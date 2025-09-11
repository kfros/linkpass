"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
// import { ZodTypeProvider } from "fastify-type-provider-zod";
const zod_1 = require("zod");
const client_1 = require("./db/client");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./db/schema");
const verify_1 = require("./telegram/verify");
const crypto_1 = __importDefault(require("crypto"));
const CreateMerchant = zod_1.z.object({
    name: zod_1.z.string().min(2),
});
const CreatePass = zod_1.z.object({
    merchantId: zod_1.z.coerce.number().int().positive(),
    sku: zod_1.z
        .string()
        .min(2)
        .regex(/^[a-zA-Z0-9-]+$/i, "SKU must be alphanumeric with optional dashes"),
    title: zod_1.z.string().min(2),
});
const CreateOrder = zod_1.z.object({
    merchantId: zod_1.z.coerce.number().int().positive(),
    sku: zod_1.z.string().min(2),
    amount: zod_1.z.number().positive(),
});
const UpdateOrderTx = zod_1.z.object({
    tx: zod_1.z.string().min(1),
    chain: zod_1.z.enum(["sol", "ton"]),
});
async function buildServer() {
    const app = (0, fastify_1.default)({ logger: true });
    await app.register(cors_1.default, {
        // Accept localhost and any ngrok-free.app subdomain over http/https
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true); // curl/Postman/same-origin
            const ok = origin === "http://localhost:3000" ||
                origin === "https://localhost:3000" ||
                /^https?:\/\/[a-z0-9-]+\.ngrok-free\.app$/i.test(origin);
            cb(null, ok);
        },
        // Be explicit: browsers preflight PATCH with these headers
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept", "Authorization"],
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
        if (!parsed.success)
            return reply.code(400).send(parsed.error.message);
        const db = await (0, client_1.getDb)();
        const [row] = await db
            .insert(schema_1.merchants)
            .values({ name: parsed.data.name })
            .returning({
            id: schema_1.merchants.id,
            name: schema_1.merchants.name,
            createdAt: schema_1.merchants.createdAt,
        });
        return reply.status(201).send(row);
    });
    app.get("/merchants", async () => {
        const db = await (0, client_1.getDb)();
        const rows = await db.select().from(schema_1.merchants).orderBy(schema_1.merchants.id);
        return rows;
    });
    // --- Passes ---
    app.post("/passes", async (request, reply) => {
        const parsed = CreatePass.safeParse(request.body);
        if (!parsed.success)
            return reply.code(400).send(parsed.error.message);
        const { merchantId, sku, title } = parsed.data;
        const db = await (0, client_1.getDb)();
        const merchant = await db.query.merchants.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.merchants.id, Number(merchantId)),
        });
        if (!merchant) {
            return reply.status(400).send({ error: "Invalid merchantId" });
        }
        const existing = await db.query.passes.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.passes.sku, sku),
        });
        if (existing) {
            return reply.status(409).send({ error: "SKU already exists" });
        }
        const [row] = await db
            .insert(schema_1.passes)
            .values({ merchantId: Number(merchantId), sku, title })
            .returning({
            id: schema_1.passes.id,
            merchantId: schema_1.passes.merchantId,
            sku: schema_1.passes.sku,
            title: schema_1.passes.title,
            active: schema_1.passes.active,
            createdAt: schema_1.passes.createdAt,
        });
        return reply.status(201).send(row);
    });
    app.get("/passes/:sku", async (request, reply) => {
        const { sku } = request.params;
        const db = await (0, client_1.getDb)();
        const pass = await db.query.passes.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.passes.sku, sku),
        });
        if (!pass) {
            return reply.status(404).send({ error: "Pass not found" });
        }
        return pass;
    });
    // --- Orders ---
    app.post("/orders", async (request, reply) => {
        const parsed = CreateOrder.safeParse(request.body);
        if (!parsed.success)
            return reply.code(400).send(parsed.error.message);
        const { merchantId, sku, amount } = parsed.data;
        const db = await (0, client_1.getDb)();
        const merchant = await db.query.merchants.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.merchants.id, Number(merchantId)),
        });
        if (!merchant) {
            return reply.status(400).send({ error: "Invalid merchantId" });
        }
        const pass = await db.query.passes.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.passes.sku, sku),
        });
        if (!pass) {
            return reply.status(400).send({ error: "Invalid SKU" });
        }
        const [row] = await db
            .insert(schema_1.orders)
            .values({ merchantId: Number(merchantId), sku, amount, chain: "mock" })
            .returning({
            id: schema_1.orders.id,
            merchantId: schema_1.orders.merchantId,
            sku: schema_1.orders.sku,
            amount: schema_1.orders.amount,
            chain: schema_1.orders.chain,
            tx: schema_1.orders.tx,
            createdAt: schema_1.orders.createdAt,
        });
        return reply.status(201).send(row);
    });
    app.patch("/orders/:id", async (request, reply) => {
        const { id } = request.params;
        const parsed = UpdateOrderTx.safeParse(request.body);
        if (!parsed.success)
            return reply.code(400).send(parsed.error.message);
        const db = await (0, client_1.getDb)();
        const orderId = Number(id);
        const [row] = await db
            .update(schema_1.orders)
            .set({ tx: parsed.data.tx, chain: parsed.data.chain })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
            .returning({
            id: schema_1.orders.id,
            merchantId: schema_1.orders.merchantId,
            sku: schema_1.orders.sku,
            amount: schema_1.orders.amount,
            chain: schema_1.orders.chain,
            tx: schema_1.orders.tx,
            createdAt: schema_1.orders.createdAt,
        });
        if (!row) {
            return reply.status(404).send({ error: "Order not found" });
        }
        return row;
    });
    app.post("/telegram-verify", async (request, reply) => {
        const { initData } = (request.body ?? {});
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
        const result = (0, verify_1.verifyTelegramInitData)(initData, botToken);
        return reply.send(result);
    });
    app.patch("/orders/:id/solana", async (request, reply) => {
        const { id } = request.params;
        const fakeTx = crypto_1.default.randomBytes(32).toString("hex");
        const db = await (0, client_1.getDb)();
        const [row] = await db
            .update(schema_1.orders)
            .set({ tx: fakeTx, chain: "sol" })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, Number(id)))
            .returning();
        if (!row) {
            return reply.status(404).send({ error: "Order not found" });
        }
        return row;
    });
    // ---------- ADMIN: LIST ORDERS ----------
    app.get("/admin/orders", async (request, reply) => {
        const { limit = "50", offset = "0" } = request.query;
        const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
        const skip = Math.max(Number(offset) || 0, 0);
        const db = await (0, client_1.getDb)();
        const rows = await db
            .select()
            .from(schema_1.orders)
            .orderBy((0, drizzle_orm_1.sql) `${schema_1.orders.id} DESC`)
            .limit(take)
            .offset(skip);
        return rows;
    });
    // ---------- ADMIN: LIST PASSES ----------
    app.get("/admin/passes", async (request, reply) => {
        const { limit = "50", offset = "0" } = request.query;
        const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
        const skip = Math.max(Number(offset) || 0, 0);
        const db = await (0, client_1.getDb)();
        const rows = await db
            .select()
            .from(schema_1.passes)
            .orderBy((0, drizzle_orm_1.sql) `${schema_1.passes.id}`)
            .limit(take)
            .offset(skip);
        return rows;
    });
    // ---------- ADMIN: VERIFY (SKU + TX) ----------
    app.get("/admin/verify", async (request, reply) => {
        const { sku, tx } = request.query;
        if (!sku || !tx) {
            return reply
                .status(400)
                .send({ ok: false, error: "sku and tx query params are required" });
        }
        const db = await (0, client_1.getDb)();
        const order = (await db.query.orders.findFirst({
            where: (o, { and, eq }) => and(eq(o.sku, sku), eq(o.tx, tx)),
            columns: {
                id: true,
                sku: true,
                tx: true,
                chain: true,
                // these may not exist if you haven't added them yet
                status: "status" in schema_1.orders ? true : undefined,
                receiptUrl: "receiptUrl" in schema_1.orders ? true : undefined,
                createdAt: true,
            },
        }));
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
