"use client";

import Link from "next/link";
import AccessRequests from "@/app/dashboard/AccessRequests";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; position: string; availability: { eventId: string; status: string }[] };
type Event = { id: string; type: "TRAINING" | "MATCH"; title: string; opponent?: string | null; startsAt: string; endsAt?: string | null; arrivalTime?: string | null; venue: string; instructions?: string | null; availability: { playerId: string; status: string }[] };

const card = "rounded-2xl border border-slate-800 bg-slate-900/70 shadow-sm";
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

function date(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function fullDate(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(value)); }
function time(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function initials(p: Player) { return `${p.firstName[0]}${p.lastName[0]}`; }
function statusText(s: string) { return s === "AVAILABLE" ? "Available" : s === "UNAVAILABLE" ? "Not available" : "Awaiting"; }
function statusClass(s: string) { return s === "AVAILABLE" ? "border-emerald-800 bg-emerald-950/70 text-emerald-300" : s === "UNAVAILABLE" ? "border-rose-900 bg-rose-950/70 text-rose-300" : "border-slate-700 bg-slate-800 text-slate-300"; }

export default function Dashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "", instructions: "" });

  async function load() {
    setLoading(true); setError("");
    const response = await fetch("/api/coachhub", { cache: "no-store" });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error || "Could not load the coach dashboard."); setLoading(false); return; }
    const data = await response.json();
    setPlayers(data.players || []); setEvents(data.events || []);
    setSelectedId(current => current && data.events?.some((e: Event) => e.id === current) ? current : data.events?.[0]?.id || "");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const upcoming = useMemo(() => events.filter(e => new Date(e.startsAt) >= new Date()).slice(0, 8), [events]);
  const selected = events.find(e => e.id === selectedId) || upcoming[0];
  const nextMatch = upcoming.find(e => e.type === "MATCH");
  const nextTraining = upcoming.find(e => e.type === "TRAINING");
  const counts = useMemo(() => {
    const a = selected?.availability || [];
    return { available: a.filter(x => x.status === "AVAILABLE").length, unavailable: a.filter(x => x.status === "UNAVAILABLE").length, pending: a.filter(x => x.status === "PENDING").length };
  }, [selected]);
  const responseRate = players.length ? Math.round(((players.length - counts.pending) / players.length) * 100) : 0;
  const attention = players.filter(p => selected && (selected.availability.find(a => a.playerId === p.id)?.status || "PENDING") === "PENDING");

  async function post(body: unknown) { return fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  async function updateAvailability(playerId: string, status: "AVAILABLE" | "UNAVAILABLE") {
    if (!selected) return; setSaving(true); setNotice(""); setError("");
    const r = await post({ action: "availability", eventId: selected.id, playerId, status });
    if (r.ok) { await load(); setNotice("Availability updated"); } else setError((await r.json().catch(() => null))?.error || "Could not update availability");
    setSaving(false);
  }
  async function createPoll(e: FormEvent) {
    e.preventDefault(); setSaving(true); setNotice(""); setError("");
    const r = await post({ action: "event", ...form });
    if (r.ok) { const created = await r.json(); setShowPoll(false); setForm({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "", instructions: "" }); await load(); setSelectedId(created.id); setNotice("Poll published to the team home page"); }
    else setError((await r.json().catch(() => null))?.error || "Could not publish poll");
    setSaving(false);
  }
  async function sendMessage() {
    if (!message.trim()) return; setSaving(true); setNotice(""); setError("");
    const r = await post({ action: "message", message: message.trim() });
    if (r.ok) { setMessage(""); setNotice("Message sent to the squad"); } else setError((await r.json().catch(() => null))?.error || "Could not send message");
    setSaving(false);
  }
  async function logout() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.href = "/login";
  }

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-7xl py-24 text-center text-slate-400">Loading your coaching workspace…</div></main>;
  if (error && !players.length && !events.length) return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-xl py-24"><div className="rounded-2xl border border-rose-900 bg-rose-950/40 p-6"><p className="text-xs font-black tracking-widest text-rose-400">COACHHUB</p><h1 className="mt-2 text-2xl font-black">Coach access required</h1><p className="mt-2 text-slate-300">{error}</p><Link href="/login" className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-black">Sign in</Link></div></div></main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-white sm:px-6 sm:py-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-lg">⚽</span><span className="text-2xl font-black tracking-tight">CoachHub</span></div><p className="mt-1 text-sm text-slate-500">Caversham Falcons U10s · Coach workspace</p></div>
        <div className="flex flex-wrap items-center gap-1"><nav className="flex flex-wrap gap-1 text-sm font-bold"><Link href="/dashboard" className="rounded-xl bg-slate-800 px-4 py-2.5">Dashboard</Link><Link href="/matches" className="rounded-xl px-4 py-2.5 text-slate-400 hover:bg-slate-900 hover:text-white">Matches</Link><Link href="/communication" className="rounded-xl px-4 py-2.5 text-slate-400 hover:bg-slate-900 hover:text-white">Messages</Link><Link href="/players" className="rounded-xl px-4 py-2.5 text-slate-400 hover:bg-slate-900 hover:text-white">Players</Link></nav><button onClick={logout} className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-900 hover:text-white">Sign out</button></div>
      </header>

      {notice && <div className="rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm font-bold text-emerald-300">✓ {notice}</div>}
      {error && <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm font-bold text-rose-300">{error}</div>}

      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black tracking-[0.2em] text-blue-400">COACH DASHBOARD</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Good morning, coach.</h1><p className="mt-2 max-w-2xl text-slate-400">Everything you need to run the next session, collect availability and keep parents and players informed.</p></div><button onClick={() => setShowPoll(v => !v)} className="rounded-xl bg-blue-600 px-5 py-3 font-black shadow-lg shadow-blue-950/20 hover:bg-blue-500">{showPoll ? "Close poll builder" : "+ Create poll"}</button></section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${card} p-5`}><div className="flex items-center justify-between"><p className="text-xs font-black tracking-widest text-slate-500">SQUAD</p><span className="text-slate-600">●</span></div><p className="mt-2 text-3xl font-black">{players.length}</p><p className="mt-1 text-sm text-slate-400">registered players</p></div>
        <div className={`${card} p-5`}><p className="text-xs font-black tracking-widest text-slate-500">NEXT MATCH</p><p className="mt-2 text-xl font-black">{nextMatch ? date(nextMatch.startsAt) : "No fixture"}</p><p className="mt-1 truncate text-sm text-slate-400">{nextMatch ? `${nextMatch.opponent || "Fixture"} · ${time(nextMatch.startsAt)}` : "Create a match poll"}</p></div>
        <div className={`${card} p-5`}><p className="text-xs font-black tracking-widest text-slate-500">NEXT TRAINING</p><p className="mt-2 text-xl font-black">{nextTraining ? date(nextTraining.startsAt) : "No session"}</p><p className="mt-1 truncate text-sm text-slate-400">{nextTraining ? `${time(nextTraining.startsAt)} · ${nextTraining.title}` : "Create a training poll"}</p></div>
        <div className={`${card} p-5`}><p className="text-xs font-black tracking-widest text-slate-500">RESPONSES</p><p className="mt-2 text-3xl font-black">{responseRate}%</p><p className="mt-1 text-sm text-slate-400">{counts.pending} awaiting on this poll</p></div>
      </section>

      {showPoll && <form onSubmit={createPoll} className={`${card} p-5 sm:p-6`}><div className="flex flex-col gap-1 border-b border-slate-800 pb-4"><p className="text-xs font-black tracking-widest text-blue-400">NEW AVAILABILITY POLL</p><h2 className="text-xl font-black">Publish an event</h2><p className="text-sm text-slate-500">The team home page will show the event and players/parents can answer Available or Not available.</p></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => setForm(f => ({...f,type:"MATCH"}))} className={`rounded-xl px-4 py-2.5 font-bold ${form.type === "MATCH" ? "bg-blue-600" : "bg-slate-800 text-slate-300"}`}>⚽ Match</button><button type="button" onClick={() => setForm(f => ({...f,type:"TRAINING"}))} className={`rounded-xl px-4 py-2.5 font-bold ${form.type === "TRAINING" ? "bg-blue-600" : "bg-slate-800 text-slate-300"}`}>🏃 Training</button></div><input required placeholder={form.type === "MATCH" ? "Fixture / poll title" : "Training focus / session title"} value={form.title} onChange={e => setForm({...form,title:e.target.value})} className={input}/>{form.type === "MATCH" ? <input placeholder="Opponent" value={form.opponent} onChange={e => setForm({...form,opponent:e.target.value})} className={input}/> : <div/>}<label className="text-sm font-semibold text-slate-400">Start<input required type="datetime-local" value={form.startsAt} onChange={e => setForm({...form,startsAt:e.target.value})} className={`${input} mt-1`}/></label><label className="text-sm font-semibold text-slate-400">End (optional)<input type="datetime-local" value={form.endsAt} onChange={e => setForm({...form,endsAt:e.target.value})} className={`${input} mt-1`}/></label>{form.type === "MATCH" && <label className="text-sm font-semibold text-slate-400">Arrival time<input type="datetime-local" value={form.arrivalTime} onChange={e => setForm({...form,arrivalTime:e.target.value})} className={`${input} mt-1`}/></label>}<input required placeholder="Venue / address" value={form.venue} onChange={e => setForm({...form,venue:e.target.value})} className={input}/><textarea placeholder="Instructions, kit or arrival notes (optional)" value={form.instructions} onChange={e => setForm({...form,instructions:e.target.value})} className={`${input} min-h-24 md:col-span-2`}/><div className="flex flex-col gap-2 sm:flex-row md:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 font-black disabled:opacity-50">{saving ? "Publishing…" : "Publish poll"}</button><button type="button" onClick={() => setShowPoll(false)} className="rounded-xl bg-slate-800 px-5 py-3 font-bold text-slate-300">Cancel</button></div></div></form>}

      <AccessRequests />

      <section className="grid gap-6 lg:grid-cols-[1.55fr_0.8fr]">
        <div className={`${card} overflow-hidden`}>
          <div className="border-b border-slate-800 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black tracking-widest text-blue-400">AVAILABILITY</p><h2 className="mt-1 text-xl font-black">Who is available?</h2><p className="mt-1 text-sm text-slate-500">{selected ? `${fullDate(selected.startsAt)} · ${time(selected.startsAt)} · ${selected.venue}` : "Create a poll to collect responses."}</p></div>{upcoming.length > 0 && <select aria-label="Choose availability poll" value={selected?.id || ""} onChange={e => setSelectedId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm"><option value="">Choose poll</option>{upcoming.map(e => <option key={e.id} value={e.id}>{date(e.startsAt)} · {e.title}</option>)}</select>}</div>{selected?.instructions && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300"><span className="font-bold text-white">Coach notes:</span> {selected.instructions}</div>}</div>
          {selected && <div className="grid grid-cols-3 border-b border-slate-800 text-center"><div className="p-4"><p className="text-2xl font-black text-emerald-400">{counts.available}</p><p className="text-xs font-bold tracking-wide text-slate-500">AVAILABLE</p></div><div className="border-x border-slate-800 p-4"><p className="text-2xl font-black text-rose-400">{counts.unavailable}</p><p className="text-xs font-bold tracking-wide text-slate-500">NOT AVAILABLE</p></div><div className="p-4"><p className="text-2xl font-black text-slate-200">{counts.pending}</p><p className="text-xs font-bold tracking-wide text-slate-500">AWAITING</p></div></div>}
          <div className="divide-y divide-slate-800">{players.map(p => { const s = selected?.availability.find(a => a.playerId === p.id)?.status || "PENDING"; return <div key={p.id} className="flex items-center gap-3 px-5 py-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-black text-slate-300">{initials(p)}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{p.firstName} {p.lastName}</p><p className="text-xs text-slate-500">{p.position}</p></div><span className={`hidden rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex ${statusClass(s)}`}>{statusText(s)}</span><div className="flex gap-1"><button title="Mark available" aria-label={`Mark ${p.firstName} available`} disabled={!selected || saving} onClick={() => updateAvailability(p.id, "AVAILABLE")} className="rounded-lg bg-emerald-950 px-2.5 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-900 disabled:opacity-40">✓</button><button title="Mark not available" aria-label={`Mark ${p.firstName} not available`} disabled={!selected || saving} onClick={() => updateAvailability(p.id, "UNAVAILABLE")} className="rounded-lg bg-rose-950 px-2.5 py-2 text-xs font-black text-rose-300 hover:bg-rose-900 disabled:opacity-40">×</button></div></div> })}</div>
          {!players.length && <div className="p-8 text-center text-sm text-slate-500">No players are registered yet.</div>}
        </div>

        <aside className="space-y-6">
          <div className={`${card} p-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black tracking-widest text-amber-400">NEEDS ATTENTION</p><h2 className="mt-1 text-xl font-black">Chase responses</h2></div><span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-300">{attention.length}</span></div>{attention.length ? <div className="mt-4 space-y-2">{attention.slice(0, 6).map(p => <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-950 p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-black">{initials(p)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{p.firstName} {p.lastName}</p><p className="text-xs text-slate-500">No response yet</p></div></div>)}{attention.length > 6 && <p className="pt-1 text-xs text-slate-500">+ {attention.length - 6} more awaiting a response</p>}</div> : <div className="mt-4 rounded-xl bg-slate-950 p-4 text-sm text-emerald-300">✓ Everyone has responded to this poll.</div>}</div>
          <div className={`${card} p-5`}><p className="text-xs font-black tracking-widest text-slate-500">QUICK MESSAGE</p><h2 className="mt-1 text-xl font-black">Tell the squad</h2><p className="mt-1 text-sm text-slate-500">Post a team-wide message.</p><textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="e.g. Bring boots, shin pads and a water bottle." className={`${input} mt-4 resize-none`}/><button onClick={sendMessage} disabled={saving || !message.trim()} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-black disabled:cursor-not-allowed disabled:opacity-40">Send to squad</button><Link href="/communication" className="mt-3 block text-center text-sm font-bold text-blue-400 hover:text-blue-300">Open messages →</Link></div>
          <div className={`${card} p-5`}><p className="text-xs font-black tracking-widest text-slate-500">QUICK ACTIONS</p><div className="mt-3 grid gap-2"><Link href="/matches" className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold hover:bg-slate-800">⚽ Manage matches <span className="float-right text-slate-600">→</span></Link><Link href="/players" className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold hover:bg-slate-800">👥 Manage players <span className="float-right text-slate-600">→</span></Link><Link href="/communication" className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold hover:bg-slate-800">💬 Team communication <span className="float-right text-slate-600">→</span></Link></div></div>
        </aside>
      </section>
    </div>
  </main>;
}
