import fastify from "fastify";
import cors from "@fastify/cors";
// import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getDb } from "./db/client";
import { eq, sql } from "drizzle-orm";
import {
  merchants as tMerchants,
  passes as tPasses,
  orders as tOrders,
} from "./db/schema";

import { verifyTelegramInitData } from "./telegram/verify";
import crypto from "crypto";

const CreateMerchant = z.object({
  name: z.string().min(2),
});
const CreatePass = z.object({
  merchantId: z.coerce.number().int().positive(),
  sku: z
    .string()
    .min(2)
    .regex(/^[a-zA-Z0-9-]+$/i, "SKU must be alphanumeric with optional dashes"),
  title: z.string().min(2),
});
const CreateOrder = z.object({
  merchantId: z.coerce.number().int().positive(),
  sku: z.string().min(2),
  amount: z.number().positive(),
});
const UpdateOrderTx = z.object({
  tx: z.string().min(1),
  chain: z.enum(["sol", "ton"]),
  receiptUrl: z.string().optional()
});

export async function buildServer() {
  const app = fastify({ logger: true });
  await app.register(cors, {
    // Accept localhost and any ngrok-free.app subdomain over http/https
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/Postman/same-origin
      const ok =
        origin === "http://localhost:3000" ||
        origin === "https://localhost:3000" ||
        /^https?:\/\/[a-z0-9-]+\.ngrok-free\.app$/i.test(origin);
      cb(null, ok);
    },

    // Be explicit: browsers preflight PATCH with these headers
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization", "ngrok-skip-browser-warning"],
    exposedHeaders: ["Content-Type"],
    maxAge: 86400,

    // Handle OPTIONS automatically; don’t fail strict checks in dev
    preflight: true,
    strictPreflight: false,

    credentials: false, // keep false unless you use cookies
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });
  // --- Merchants ---
  app.post("/merchants", async (request, reply) => {
    const parsed = CreateMerchant.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.message);
    const db = await getDb();
    const [row] = await db
      .insert(tMerchants)
      .values({ name: parsed.data.name })
      .returning({
        id: tMerchants.id,
        name: tMerchants.name,
        createdAt: tMerchants.createdAt,
      });
    return reply.status(201).send(row);
  });

  app.get("/merchants", async () => {
    const db = await getDb();
    const rows = await db.select().from(tMerchants).orderBy(tMerchants.id);
    return rows;
  });

  // --- Passes ---
  app.post("/passes", async (request, reply) => {
    const parsed = CreatePass.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.message);

    const { merchantId, sku, title } = parsed.data;
    const db = await getDb();
    const merchant = await db.query.merchants.findFirst({
      where: eq(tMerchants.id, Number(merchantId)),
    });
    if (!merchant) {
      return reply.status(400).send({ error: "Invalid merchantId" });
    }

    const existing = await db.query.passes.findFirst({
      where: eq(tPasses.sku, sku),
    });
    if (existing) {
      return reply.status(409).send({ error: "SKU already exists" });
    }

    const [row] = await db
      .insert(tPasses)
      .values({ merchantId: Number(merchantId), sku, title })
      .returning({
        id: tPasses.id,
        merchantId: tPasses.merchantId,
        sku: tPasses.sku,
        title: tPasses.title,
        active: tPasses.active,
        createdAt: tPasses.createdAt,
      });
    return reply.status(201).send(row);
  });

  app.get("/passes/:sku", async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const db = await getDb();
    const pass = await db.query.passes.findFirst({
      where: eq(tPasses.sku, sku),
    });
    if (!pass) {
      return reply.status(404).send({ error: "Pass not found" });
    }
    return pass;
  });

  // --- Orders ---
  app.post("/orders", async (request, reply) => {
    const parsed = CreateOrder.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.message);

    const { merchantId, sku, amount } = parsed.data;
    const db = await getDb();
    const merchant = await db.query.merchants.findFirst({
      where: eq(tMerchants.id, Number(merchantId)),
    });
    if (!merchant) {
      return reply.status(400).send({ error: "Invalid merchantId" });
    }

    const pass = await db.query.passes.findFirst({
      where: eq(tPasses.sku, sku),
    });
    if (!pass) {
      return reply.status(400).send({ error: "Invalid SKU" });
    }

    const [row] = await db
      .insert(tOrders)
      .values({ merchantId: Number(merchantId), sku, amount, chain: "mock" })
      .returning({
        id: tOrders.id,
        merchantId: tOrders.merchantId,
        sku: tOrders.sku,
        amount: tOrders.amount,
        chain: tOrders.chain,
        tx: tOrders.tx,
        createdAt: tOrders.createdAt,
      });
    return reply.status(201).send(row);
  });

  app.patch("/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateOrderTx.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.message);

    const db = await getDb();
    const orderId = Number(id);
    const [row] = await db
      .update(tOrders)
      .set({
      tx: parsed.data.tx,
      chain: parsed.data.chain,
      status: "paid",
      ...(parsed.data.receiptUrl ? { receiptUrl: parsed.data.receiptUrl } : {}),
    })
      .where(eq(tOrders.id, orderId))
      .returning({
        id: tOrders.id,
        merchantId: tOrders.merchantId,
        sku: tOrders.sku,
        amount: tOrders.amount,
        chain: tOrders.chain,
        tx: tOrders.tx,
        createdAt: tOrders.createdAt,
      });
    if (!row) {
      return reply.status(404).send({ error: "Order not found" });
    }
    return row;
  });

  app.post("/telegram-verify", async (request, reply) => {
    const { initData } = (request.body ?? {}) as { initData?: string };
    if (!initData) {
      return reply
        .status(400)
        .send({ ok: false, error: "No initData provided" });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      request.log.error("No TELEGRAM_BOT_TOKEN in env");
      return reply
        .status(500)
        .send({ ok: false, error: "Server misconfiguration" });
    }

    const result = verifyTelegramInitData(initData, botToken);
    return reply.send(result);
  });

  app.patch("/orders/:id/solana", async (request, reply) => {
    const { id } = request.params as { id: string };
    const fakeTx = crypto.randomBytes(32).toString("hex");

    const db = await getDb();
    const [row] = await db
      .update(tOrders)
      .set({ tx: fakeTx, chain: "sol" })
      .where(eq(tOrders.id, Number(id)))
      .returning();
    if (!row) {
      return reply.status(404).send({ error: "Order not found" });
    }

    return row;
  });

  // ---------- ADMIN: LIST ORDERS ----------
  app.get("/admin/orders", async (request, reply) => {
    const { limit = "50", offset = "0" } = request.query as {
      limit?: string;
      offset?: string;
    };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = Math.max(Number(offset) || 0, 0);

    const db = await getDb();

    const rows = await db
      .select()
      .from(tOrders)
      .orderBy(sql`${tOrders.id} DESC`)
      .limit(take)
      .offset(skip);
    return rows;
  });

  // ---------- ADMIN: LIST PASSES ----------
  app.get("/admin/passes", async (request, reply) => {
    const { limit = "50", offset = "0" } = request.query as {
      limit?: string;
      offset?: string;
    };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = Math.max(Number(offset) || 0, 0);
    const db = await getDb();
    const rows = await db
      .select()
      .from(tPasses)
      .orderBy(sql`${tPasses.id}`)
      .limit(take)
      .offset(skip);
    return rows;
  });

  // ---------- ADMIN: VERIFY (SKU + TX) ----------
  app.get("/admin/verify", async (request, reply) => {
    const { sku, tx } = request.query as { sku?: string; tx?: string };
    if (!sku || !tx) {
      return reply
        .status(400)
        .send({ ok: false, error: "sku and tx query params are required" });
    }
    const db = await getDb();
    type OrderResult = {
      id: number;
      sku: string;
      tx: string | null;
      chain: string;
      status?: string;
      receiptUrl?: string | null;
      createdAt: Date;
    };

    const order = (await db.query.orders.findFirst({
      where: (o, { and, eq }) => and(eq(o.sku, sku), eq(o.tx, tx)),
      columns: {
        id: true,
        sku: true,
        tx: true,
        chain: true,
        // these may not exist if you haven't added them yet
        status: "status" in tOrders ? true : undefined,
        receiptUrl: "receiptUrl" in tOrders ? true : undefined,
        createdAt: true,
      },
    })) as OrderResult | undefined;

    if (!order) {
      return { valid: false, reason: "No order found for this SKU + TX" };
    }

    const isPaid = order.status ? order.status === "paid" : Boolean(order.tx);
    if (!isPaid) {
      return { valid: false, reason: "Order exists but not paid yet" };
    }

    return {
      valid: true,
      orderId: order.id,
      chain: order.chain,
      receiptUrl: order.receiptUrl ?? null,
      createdAt: order.createdAt,
    };
  });

  return app;
}
