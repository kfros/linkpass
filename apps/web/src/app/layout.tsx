import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import TonProvider from "@/components/ui/ton-provider";
import SonnerProvider from "@/components/ui/sonner-provider";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

export const metadata: Metadata = {
  title: "LinkPass",
  description: "Cross-chain access passes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TonProvider>
          {children}
          <SonnerProvider />
        </TonProvider>
      </body>
    </html>
  );
}