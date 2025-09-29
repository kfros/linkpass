"use client";

import { useState, useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";

const API = process.env.NEXT_PUBLIC_API_URL!;

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

type Chain = "TON" | "SOL";



type ConfirmResult = {
  ok: boolean;
  already?: boolean;
  tx?: string;
  receiptUrl?: string;
  reason?: string;
};

export default function BuyPass() {
  const [selectedChain, setSelectedChain] = useState<Chain>("TON");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  // Telegram initData capture
  interface TelegramWebAppUser {
    id: number | string;
    username?: string;
  }

  interface TelegramWebAppInitDataUnsafe {
    user?: TelegramWebAppUser;
  }

  interface TelegramWebApp {
    initDataUnsafe?: TelegramWebAppInitDataUnsafe;
  }

  type TelegramWindow = {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  };

  const tg =
    typeof window !== "undefined"
      ? (window as TelegramWindow).Telegram?.WebApp
      : undefined;
  const tgUser = useMemo(() => {
    const u = tg?.initDataUnsafe?.user;
    if (!u) return null;
    return { id: String(u.id), username: u.username ? String(u.username) : undefined };
  }, [tg]);

  const headers = API.includes("ngrok-free.app")
    ? { "ngrok-skip-browser-warning": "true" }
    : undefined;

  async function createOrder(chain: Chain) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          sku: "vip-pass",
          merchantId: 1,
          chain: chain,
          // pass Telegram identity (optional)
          tgUserId: tgUser?.id,
          tgUsername: tgUser?.username,
        }),
      });
      const d = await res.json();
      setOrderId(d.orderId);
      setLink(d.link || d.qrText);
      return d.link || d.qrText;
    } finally {
      setBusy(false);
    }
  }

  async function payWithChain(chain: Chain) {
    const l = link ?? (await createOrder(chain));
    if (!l) return;
    
    if (chain === "SOL") {
      // For Solana, try to open Blink directly
      if (isMobileUA()) {
        // On mobile, try to open in Phantom or other Solana wallet
        window.location.href = l;
      } else {
        // On desktop, show QR or try to open Blink
        setShowQR(true);
      }
    } else {
      // TON payment flow
      if (isMobileUA()) {
        window.location.href = l;
      } else {
        setShowQR(true);
      }
    }
  }

  async function confirmOnce() {
    if (!orderId) return;
    const res = await fetch(`${API}orders/${orderId}/confirm`, { method: "POST", headers });
    const d: ConfirmResult = await res.json();
    setResult(d);
  }

  // Reset when changing chains
  function handleChainChange(chain: Chain) {
    setSelectedChain(chain);
    setOrderId(null);
    setLink(null);
    setShowQR(false);
    setResult(null);
  }

  // Success screen
  if (result?.ok) {
    return (
      <main className="max-w-lg mx-auto p-6 space-y-4">
        <h1 className="text-3xl font-bold">✅ Payment Confirmed</h1>
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="text-sm">Order ID</div>
          <div className="font-mono text-sm">{orderId}</div>
          {result.tx && (
            <>
              <div className="text-sm">Transaction</div>
              <div className="font-mono text-sm break-all">{result.tx}</div>
            </>
          )}
          {result.receiptUrl && (
            <>
              <div className="text-sm">Receipt</div>
              <div className="flex gap-2 items-center">
                <a className="underline" href={result.receiptUrl} target="_blank">Open in explorer</a>
                <button
                  className="text-xs underline"
                  onClick={() => window.open(result.receiptUrl!, "_blank")}
                >
                  Open
                </button>
              </div>
              <div className="mt-3">
                <QRCodeCanvas value={result.receiptUrl} size={160}  />
              </div>
            </>
          )}
        </div>
        <button
          className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300"
          onClick={() => (window.location.href = "/")}
        >
          Back to home
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Buy Pass: VIP Access</h1>
      <p className="text-muted-foreground">
        You are about to buy <b>VIP Access</b> (SKU: <code>vip-pass</code>) from merchant ID 1.
      </p>

      <div className="p-6 rounded-2xl border shadow-sm space-y-4">
        {/* Chain Selection */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Choose Payment Method:</div>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-xl transition-colors ${
                selectedChain === "TON"
                  ? "bg-blue-500 text-white"
                  : "bg-neutral-200 hover:bg-neutral-300"
              }`}
              onClick={() => handleChainChange("TON")}
            >
              TON Network
            </button>
            <button
              className={`px-4 py-2 rounded-xl transition-colors ${
                selectedChain === "SOL"
                  ? "bg-purple-500 text-white"
                  : "bg-neutral-200 hover:bg-neutral-300"
              }`}
              onClick={() => handleChainChange("SOL")}
            >
              Solana {selectedChain === "SOL" && <span className="text-xs">(Blink)</span>}
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className={`px-4 py-2 rounded-xl text-white hover:opacity-90 disabled:opacity-50 ${
              selectedChain === "TON" ? "bg-blue-600" : "bg-purple-600"
            }`}
            onClick={() => payWithChain(selectedChain)}
            disabled={busy}
          >
            {busy ? "Creating…" : `Pay with ${selectedChain}`}
            {selectedChain === "SOL" && !busy && <span className="ml-1">⚡</span>}
          </button>

          <button
            className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300"
            onClick={confirmOnce}
            disabled={!orderId}
          >
            I have paid — Check
          </button>
        </div>

        {showQR && link && (
          <div className="mt-4 p-4 border rounded-xl inline-block">
            <div className="mb-2 font-medium">
              {selectedChain === "SOL" ? "Scan with Phantom or Blink-compatible wallet" : "Scan to pay"}
            </div>
            <QRCodeCanvas value={link} size={224} />
            <div className="mt-2 text-xs break-all">{link}</div>
            <div className="mt-2 flex gap-2">
              <button
                className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
                onClick={() => navigator.clipboard.writeText(selectedChain === "SOL" ? `${API}/api/actions/buy-pass` : link)}
              >
                Copy link
              </button>
              {selectedChain === "SOL" && (
                <button
                  className="px-3 py-1 rounded bg-purple-200 hover:bg-purple-300"
                  onClick={() => window.open(`solana-action:${API}/api/actions/buy-pass`, "_blank")}
                >
                  Open Blink
                </button>
              )}
              <button
                className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
                onClick={() => setShowQR(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {selectedChain === "SOL" && (
          <div className="text-sm text-purple-700 bg-purple-50 p-3 rounded-xl">
            <strong>Solana Blink:</strong> One-click payments! Compatible with Phantom, Backpack, and other Blink-enabled wallets.
            Price: 0.01 SOL (~$2-3)
          </div>
        )}

        {selectedChain === "TON" && (
          <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded-xl">
            <strong>TON Network:</strong> Fast and low-cost payments via Tonkeeper or other TON wallets.
            Price: 0.02 TON (~$0.10-0.20)
          </div>
        )}
      </div>

      {/* Pending result display (not paid yet / error) */}
      {result && !result.ok && (
        <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-xl">
          Not paid yet: {result.reason ?? "pending"}
        </div>
      )}
    </main>
  );
}
