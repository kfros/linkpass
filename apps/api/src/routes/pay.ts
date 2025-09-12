import { FastifyInstance } from "fastify";
import {
  buildTonPayment,
  findIncomingTx,
  explorerTxUrl,
  findIncomingByAmount,
} from "../chain/ton.js";
import { getDb } from "../db/client";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { fr } from "zod/v4/locales/index.cjs";
import { z } from "zod";
import { findIncomingTxCombined } from "../chain/tonFinder.js";

const PayBody = z.object({
  sku: z.string().optional(),
  merchantId: z.number().int().positive().optional(),
});

export async function payRoutes(app: FastifyInstance) {
  // 1) Create order and return ton://transfer link
  app.post("/pay", async (req, reply) => {
    const { sku = "vip-pass", merchantId = 1 } = PayBody.parse(req.body);
    // create order: status=paying, chain=ton
    const db = await getDb();
    const [order] = await db
      .insert(orders)
      .values({
        merchantId,
        sku,
        amount: 0, // not used for chain settlement in MVP
        chain: "ton",
        status: "paying",
      })
      .returning();

    try {
      const pay = buildTonPayment(sku, order.id);

      // (optional) store expected amount/comment, helps later debug
      await db
        .update(orders)
        .set({ tx: null, receiptUrl: null })
        .where(eq(orders.id, order.id));

      return reply.send({
        orderId: order.id,
        sku,
        chain: "ton",
        address: pay.address,
        amountTon: pay.amountTon,
        amountNano: pay.amountNano,
        comment: pay.comment,
        link: pay.link, // ton://transfer/...  (turn into QR on client)
      });
    } catch (e) {
      req.log.warn({ err: e }, "pay: configuration error");
      return reply.code(400).send({ ok: false, reason: (e as Error).message });
    }
  });

  // 2) Confirm endpoint: lookup blockchain and mark paid if found
  app.post("/orders/:id/confirm", async (req, reply) => {
    const db = await getDb();
    const id = Number((req.params as { id: string }).id);
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

    const pay = buildTonPayment(order.sku, order.id);

    const hit = await findIncomingTxCombined(
      pay.address,
      pay.amountNano,
      pay.comment
    );
    if (!hit.ok) {
      req.log.info(
        { expect: { nano: pay.amountNano, comment: pay.comment } },
        "confirm: not found (combined)"
      );
      return reply.send({ ok: false, reason: "not found yet" });
    }

    const receiptUrl = explorerTxUrl(hit.txHash);
    await db
      .update(orders)
      .set({
        status: "paid",
        tx: hit.txHash,
        chain: "ton",
        receiptUrl,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return reply.send({ ok: true, tx: hit.txHash, receiptUrl });
  });
}
