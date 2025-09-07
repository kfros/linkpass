import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();

  // Prefer forwarded values when running behind a proxy/tunnel (ngrok, CF, etc.)
  const host  = h.get("x-forwarded-host")  ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");

  const origin = `${proto}://${host}`;

  return new Response(JSON.stringify({
    url: origin,                     // <-- must be the public dApp origin
    name: "LinkPass (Dev)",
    iconUrl: `${origin}/icon.png`,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
