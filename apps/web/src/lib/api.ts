export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const needsNgrokSkip = /:\/\/[^/]+\.ngrok-free\.app$/i.test(API);
const defaultHeaders: HeadersInit = needsNgrokSkip
  ? { "ngrok-skip-browser-warning": "true" }
  : {};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    const msg = `HTTP ${res.status} ${res.statusText}${body ? ` – ${body.slice(0, 500)}` : ""}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export type Merchant = { id: number; name: string };
export type Pass = {
  id: number;
  sku: string;
  title: string;
  merchantId: number;
};
export type Order = { id: number; sku: string; amount: number; status: string };

export const api = {
  merchants: {
    list: () => fetch(`${API}/merchants`).then((res) => json<Merchant[]>(res)),
    create: (name: string): Promise<Merchant> =>
      fetch(`${API}/merchants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((res) => json<Merchant>(res)),
  },
  passes: {
    create: (merchantId: number, sku: string, title: string): Promise<Pass> =>
      fetch(`${API}/passes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, sku, title }),
      }).then((res) => json<Pass>(res)),
    get: (sku: string) =>
      fetch(`${API}/passes/${sku}`).then((res) => json<Pass>(res)),
  },
  orders: {
    create: (merchantId: number, sku: string, amount: number): Promise<Order> =>
      fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, sku, amount }),
      }).then((res) => json<Order>(res)),

    updateTx: (id: number, chain: "sol" | "ton", tx: string): Promise<Order> =>
      fetch(`${API}/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain, tx }),
      }).then((res) => json<Order>(res)),
  },
  solana: {
    pay: (orderId: number) =>
      fetch(`${API}/orders/${orderId}/solana`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }).then((res) => json<Order>(res)),
  },
};

export type AdminOrder = {
  id: number;
  merchantId: number;
  sku: string;
  from: string | null;
  amount: number;
  chain: "mock" | "sol" | "ton";
  tx: string | null;
  status?: "created" | "paying" | "paid" | "failed";
  receiptUrl?: string | null;
  createdAt: string;
};

export type AdminPass = {
  id: number;
  merchantId: number;
  sku: string;
  title: string;
  active: boolean;
  createdAt: string;
};

export const adminApi = {
  orders: (limit = 50, offset = 0) =>
    fetch(`${API}/admin/orders?limit=${limit}&offset=${offset}`, { cache: "no-store", headers: defaultHeaders })
      .then(res => json<AdminOrder[]>(res)),
  passes: () =>
    fetch(`${API}/admin/passes`, { cache: "no-store", headers: defaultHeaders })
      .then(res => json<AdminPass[]>(res)),
  verify: (sku: string, tx: string) =>
    fetch(`${API}/admin/verify?sku=${encodeURIComponent(sku)}&tx=${encodeURIComponent(tx)}`, { cache: "no-store", headers: defaultHeaders })
      .then(res => json<{ valid: boolean; reason?: string; orderId?: number; chain?: string; receiptUrl?: string | null }>(res)),
};
