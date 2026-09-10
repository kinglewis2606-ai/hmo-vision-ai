"use client";

import { useEffect, useState } from "react";

type RequestItem = {
  id: string;
  parentName: string;
  parentEmail: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  createdAt: string;
  player: { id: string; firstName: string; lastName: string; position: string };
};

const fmt = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function AccessRequests() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/coachhub/access-requests", { cache: "no-store" });
    if (response.ok) setRequests((await response.json()).requests || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setSaving(id); setNotice("");
    const response = await fetch("/api/coachhub/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (response.ok) {
      setNotice(status === "APPROVED" ? "Parent access approved." : "Parent request rejected.");
      await load();
    } else {
      const data = await response.json().catch(() => null);
      setNotice(data?.error || "Could not update request.");
    }
    setSaving("");
  }

  const pending = requests.filter((item) => item.status === "PENDING");
  if (loading || pending.length === 0) return null;

  return <section className="rounded-2xl border border-blue-900 bg-blue-950/20 p-5">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-xs font-black tracking-widest text-blue-400">PARENT ACCESS</div><h2 className="mt-1 text-xl font-black">Requests waiting for approval</h2></div>
      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black">{pending.length}</span>
    </div>
    {notice && <p className="mt-3 text-sm font-bold text-emerald-300">{notice}</p>}
    <div className="mt-4 space-y-3">
      {pending.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="font-bold">{item.parentName} <span className="font-normal text-slate-500">· {item.parentEmail}</span></div><div className="mt-1 text-sm text-slate-400">Requesting access to <b className="text-white">{item.player.firstName} {item.player.lastName}</b> · {item.player.position}</div><div className="mt-1 text-xs text-slate-600">Requested {fmt(item.createdAt)}</div></div>
        <div className="flex shrink-0 gap-2"><button disabled={saving === item.id} onClick={() => review(item.id, "REJECTED")} className="rounded-lg border border-red-800 px-3 py-2 text-sm font-bold text-red-300 disabled:opacity-50">Reject</button><button disabled={saving === item.id} onClick={() => review(item.id, "APPROVED")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black disabled:opacity-50">Approve</button></div>
      </div>)}
    </div>
  </section>;
}
