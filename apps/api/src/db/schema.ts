import {
    pgTable,
    serial,
    text,
    timestamp,
    varchar,
    boolean,
    integer
} from "drizzle-orm/pg-core";

export const merchants = pgTable("merchants", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passes = pgTable("passes", {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchants.id),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchants.id),
    sku: varchar("sku", { length: 64 }).notNull(),
    amount: integer("amount").notNull(),
    chain: varchar("chain", { length: 32 }).notNull(),
    tx: text("tx"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});