import { FastifyInstance, FastifyReply, FastifySchema, FastifyTypeProviderDefault, RawServerDefault, RouteGenericInterface } from "fastify";
import {   Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction, } from "@solana/web3.js";
import { getDb } from "../db/client";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getGateway } from "../chain";
import { IncomingMessage, ServerResponse } from "http";

const DEVNET_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const CLUSTER = (process.env.SOLANA_CLUSTER || "devnet").toLowerCase(); // "devnet" | "mainnet" | "testnet"
const RECIPIENT = process.env.SOLANA_RECIPIENT_ADDRESS || ""; // devnet pubkey
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";      // e.g. https://linkpass-api.onrender.com
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const LAMPORTS = 1_000_000_000;
const PRICE_SOL = 0.5;
const PRICE_LAMPORTS = Math.round(PRICE_SOL * LAMPORTS);

function explorerTxUrl(sig: string) {
  return `https://explorer.solana.com/tx/${sig}${CLUSTER === "mainnet" ? "" : `?cluster=${CLUSTER}`}`;
}

// Solana Actions spec types
interface ActionGetResponse {
  icon: string;
  label: string;
  description: string;
  title: string;
  disabled?: boolean;
  links?: {
    actions: Array<{
      label: string;
      href: string;
      type?: "transaction" | "post";
    }>;
  };
}


type ActionPostRequest = { account: string };
type ActionPostResponse = { transaction: string; message?: string };

function withCORS(reply: any) {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .header(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Requested-With, x-dialect-sdk-version, x-dialect-app-id"
    )
    .header("Cache-Control", "no-store");
}

export async function actionsRoutes(app: FastifyInstance) {
  // GET /api/actions/buy-pass - Returns action metadata



  // OPTIONS for CORS
   app.options("/api/actions/buy-pass", async (_req, reply) => {
    return withCORS(reply).code(200).send();
  });
  
  // POST /api/actions/buy-pass - Returns serialized transaction
app.post("/api/actions/buy-pass", async (req, reply) => {
    try {
    withCORS(reply);

    const { account } = req.body as { account?: string };
    if (!account) return reply.code(400).send({ error: "Missing field 'account'" });

    const payer = new PublicKey(account);
    const receiver = new PublicKey(RECIPIENT);

    const db = await getDb();

    // ❶ Create order first
    const [order] = await db.insert(orders).values({
      merchantId: 1,
      sku: "vip-pass",
      amount: PRICE_SOL,
      amountNano: BigInt(PRICE_LAMPORTS),
      chain: "sol",
      status: "paying",
      toAddress: receiver.toBase58(),
      memo: "", // fill after id known
    }).returning();

    const memoText = `order-${order.id}`;

    // Persist memo immediately
    await db.update(orders).set({ memo: memoText }).where(eq(orders.id, order.id));

    // ❷ Build unsigned v0 tx with ComputeBudget + Transfer + Memo(order-<id>)
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const computeIxs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ];

    const transferIx = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: receiver,
      lamports: PRICE_LAMPORTS,
    });

    const memoIx = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memoText, "utf8"),
    });

    const { blockhash } = await connection.getLatestBlockhash({ commitment: "finalized" });

    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [...computeIxs, transferIx, memoIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    const base64 = Buffer.from(
      tx.serialize()
    ).toString("base64");

    // ❸ Return per Actions spec
    return reply.type("application/json").send({
      transaction: base64,
      message: "VIP Pass created. Completing payment…",
    });

  } catch (e: any) {
    req.log.error({ err: e }, "Failed to create Blink transaction");
    return reply
      .type("application/json")
      .code(500)
      .send({ error: "Failed to create transaction", details: e?.message || String(e) });
  }
});

  // GET /api/actions/buy-pass/:orderId/status - Check order status
app.get("/api/actions/buy-pass", async (req, reply) => {
  const sig = (req.query as any)?.transaction as string | undefined;

  // If Dialect is calling back with ?transaction=<signature>, confirm on-chain and close the order
  if (sig) {
    try {
      const connection = new Connection(DEVNET_RPC, "confirmed");
      const tx = await connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      // Defensive checks
      if (!tx?.meta || tx.meta.err) throw new Error("Transaction failed or not found");

      // Extract memo string (if present)
      const keys = tx.transaction.message.getAccountKeys().staticAccountKeys;
      const memoIx = tx.transaction.message.compiledInstructions.find(ix =>
        keys[ix.programIdIndex].toBase58() === MEMO_PROGRAM_ID.toBase58()
      );
      let memoText: string | undefined;
      if (memoIx) memoText = new TextDecoder("utf-8").decode(memoIx.data);

      // Parse order id from memo
      const orderId = memoText?.startsWith("order-") ? Number(memoText.slice("order-".length)) : undefined;
      if (!orderId) throw new Error("Memo with order-<id> not found");

      // Check amount received by RECIPIENT
      const idx = keys.findIndex(k => k.toBase58() === RECIPIENT);
      if (idx < 0) throw new Error("Recipient not in account keys");

      const received =
        (tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0);
      if (received !== PRICE_LAMPORTS) throw new Error("Amount mismatch");

      // ✅ Mark order as paid
      const db = await getDb();
      await db.update(orders).set({
        status: "paid",
        tx: sig,
        confirmedAt: new Date(),
      }).where(eq(orders.id, orderId));

      // Success card
      const success: ActionGetResponse = {
        icon: `${API_BASE}/icon.png`,
        title: "LinkPass - VIP Pass",
        label: "Paid ✔",
        description: `Order #${orderId} paid successfully.`,
        links: {
          actions: [
            { label: "View on Explorer", href: explorerTxUrl(sig), type: "post" },
          ],
        },
      };
      return withCORS(reply).send(success);

    } catch (e: any) {
      // If verification fails, show a neutral result (and keep order as 'paying')
      const fallback: ActionGetResponse = {
        icon: `${API_BASE}/icon.png`,
        title: "LinkPass - VIP Pass",
        label: "Payment received",
        description: "We are finalizing your payment. If this persists, contact support.",
        links: { actions: [{ label: "View on Explorer", href: explorerTxUrl(sig!), type: "post" }] },
      };
      return withCORS(reply).send(fallback);
    }
  }


  // ------- default metadata (no tx yet) -------
  const meta: ActionGetResponse = {
    icon: `${API_BASE}/icon.png`,
    title: "LinkPass - VIP Pass",
    label: `Buy for ${PRICE_SOL} SOL`,
    description: "Purchase a VIP pass with Solana. One-click payment via Blink!",
    links: {
      actions: [
        { label: `Buy for ${PRICE_SOL} SOL`, href: `${API_BASE}/api/actions/buy-pass`, type: "transaction" },
      ],
    },
  };
  return withCORS(reply).send(meta);
});
}

