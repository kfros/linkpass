export type Chain = "TON" | "SOL";

export interface PaymentIntentInput {
  to: string;              // recipient address
  amountNano: string;      // integer nanoton / lamports etc.
  memo?: string;           // optional comment / reference
  from?: string;           // sender wallet public key (for Solana)
  disableMemo?: boolean;   // disables memo instruction for debugging
}

export interface PaymentIntent {
  uri: string;             // deep link (e.g., ton://transfer/...)
  qrText: string;          // same as uri (for QR generator)
  memo?: string;
  debug?: {
    base64Transaction: string;
    disableMemo?: boolean;
  };
}

export interface FindIncomingInput {
  to: string;
  amountNano: string;
  memo?: string;
  notOlderThanMs?: number; // gateway may ignore if it can’t use it
}

export interface FindIncomingResult {
  txHash: string;
  from?: string | null;
}

export interface ChainGateway {
  readonly chain: Chain;

  makePaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent>;

  findIncoming(input: FindIncomingInput): Promise<FindIncomingResult | null>;

  explorerTxUrl(txHash: string): string;
}
