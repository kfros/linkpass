import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

export const metadata: Metadata = {
  title: "LinkPass",
  description: "Cross-chain access passes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const manifestUrl = "/tonconnect-manifest.json";
  return (
    <html lang="en">
      <body>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
        {children}
        <Toaster richColors position="top-center" />
        </TonConnectUIProvider>
      </body>
    </html>
  );
}