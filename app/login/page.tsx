"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error || "Unable to sign in");
    router.push(data.user.role === "COACH" ? "/dashboard" : data.user.role === "PLAYER" ? "/player" : "/parent");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <div className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">CoachHub</div>
          <h1 className="mt-3 text-3xl font-black">Sign in</h1>
          <p className="mt-2 text-slate-400">Access your team, availability polls and development information.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <label className="block text-sm font-semibold">Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none" /></label>
          <label className="block text-sm font-semibold">Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none" /></label>
          {error && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <a href="/" className="mt-5 block text-center text-sm text-slate-400 hover:text-white">Back to team home</a>
      </div>
    </main>
  );
}
