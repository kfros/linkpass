import fastify from "fastify";
import cors from "@fastify/cors";
// import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getDb } from "./db/client";
import { eq } from "drizzle-orm";
import {
  merchants as tMerchants,
  passes as tPasses,
  orders as tOrders,
} from "./db/schema";

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
});

export async function buildServer() {
  const app = fastify({ logger: true });
  await app.register(cors, {
  // Accept localhost and any ngrok-free.app subdomain over http/https
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/Postman/same-origin
    const ok =
      origin === 'http://localhost:3000' ||
      origin === 'https://localhost:3000' ||
      /^https?:\/\/[a-z0-9-]+\.ngrok-free\.app$/i.test(origin);
    cb(null, ok);
  },

  // Be explicit: browsers preflight PATCH with these headers
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Type'],
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
      .set({ tx: parsed.data.tx, chain: parsed.data.chain })
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
  return app;
}
