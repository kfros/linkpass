import {
  FastifyInstance,
  FastifyReply,
  FastifySchema,
  FastifyTypeProviderDefault,
  RawServerDefault,
  RouteGenericInterface,
} from "fastify";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { getDb } from "../db/client";
import { orders } from "../db/schema.js";
import { eq, InferInsertModel } from "drizzle-orm";
import { getGateway } from "../chain";
import { IncomingMessage, ServerResponse } from "http";

const DEVNET_RPC =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const CLUSTER = (process.env.SOLANA_CLUSTER || "devnet").toLowerCase(); // "devnet" | "mainnet" | "testnet"
const RECIPIENT = process.env.SOLANA_RECIPIENT_ADDRESS || ""; // devnet pubkey
const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""; // e.g. https://linkpass-api.onrender.com
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const LAMPORTS = 1_000_000_000;
const PRICE_SOL = 0.5;
const PRICE_LAMPORTS = Math.round(PRICE_SOL * LAMPORTS);

type NewOrder = InferInsertModel<typeof orders>;

function explorerTxUrl(sig: string) {
  return `https://explorer.solana.com/tx/${sig}${
    CLUSTER === "mainnet" ? "" : `?cluster=${CLUSTER}`
  }`;
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

      req.log.info({ body: req.body }, "POST /buy-pass in");

      const { account } = req.body as { account?: string };
      if (!account)
        return reply.code(400).send({ error: "Missing field 'account'" });

      const payer = new PublicKey(account);
      const receiver = new PublicKey(RECIPIENT);

      const db = await getDb();

      const newOrder: NewOrder = {
        merchantId: 1,
        sku: "vip-pass",
        amount: PRICE_SOL.toString(), // string
        chain: "sol",
        from: account, // string | null
        status: "paying", // must be in your orderStatusEnum
        amountNano: BigInt(PRICE_LAMPORTS), // bigint | null
        toAddress: receiver.toBase58(), // string | null
        // memo: will set after we know id (optional/nullable)
      };

      // ❶ Create order first
      const [order] = await db.insert(orders).values(newOrder).returning();

      const memoText = `order-${order.id}`;

      // Persist memo immediately
      await db
        .update(orders)
        .set({ memo: memoText })
        .where(eq(orders.id, order.id));

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

      const { blockhash } = await connection.getLatestBlockhash({
        commitment: "finalized",
      });

      const msg = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: [...computeIxs, transferIx, memoIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      const base64 = Buffer.from(tx.serialize()).toString("base64");

      req.log.info({ base64Len: base64.length }, "POST /buy-pass out");

      // ❸ Return per Actions spec
      return reply.send({
      transaction: base64,        // base64 of VersionedTransaction
      message: "VIP Pass created. Completing payment…",
      });
    }  catch (e: any) {
    req.log.error({ e }, "POST /buy-pass failed");
    return withCORS(reply).code(500).send({ error: "Failed to create transaction", details: e?.message });
  }
});

  // GET /api/actions/buy-pass/:orderId/status - Check order status
  app.get("/api/actions/buy-pass", async (req, reply) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const cluster = (process.env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
  const sig = (req.query as any)?.transaction as string | undefined;
  req.log.info({ url: req.url, q: req.query }, "GET /buy-pass");

  if (sig) {
    // 🔎 log so you can see if Dialect called back with the signature
    req.log.info({ sig }, "Dialect success callback");
    return withCORS(reply).send({
      icon: `${apiUrl}/icon.png`,
      title: "LinkPass - VIP Pass",
      label: "Paid ✔",
      description: "Payment received. Your VIP Pass will arrive shortly.",
      links: {
        actions: [
          {
            label: "View on Explorer",
            href: `https://explorer.solana.com/tx/${sig}${cluster === "mainnet" ? "" : `?cluster=${cluster}`}`,
            type: "post",
          },
        ],
      },
    });
  }
    // ------- default metadata (no tx yet) -------
    const meta: ActionGetResponse = {
      icon: `${API_BASE}/icon.png`,
      title: "LinkPass - VIP Pass",
      label: `Buy for ${PRICE_SOL} SOL`,
      description:
        "Purchase a VIP pass with Solana. One-click payment via Blink!",
      links: {
        actions: [
          {
            label: `Buy for ${PRICE_SOL} SOL`,
            href: `${API_BASE}/api/actions/buy-pass`,
            type: "transaction",
          },
        ],
      },
    };
    return withCORS(reply).send(meta);
  });
}
