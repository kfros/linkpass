"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

const API = process.env.NEXT_PUBLIC_API_URL!; // e.g. https://<ngrok>/api

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

export default function BuyPass() {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const headers = API.includes("ngrok-free.app")
    ? { "ngrok-skip-browser-warning": "true" }
    : undefined;

  async function createOrder() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ sku: "vip-pass", merchantId: 1 }),
      });
      const d = await res.json();
      setOrderId(d.orderId);
      setLink(d.link as string);
      return d.link as string;
    } finally {
      setBusy(false);
    }
  }

  async function payWithTon() {
    const l = link ?? (await createOrder());
    if (!l) return;
    if (isMobileUA()) {
      // mobile / Telegram webview → open wallet directly
      window.location.href = l;
    } else {
      // desktop → show QR
      setShowQR(true);
    }
  }

  async function confirmOnce() {
    if (!orderId) {
      alert("Create order first (click Pay with TON).");
      return;
    }
    const res = await fetch(`${API}/orders/${orderId}/confirm`, {
      method: "POST",
      headers,
    });
    const d: {
      ok: boolean;
      already?: boolean;
      tx?: string;
      receiptUrl?: string;
      reason?: string;
    } = await res.json();

    if (d.ok) {
      alert(
        d.already
          ? `Already confirmed\n${d.receiptUrl ?? ""}`
          : `Payment confirmed!\nTx: ${d.tx ?? ""}`
      );
    } else {
      alert(`Not paid yet: ${d.reason ?? "pending"}`);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Buy Pass: VIP Access</h1>
      <p className="text-muted-foreground">
        You are about to buy the pass <b>VIP Access</b> (SKU: <code>vip-pass</code>) from merchant ID 1.
      </p>

      <div className="p-6 rounded-2xl border shadow-sm space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button
            className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-50"
            onClick={payWithTon}
            disabled={busy}
          >
            {busy ? "Creating…" : "Pay with TON"}
          </button>

          <button
            className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300"
            onClick={confirmOnce}
          >
            I have paid — Check
          </button>
        </div>

        {showQR && link && (
          <div className="mt-4 p-4 border rounded-xl inline-block">
            <div className="mb-2 font-medium">Scan to pay</div>
            <QRCodeCanvas value={link} size={224} />
            <div className="mt-2 text-xs break-all">{link}</div>
              <button
                className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
                onClick={async () => {
                  if (link) {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
                onClick={() => setShowQR(false)}
              >
                Close
              </button>
            </div>
        )}
        </div>
    </main>
  );
}
