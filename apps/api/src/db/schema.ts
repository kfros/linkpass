import {
pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  uuid,
  bigint,
  jsonb,
  bigserial,
  customType,
} from "drizzle-orm/pg-core";
import { fr } from "zod/v4/locales/index.cjs";

export const bytea = customType<{ data: string; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
  toDriver(val) {
    let newVal = val;
    if (val.startsWith("0x")) {
      newVal = val.slice(2);
    }

    return Buffer.from(newVal, "hex");
  },
  fromDriver(val: unknown) {
    return (val as Buffer).toString("hex");
  },
})

export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "paying",
  "paid",
  "failed",
]);

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passes = pgTable("passes", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchants.id),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  active: boolean("active").default(true).notNull(),
  
    // NEW (additive): prep for pricing + multi-chain
    priceNano: bigint("price_nano", { mode: "bigint" }), // nullable for safe rollout
    chain: varchar("chain", { length: 16 }),             // e.g., 'TON' | 'SOL'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchants.id),
    sku: varchar("sku", { length: 64 }).notNull(),
    amount: integer("amount").notNull(),
    chain: varchar("chain", { length: 32 }).notNull(),
    from: varchar("from_address", { length: 128 }),
    tgUserId: text("tg_user_id"),
    tgUsername: text("tg_username"),
    tx: text("tx"),
    status: orderStatusEnum("status").default("created").notNull(),
    receiptUrl: text("receipt_url"),

    // NEW (additive): precise amount + memo + toAddress + confirmedAt
    amountNano: bigint("amount_nano", { mode: "bigint" }),
    memo: text("memo"),
    toAddress: text("to_address"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_orders_sku").on(t.sku), index("idx_orders_tx").on(t.tx)]
);

// 1) Multi-merchant users (Stripe-like)
export const merchantUsers = pgTable(
  "merchant_users",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ux_merchant_users_merchant_email").on(t.merchantId, t.email),
  ]
);

// 2) Customers (per merchant; links to Telegram where applicable)
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    tgUserId: bigint("tg_user_id", { mode: "bigint" }), // Telegram user id (optional)
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ix_customers_merchant").on(t.merchantId),
    index("ix_customers_tg").on(t.tgUserId),
  ]
);

// 3) Chain bindings (per pass, per chain) for the unified view
export const chainBindings = pgTable(
  "chain_bindings",
  {
    id: serial("id").primaryKey(),
    passId: integer("pass_id").notNull().references(() => passes.id, { onDelete: "cascade" }),
    chain: varchar("chain", { length: 16 }).notNull(), // 'TON' | 'SOL'
    assetId: text("asset_id").notNull(),               // NFT/jetton/mint addr, etc.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ux_chain_bindings_pass_chain").on(t.passId, t.chain),
  ]
);

// 4) Verification receipts (public deep links to validate an order)
export const verificationReceipts = pgTable("verification_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  sig: bytea("sig").notNull(), // HMAC/EdDSA signature bytes
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ix_verification_receipts_order").on(t.orderId),
]);


// 5) App events (staging table; ship to ClickHouse later)
export const appEvents = pgTable(
  "app_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    merchantId: integer("merchant_id"),
    customerId: integer("customer_id"),
    event: text("event").notNull(),   // 'purchase_initiated' | 'purchase_succeeded' | ...
    props: jsonb("props"),            // lightweight context
  },
  (t) => [
    index("ix_app_events_ts").on(t.ts),
    index("ix_app_events_merchant").on(t.merchantId),
  ]
);