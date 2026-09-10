"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ParentAccessRequestPage() {
  const [form, setForm] = useState({ parentName: "", parentEmail: "", childFirstName: "", childLastName: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setNotice(""); setError("");
    const response = await fetch("/api/coachhub/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", ...form }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setNotice("Your request has been sent to the coach. You will get access once they approve it.");
      setForm({ parentName: "", parentEmail: "", childFirstName: "", childLastName: "" });
    } else setError(data?.error || "Could not send your request.");
    setSaving(false);
  }

  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8"><div className="mx-auto max-w-lg"><Link href="/parent" className="text-sm font-bold text-blue-400">← Parent view</Link><section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl"><p className="text-xs font-black tracking-widest text-blue-400">COACHHUB · PARENT ACCESS</p><h1 className="mt-2 text-3xl font-black">Request access</h1><p className="mt-2 text-slate-400">Tell us who you are and which child you are connected to. A coach must approve the request before access is granted.</p>{notice && <div className="mt-5 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm font-bold text-emerald-300">{notice}</div>}{error && <div className="mt-5 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm font-bold text-red-300">{error}</div>}<form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-bold text-slate-300">Your name<input required value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /></label><label className="block text-sm font-bold text-slate-300">Your email<input required type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-300">Child first name<input required value={form.childFirstName} onChange={(e) => setForm({ ...form, childFirstName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /></label><label className="block text-sm font-bold text-slate-300">Child last name<input required value={form.childLastName} onChange={(e) => setForm({ ...form, childLastName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /></label></div><button disabled={saving} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50">{saving ? "Sending…" : "Send request to coach"}</button></form></section></div></main>;
}
