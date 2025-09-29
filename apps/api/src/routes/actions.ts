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
      description: "Purchase a VIP pass with Solana. One-click payment via Blink!",
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
      const { account, type } = req.body as ActionPostRequest & { type?: string };

      if (!account) {
        return reply.code(400).send({
          error: "Missing required field: account (sender public key)",
        });
      }

      // Validate the account is a valid Solana public key
      try {
        new PublicKey(account);
      } catch {
        return reply.code(400).send({
          error: "Invalid Solana account address",
        });
      }

      const db = await getDb();

      // Create order in database
      const [order] = await db
        .insert(orders)
        .values({
          merchantId: 1,
          sku: "vip-pass",
          amount: 0,
          amountNano: BigInt("10000000"), // 0.01 SOL in lamports
          chain: "sol",
          status: "paying",
          toAddress: process.env.SOLANA_RECIPIENT_ADDRESS || "11111111111111111111111111111111",
          memo: `Order-${Date.now()}`,
        })
        .returning();

      // Update order with the correct memo
      await db
        .update(orders)
        .set({ 
          memo: `Order-${order.id}`,
        })
        .where(eq(orders.id, order.id));

      // If type is 'transaction', generate serialized transaction for Dial.to/Blink
      if (type === "transaction") {
        const gw = getGateway("SOL");
        const intent = await gw.makePaymentIntent({
          to: process.env.SOLANA_RECIPIENT_ADDRESS || "11111111111111111111111111111111",
          amountNano: "500000000", // 0.5 SOL in lamports (adjust as needed)
          memo: `Order-${order.id}`,
          from: account,
        });
        // Extract transaction from the intent URI
        const url = new URL(intent.uri);
        const serializedTransaction = url.searchParams.get("tx");
        if (!serializedTransaction) {
          throw new Error("Failed to generate transaction");
        }
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        reply.header("Access-Control-Allow-Headers", "Content-Type");
        return reply.send({
          orderId: order.id,
          transaction: serializedTransaction,
          message: `VIP Pass purchase created! Order ID: ${order.id}`,
        });
      }

      // Otherwise, generate Solana Pay URL for QR code
      const recipient = process.env.SOLANA_RECIPIENT_ADDRESS || "11111111111111111111111111111111";
      const amount = 0.01;
      const reference = order.id;
      const label = "VIP Pass";
      const message = "Buy VIP Pass";
      const solanaPayUrl = `solana:${recipient}?amount=${amount}&reference=${reference}&label=${encodeURIComponent(label)}&message=${encodeURIComponent(message)}`;

      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");
      return reply.send({
        orderId: order.id,
        link: solanaPayUrl,
        message: `VIP Pass purchase created! Order ID: ${order.id}`,
      });
    } catch (error) {
      req.log.info({ error }, "Error creating Blink transaction");
      
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");
      
      return reply.code(500).send({
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