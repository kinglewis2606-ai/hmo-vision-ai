"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"PARENT" | "COACH">("PARENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachCode, setCoachCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, email, password, coachCode }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error || "Unable to create account");
    router.push(role === "COACH" ? "/dashboard" : "/parent/request");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-8"><div className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">CoachHub</div><h1 className="mt-3 text-3xl font-black">Create your account</h1><p className="mt-2 text-slate-400">Parents are linked to a child only after the coach approves the request.</p></div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid grid-cols-2 gap-2">{(["PARENT", "COACH"] as const).map((item) => <button type="button" key={item} onClick={() => setRole(item)} className={`rounded-xl px-4 py-3 text-sm font-bold ${role === item ? "bg-emerald-500 text-slate-950" : "bg-slate-900 text-slate-300"}`}>{item === "PARENT" ? "Parent" : "Coach"}</button>)}</div>
          <label className="block text-sm font-semibold">Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>
          <label className="block text-sm font-semibold">Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /><span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span></label>
          {role === "COACH" && <label className="block text-sm font-semibold">Team setup code<input value={coachCode} onChange={(e) => setCoachCode(e.target.value)} type="password" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3" /></label>}
          {error && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{busy ? "Creating…" : "Create account"}</button>
        </form>
        <a href="/login" className="mt-5 block text-center text-sm text-slate-400 hover:text-white">Already have an account? Sign in</a>
      </div>
    </main>
  );
}
