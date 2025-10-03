CREATE TABLE "revoked_access_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ix_revoked_access_tokens_hash" ON "revoked_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_revoked_access_tokens_expiry" ON "revoked_access_tokens" USING btree ("expires_at");