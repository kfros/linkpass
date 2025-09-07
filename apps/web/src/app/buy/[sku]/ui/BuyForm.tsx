"use client";
import { useState } from "react";
import { api, Pass } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { TonConnectButton, useTonConnectUI } from "@tonconnect/ui-react";

// const id = crypto.randomUUID();

//  toast.success(`Pass "${p.title}" created with SKU "${p.sku}"`, { id, action: {
//                 label: "Close",
//                 onClick: () => toast.dismiss(id),
//             }, duration: 5000 });

export default function BuyForm({ pass }: { pass: Pass }) {
  const [amountUsd, setAmountUsd] = useState("19.99");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [tonConnectUI] = useTonConnectUI();

   async function ensureOrder() {
    const cents = Math.round(parseFloat(amountUsd) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Enter a valid price");
      return null;
    }
    if (orderId) return { id: orderId };
    const order = await api.orders.create(pass.merchantId, pass.sku, cents);
    setOrderId(order.id);
    return order;
  }

  async function payWithTon() {
    setLoading(true);
    try {
      const order = await ensureOrder();
      if (!order) return;

      // NOTE: Demo amount — 0.05 TON. Replace with real quote later.
      const recipient = process.env.NEXT_PUBLIC_TON_RECIPIENT!;
      const nanotons = BigInt(50_000_000); // 0.05 TON

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: recipient, amount: nanotons.toString() }],
      });

      // result can be string or object; normalize to string for storage
      const tx = typeof result === "string" ? result : (result?.boc ?? JSON.stringify(result));
      await api.orders.updateTx(order.id, "ton", tx);

      toast.success(`TON payment submitted! Order #${order.id}`);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
          ? e
          : "TON payment failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function placeOrder() {
    setLoading(true);
    const id = crypto.randomUUID();
    try {
      const cents = Math.round(parseFloat(amountUsd) * 100);
      if (isNaN(cents) || cents <= 0) {
        toast.error("Enter a valid price", {
          id,
          action: {
            label: "Close",
            onClick: () => toast.dismiss(),
          },
          duration: 5000,
        });
        setLoading(false);
        return;
      }
      const order = await api.orders.create(pass.merchantId, pass.sku, cents);
      setOrderId(order.id);
      toast.success(
        `Order ${order.id} created for $${(order.amount / 100).toFixed(2)}`,
        {
          id,
          action: {
            label: "Close",
            onClick: () => toast.dismiss(id),
          },
          duration: 5000,
        }
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        toast.error(e.message, {
          id,
          action: {
            label: "Close",
            onClick: () => toast.dismiss(),
          },
          duration: 5000,
        });
      } else {
        toast.error("An unexpected error occurred", {
          id,
          action: {
            label: "Close",
            onClick: () => toast.dismiss(),
          },
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card className="p-4 space-y-4">
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">
            Price (USD)
          </label>
          <Input
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            placeholder="19.99"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={placeOrder} disabled={loading}>
            {loading ? "Processing..." : "Buy now"}
          </Button>
        </div>
      </div>

      {orderId && (
        <div className="p-4 bg-gray-50 text-green-900 rounded">
          ✅ Order <strong>#{orderId}</strong> has been created (mock chain)!
          This will evolve into a Solana Action / TON flow with wallet approval
          and an on-chain receipt.
        </div>
      )}
    </Card>
  );
}
