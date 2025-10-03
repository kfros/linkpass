CREATE TABLE "active_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "active_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"profile_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_merchant_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."merchant_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_providers" ADD CONSTRAINT "oauth_providers_user_id_merchant_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."merchant_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_active_sessions_user" ON "active_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_active_sessions_session" ON "active_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ix_active_sessions_activity" ON "active_sessions" USING btree ("last_activity");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_oauth_providers_provider_id" ON "oauth_providers" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "ix_oauth_providers_user" ON "oauth_providers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_oauth_providers_email" ON "oauth_providers" USING btree ("email");