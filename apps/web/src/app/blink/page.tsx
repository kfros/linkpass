"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

const BLINK_URL = process.env.NEXT_PUBLIC_BASE_URL 
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/actions/buy-pass`
  : "http://localhost:4000/api/actions/buy-pass";

export default function BlinkPage() {
  const [copied, setCopied] = useState(false);

  async function copyBlink() {
    try {
      await navigator.clipboard.writeText(BLINK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold gradient-text">
          ⚡ Solana Blink Integration
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Experience one-click payments with Solana Blinks! Share the link or QR code
          to enable instant VIP pass purchases through compatible wallets.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Blink Preview */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">🎯 Blink Preview</h2>
          <div className="border rounded-2xl p-6 bg-gradient-to-br from-purple-50 to-blue-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl font-bold">LP</span>
              </div>
              <div>
                <h3 className="font-semibold">LinkPass - VIP Pass</h3>
                <p className="text-sm text-muted-foreground">Buy VIP Pass with Solana</p>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">
              Purchase a VIP pass with Solana. One-click payment via Blink!
            </p>

            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Price</span>
                <span className="font-mono">0.01 SOL</span>
              </div>
              <button className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl font-medium transition-colors">
                Buy for 0.01 SOL ⚡
              </button>
            </div>
          </div>
        </div>

        {/* Share & Test */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">📤 Share & Test</h2>
          
          <div className="border rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Blink URL:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={BLINK_URL}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={copyBlink}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-purple-500 hover:bg-purple-600 text-white"
                  }`}
                >
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">QR Code:</label>
              <div className="flex justify-center p-4 bg-white border rounded-xl">
                <QRCodeCanvas
                  value={BLINK_URL}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => window.open(BLINK_URL, "_blank")}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl font-medium transition-colors"
              >
                🔗 Test Blink
              </button>
              
              <a
                href={`https://dial.to/?action=solana-action:${encodeURIComponent(BLINK_URL)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-medium text-center transition-colors"
              >
                🚀 Open in Dialect
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-center">✨ Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-4 border rounded-xl">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-semibold mb-1">One-Click Payment</h3>
            <p className="text-sm text-muted-foreground">
              No complex forms or multiple steps. Just click and pay.
            </p>
          </div>
          <div className="text-center p-4 border rounded-xl">
            <div className="text-2xl mb-2">🔗</div>
            <h3 className="font-semibold mb-1">Shareable Links</h3>
            <p className="text-sm text-muted-foreground">
              Share via social media, messaging, or embed as QR codes.
            </p>
          </div>
          <div className="text-center p-4 border rounded-xl">
            <div className="text-2xl mb-2">🏦</div>
            <h3 className="font-semibold mb-1">Wallet Compatible</h3>
            <p className="text-sm text-muted-foreground">
              Works with Phantom, Backpack, and other Blink-enabled wallets.
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="border rounded-2xl p-6 bg-blue-50">
        <h3 className="font-semibold mb-3">🧭 How to use:</h3>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="font-medium text-blue-600">1.</span>
            Copy the Blink URL or scan the QR code with a compatible wallet
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-blue-600">2.</span>
            The wallet will show you the transaction preview
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-blue-600">3.</span>
            Confirm the payment (0.01 SOL) to purchase your VIP pass
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-blue-600">4.</span>
            Your purchase will be confirmed on-chain instantly!
          </li>
        </ol>
      </div>

      <style jsx>{`
        .gradient-text {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </main>
  );
}
