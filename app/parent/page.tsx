"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Availability = { eventId: string; playerId: string; status: string; reason?: string | null };
type Feedback = { id: string; wentWell?: string | null; needsWork?: string | null; focusNext?: string | null; createdAt: string };
type Player = { id: string; firstName: string; lastName: string; position: string; availability: Availability[]; feedback: Feedback[] };
type Event = { id: string; type: "MATCH" | "TRAINING"; title: string; opponent?: string | null; startsAt: string; arrivalTime?: string | null; venue: string; availability: Availability[]; selections: { playerId: string; role: string; position?: string | null; isCaptain: boolean }[]; eventMessages: { id: string; sender: string; body: string; createdAt: string }[] };
type Data = { players: Player[]; events: Event[]; messages: { id: string; sender: string; body: string; createdAt: string }[] };

const fmt = (value: string) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ParentPage() {
  const [data, setData] = useState<Data | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => { const res = await fetch("/api/coachhub", { cache: "no-store" }); const json = await res.json(); setData(json); setPlayerId((id) => id || json.players?.[0]?.id || ""); };
  useEffect(() => { load(); }, []);
  const child = useMemo(() => data?.players.find((p) => p.id === playerId), [data, playerId]);
  const match = useMemo(() => data?.events.find((e) => e.type === "MATCH"), [data]);
  const training = useMemo(() => data?.events.find((e) => e.type === "TRAINING"), [data]);

  const respond = async (event: Event, status: "AVAILABLE" | "UNAVAILABLE" | "MAYBE") => {
    if (!child || saving) return;
    setSaving(true); setNotice("");
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "availability", eventId: event.id, playerId: child.id, status, reason: reason.trim() || undefined }) });
    if (res.ok) { setReason(""); setNotice(`${child.firstName}'s availability has been saved.`); await load(); } else setNotice((await res.json()).error || "Could not save availability.");
    setSaving(false);
  };

  const eventCard = (event: Event | undefined, label: string) => { if (!event || !child) return null; const current = child.availability.find((a) => a.eventId === event.id); const selection = event.selections.find((s) => s.playerId === child.id); return <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl"><p className="text-xs font-black uppercase tracking-widest text-blue-400">{label} · {event.type}</p><h2 className="mt-1 text-2xl font-black">{event.title}{event.opponent ? ` vs ${event.opponent}` : ""}</h2><p className="mt-2 text-slate-400">{fmt(event.startsAt)} · {event.venue}</p>{event.arrivalTime && <p className="mt-1 text-sm text-slate-500">Arrival: {fmt(event.arrivalTime)}</p>}{selection && <p className="mt-3 rounded-xl bg-emerald-950/50 p-3 text-sm font-bold text-emerald-300">Squad status: {selection.role.replace("_", " ")}{selection.position ? ` · ${selection.position}` : ""}{selection.isCaptain ? " · Captain" : ""}</p>}<div className="mt-5 rounded-2xl bg-slate-950 p-4"><p className="text-center text-lg font-black">Is {child.firstName} available?</p><p className="mt-1 text-center text-sm text-slate-500">Current: {current?.status || "PENDING"}</p><div className="mt-4 grid grid-cols-3 gap-2"><button disabled={saving} onClick={() => respond(event, "AVAILABLE")} className="rounded-2xl bg-emerald-600 px-2 py-4 font-black">YES</button><button disabled={saving} onClick={() => respond(event, "MAYBE")} className="rounded-2xl bg-amber-600 px-2 py-4 font-black">MAYBE</button><button disabled={saving} onClick={() => respond(event, "UNAVAILABLE")} className="rounded-2xl bg-rose-600 px-2 py-4 font-black">NO</button></div></div></section>; };

  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8"><div className="mx-auto max-w-2xl space-y-5"><header className="text-center"><p className="text-sm font-black tracking-widest text-blue-400">COACHHUB</p><h1 className="mt-1 text-4xl font-black">Parent view</h1><p className="mt-2 text-slate-400">A quick way to tell the coach about your child.</p></header><section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><label className="text-xs font-bold uppercase text-slate-500">Demo child</label><select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-bold">{data?.players.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></section>{notice && <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-3 text-center text-sm font-bold text-blue-200">{notice}</div>}<div className="space-y-4">{eventCard(match, "Next match")}{eventCard(training, "Next training")}</div><section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><label className="text-xs font-bold uppercase text-slate-500">Optional note to coach</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. away this weekend" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none" /></section>{child?.feedback?.[0] && <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-black">Latest coach feedback</h2>{child.feedback[0].wentWell && <p className="mt-3"><b>Went well:</b> {child.feedback[0].wentWell}</p>}{child.feedback[0].needsWork && <p className="mt-2"><b>Needs work:</b> {child.feedback[0].needsWork}</p>}{child.feedback[0].focusNext && <p className="mt-2 text-blue-300"><b>Next focus:</b> {child.feedback[0].focusNext}</p>}</section>}<section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-black">Coach messages</h2><div className="mt-3 space-y-3">{data?.messages?.slice(0, 5).map((m) => <div key={m.id} className="rounded-xl bg-slate-950 p-3"><p className="text-xs font-bold text-slate-500">{m.sender} · {fmt(m.createdAt)}</p><p className="mt-1">{m.body}</p></div>)}</div></section><div className="flex justify-center gap-3 text-sm"><Link href="/player" className="text-blue-400">Player view</Link><Link href="/dashboard" className="text-blue-400">Coach dashboard</Link></div></div></main>;
}
