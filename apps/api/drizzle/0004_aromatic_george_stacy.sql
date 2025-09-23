CREATE TABLE "app_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"merchant_id" integer,
	"customer_id" integer,
	"event" text NOT NULL,
	"props" jsonb
);
--> statement-breakpoint
CREATE TABLE "chain_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"pass_id" integer NOT NULL,
	"chain" varchar(16) NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"tg_user_id" bigint,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"sig" "bytea" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "amount_nano" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "memo" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "to_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "passes" ADD COLUMN "price_nano" bigint;--> statement-breakpoint
ALTER TABLE "passes" ADD COLUMN "chain" varchar(16);--> statement-breakpoint
ALTER TABLE "chain_bindings" ADD CONSTRAINT "chain_bindings_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_receipts" ADD CONSTRAINT "verification_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_app_events_ts" ON "app_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "ix_app_events_merchant" ON "app_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_chain_bindings_pass_chain" ON "chain_bindings" USING btree ("pass_id","chain");--> statement-breakpoint
CREATE INDEX "ix_customers_merchant" ON "customers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ix_customers_tg" ON "customers" USING btree ("tg_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_merchant_users_merchant_email" ON "merchant_users" USING btree ("merchant_id","email");--> statement-breakpoint
CREATE INDEX "ix_verification_receipts_order" ON "verification_receipts" USING btree ("order_id");