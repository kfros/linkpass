import type {
  ChainGateway,
  PaymentIntentInput,
  PaymentIntent,
  FindIncomingInput,
  FindIncomingResult,
} from "./types";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "node:assert/strict";

export class SolanaGateway implements ChainGateway {
  readonly chain = "SOL" as const;

  private getConnection(): Connection {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    return new Connection(rpcUrl, "confirmed");
  }

  private getRecipientAddress(): string {
    const addr = process.env.SOLANA_RECIPIENT_ADDRESS;
    if (!addr) throw new Error("SOLANA_RECIPIENT_ADDRESS not configured");
    return addr;
  }

  async makePaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    const { to, amountNano, memo } = input;
    assert(to, "Solana: 'to' is required");
    assert(/^\d+$/.test(String(amountNano)), "Solana: amountNano must be an integer string");

    const connection = this.getConnection();
    const recipient = new PublicKey(to);
    const lamports = BigInt(amountNano);

    // Create a basic SOL transfer transaction
    const transaction = new Transaction();
    
    // Add transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey("11111111111111111111111111111111"), // placeholder - will be replaced by user's wallet
        toPubkey: recipient,
        lamports: Number(lamports),
      })
    );

    // Add memo instruction if provided
    if (memo) {
      const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
      transaction.add(
        new TransactionInstruction({
          keys: [],
          programId: memoProgram,
          data: Buffer.from(memo, "utf8"),
        })
      );
    }

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Serialize transaction for Blink
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const base64Transaction = serializedTransaction.toString("base64");
    
    // Create Blink-compatible URI
    const blinkUrl = this.createBlinkUrl(base64Transaction, memo);
    
    return {
      uri: blinkUrl,
      qrText: blinkUrl,
      memo,
    };
  }

  private createBlinkUrl(serializedTx: string, memo?: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4000";
    const actionUrl = `${baseUrl}/api/actions/buy-pass`;
    
    const params = new URLSearchParams();
    params.set("tx", serializedTx);
    if (memo) params.set("memo", memo);
    
    return `${actionUrl}?${params.toString()}`;
  }

  async findIncoming(input: FindIncomingInput): Promise<FindIncomingResult | null> {
    const { to, amountNano, memo, notOlderThanMs = 10 * 60 * 1000 } = input;
    
    try {
      const connection = this.getConnection();
      const recipientPubkey = new PublicKey(to);
      const expectedAmount = BigInt(amountNano);
      
      // Get recent transaction signatures for the recipient address
      const signatures = await connection.getSignaturesForAddress(
        recipientPubkey,
        {
          limit: 50,
        }
      );

      const cutoffTime = Date.now() - notOlderThanMs;

      for (const sigInfo of signatures) {
        // Skip if too old
        if (sigInfo.blockTime && sigInfo.blockTime * 1000 < cutoffTime) {
          continue;
        }

        // Get transaction details
        const tx = await connection.getTransaction(sigInfo.signature, {
          commitment: "confirmed",
        });

        if (!tx || !tx.meta) continue;

        // Check if transaction was successful
        if (tx.meta.err) continue;

        // Check for SOL transfer to our address
        const preBalance = tx.meta.preBalances[1] || 0; // recipient usually at index 1
        const postBalance = tx.meta.postBalances[1] || 0;
        const receivedAmount = postBalance - preBalance;

        if (receivedAmount === Number(expectedAmount)) {
          // If memo is specified, check if it matches
          if (memo) {
            const memoInstruction = tx.transaction.message.instructions.find(
              (ix) => {
                const programId = tx.transaction.message.accountKeys[ix.programIdIndex];
                return programId.toString() === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
              }
            );

            if (memoInstruction) {
              const memoData = Buffer.from(memoInstruction.data, "base64").toString("utf8");
              if (memoData !== memo) continue;
            } else if (memo) {
              continue; // Expected memo but didn't find one
            }
          }

          // Find the sender address
          const fromAddress = tx.transaction.message.accountKeys[0].toString();

          return {
            txHash: sigInfo.signature,
            from: fromAddress,
          };
        }
      }

      return null;
    } catch (error) {
      console.error("Error finding incoming Solana transaction:", error);
      return null;
    }
  }

  explorerTxUrl(txHash: string): string {
    const cluster = (process.env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
    const base = `https://explorer.solana.com/tx/${txHash}`;
    return cluster === "mainnet" ? base : `${base}?cluster=${cluster}`;
  }
}

export const solanaGateway = new SolanaGateway();
