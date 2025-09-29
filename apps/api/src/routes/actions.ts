import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "../db/client";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getGateway } from "../chain";

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

interface ActionPostRequest {
  account: string;
}

interface ActionPostResponse {
  transaction: string;
  message?: string;
}

export async function actionsRoutes(app: FastifyInstance) {
  // GET /api/actions/buy-pass - Returns action metadata
  app.get("/api/actions/buy-pass", async (req, reply) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    const response: ActionGetResponse = {
      icon: `${apiUrl}/icon.png`,
      label: "Buy VIP Pass",
      description:
        "Purchase a VIP pass with Solana. One-click payment via Blink!",
      title: "LinkPass - VIP Pass",
      links: {
        actions: [
          {
            label: "Buy for 0.5 SOL",
            href: `${apiUrl}/api/actions/buy-pass`,
            type: "transaction",
          },
        ],
      },
    };

    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");

    return reply.send(response);
  });

  // OPTIONS for CORS
  app.options("/api/actions/buy-pass", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    return reply.code(200).send();
  });

  // POST /api/actions/buy-pass - Returns serialized transaction
  app.post("/api/actions/buy-pass", async (req, reply) => {
  try {
    // --- CORS & content type early ---
    reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
      // include common Dialect/extension headers to avoid preflight rejections
      .header("Access-Control-Allow-Headers",
              "Content-Type, X-Requested-With, x-dialect-sdk-version, x-dialect-app-id")
      .type("application/json");

    const { account } = req.body as { account?: string };
    if (!account) return reply.code(400).send({ error: "Missing field 'account'" });

    // Validate payer pubkey
    new PublicKey(account);

    const db = await getDb();

    // Create order
    const [order] = await db.insert(orders).values({
      merchantId: 1,
      sku: "vip-pass",
      amount: 0,
      amountNano: BigInt("500000000"), // 0.5 SOL
      chain: "sol",
      status: "paying",
      toAddress: process.env.SOLANA_RECIPIENT_ADDRESS!,
      memo: `Order-${Date.now()}`,
    }).returning();

    const memo = `Order-${order.id}`;
    await db.update(orders).set({ memo }).where(eq(orders.id, order.id));

    // --- Build the unsigned VersionedTransaction ----
    const gw = getGateway("SOL");

    // Make sure your gateway uses:
    // - ComputeUnitLimit + ComputeUnitPrice({ microLamports: 1000 })
    // - getLatestBlockhash({ commitment: "finalized" })
    // - serialize({ requireAllSignatures: false })  <-- important for unsigned tx
    const intent = await gw.makePaymentIntent({
      to: process.env.SOLANA_RECIPIENT_ADDRESS!,
      amountNano: "500000000",
      memo,
      from: account,
    });

    // prefer a direct field; otherwise take from debug
    const base64Tx: string =
      (intent as any).base64Transaction ??
      (intent as any).debug?.base64Transaction;

    if (!base64Tx) throw new Error("Failed to construct unsigned transaction");

    // --- Return exactly what Dialect expects ---
    // Keep it to { transaction, message [, links] }. No extra fields.
    return reply.code(200).send({
      transaction: base64Tx,
      message: "VIP Pass created. Completing payment…",
      // Optional: success links; {SIGNATURE} will be replaced by Dialect
      links: {
        actions: [
          {
            label: "View on Explorer",
            href: "https://explorer.solana.com/tx/{SIGNATURE}?cluster=devnet",
            type: "external",
          },
        ],
      },
    });

  } catch (error) {
    req.log.error({ error }, "Error creating Blink transaction");
    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
      .header("Access-Control-Allow-Headers",
              "Content-Type, X-Requested-With, x-dialect-sdk-version, x-dialect-app-id")
      .type("application/json")
      .code(500)
      .send({ error: "Failed to create transaction", details: (error as Error).message });
  }
});

  // GET /api/actions/buy-pass/:orderId/status - Check order status
  app.get("/api/actions/buy-pass/:orderId/status", async (req, reply) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
     const sig = (req.query as any).transaction as string | undefined;

      if (sig) {
    return reply.send({
      icon: `${apiUrl}/icon.png`,
      title: "LinkPass - VIP Pass",
      description: "Payment received. Your VIP Pass will arrive shortly.",
      label: "Paid ✔",
      links: {
        actions: [
          { label: "View on Explorer", href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, type: "external" },
        ],
      },
    });
  }
    try {
      const { orderId } = req.params as { orderId: string };
      const db = await getDb();

      const order = await db.query.orders.findFirst({
        where: (t, { eq }) => eq(t.id, Number(orderId)),
      });

      if (!order) {
        return reply.code(404).send({
          error: "Order not found",
        });
      }

      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      return reply.send({
        orderId: order.id,
        status: order.status,
        tx: order.tx,
        receiptUrl: order.receiptUrl,
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt,
      });
    } catch (error) {
      req.log.info({ error }, "Error checking order status");

      reply.header("Access-Control-Allow-Origin", "*");

      return reply.code(500).send({
        error: "Failed to check order status",
        details: (error as Error).message,
      });
    }
  });
}
