/* eslint-disable @typescript-eslint/no-explicit-any */
import fetch from "node-fetch";
import { Address, Cell } from "@ton/core"

const TONCENTER_API =
  process.env.TONCENTER_API || "https://testnet.toncenter.com/api/v3";
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";
const TON_RECIPIENT = process.env.TON_RECIPIENT!;
const IS_TESTNET = (process.env.TON_NETWORK || "testnet") === "testnet";

const headers: Record<string, string> = TONCENTER_API_KEY
  ? { "X-API-Key": TONCENTER_API_KEY }
  : {};

function tryB64ToText(s: unknown): string | null {
  if (!s || typeof s !== "string") return null;
  try {
    // base64url or base64
    const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(base64, "base64");
    const txt = buf.toString("utf8");
    // only accept printable text
    return /[\x20-\x7E]/.test(txt) ? txt : null;
  } catch {
    return null;
  }
}

function extractValueNano(msg: any): string | null {
  // value/amount in nanotons (string)
  const v = msg?.value ?? msg?.amount;
  if (v == null) return null;
  const s = String(v);
  return /^\d+$/.test(s) ? s : null;
}

function parseTonCommentFromBody(bodyB64: string | undefined): string | null {
  if (!bodyB64) return null;
  try {
    const cell = Cell.fromBoc(Buffer.from(bodyB64.replace(/-/g, "+").replace(/_/g, "/"), "base64"))[0];
    const s = cell.beginParse();
    // Standard "text comment" format: 32-bit op == 0, then UTF-8 tail
    if (s.remainingBits < 32) return null;
    const op = s.loadUint(32);
    if (op !== 0) return null;
    const text = s.loadStringTail();
    return (text ?? "").trim() || null;
  } catch {
    return null;
  }
}

function extractCommentFromMsg(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null;

  const direct = [msg?.message, msg?.comment, msg?.text, msg?.msg_data?.text]
    .find(v => typeof v === "string" && v.trim());
  if (direct) return (direct as string).trim();

  // otherwise parse BOC body
  const body = msg?.msg_data?.body ?? msg?.body ?? msg?.payload;
  if (typeof body === "string") return parseTonCommentFromBody(body);
  return null;
}

export type TonPayment = {
  address: string; // recipient
  amountTon: number; // float tons
  amountNano: string; // string nanotons
  comment: string; // orderId (as string)
  link: string; // ton://transfer/...
  explorerTx?: string; // set after we find tx
};

export function tonToNanoSafe(amount: number | string): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid TON amount: "${s}"`);

  const [intPart, fracPart = ""] = s.split(".");
  const frac9 = (fracPart + "000000000").slice(0, 9); // pad/truncate to 9 digits
  return BigInt(intPart) * 1_000_000_000n + BigInt(frac9);
}

export function tonAmountToNanoString(amount: number | string): string {
  return tonToNanoSafe(amount).toString();
}

export function tonAmountToNano(ton: number): string {
  // 1 TON = 1e9 nano
  const nano = BigInt(Math.round(ton * 1e9));
  return nano.toString();
}

export function paymentLink(
  address: string,
  amountNano: string,
  comment: string
): string {
  const params = new URLSearchParams({
    amount: amountNano, // many wallets accept decimal tons
    text: comment,
  });
  return `ton://transfer/${address}?${params.toString()}`;
}

// Fetch last N transactions to recipient and try to find a match
export async function findIncomingTx(
  recipient: string,
  expectedNano: string,
  comment: string
): Promise<{ ok: boolean; txHash?: string; debug?: any[] }> {
  // toncenter v3: /transactions?account=<addr>&limit=20
  const url = new URL(`${TONCENTER_API}/transactions`);
  url.searchParams.set("account", recipient);
  url.searchParams.set("limit", "40");
  url.searchParams.set("include_msg_body", "true");
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`toncenter ${res.status} – ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  const txs = Array.isArray(data.transactions) ? data.transactions : [];

  const examined: any[] = [];

  const normalizeComment = (msg: any): string | null => {
    const blk = (x: unknown) =>
      typeof x === "string" && x.trim() ? x.trim() : null;
    // common fields
    const direct = blk(msg?.message) ?? blk(msg?.comment) ?? blk(msg?.text);
    if (direct) return direct;

    // toncenter v3: nested msg_data.text or base64 body
    const text = blk(msg?.msg_data?.text);
    if (text) return text;

    const b64 = msg?.msg_data?.body || msg?.body || msg?.payload;
    if (typeof b64 === "string") {
      try {
        const s = Buffer.from(
          b64.replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        )
          .toString("utf8")
          .trim();
        if (s) return s;
      } catch {
        /* ignore */
      }
    }
    return null;
  };

  // We look for IN transactions (to recipient) where message/comment matches and amount equals
  for (const tx of txs) {
    const hash = tx.hash || tx.transaction_id || tx.id || null;

    // Normalize messages to an array of inbound messages
    const msgs: any[] = [];
    if (tx.in_msg) msgs.push(tx.in_msg);
    if (Array.isArray(tx.in_msgs)) msgs.push(...tx.in_msgs);
    if (Array.isArray(tx.messages)) msgs.push(...tx.messages);

    for (const m of msgs) {
      const to = m.destination || m.dst || tx.account || null;
      const val = extractValueNano(m);
      const cmt = extractCommentFromMsg(m);

      examined.push({ hash, to, val, cmt });

      const toUs = !to || String(to).toLowerCase() === recipient.toLowerCase(); // some APIs omit destination on in_msg
      if (toUs && val === expectedNano && cmt === comment) {
        return { ok: true, txHash: hash ?? undefined, debug: examined };
      }
    }
  }
  return { ok: false, debug: examined };
}

export async function findIncomingByAmount(
  recipient: string,
  expectedNano: string,
  orderCreatedAt: Date
): Promise<{ txHash?: string } | null> {
  const url = new URL(`${TONCENTER_API}/transactions`);
  url.searchParams.set("account", recipient);
  url.searchParams.set("limit", "50");
  url.searchParams.set("include_msg_body", "true"); // keep it; helps when available

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  const data = await res.json() as any;
  const txs: any[] = Array.isArray(data.transactions) ? data.transactions : [];
  const createdMs = +orderCreatedAt - 60_000; // allow 60s early tolerance

  for (const tx of txs) {
    const ts = typeof tx.now === "number" ? tx.now * 1000 : Date.now();
    if (ts < createdMs) continue;

    const msgs: any[] = [];
    if (tx.in_msg) msgs.push(tx.in_msg);
    if (Array.isArray(tx.in_msgs)) msgs.push(...tx.in_msgs);
    if (Array.isArray(tx.messages)) msgs.push(...tx.messages);

    for (const m of msgs) {
      const v = m?.value ?? m?.amount;
      if (v != null && String(v) === expectedNano) {
        return { txHash: tx.hash || tx.transaction_id || tx.id };
      }
    }
  }
  return null;
}

export function explorerTxUrl(hash: string): string {
  // Use tonviewer for nice links
  return `${
    IS_TESTNET ? "https://testnet.tonviewer.com" : "https://tonviewer.com"
  }/transaction/${hash}`;
}

export function skuPriceTon(sku: string): number {
  // MVP: from env variables
  const key = `PASS_${sku.replace(/[^A-Z0-9]/gi, "_").toUpperCase()}_TON`;
  const val = process.env[key];
  if (!val)
    throw new Error(`Missing TON price env for SKU: ${sku} (set ${key})`);
  return Number(val);
}

export function buildTonPayment(sku: string, orderId: number): TonPayment {
  const amountTon = skuPriceTon(sku); // e.g., 0.02
  const amountNano = tonToNanoSafe(amountTon).toString(); // "20000000"
  const comment = String(orderId);
  const link = paymentLink(TON_RECIPIENT, amountNano, comment);
  return { address: TON_RECIPIENT, amountTon, amountNano, comment, link };
}
