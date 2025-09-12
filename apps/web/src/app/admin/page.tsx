"use client";

import { useEffect, useMemo, useState } from "react";
import { api, adminApi, type AdminOrder, type AdminPass } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";

type Merchant = { id: number; name: string; CreatedAt?: string };

function ReceiptQR({ url, onClose }: { url: string; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-4 shadow-xl">
        <div className="font-semibold mb-2">Receipt</div>
        <QRCodeCanvas value={url} size={224} />
        <div className="text-xs break-all mt-2">{url}</div>
        <div className="flex gap-2 mt-3 justify-end">
          <button
            className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
            onClick={() => navigator.clipboard.writeText(url)}
          >
            Copy
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
            onClick={() => window.open(url, "_blank")}
          >
            Open
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-200 hover:bg-neutral-300"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  // --- merchant & pass creation state ---
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [merchantId, setMerchantId] = useState<number | null>(null);

  // --- admin data state ---
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [passes, setPasses] = useState<AdminPass[] | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [errAdmin, setErrAdmin] = useState<string | null>(null);

  // --- verify form state ---
  const [verifySku, setVerifySku] = useState("vip-pass");
  const [verifyTx, setVerifyTx] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const canVerify = useMemo(
    () => verifySku.trim() && verifyTx.trim(),
    [verifySku, verifyTx]
  );
  const [verifying, setVerifying] = useState(false);

  async function loadMerchants() {
    const list = await api.merchants.list();
    setMerchants(list);
    if (!merchantId && list.length) setMerchantId(list[0].id);
  }

  async function loadAdmin() {
    setLoadingAdmin(true);
    setErrAdmin(null);
    try {
      const [os, ps] = await Promise.all([
        adminApi.orders(50, 0),
        adminApi.passes(),
      ]);
      setOrders(os);
      setPasses(ps);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        setErrAdmin(String((e as { message?: string }).message));
      } else {
        setErrAdmin(String(e));
      }
    } finally {
      setLoadingAdmin(false);
    }
  }

  useEffect(() => {
    // initial loads
    loadMerchants().catch(() => {});
    loadAdmin().catch(() => {});
  }, []);

  async function createMerchant() {
    const id = crypto.randomUUID();
    if (!name.trim()) {
      return toast.error("Name is required", {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
    }
    try {
      const m = await api.merchants.create(name.trim());
      setMerchants((ms) => [...ms, m]);
      setName("");
      toast.success(`Merchant "${m.name}" created`, {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
      if (!merchantId) setMerchantId(m.id);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        toast.error((e as { message?: string }).message ?? "Unexpected error");
      } else {
        toast.error("Unexpected error");
      }
    }
  }

  async function createPass() {
    const id = crypto.randomUUID();
    if (!merchantId) {
      return toast.error("Select a merchant", {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
    }
    if (!sku.trim()) {
      return toast.error("SKU is required", {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
    }
    if (!title.trim()) {
      return toast.error("Title is required", {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
    }
    try {
      const p = await api.passes.create(merchantId, sku.trim(), title.trim());
      setSku("");
      setTitle("");
      toast.success(`Pass "${p.title}" created with SKU "${p.sku}"`, {
        id,
        action: { label: "Close", onClick: () => toast.dismiss(id) },
        duration: 5000,
      });
      // refresh admin data so new pass shows up
      loadAdmin().catch(() => {});
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        toast.error((e as { message?: string }).message ?? "Unexpected error");
      } else {
        toast.error("Unexpected error");
      }
    }
  }

  async function verifyPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!canVerify || verifying) return;
    setVerifying(true);
    try {
      const res = await adminApi.verify(verifySku.trim(), verifyTx.trim());
      if (res.valid) {
        toast.success(
          `✅ Valid. Order #${res.orderId} on ${(
            res.chain ?? ""
          ).toUpperCase()}`,
          res.receiptUrl
            ? {
                description: "Open explorer link",
                action: {
                  label: "Open",
                  onClick: () => window.open(res.receiptUrl!, "_blank"),
                },
              }
            : undefined
        );
      } else {
        toast.error(`❌ Invalid: ${res.reason ?? "not found"}`);
      }
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        toast.error(
          `Verify failed: ${(e as { message?: string }).message ?? e}`
        );
      } else {
        toast.error(`Verify failed: ${String(e)}`);
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold">Admin Panel</h1>

      {/* Create Merchant */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Create Merchant</h2>
        <div className="flex gap-2 flex-col sm:flex-row">
          <Input
            placeholder="Merchant Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={createMerchant}>Create</Button>
        </div>
      </Card>

      {/* Create Pass */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Create Pass</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          <select
            className="p-2 border rounded"
            value={merchantId ?? ""}
            onChange={(e) =>
              setMerchantId(e.target.value ? parseInt(e.target.value) : null)
            }
          >
            <option value="" disabled>
              Select Merchant
            </option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="SKU (vip-pass)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <Input
            placeholder="Title (VIP Access)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button className="sm:col-span-3" onClick={createPass}>
            Create Pass
          </Button>
        </div>
      </Card>

      {/* Verify */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Verify Purchase</h2>
        <form
          onSubmit={verifyPurchase}
          className="grid md:grid-cols-[1fr_2fr_auto] gap-2 items-end"
        >
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">SKU</label>
            <Input
              value={verifySku}
              onChange={(e) => setVerifySku(e.target.value)}
              placeholder="vip-pass"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              Transaction hash
            </label>
            <Input
              value={verifyTx}
              onChange={(e) => setVerifyTx(e.target.value)}
              placeholder="te6cck..."
            />
          </div>
          <Button type="submit" disabled={!canVerify || verifying}>
            {verifying ? "Checking…" : "Verify"}
          </Button>
        </form>
      </Card>

      {/* Orders */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Orders</h2>
          <Button variant="secondary" onClick={() => loadAdmin()}>
            Refresh
          </Button>
        </div>
        {loadingAdmin && !orders && <p>Loading…</p>}
        {errAdmin && (
          <p className="text-destructive">Failed to load: {errAdmin}</p>
        )}
        {orders && orders.length === 0 && (
          <p className="text-muted-foreground">No orders yet.</p>
        )}
        {orders && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                  <th>ID</th>
                  <th>SKU</th>
                  <th>Amount</th>
                  <th>Chain</th>
                  <th>From</th>
                  <th>TX</th>
                  <th>Status</th>
                  <th>Receipt</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:py-2 [&>tr>td]:px-2">
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td>{o.id}</td>
                    <td>{o.sku}</td>
                    <td>{(o.amount / 100).toFixed(2)}</td>
                    <td className="truncate max-w-[280px]">{o.from ?? "—"}</td>
                    <td className="uppercase">{o.chain}</td>
                    <td className="max-w-[280px] truncate">{o.tx ?? "—"}</td>
                    <td>
                      {o.status === "paid" ? (
                        <span className="text-green-700 font-medium">paid</span>
                      ) : o.status === "paying" ? (
                        <span className="text-amber-600">paying</span>
                      ) : o.status === "created" ? (
                        <span>created</span>
                      ) : (
                        <span className="text-red-600">failed</span>
                      )}
                    </td>
                    <td>
                      {o.receiptUrl ? (
                        <div className="flex gap-2 items-center">
                          <a
                            className="underline"
                            href={o.receiptUrl}
                            target="_blank"
                          >
                            view
                          </a>
                          <button
                            className="text-xs underline"
                            onClick={() => setQrUrl(o.receiptUrl!)}
                          >
                            QR
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{new Date(o.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Passes */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Passes</h2>
        {!passes && !errAdmin && <p>Loading…</p>}
        {passes && passes.length === 0 && (
          <p className="text-muted-foreground">No passes yet.</p>
        )}
        {passes && passes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>SKU</th>
                  <th>Title</th>
                  <th>Active</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:py-2 [&>tr>td]:px-2">
                {passes.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td>{p.id}</td>
                    <td>{p.merchantId}</td>
                    <td>{p.sku}</td>
                    <td>{p.title}</td>
                    <td>{p.active ? "Yes" : "No"}</td>
                    <td>{new Date(p.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {qrUrl && <ReceiptQR url={qrUrl} onClose={() => setQrUrl(null)} />}
    </main>
  );
}
