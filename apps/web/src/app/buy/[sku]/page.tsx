import { api, type Pass } from "@/lib/api";
import { notFound } from "next/navigation";
import BuyForm from "./ui/BuyForm";

type Props = { params: { sku: string } };

export default async function BuyPage(props: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await props.params;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/passes/${sku}`,
    { next: { revalidate: 10 }, cache: "no-store" }
  );
  if (!res.ok) {
    console.error("Failed to load pass:", res.status, await res.text());
    notFound();
  }
  const pass: Pass = (await res.json()) as Pass;
  return (
    <main className="max-w-2xl mx-auto py-20 px-4">
      <h1 className="text-3xl font-bold mb-6">Buy Pass: {pass.title}</h1>
      <p className="text-muted-foreground mb-10">
        You are about to buy the pass <strong>{pass.title}</strong> (SKU:{" "}
        <code>{pass.sku}</code>) from merchant ID <code>{pass.merchantId}</code>
        .
      </p>
      <BuyForm pass={pass} />
    </main>
  );
}
