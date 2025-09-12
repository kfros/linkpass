/* eslint-disable @typescript-eslint/no-explicit-any */
import { Address } from "@ton/core";
import { getTonClient } from "./tonRpc";
import { tryDecodeTextCommentFromCell } from "./tonComment";
import fetch from "node-fetch";

// ---------- JSON-RPC strict (amount + comment) ----------
export async function findIncomingTxJsonRpcStrict(recipient: string, expectedNano: string, expectedComment: string)
: Promise<{ ok: true; txHash: string } | { ok: false }> {
  const client = getTonClient();
  const addr = Address.parse(recipient);
  const txs = await client.getTransactions(addr, { limit: 40, archival: false });

  for (const tx of txs) {
    const inMsg = tx.inMessage;
    if (!inMsg || inMsg.info.type !== "internal") continue;
    const valueStr = inMsg.info.value.coins.toString();
    const comment = tryDecodeTextCommentFromCell(inMsg.body);
    if (valueStr === expectedNano && comment === expectedComment) {
        // convert tx.hash (Buffer) to base64 string
      const hashB64 = Buffer.from(tx.hash()).toString('base64'); 
      return { ok: true, txHash: hashB64 };
    }
  }
  return { ok: false };
}

// ---------- REST v3 strict (amount + comment) ----------
function b64urlToUtf8(b64url: string | undefined): string | null {
  if (!b64url) return null;
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(b64, "base64");
    return buf.toString("utf8");
  } catch { return null; }
}

export async function findIncomingTxRestStrict(recipient: string, expectedNano: string, expectedComment: string)
: Promise<{ ok: true; txHash: string } | { ok: false }> {
  const base = process.env.TONCENTER_API || "https://testnet.toncenter.com/api/v3";
  const key = process.env.TONCENTER_API_KEY || "";
  const url = new URL(`${base}/transactions`);
  url.searchParams.set("account", recipient);
  url.searchParams.set("limit", "50");
  url.searchParams.set("include_msg_body", "true");

  const headers = key ? { "X-API-Key": key } : undefined;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { ok: false };
  const data = await res.json() as { transactions?: any[] };
  const txs = Array.isArray(data.transactions) ? data.transactions : [];

  for (const tx of txs) {
    const msgs: any[] = [];
    if (tx.in_msg) msgs.push(tx.in_msg);
    if (Array.isArray(tx.in_msgs)) msgs.push(...tx.in_msgs);
    if (Array.isArray(tx.messages)) msgs.push(...tx.messages);

    for (const m of msgs) {
      const v = (m?.value ?? m?.amount);
      const valueStr = v != null ? String(v) : null;
      if (valueStr !== expectedNano) continue;

      // comment candidates
      const direct =
        (typeof m?.message === "string" && m.message.trim()) ||
        (typeof m?.comment === "string" && m.comment.trim()) ||
        (typeof m?.text === "string" && m.text.trim()) ||
        (typeof m?.msg_data?.text === "string" && m.msg_data.text.trim());

      let comment: string | null = (direct as string) || null;
      if (!comment) {
        const body = m?.msg_data?.body || m?.body || m?.payload;
        // try text body first
        const txt = typeof body === "string" ? b64urlToUtf8(body) : null;
        comment = (txt?.trim() || null);
        // Note: REST body may be raw BOC; JSON-RPC path already handles Cell parsing.
      }

      if (comment === expectedComment) {
        const hash = tx.hash || tx.transaction_id || tx.id;
        if (typeof hash === "string") return { ok: true, txHash: hash };
      }
    }
  }
  return { ok: false };
}

// ---------- JSON-RPC fallback (amount-only + time window) ----------
export async function findIncomingByAmountJsonRpc(recipient: string, expectedNano: string, notOlderThanMs = 10 * 60 * 1000)
: Promise<{ ok: true; txHash: string } | { ok: false }> {
  const client = getTonClient();
  const addr = Address.parse(recipient);
  const txs = await client.getTransactions(addr, { limit: 50, archival: false });
  const cutoff = Date.now() - notOlderThanMs;

  for (const tx of txs) {
    const tMs = Number(tx.now) * 1000;
    if (Number.isFinite(tMs) && tMs < cutoff) break;

    const inMsg = tx.inMessage;
    if (!inMsg || inMsg.info.type !== "internal") continue;
    if (inMsg.info.value.coins.toString() === expectedNano) {
      const hashB64 = Buffer.from(tx.hash()).toString('base64');
      return { ok: true, txHash: hashB64 };
    }
  }
  return { ok: false };
}

// ---------- Orchestrator ----------
export async function findIncomingTxCombined(recipient: string, expectedNano: string, expectedComment: string)
: Promise<{ ok: true; txHash: string } | { ok: false }> {
  // 1) JSON-RPC strict
  const a = await findIncomingTxJsonRpcStrict(recipient, expectedNano, expectedComment);
  if (a.ok) return a;

  // 2) REST strict (toncenter v3 with include_msg_body)
  const b = await findIncomingTxRestStrict(recipient, expectedNano, expectedComment);
  if (b.ok) return b;

  // 3) JSON-RPC amount-only fallback
  const c = await findIncomingByAmountJsonRpc(recipient, expectedNano, 10 * 60 * 1000);
  if (c.ok) return c;

  return { ok: false };
}
