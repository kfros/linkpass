import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

let connected = false;
export async function getDb() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return drizzle(client, { schema });
}