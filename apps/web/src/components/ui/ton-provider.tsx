// e.g., apps/web/src/components/providers/ton-provider.tsx
"use client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

const base = process.env.NEXT_PUBLIC_BASE_URL
const manifestUrl = `${base}/api/tonconnect-manifest`;

export default function TonProvider({ children }: { children: React.ReactNode }) {
  return (
    
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        {children}
      </TonConnectUIProvider>
    
  );
}
