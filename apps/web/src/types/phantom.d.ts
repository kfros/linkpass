declare global {
  interface Window {
    solana?: {
      connect: () => Promise<{ publicKey?: { toString(): string } }>;
      publicKey?: { toString(): string };
      isPhantom?: boolean;
    };
  }
}

export {};