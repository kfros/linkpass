import { pgTable, index, bigserial, timestamp, integer, text, jsonb, serial, varchar, foreignKey, numeric, bigint, uniqueIndex, unique, boolean, uuid, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const orderStatus = pgEnum("order_status", ['created', 'paying', 'paid', 'failed'])


export const appEvents = pgTable("app_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	ts: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	merchantId: integer("merchant_id"),
	customerId: integer("customer_id"),
	event: text().notNull(),
	props: jsonb(),
}, (table) => [
	index("ix_app_events_merchant").using("btree", table.merchantId.asc().nullsLast().op("int4_ops")),
	index("ix_app_events_ts").using("btree", table.ts.asc().nullsLast().op("timestamptz_ops")),
]);

export const merchants = pgTable("merchants", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 120 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const orders = pgTable("orders", {
	id: serial().primaryKey().notNull(),
	merchantId: integer("merchant_id").notNull(),
	sku: varchar({ length: 64 }).notNull(),
	amount: numeric({ precision: 20, scale:  9 }).notNull(),
	chain: varchar({ length: 32 }).notNull(),
	tx: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: orderStatus().default('created').notNull(),
	receiptUrl: text("receipt_url"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fromAddress: varchar("from_address", { length: 128 }),
	tgUserId: text("tg_user_id"),
	tgUsername: text("tg_username"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountNano: bigint("amount_nano", { mode: "number" }),
	memo: text(),
	toAddress: text("to_address"),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_orders_sku").using("btree", table.sku.asc().nullsLast().op("text_ops")),
	index("idx_orders_tx").using("btree", table.tx.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.merchantId],
			foreignColumns: [merchants.id],
			name: "orders_merchant_id_merchants_id_fk"
		}),
]);

export const merchantUsers = pgTable("merchant_users", {
	id: serial().primaryKey().notNull(),
	merchantId: integer("merchant_id").notNull(),
	email: text().notNull(),
	role: text().default('admin').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	passwordHash: text("password_hash"),
}, (table) => [
	uniqueIndex("ux_merchant_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("ux_merchant_users_merchant_email").using("btree", table.merchantId.asc().nullsLast().op("int4_ops"), table.email.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.merchantId],
			foreignColumns: [merchants.id],
			name: "merchant_users_merchant_id_merchants_id_fk"
		}).onDelete("cascade"),
]);

export const passes = pgTable("passes", {
	id: serial().primaryKey().notNull(),
	merchantId: integer("merchant_id").notNull(),
	sku: varchar({ length: 64 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	priceNano: bigint("price_nano", { mode: "number" }),
	chain: varchar({ length: 16 }),
}, (table) => [
	foreignKey({
			columns: [table.merchantId],
			foreignColumns: [merchants.id],
			name: "passes_merchant_id_merchants_id_fk"
		}),
	unique("passes_sku_unique").on(table.sku),
]);

export const chainBindings = pgTable("chain_bindings", {
	id: serial().primaryKey().notNull(),
	passId: integer("pass_id").notNull(),
	chain: varchar({ length: 16 }).notNull(),
	assetId: text("asset_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("ux_chain_bindings_pass_chain").using("btree", table.passId.asc().nullsLast().op("int4_ops"), table.chain.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.passId],
			foreignColumns: [passes.id],
			name: "chain_bindings_pass_id_passes_id_fk"
		}).onDelete("cascade"),
]);

export const customers = pgTable("customers", {
	id: serial().primaryKey().notNull(),
	merchantId: integer("merchant_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tgUserId: bigint("tg_user_id", { mode: "number" }),
	email: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_customers_merchant").using("btree", table.merchantId.asc().nullsLast().op("int4_ops")),
	index("ix_customers_tg").using("btree", table.tgUserId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.merchantId],
			foreignColumns: [merchants.id],
			name: "customers_merchant_id_merchants_id_fk"
		}).onDelete("cascade"),
]);

export const verificationReceipts = pgTable("verification_receipts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: integer("order_id").notNull(),
	// TODO: failed to parse database type 'bytea'
	sig: unknown("sig").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_verification_receipts_order").using("btree", table.orderId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "verification_receipts_order_id_orders_id_fk"
		}).onDelete("cascade"),
]);

export const activeSessions = pgTable("active_sessions", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	sessionId: text("session_id").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	lastActivity: timestamp("last_activity", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("ix_active_sessions_activity").using("btree", table.lastActivity.asc().nullsLast().op("timestamptz_ops")),
	index("ix_active_sessions_session").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("ix_active_sessions_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [merchantUsers.id],
			name: "active_sessions_user_id_merchant_users_id_fk"
		}).onDelete("cascade"),
	unique("active_sessions_session_id_unique").on(table.sessionId),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("ix_refresh_tokens_hash").using("btree", table.tokenHash.asc().nullsLast().op("text_ops")),
	index("ix_refresh_tokens_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [merchantUsers.id],
			name: "refresh_tokens_user_id_merchant_users_id_fk"
		}).onDelete("cascade"),
]);

export const oauthProviders = pgTable("oauth_providers", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	provider: varchar({ length: 50 }).notNull(),
	providerId: text("provider_id").notNull(),
	email: text(),
	displayName: text("display_name"),
	profileData: jsonb("profile_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_oauth_providers_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("ix_oauth_providers_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("ux_oauth_providers_provider_id").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [merchantUsers.id],
			name: "oauth_providers_user_id_merchant_users_id_fk"
		}).onDelete("cascade"),
]);
