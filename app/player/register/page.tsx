"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PlayerRegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/player-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, email, password }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error || "Unable to create player account");
    router.push("/player"); router.refresh();
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-white"><div className="mx-auto max-w-md"><div className="mb-8"><div className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">CoachHub · Player</div><h1 className="mt-3 text-3xl font-black">Set up your player login</h1><p className="mt-2 text-slate-400">Use the private invite supplied by your coach. Your account is permanently linked to your player profile.</p></div><form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6"><label className="block text-sm font-semibold">Invite code<input value={code} onChange={(e) => setCode(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none" /></label><label className="block text-sm font-semibold">Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none" /></label><label className="block text-sm font-semibold">Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none" /><span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span></label>{error && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-blue-500 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? "Creating login…" : "Create player login"}</button></form><Link href="/login" className="mt-5 block text-center text-sm text-slate-400 hover:text-white">Already have a login? Sign in</Link></div></main>;
}
