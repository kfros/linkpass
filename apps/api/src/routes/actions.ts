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
      const { account } = req.body as ActionPostRequest;

      if (!account)
        return reply
          .code(400)
          .send({ error: "Missing required field: account" });
      try {
        new PublicKey(account);
      } catch {
        return reply
          .code(400)
          .send({ error: "Invalid Solana account address" });
      }

      const db = await getDb();

      // Create the order first
      const [order] = await db
        .insert(orders)
        .values({
          merchantId: 1,
          sku: "vip-pass",
          amount: 0,
          amountNano: BigInt("500000000"), // 0.5 SOL
          chain: "sol",
          status: "paying",
          toAddress:
            process.env.SOLANA_RECIPIENT_ADDRESS ||
            "11111111111111111111111111111111",
          memo: `Order-${Date.now()}`,
        })
        .returning();

      // Finalize the memo
      const memo = `Order-${order.id}`;
      await db.update(orders).set({ memo }).where(eq(orders.id, order.id));

      // Build the UNSIGNED tx and return it directly
      const gw = getGateway("SOL");
      const { base64Transaction } = await gw
        .makePaymentIntent({
          to:
            process.env.SOLANA_RECIPIENT_ADDRESS ||
            "11111111111111111111111111111111",
          amountNano: "500000000", // 0.5 SOL
          memo,
          from: account,
        })
        .then((x) => ({
          base64Transaction:
            (x as any).debug?.base64Transaction || (x as any).base64Transaction,
        }));

      if (!base64Transaction)
        throw new Error("Failed to construct transaction");

      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      const response: ActionPostResponse & { orderId: number } = {
        transaction: base64Transaction,
        message: `VIP Pass purchase created! Order ID: ${order.id}`,
        orderId: order.id,
      };
      return reply.type("application/json").send({
    transaction: base64Transaction,
    message: "VIP Pass created. Completing payment…",
    // optional: links shown after success
    links: {
      actions: [
        { label: "View on Explorer", href: "https://explorer.solana.com/tx/{SIGNATURE}?cluster=devnet", type: "external" },
      ],
    },
  });
    } catch (error) {
      req.log.info({ error }, "Error creating Blink transaction");
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");
      return reply
        .code(500)
        .send({
          error: "Failed to create transaction",
          details: (error as Error).message,
        });
    }
  });

  // GET /api/actions/buy-pass/:orderId/status - Check order status
  app.get("/api/actions/buy-pass/:orderId/status", async (req, reply) => {
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
