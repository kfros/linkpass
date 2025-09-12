ALTER TABLE "orders" ALTER COLUMN "from_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tg_user_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tg_username" text;