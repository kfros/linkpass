import type {
  ChainGateway,
  PaymentIntentInput,
  PaymentIntent,
  FindIncomingInput,
  FindIncomingResult,
} from "./types";
import { findIncomingTxCombined } from "../chain/tonFinder"; // keep your current file
import assert from "node:assert/strict";

function encodeMemo(s?: string) {
  return s ? encodeURIComponent(s) : "";
}

export class TonGateway implements ChainGateway {
  readonly chain = "TON" as const;

  async makePaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    const { to, amountNano, memo } = input;
    assert(to, "TON: 'to' is required");
    assert(/^\d+$/.test(String(amountNano)), "TON: amountNano must be an integer string");

    // TON deep link: amount in NANOtons (integer), memo via 'text' param
    const qp = new URLSearchParams();
    qp.set("amount", String(amountNano));
    if (memo) qp.set("text", encodeMemo(memo));

    const uri = `ton://transfer/${to}?${qp.toString()}`;
    return { uri, qrText: uri, memo };
  }

  async findIncoming(input: FindIncomingInput): Promise<FindIncomingResult | null> {
    const { to, amountNano, memo } = input;
    const hit = await findIncomingTxCombined(to, String(amountNano), memo ?? "");
    if (!hit.ok) return null;
    return { txHash: hit.txHash, from: hit.from ?? null };
  }

  explorerTxUrl(txHash: string): string {
    // Works with base64 hash produced by your finder
    const base = process.env.TON_NETWORK === "mainnet"
      ? "https://tonviewer.com/transaction/"
      : "https://testnet.tonviewer.com/transaction/";
    return base + txHash;
  }
}

// Singleton
export const tonGateway = new TonGateway();
