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
} from "drizzle-orm/pg-core";
import { fr } from "zod/v4/locales/index.cjs";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_orders_sku").on(t.sku), index("idx_orders_tx").on(t.tx)]
);
