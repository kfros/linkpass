import type { Metadata, Viewport } from "next";
import "./globals.css";
import TonProvider from "@/components/ui/ton-provider";
import SonnerProvider from "@/components/ui/sonner-provider";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "LinkPass",
  description: "Cross-chain access passes",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <TonProvider>
            {children}
            <SonnerProvider />
          </TonProvider>
        </AuthProvider>
      </body>
    </html>
  );
}