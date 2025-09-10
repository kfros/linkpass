"use client";

import { useEffect, useState, useMemo } from "react";
import WebApp from "@twa-dev/sdk";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: unknown;
  };
};

export default function MiniApp() {
  const [sku, setSku] = useState("vip-pass");
  const [amountUsd, setAmountUsd] = useState("19.99");  
  const [tg, setTg] = useState<unknown>(null);
  const isTelegram =
    typeof window !== "undefined" &&
    (window as TelegramWindow).Telegram?.WebApp;

  const startSku = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("sku") ?? "vip-pass";
    } catch {
      return "vip-pass";
    }
  }, []);

  useEffect(() => {
    // Import only on the client to avoid SSR touching `window`
    (async () => {
      const { default: WebApp } = await import('@twa-dev/sdk');
      WebApp.ready();           // optional but recommended
      setTg(WebApp);
    })();
  }, []);

  const [merchantId, setMerchantId] = useState<number | null>(null);
  useEffect(() => {
    api.merchants
      .list()
      .then((m) => {
        if (m.length) setMerchantId(m[0].id);
      })
      .catch(() => {});
  }, []);

  async function createOrder() {
    if (!merchantId) {
      toast.error("No merchant found. Please create a merchant first.");
      return;
    }
    const cents = Math.round(parseFloat(amountUsd) * 100);
    const o = await api.orders.create(merchantId, sku, cents);
    toast.success(`Order #${o.id} created`);
  }
  return (
    <main className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">LinkPass – Mini-App</h1>
      <Card className="p-4 space-y-3">
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">SKU</label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Price (USD)</label>
          <Input
            inputMode="decimal"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={createOrder}>Create order</Button>
          <Button variant="secondary" asChild>
            <Link href={`/buy/${encodeURIComponent(sku)}`}>
              Open full Buy page
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isTelegram
            ? "Running inside Telegram WebApp ✅"
            : "Not in Telegram (dev preview)"}
        </p>
      </Card>
    </main>
  );
}
