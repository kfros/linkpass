import { FastifyInstance } from "fastify";
import { getDb } from "../db/client";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getGateway } from "../chain";
import type { Chain } from "../chain/types";

const PayBody = z.object({
  sku: z.string().optional(),
  merchantId: z.number().int().positive().optional(),
  tgUserId: z.string().optional(),
  tgUsername: z.string().optional(),
  chain: z.enum(["TON", "SOL"]).optional(),
});

export async function payRoutes(app: FastifyInstance) {
  // Helper function to get pricing and recipient address for a SKU and chain
  function getSkuConfig(sku: string, chain: Chain) {
    // For MVP, hardcoded pricing - later move to database
    const configs = {
      "vip-pass": {
        TON: { amountNano: "20000000", recipient: process.env.TON_RECIPIENT_ADDRESS || "0QBv2t8tqBB2KADpupdZ5nGT-CQm89eHHQZboclO1ealFTZL" },
        SOL: { amountNano: "10000000", recipient: process.env.SOLANA_RECIPIENT_ADDRESS || "11111111111111111111111111111111" }, // 0.01 SOL in lamports
      },
    };
    
    const config = configs[sku as keyof typeof configs]?.[chain];
    if (!config) throw new Error(`Unsupported sku/chain: ${sku}/${chain}`);
    return config;
  }

  // 1) Create order and return payment link/intent
  app.post("/pay", async (req, reply) => {
    const {
      sku = "vip-pass",
      merchantId = 1,
      tgUserId,
      tgUsername,
      chain = "TON",
    } = PayBody.parse(req.body);

    try {
      const db = await getDb();
      const skuConfig = getSkuConfig(sku, chain);
      const gw = getGateway(chain);

      // Create order
      const [order] = await db
        .insert(orders)
        .values({
          merchantId,
          sku,
          amount: 0, // Legacy field, using amountNano instead
          amountNano: BigInt(skuConfig.amountNano),
          chain: chain.toLowerCase(),
          status: "paying",
          tgUserId,
          tgUsername,
          toAddress: skuConfig.recipient,
          memo: `Order-${Date.now()}`, // Unique identifier for this order
        })
        .returning();

      let link: string;
      let qrText: string;

      if (chain === "SOL") {
        // Generate Solana Pay URL for QR code
        const recipient = skuConfig.recipient;
        const amount = Number(skuConfig.amountNano) / 1e9; // convert lamports to SOL
        const reference = order.id;
        const label = "VIP Pass";
        const message = "Buy VIP Pass";
        link = `solana:${recipient}?amount=${amount}&reference=${reference}&label=${encodeURIComponent(label)}&message=${encodeURIComponent(message)}`;
        qrText = link;
      } else {
        // Generate payment intent for TON or other chains
        const intent = await gw.makePaymentIntent({
          to: skuConfig.recipient,
          amountNano: skuConfig.amountNano,
          memo: `Order-${order.id}`,
        });
        link = intent.uri;
        qrText = intent.qrText;
      }

      // Update order with memo
      await db
        .update(orders)
        .set({ memo: `Order-${order.id}` })
        .where(eq(orders.id, order.id));

      return reply.send({
        orderId: order.id,
        sku,
        chain: chain,
        address: skuConfig.recipient,
        amountNano: skuConfig.amountNano,
        memo: `Order-${order.id}`,
        link,
        qrText,
      });
    } catch (e) {
      req.log.warn({ err: e }, "pay: configuration error");
      return reply.code(400).send({ ok: false, reason: (e as Error).message });
    }
  });

  app.post("/orders/:id/intent", async (req, reply) => {
    const { id: orderId } = req.params as { id: string };
    const db = await getDb();
    const id = Number(orderId);
    const order = await db.query.orders.findFirst({
      where: (t, { eq }) => eq(t.id, id),
    });
    const gw = getGateway((order?.chain as Chain) ?? "SOL");

    if (!order || !order.toAddress) {
      return reply
        .code(400)
        .send({ ok: false, reason: "Order or toAddress not found" });
    }

    const intent = await gw.makePaymentIntent({
      to: order.toAddress,
      amountNano: String(order.amountNano ?? order.amount), // lamports
      memo: order.memo ?? undefined,
    });

    return reply.send(intent); // { uri, qrText, memo }
  });

  // 2) Confirm endpoint: lookup blockchain and mark paid if found
  app.post("/orders/:id/confirm", async (req, reply) => {
    try {
      const { id: orderId } = req.params as { id: string };
      const db = await getDb();
      const id = Number(orderId);
      const order = await db.query.orders.findFirst({
        where: (t, { eq }) => eq(t.id, id),
      });

      if (!order)
        return reply.code(404).send({ ok: false, reason: "order not found" });
      if (order.status === "paid")
        return reply.send({
          ok: true,
          already: true,
          receiptUrl: order.receiptUrl,
        });

      const chain = (order.chain?.toUpperCase() as Chain) || "TON";
      const gw = getGateway(chain);

      if (!order.toAddress) {
        return reply.code(400).send({ ok: false, reason: "toAddress not found" });
      }

      const hit = await gw.findIncoming({
        to: order.toAddress,
        amountNano: String(order.amountNano ?? order.amount),
        memo: order.memo ?? undefined,
      });
      
      if (!hit) {
        req.log.info(
          { expect: { amountNano: order.amountNano, memo: order.memo } },
          "confirm: not found yet"
        );
        return reply.send({ ok: false, reason: "not found yet" });
      }

      const receiptUrl = gw.explorerTxUrl(hit.txHash);
      await db
        .update(orders)
        .set({
          status: "paid",
          tx: hit.txHash,
          from: hit.from,
          receiptUrl,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      return reply.send({ ok: true, tx: hit.txHash, receiptUrl });
    } catch (e) {
      req.log.info({ err: e }, "confirm: error");
      return reply.code(500).send({ ok: false, reason: "domain error", error: (e as Error).message });
    }
  });
}
