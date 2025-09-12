// apps/api/src/chain/tonRpc.ts
import { TonClient } from "@ton/ton";

let _client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (_client) return _client;

  const endpoint = (process.env.TON_RPC_URL || "").trim();          // MUST be .../api/v2/jsonRPC
  if (!endpoint) throw new Error("TON_RPC_URL is not set");

  const apiKey = (process.env.TON_RPC_API_KEY || "").trim() || undefined;

  // TonClient will POST directly to the endpoint you pass.
  // For TonCenter, pass the full /api/v2/jsonRPC and the apiKey separately.
  _client = new TonClient({ endpoint, apiKey });

  return _client;
}
