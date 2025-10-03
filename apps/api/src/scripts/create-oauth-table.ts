#!/usr/bin/env ts-node
import { getDb } from "../db/client";

async function createOAuthTable() {
  const db = await getDb();
  
  try {
    // Create OAuth providers table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS oauth_providers (
        id serial PRIMARY KEY NOT NULL,
        user_id integer NOT NULL,
        provider varchar(50) NOT NULL,
        provider_id text NOT NULL,
        email text,
        display_name text,
        profile_data jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    
    // Add foreign key constraint
    await db.execute(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'oauth_providers_user_id_merchant_users_id_fk'
        ) THEN
          ALTER TABLE oauth_providers 
          ADD CONSTRAINT oauth_providers_user_id_merchant_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES merchant_users(id) ON DELETE cascade;
        END IF;
      END $$;
    `);
    
    // Create indexes
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_oauth_providers_provider_id 
      ON oauth_providers (provider, provider_id);
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS ix_oauth_providers_user 
      ON oauth_providers (user_id);
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS ix_oauth_providers_email 
      ON oauth_providers (email);
    `);
    
    console.log("✅ OAuth providers table created successfully!");
    
  } catch (error) {
    console.error("❌ Error creating OAuth table:", error);
  }
}

if (require.main === module) {
  createOAuthTable().then(() => {
    console.log("Script completed");
    process.exit(0);
  }).catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}