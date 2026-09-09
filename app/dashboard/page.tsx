"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; position: string; availability: { eventId: string; status: string; reason?: string | null }[]; feedback: { needsWork?: string | null }[] };
type Event = { id: string; type: "TRAINING" | "MATCH"; title: string; opponent?: string | null; startsAt: string; endsAt?: string | null; arrivalTime?: string | null; venue: string; availability: { playerId: string; status: string }[] };
type Feedback = { id: string; player: Player; wentWell?: string | null; needsWork?: string | null; focusNext?: string | null; createdAt: string };

const card = "rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10";
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function initials(p: Player) { return `${p.firstName[0]}${p.lastName[0]}`; }
function statusLabel(status: string) { return status === "AVAILABLE" ? "Available" : status === "UNAVAILABLE" ? "Unavailable" : status === "MAYBE" ? "Maybe" : "Awaiting"; }
function statusClass(status: string) { return status === "AVAILABLE" ? "border-emerald-800 bg-emerald-950 text-emerald-300" : status === "UNAVAILABLE" ? "border-red-900 bg-red-950 text-red-300" : status === "MAYBE" ? "border-amber-800 bg-amber-950 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-300"; }

export default function Dashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/coachhub", { cache: "no-store" });
    if (res.ok) { const data = await res.json(); setPlayers(data.players); setEvents(data.events); setFeedback(data.feedback); if (!selectedEventId && data.events[0]) setSelectedEventId(data.events[0].id); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events.find((e) => e.type === "MATCH");
  const match = events.find((e) => e.type === "MATCH");
  const training = events.find((e) => e.type === "TRAINING");
  const counts = useMemo(() => {
    const a = selectedEvent?.availability || [];
    return { available: a.filter((x) => x.status === "AVAILABLE").length, unavailable: a.filter((x) => x.status === "UNAVAILABLE").length, maybe: a.filter((x) => x.status === "MAYBE").length, pending: a.filter((x) => x.status === "PENDING").length };
  }, [selectedEvent]);

  async function updateAvailability(playerId: string, status: "AVAILABLE" | "UNAVAILABLE" | "MAYBE") {
    if (!selectedEvent) return;
    setSaving(true);
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "availability", eventId: selectedEvent.id, playerId, status }) });
    if (res.ok) await load();
    setSaving(false);
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "event", ...eventForm }) });
    if (res.ok) { const created = await res.json(); setNotice(`${eventForm.type === "MATCH" ? "Match" : "Training"} created`); setShowEventForm(false); setEventForm({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "" }); await load(); setSelectedEventId(created.id); }
    else { const data = await res.json().catch(() => null); setNotice(data?.error || "Could not create event"); }
    setSaving(false);
  }

  async function sendMessage() {
    if (!message.trim()) return;
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", message }) });
    if (res.ok) { setMessage(""); setNotice("Message sent to the squad"); setTimeout(() => setNotice(""), 2500); }
  }

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-6xl py-20 text-center text-slate-400">Loading your squad…</div></main>;
  return <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-2xl font-black tracking-tight">⚽ CoachHub</div><div className="text-sm text-slate-400">The football operating system for grassroots coaches.</div></div>
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-sm"><span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 font-black">C</span> Coach</div>
      </header>

      <section className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-8 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-2 text-xs font-black tracking-[0.2em] text-blue-400">COACH DASHBOARD</div><h1 className="text-3xl font-black sm:text-4xl">Caversham Falcons U10s</h1><p className="mt-2 max-w-2xl text-slate-400">Plan, communicate, train, match and develop — all in one place.</p></div>
        <button className="rounded-xl bg-blue-600 px-5 py-3 font-black hover:bg-blue-500" onClick={() => setShowEventForm((v) => !v)}>{showEventForm ? "Close" : "+ Add event"}</button>
      </section>

      {showEventForm && <form onSubmit={createEvent} className={`${card} grid gap-3 md:grid-cols-2`}>
        <div className="md:col-span-2 flex gap-2"><button type="button" onClick={() => setEventForm((f) => ({ ...f, type: "MATCH" }))} className={`rounded-lg px-4 py-2 font-bold ${eventForm.type === "MATCH" ? "bg-blue-600" : "bg-slate-800"}`}>Match</button><button type="button" onClick={() => setEventForm((f) => ({ ...f, type: "TRAINING" }))} className={`rounded-lg px-4 py-2 font-bold ${eventForm.type === "TRAINING" ? "bg-blue-600" : "bg-slate-800"}`}>Training</button></div>
        <input required placeholder="Title / session focus" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" />
        {eventForm.type === "MATCH" ? <input placeholder="Opponent" value={eventForm.opponent} onChange={(e) => setEventForm({ ...eventForm, opponent: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /> : <div />}
        <label className="text-sm text-slate-400">Start<input required type="datetime-local" value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
        <label className="text-sm text-slate-400">End (optional)<input type="datetime-local" value={eventForm.endsAt} onChange={(e) => setEventForm({ ...eventForm, endsAt: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
        {eventForm.type === "MATCH" && <label className="text-sm text-slate-400">Player arrival<input type="datetime-local" value={eventForm.arrivalTime} onChange={(e) => setEventForm({ ...eventForm, arrivalTime: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>}
        <input required placeholder="Venue" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" />
        <button disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 font-black hover:bg-emerald-500 disabled:opacity-50 md:col-span-2">{saving ? "Saving…" : "Create event & request availability"}</button>
      </form>}

      <section className="grid gap-4 md:grid-cols-3">
        <article className={card}><div className="text-xs font-black tracking-widest text-slate-500">NEXT MATCH</div><h2 className="mt-2 text-xl font-black">{match ? `${formatDate(match.startsAt)} · ${match.opponent || "Fixture"}` : "No match scheduled"}</h2><div className="mt-3 text-3xl font-black text-emerald-400">{match?.availability.filter((a) => a.status === "AVAILABLE").length ?? 0} <span className="text-sm text-slate-400">available</span></div><div className="text-sm text-slate-500">{match?.availability.filter((a) => a.status === "PENDING").length ?? 0} awaiting a response</div></article>
        <article className={card}><div className="text-xs font-black tracking-widest text-slate-500">NEXT TRAINING</div><h2 className="mt-2 text-xl font-black">{training ? formatDate(training.startsAt) : "No training scheduled"}</h2><div className="mt-3 text-3xl font-black">{training ? formatTime(training.startsAt) : "—"}</div><div className="text-sm text-slate-500">{training?.title} · {training?.venue}</div></article>
        <article className={`${card} border-amber-900/60`}><div className="text-xs font-black tracking-widest text-amber-400">NEEDS ATTENTION</div><ul className="mt-3 space-y-2 text-sm text-slate-300"><li>• {counts.pending} replies missing</li><li>• {feedback.filter((f) => f.needsWork).length} development notes</li><li>• {counts.available} currently available</li></ul></article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <article className={card}>
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black tracking-widest text-blue-400">AVAILABILITY</div><h2 className="mt-1 text-xl font-black">Squad responses</h2></div><select value={selectedEvent?.id || ""} onChange={(e) => setSelectedEventId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">Select event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.type === "MATCH" ? "⚽" : "🏃"} {formatDate(e.startsAt)} · {e.title}{e.opponent ? ` vs ${e.opponent}` : ""}</option>)}</select></div>
          {selectedEvent && <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div className="rounded-xl bg-emerald-950 p-2"><b className="block text-lg text-emerald-300">{counts.available}</b>Available</div><div className="rounded-xl bg-red-950 p-2"><b className="block text-lg text-red-300">{counts.unavailable}</b>Unavailable</div><div className="rounded-xl bg-amber-950 p-2"><b className="block text-lg text-amber-300">{counts.maybe}</b>Maybe</div><div className="rounded-xl bg-slate-800 p-2"><b className="block text-lg">{counts.pending}</b>Awaiting</div></div>}
          <div className="mt-4 divide-y divide-slate-800">{players.map((p) => { const status = selectedEvent?.availability.find((a) => a.playerId === p.id)?.status || "PENDING"; return <div key={p.id} className="flex flex-wrap items-center gap-3 py-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 font-black text-slate-300">{initials(p)}</span><div className="min-w-32 flex-1"><div className="font-bold">{p.firstName} {p.lastName}</div><div className="text-xs text-slate-500">{p.position}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(status)}`}>{statusLabel(status)}</span><div className="flex gap-1"><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(p.id, "AVAILABLE")} className="rounded-lg border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950">✓</button><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(p.id, "MAYBE")} className="rounded-lg border border-amber-800 px-2 py-1 text-xs text-amber-300 hover:bg-amber-950">?</button><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(p.id, "UNAVAILABLE")} className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-950">×</button></div></div>; })}</div>
        </article>
        <article className={card}><div className="text-xs font-black tracking-widest text-blue-400">THINGS TO WORK ON</div><h2 className="mt-1 text-xl font-black">Development focus</h2><div className="mt-4 space-y-3">{feedback.slice(0, 4).map((f) => <div key={f.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><b>{f.player.firstName} {f.player.lastName}</b><p className="mt-1 text-sm text-slate-400">{f.needsWork || "Keep building consistency"}</p></div>)}<div className="rounded-xl border border-blue-900 bg-blue-950/40 p-3"><b>Team</b><p className="mt-1 text-sm text-blue-200">Playing out from the back under pressure</p></div></div></article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className={card}><div className="text-xs font-black tracking-widest text-blue-400">RECENT FEEDBACK</div><h2 className="mt-1 text-xl font-black">Keep the conversation going</h2>{feedback.slice(0, 3).map((f) => <div key={f.id} className="mt-4 border-l-2 border-slate-700 pl-4 text-sm"><div className="flex justify-between gap-3"><b>{f.player.firstName} {f.player.lastName}</b><span className="text-slate-500">{formatDate(f.createdAt)}</span></div><div className="mt-2 text-slate-400"><b className="text-slate-300">Went well:</b> {f.wentWell || "—"}</div><div className="mt-1 text-slate-400"><b className="text-slate-300">Next:</b> {f.focusNext || f.needsWork || "—"}</div></div>)}</article>
        <article className={card}><div className="text-xs font-black tracking-widest text-blue-400">COMMUNICATION</div><h2 className="mt-1 text-xl font-black">Message the squad</h2><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Please arrive 15 minutes early on Saturday…" className="mt-4 min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /><button disabled={!message.trim()} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-black hover:bg-blue-500 disabled:opacity-40" onClick={sendMessage}>Send to all parents & players</button>{notice && <div className="mt-3 rounded-lg bg-emerald-950 p-3 text-sm text-emerald-300">{notice}</div>}</article>
      </section>
      <footer className="pb-4 text-center text-xs text-slate-600">CoachHub · Plan → Communicate → Availability → Train → Match → Feedback → Develop</footer>
    </div>
  </main>;
}
