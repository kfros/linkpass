"use client";

import { useEffect, useState } from "react";

export default function TelegramMiniApp() {
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    setIsTelegram(Boolean(tg));
  }, []);

  return (
    <main className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">Telegram Mini-App</h1>
      <p>
        Running inside Telegram container: <b>{String(isTelegram)}</b>
      </p>
      <p className="text-sm text-muted-foreground">
        We’ll add TonConnect and purchase flow after the API slice.
      </p>
    </main>
  );
}
