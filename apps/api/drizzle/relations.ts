import { relations } from "drizzle-orm/relations";
import { merchants, orders, merchantUsers, passes, chainBindings, customers, verificationReceipts, activeSessions, refreshTokens, oauthProviders } from "./schema";

export const ordersRelations = relations(orders, ({one, many}) => ({
	merchant: one(merchants, {
		fields: [orders.merchantId],
		references: [merchants.id]
	}),
	verificationReceipts: many(verificationReceipts),
}));

export const merchantsRelations = relations(merchants, ({many}) => ({
	orders: many(orders),
	merchantUsers: many(merchantUsers),
	passes: many(passes),
	customers: many(customers),
}));

export const merchantUsersRelations = relations(merchantUsers, ({one, many}) => ({
	merchant: one(merchants, {
		fields: [merchantUsers.merchantId],
		references: [merchants.id]
	}),
	activeSessions: many(activeSessions),
	refreshTokens: many(refreshTokens),
	oauthProviders: many(oauthProviders),
}));

export const passesRelations = relations(passes, ({one, many}) => ({
	merchant: one(merchants, {
		fields: [passes.merchantId],
		references: [merchants.id]
	}),
	chainBindings: many(chainBindings),
}));

export const chainBindingsRelations = relations(chainBindings, ({one}) => ({
	pass: one(passes, {
		fields: [chainBindings.passId],
		references: [passes.id]
	}),
}));

export const customersRelations = relations(customers, ({one}) => ({
	merchant: one(merchants, {
		fields: [customers.merchantId],
		references: [merchants.id]
	}),
}));

export const verificationReceiptsRelations = relations(verificationReceipts, ({one}) => ({
	order: one(orders, {
		fields: [verificationReceipts.orderId],
		references: [orders.id]
	}),
}));

export const activeSessionsRelations = relations(activeSessions, ({one}) => ({
	merchantUser: one(merchantUsers, {
		fields: [activeSessions.userId],
		references: [merchantUsers.id]
	}),
}));

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	merchantUser: one(merchantUsers, {
		fields: [refreshTokens.userId],
		references: [merchantUsers.id]
	}),
}));

export const oauthProvidersRelations = relations(oauthProviders, ({one}) => ({
	merchantUser: one(merchantUsers, {
		fields: [oauthProviders.userId],
		references: [merchantUsers.id]
	}),
}));