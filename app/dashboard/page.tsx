"use client";

import Link from "next/link";
import { useState } from "react";

const players = [
  ["Jack Thompson","GK","available"],["Noah Williams","DEF","available"],["Oliver Smith","MID","pending"],["Harry Brown","MID","available"],["Charlie Jones","FWD","available"],["Leo Wilson","DEF","maybe"],["George Taylor","MID","available"],["Alfie Davies","FWD","unavailable"]
];

export default function Dashboard() {
  const [notice, setNotice] = useState("");
  const send = () => { setNotice("Message sent to the squad"); setTimeout(() => setNotice(""), 2500); };
  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-white/10 bg-slate-900/80 px-5 py-4 sticky top-0 z-10 backdrop-blur">
      <div className="mx-auto max-w-6xl flex items-center justify-between"><div><div className="text-xl font-black">⚽ CoachHub</div><div className="text-xs text-slate-400">Caversham Falcons U10s</div></div><button onClick={send} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500">Message squad</button></div>
    </header>
    <section className="mx-auto max-w-6xl p-5 md:p-8">
      <div className="mb-7"><p className="text-sm text-blue-400 font-semibold">WEDNESDAY 9 SEPTEMBER</p><h1 className="text-3xl md:text-4xl font-black mt-1">Good morning, Coach 👋</h1><p className="text-slate-400 mt-2">Everything you need for the week, in one place.</p></div>
      {notice && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-300">✓ {notice}</div>}
      <div className="grid gap-4 md:grid-cols-3 mb-7">
        <Link href="#match" className="rounded-2xl bg-blue-600 p-5 hover:bg-blue-500"><div className="text-sm opacity-80">NEXT MATCH · SAT 12 SEP</div><div className="text-2xl font-black mt-2">Caversham Falcons</div><div className="font-semibold">vs Reading United · 10:30</div><div className="mt-4 text-sm">12 available · 2 awaiting →</div></Link>
        <Link href="#training" className="rounded-2xl bg-slate-900 border border-white/10 p-5 hover:border-white/20"><div className="text-sm text-slate-400">NEXT TRAINING · FRI 11 SEP</div><div className="text-2xl font-black mt-2">Finishing & movement</div><div className="text-slate-400">18:00–19:00 · Mapledurham</div><div className="mt-4 text-sm text-emerald-300">14 / 16 confirmed</div></Link>
        <div className="rounded-2xl bg-slate-900 border border-white/10 p-5"><div className="text-sm text-slate-400">NEEDS ATTENTION</div><div className="text-2xl font-black mt-2">3 things</div><div className="mt-3 space-y-2 text-sm"><div>🔴 2 match replies missing</div><div>🔧 4 feedback notes due</div><div>📋 Squad selection not finished</div></div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl bg-slate-900 border border-white/10 overflow-hidden"><div className="p-5 border-b border-white/10 flex justify-between"><div><h2 className="font-black text-xl">Squad availability</h2><p className="text-sm text-slate-400">Saturday's match</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">12 available</span></div><div>{players.map(([name,pos,status]) => <div key={name} className="px-5 py-3 border-b border-white/5 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-slate-800 grid place-items-center text-xs font-bold">{pos}</div><div><div className="font-semibold">{name}</div><div className="text-xs text-slate-500">{pos}</div></div></div><span className={`text-xs font-bold ${status === "available" ? "text-emerald-300" : status === "pending" ? "text-amber-300" : status === "maybe" ? "text-blue-300" : "text-rose-300"}`}>{status === "available" ? "✓ Available" : status === "pending" ? "⏳ Awaiting" : status === "maybe" ? "? Maybe" : "✕ Unavailable"}</span></div>)}</div></section>
        <div className="space-y-6">
          <section id="training" className="rounded-2xl bg-slate-900 border border-white/10 p-5"><h2 className="font-black text-xl">🔧 Things to work on</h2><div className="mt-4 space-y-3"><div className="rounded-xl bg-slate-800 p-4"><div className="font-bold">Team</div><div className="text-sm text-slate-400 mt-1">Playing out from the back under pressure</div></div><div className="rounded-xl bg-slate-800 p-4"><div className="font-bold">Oliver Smith</div><div className="text-sm text-slate-400 mt-1">Scan before receiving · next session focus</div></div><div className="rounded-xl bg-slate-800 p-4"><div className="font-bold">Leo Wilson</div><div className="text-sm text-slate-400 mt-1">Defensive positioning</div></div></div></section>
          <section id="match" className="rounded-2xl bg-slate-900 border border-white/10 p-5"><h2 className="font-black text-xl">⭐ Recent feedback</h2><div className="mt-4 text-sm"><p className="text-slate-300">“Great energy and movement today. Lots of improvement in passing combinations.”</p><p className="text-slate-500 mt-2">Training · Tuesday</p></div></section>
        </div>
      </div>
    </section>
  </main>;
}
