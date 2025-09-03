export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export type Merchant = { id: number; name: string };
export type Pass = { id: number; sku: string; title: string; merchantId: number };
export type Order = { id: number; sku: string; amount: number; status: string };

export const api = {
    merchants: {
        list: () => fetch(`${API}/merchants`).then(res => json<Merchant[]>(res)),
        create: (name: string) : Promise<Merchant> => fetch(`${API}/merchants`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        }).then(res => json<Merchant>(res)),
    },
    passes: {
        create: (merchantId: number, sku: string, title: string): Promise<Pass> => fetch(`${API}/passes`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merchantId, sku, title }),
        }).then(res => json<Pass>(res)),
        get: (sku: string) => fetch(`${API}/passes/${sku}`).then(res => json<Pass>(res)),
    },
    orders: {
        create: (merchantId: number, sku: string, amount: number) : Promise<Order> => fetch(`${API}/orders`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merchantId, sku, amount }),
        }).then(res => json<Order>(res)),
    }
};