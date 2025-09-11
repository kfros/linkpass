"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orders = exports.passes = exports.merchants = exports.orderStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.orderStatusEnum = (0, pg_core_1.pgEnum)("order_status", [
    "created",
    "paying",
    "paid",
    "failed",
]);
exports.merchants = (0, pg_core_1.pgTable)("merchants", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 120 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.passes = (0, pg_core_1.pgTable)("passes", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    merchantId: (0, pg_core_1.integer)("merchant_id")
        .notNull()
        .references(() => exports.merchants.id),
    sku: (0, pg_core_1.varchar)("sku", { length: 64 }).notNull().unique(),
    title: (0, pg_core_1.varchar)("title", { length: 200 }).notNull(),
    active: (0, pg_core_1.boolean)("active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.orders = (0, pg_core_1.pgTable)("orders", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    merchantId: (0, pg_core_1.integer)("merchant_id")
        .notNull()
        .references(() => exports.merchants.id),
    sku: (0, pg_core_1.varchar)("sku", { length: 64 }).notNull(),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    chain: (0, pg_core_1.varchar)("chain", { length: 32 }).notNull(),
    tx: (0, pg_core_1.text)("tx"),
    status: (0, exports.orderStatusEnum)("status").default("created").notNull(),
    receiptUrl: (0, pg_core_1.text)("receipt_url"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (t) => [(0, pg_core_1.index)("idx_orders_sku").on(t.sku), (0, pg_core_1.index)("idx_orders_tx").on(t.tx)]);
