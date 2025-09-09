import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
// Extend globalThis to include _pgPool
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pgPool = globalThis._pgPool ?? new Pool({
  connectionString, max: 5, idleTimeoutMillis: 30_000
});

if (!globalThis._pgPool) globalThis._pgPool = pgPool;

export const db = drizzle(pgPool, { schema });

export function getDb() {
  return db;
}