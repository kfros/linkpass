"use client";
import { use, useEffect, useState } from "react";
import { api, adminApi } from "../../lib/api";
import { Button } from "../../../../../_src/components/ui/button";
import { Card } from "../../../../../_src/components/ui/card";
import { Input } from "../../../../../_src/components/ui/input";
import { Toaster } from "sonner";
import { toast } from "sonner";

type Merchant = { id: number; name: string, CreatedAt?: string };

export default function Admin() {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [name, setName] = useState("");
    const [sku, setSku] = useState("");
    const [title, setTitle] = useState("");
    const [merchantId, setMerchantId] = useState<number | null>(null);

    async function load() {
        const list = await api.merchants.list();
        setMerchants(list);
        if (!merchantId && list.length) {
            setMerchantId(list[0].id);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function createMerchant() {        
        const id = crypto.randomUUID();
        if (!name.trim()) return toast.error("Name is required", { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(),
            }, duration: 5000 });
        try {
            const m = await api.merchants.create(name.trim());
            setMerchants((ms) => [...ms, m]);
            setName("");
            toast.success(`Merchant "${m.name}" created`, { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(id),
            }, duration: 5000 });
            if (!merchantId) setMerchantId(m.id);
        } catch (e: unknown) {
            if (e instanceof Error) {
                toast.error(e.message);
            } else {
                toast.error("An unexpected error occurred");
            }
        }
    }

    async function createPass() {
        const id = crypto.randomUUID();
        if (!merchantId) return toast.error("Select a merchant", { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(),
            }, duration: 5000 });
        if (!sku.trim()) return toast.error("SKU is required", { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(),
            }, duration: 5000 });
        if (!title.trim()) return toast.error("Title is required", { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(),
            }, duration: 5000 });
        try {
            const p = await api.passes.create(merchantId, sku.trim(), title.trim());
            setSku("");
            setTitle("");
            toast.success(`Pass "${p.title}" created with SKU "${p.sku}"`, { id, action: {
                label: "Close",
                onClick: () => toast.dismiss(id),
            }, duration: 5000 });
        } catch (e: unknown) {
            if (e instanceof Error) {
                toast.error(e.message);
            } else {
                toast.error("An unexpected error occurred");
            }
        }
    }

    return (
        <main className="max-w-3xl mx-auto p-6 space-y-8">
            {/* <Toaster richColors position="top-center" /> */}
            <h1 className="text-3xl font-bold">Admin Panel</h1>

            <Card className="p-6 space-y-4">
                <h2 className="text-2xl font-semibold">Create Merchant</h2>
                <div className="flex gap-2">
                    <Input placeholder="Merchant Name" value={name} onChange={e => setName(e.target.value)} />
                    <Button onClick={createMerchant}>Create</Button>
                </div>
            </Card>
            <Card className="p-6 space-y-4">
                <h2 className="text-2xl font-semibold">Create Pass</h2>
                <div className="grid sm:grid-cols-3 gap-2">
                    <select 
                        className="p-2 border rounded"
                        value={merchantId ?? ""}
                        onChange={e => setMerchantId(e.target.value ? parseInt(e.target.value) : null)}
                        >
                        <option value="" disabled>Select Merchant</option>
                        {merchants.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                    <Input placeholder="SKU (VIP Pass)" value={sku} onChange={e => setSku(e.target.value)} />
                    <Input placeholder="Title (VIP Access)" value={title} onChange={e => setTitle(e.target.value)} />
                    <Button className="sm:col-span-3" onClick={createPass}>Create Pass</Button>
                </div>
            </Card>

            <Card className="p-6 space-y-4">
                <h2 className="text-2xl font-semibold">Merchants</h2>
                {merchants.length === 0 && <p className="text-muted-foreground">No merchants yet.</p>}
                <ul className="list-disc list-inside space-y-1">
                    {merchants.map(m => (
                        <li key={m.id}>
                            <b>{m.name}</b> (ID: {m.id}) {m.CreatedAt && <span className="text-sm text-muted-foreground">- Created at {new Date(m.CreatedAt).toLocaleString()}</span>}
                        </li>
                    ))}
                </ul>
            </Card>
        </main>
    )
}