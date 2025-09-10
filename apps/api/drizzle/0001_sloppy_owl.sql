CREATE TYPE "public"."order_status" AS ENUM('created', 'paying', 'paid', 'failed');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status" "order_status" DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_orders_sku" ON "orders" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_orders_tx" ON "orders" USING btree ("tx");