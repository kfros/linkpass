import { Card } from "../../../../_src/components/ui/card";
import { Button } from "../../../../_src/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh grid place-items-center p-8">
      <Card className="max-w-4xl w-full p-8 space-y-4 text-center">
        <h1 className="text-3xl font-bold">LinkPass</h1>
        <p className="text-muted-foreground width-full">
          Cross-chain access passes with Telegram Mini-App & Solana Blinks.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild><Link href="/telegram">Open Telegram Mini-App</Link></Button>
          <Button variant="outline" asChild><Link href="/blink">Try Blink Demo</Link></Button>
          <Button variant="ghost" asChild><Link href="/admin">Go to Admin Panel</Link></Button>
          <Button variant="outline" asChild>
            <Link href="/buy/vip-pass" className="text-sm text-muted-foreground underline">Buy a VIP Pass
          </Link></Button>
        </div>
      </Card>
    </main>
  );
}