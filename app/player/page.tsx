"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Availability = { eventId: string; playerId: string; status: string; reason?: string | null };
type Feedback = { id: string; wentWell?: string | null; needsWork?: string | null; focusNext?: string | null; passing?: number | null; firstTouch?: number | null; positioning?: number | null; confidence?: number | null; createdAt: string };
type Player = { id: string; firstName: string; lastName: string; position: string; availability: Availability[]; feedback: Feedback[] };
type Event = { id: string; type: "MATCH" | "TRAINING"; title: string; opponent?: string | null; startsAt: string; endsAt?: string | null; arrivalTime?: string | null; venue: string; availability: Availability[]; selections: { playerId: string; role: string; position?: string | null; isCaptain: boolean }[]; eventMessages: { id: string; sender: string; body: string; createdAt: string }[] };
type Data = { players: Player[]; events: Event[]; messages: { id: string; sender: string; body: string; createdAt: string }[] };

const fmt = (value: string) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function PlayerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const res = await fetch("/api/coachhub", { cache: "no-store" });
    const json = await res.json();
    setData(json);
    setPlayerId((current) => current || json.players?.[0]?.id || "");
  };
  useEffect(() => { load(); }, []);

  const player = useMemo(() => data?.players.find((p) => p.id === playerId), [data, playerId]);
  const events = useMemo(() => [...(data?.events || [])].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 6), [data]);
  const feedback = player?.feedback?.[0];

  const setAvailability = async (event: Event, status: "AVAILABLE" | "MAYBE" | "UNAVAILABLE") => {
    if (!player || saving) return;
    setSaving(event.id + status); setMessage("");
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "availability", teamId: "", eventId: event.id, playerId: player.id, status, reason: reason.trim() || undefined }) });
    if (res.ok) { setReason(""); await load(); setMessage("Availability updated."); } else setMessage((await res.json()).error || "Could not update availability.");
    setSaving("");
  };

  return <main className="min-h-screen bg-slate-950 text-white p-4 sm:p-8">
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-bold text-blue-400">COACHHUB</p><h1 className="text-3xl font-black">Player view</h1><p className="text-slate-400">See your schedule, availability and development.</p></div>
        <Link href="/dashboard" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold">Coach dashboard</Link>
      </header>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Demo player</label>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-bold">{data?.players.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.position}</option>)}</select>
      </section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black">Availability</h2>{message && <span className="text-sm text-blue-300">{message}</span>}</div><div className="space-y-3">{events.map((event) => { const a = player?.availability.find((x) => x.eventId === event.id); const selection = event.selections.find((x) => x.playerId === player?.id); return <article key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-4"><div><span className="text-xs font-black uppercase text-blue-400">{event.type}</span><h3 className="text-lg font-black">{event.title}{event.opponent ? ` vs ${event.opponent}` : ""}</h3><p className="text-sm text-slate-400">{fmt(event.startsAt)} · {event.venue}</p>{selection && <p className="mt-2 text-sm font-bold text-emerald-300">Squad: {selection.role.replace("_", " ")}{selection.position ? ` · ${selection.position}` : ""}{selection.isCaptain ? " · Captain" : ""}</p>}</div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold">{a?.status || "PENDING"}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><button disabled={!!saving} onClick={() => setAvailability(event, "AVAILABLE")} className="rounded-xl bg-emerald-600 px-2 py-3 text-sm font-black">Available</button><button disabled={!!saving} onClick={() => setAvailability(event, "MAYBE")} className="rounded-xl bg-amber-600 px-2 py-3 text-sm font-black">Maybe</button><button disabled={!!saving} onClick={() => setAvailability(event, "UNAVAILABLE")} className="rounded-xl bg-rose-600 px-2 py-3 text-sm font-black">Unavailable</button></div></article>; })}</div></section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-black">Reason (optional)</h2><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add a note for your coach" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none" /></section>
      {feedback && <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-black">Latest feedback</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{[["Passing", feedback.passing],["First touch", feedback.firstTouch],["Positioning", feedback.positioning],["Confidence", feedback.confidence]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-black">{value ?? "—"}<span className="text-sm text-slate-600">/5</span></p></div>)}</div>{feedback.wentWell && <p className="mt-4"><b>Went well:</b> {feedback.wentWell}</p>}{feedback.needsWork && <p className="mt-2"><b>Needs work:</b> {feedback.needsWork}</p>}{feedback.focusNext && <p className="mt-2 text-blue-300"><b>Next focus:</b> {feedback.focusNext}</p>}</section>}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-black">Team messages</h2><div className="mt-3 space-y-3">{data?.messages?.slice(0, 5).map((m) => <div key={m.id} className="rounded-xl bg-slate-950 p-3"><p className="text-xs font-bold text-slate-500">{m.sender} · {fmt(m.createdAt)}</p><p className="mt-1">{m.body}</p></div>)}</div></section>
    </div>
  </main>;
}
