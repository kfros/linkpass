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
            label: "Buy for 0.01 SOL",
            href: `solana-action:${apiUrl}/api/actions/buy-pass`,
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
      
      if (!account) {
        return reply.code(400).send({
          error: "Missing required field: account",
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
          memo: `Blink-Order-${Date.now()}`,
        })
        .returning();

      // Get Solana gateway and create payment intent
      const gw = getGateway("SOL");
      const intent = await gw.makePaymentIntent({
        to: process.env.SOLANA_RECIPIENT_ADDRESS || "11111111111111111111111111111111",
        amountNano: "10000000",
        memo: `Blink-Order-${order.id}`,
        from: account, // <-- pass the user's wallet public key
      });

      // Update order with the correct memo
      await db
        .update(orders)
        .set({ 
          memo: `Blink-Order-${order.id}`,
        })
        .where(eq(orders.id, order.id));

      // Extract transaction from the intent URI
      const url = new URL(intent.uri);
      const serializedTransaction = url.searchParams.get("tx");
      
      if (!serializedTransaction) {
        throw new Error("Failed to generate transaction");
      }

      const response: ActionPostResponse = {
        transaction: serializedTransaction,
        message: `VIP Pass purchase created! Order ID: ${order.id}`,
      };

      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      return reply.send(response);
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