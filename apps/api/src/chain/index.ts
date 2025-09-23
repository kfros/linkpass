import type { Chain, ChainGateway } from "./types";
import { tonGateway } from "./ton.gateway";
import { solanaGateway } from "./solana.gateway";

const registry: Record<Chain, ChainGateway> = {
  TON: tonGateway,
  SOL: solanaGateway,
};

export function getGateway(chain: Chain): ChainGateway {
  const gw = registry[chain];
  if (!gw) throw new Error(`No gateway for chain: ${chain}`);
  return gw;
}
