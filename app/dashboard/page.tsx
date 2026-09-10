"use client";

import Link from "next/link";
import AccessRequests from "@/app/dashboard/AccessRequests";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; position: string; availability: { eventId: string; status: string }[] };
type Event = { id: string; type: "TRAINING" | "MATCH"; title: string; opponent?: string | null; startsAt: string; endsAt?: string | null; arrivalTime?: string | null; venue: string; availability: { playerId: string; status: string }[] };

const card = "rounded-2xl border border-slate-800 bg-slate-900/60 p-5";
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function initials(player: Player) { return `${player.firstName[0]}${player.lastName[0]}`; }
function statusLabel(status: string) { return status === "AVAILABLE" ? "Available" : status === "UNAVAILABLE" ? "Unavailable" : status === "MAYBE" ? "Maybe" : "Awaiting"; }
function statusClass(status: string) { return status === "AVAILABLE" ? "border-emerald-800 bg-emerald-950 text-emerald-300" : status === "UNAVAILABLE" ? "border-red-900 bg-red-950 text-red-300" : status === "MAYBE" ? "border-amber-800 bg-amber-950 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-300"; }

export default function Dashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/coachhub", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setPlayers(data.players || []);
      setEvents(data.events || []);
      if (!selectedEventId && data.events?.[0]) setSelectedEventId(data.events[0].id);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId) || events.find((event) => event.type === "MATCH");
  const nextMatch = events.find((event) => event.type === "MATCH");
  const nextTraining = events.find((event) => event.type === "TRAINING");
  const counts = useMemo(() => {
    const availability = selectedEvent?.availability || [];
    return {
      available: availability.filter((item) => item.status === "AVAILABLE").length,
      unavailable: availability.filter((item) => item.status === "UNAVAILABLE").length,
      maybe: availability.filter((item) => item.status === "MAYBE").length,
      pending: availability.filter((item) => item.status === "PENDING").length,
    };
  }, [selectedEvent]);

  async function updateAvailability(playerId: string, status: "AVAILABLE" | "UNAVAILABLE" | "MAYBE") {
    if (!selectedEvent) return;
    setSaving(true);
    const response = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "availability", eventId: selectedEvent.id, playerId, status }) });
    if (response.ok) await load();
    setSaving(false);
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "event", ...eventForm }) });
    if (response.ok) {
      const created = await response.json();
      setNotice(`${eventForm.type === "MATCH" ? "Match" : "Training"} created`);
      setShowEventForm(false);
      setEventForm({ type: "MATCH", title: "", opponent: "", startsAt: "", endsAt: "", arrivalTime: "", venue: "" });
      await load();
      setSelectedEventId(created.id);
    } else {
      const data = await response.json().catch(() => null);
      setNotice(data?.error || "Could not create event");
    }
    setSaving(false);
  }

  async function sendMessage() {
    if (!message.trim()) return;
    const response = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", message: message.trim() }) });
    if (response.ok) {
      setMessage("");
      setNotice("Message sent to the squad");
    }
  }

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-6xl py-20 text-center text-slate-400">Loading your squad…</div></main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-2xl font-black tracking-tight">⚽ CoachHub</div><div className="text-sm text-slate-500">Caversham Falcons U10s</div></div>
          <nav className="flex flex-wrap gap-1 text-sm font-bold">
            <Link href="/dashboard" className="rounded-lg bg-slate-800 px-3 py-2 text-white">Home</Link>
            <Link href="/matches" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Matches</Link>
            <Link href="/communication" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Messages</Link>
            <Link href="/players" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Players</Link>
          </nav>
        </header>

        <AccessRequests />

        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black tracking-widest text-blue-400">HOME</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">What needs doing?</h1><p className="mt-1 text-slate-400">Your team at a glance.</p></div>
          <button onClick={() => setShowEventForm((open) => !open)} className="rounded-xl bg-blue-600 px-5 py-3 font-black hover:bg-blue-500">{showEventForm ? "Close" : "+ Add event"}</button>
        </section>

        {showEventForm && <form onSubmit={createEvent} className={`${card} grid gap-3 md:grid-cols-2`}>
          <div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => setEventForm((form) => ({ ...form, type: "MATCH" }))} className={`rounded-lg px-4 py-2 font-bold ${eventForm.type === "MATCH" ? "bg-blue-600" : "bg-slate-800"}`}>Match</button><button type="button" onClick={() => setEventForm((form) => ({ ...form, type: "TRAINING" }))} className={`rounded-lg px-4 py-2 font-bold ${eventForm.type === "TRAINING" ? "bg-blue-600" : "bg-slate-800"}`}>Training</button></div>
          <input required placeholder="Title / session focus" value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" />
          {eventForm.type === "MATCH" ? <input placeholder="Opponent" value={eventForm.opponent} onChange={(event) => setEventForm({ ...eventForm, opponent: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /> : <div />}
          <label className="text-sm text-slate-400">Start<input required type="datetime-local" value={eventForm.startsAt} onChange={(event) => setEventForm({ ...eventForm, startsAt: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label className="text-sm text-slate-400">End (optional)<input type="datetime-local" value={eventForm.endsAt} onChange={(event) => setEventForm({ ...eventForm, endsAt: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          {eventForm.type === "MATCH" && <label className="text-sm text-slate-400">Player arrival<input type="datetime-local" value={eventForm.arrivalTime} onChange={(event) => setEventForm({ ...eventForm, arrivalTime: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /></label>}
          <input required placeholder="Venue" value={eventForm.venue} onChange={(event) => setEventForm({ ...eventForm, venue: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" />
          <button disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 font-black disabled:opacity-50 md:col-span-2">{saving ? "Saving…" : "Create event"}</button>
        </form>}

        <section className="grid gap-4 md:grid-cols-2">
          <article className={card}><div className="text-xs font-black tracking-widest text-slate-500">NEXT MATCH</div><h2 className="mt-2 text-2xl font-black">{nextMatch ? `${nextMatch.opponent || "Fixture"} · ${formatDate(nextMatch.startsAt)}` : "No match scheduled"}</h2>{nextMatch && <p className="mt-2 text-slate-400">{formatTime(nextMatch.startsAt)} · {nextMatch.venue} · {nextMatch.availability.filter((item) => item.status === "AVAILABLE").length} available</p>}<Link href="/matches" className="mt-4 inline-block text-sm font-bold text-blue-400 hover:text-blue-300">Manage match →</Link></article>
          <article className={card}><div className="text-xs font-black tracking-widest text-slate-500">NEXT TRAINING</div><h2 className="mt-2 text-2xl font-black">{nextTraining ? formatDate(nextTraining.startsAt) : "No training scheduled"}</h2>{nextTraining && <p className="mt-2 text-slate-400">{formatTime(nextTraining.startsAt)} · {nextTraining.title} · {nextTraining.venue}</p>}</article>
        </section>

        <section className={card}>
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black tracking-widest text-blue-400">AVAILABILITY</div><h2 className="mt-1 text-xl font-black">Who is available?</h2></div><select value={selectedEvent?.id || ""} onChange={(event) => setSelectedEventId(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">Select event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.type === "MATCH" ? "⚽" : "🏃"} {formatDate(event.startsAt)} · {event.title}{event.opponent ? ` vs ${event.opponent}` : ""}</option>)}</select></div>
          {selectedEvent && <div className="flex flex-wrap gap-4 py-4 text-sm"><span className="text-emerald-300"><b>{counts.available}</b> available</span><span className="text-amber-300"><b>{counts.maybe}</b> maybe</span><span className="text-red-300"><b>{counts.unavailable}</b> unavailable</span><span className="text-slate-400"><b>{counts.pending}</b> awaiting</span></div>}
          <div className="divide-y divide-slate-800">{players.map((player) => { const status = selectedEvent?.availability.find((item) => item.playerId === player.id)?.status || "PENDING"; return <div key={player.id} className="flex flex-wrap items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-black text-slate-300">{initials(player)}</span><div className="min-w-32 flex-1"><div className="font-bold">{player.firstName} {player.lastName}</div><div className="text-xs text-slate-500">{player.position}</div></div><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(status)}`}>{statusLabel(status)}</span><div className="flex gap-1"><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(player.id, "AVAILABLE")} className="rounded-lg border border-emerald-800 px-2 py-1 text-xs text-emerald-300">✓</button><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(player.id, "MAYBE")} className="rounded-lg border border-amber-800 px-2 py-1 text-xs text-amber-300">?</button><button disabled={!selectedEvent || saving} onClick={() => updateAvailability(player.id, "UNAVAILABLE")} className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-300">×</button></div></div>; })}</div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className={card}><div className="text-xs font-black tracking-widest text-blue-400">QUICK MESSAGE</div><h2 className="mt-1 text-xl font-black">Message the squad</h2><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. Please arrive 15 minutes early on Saturday…" className="mt-3 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-blue-500" /><button disabled={!message.trim()} onClick={sendMessage} className="mt-3 rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-40">Send message</button>{notice && <span className="ml-3 text-sm font-bold text-emerald-400">{notice}</span>}</div>
          <Link href="/players" className="flex min-w-52 items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-blue-700"><span><span className="block text-xs font-black tracking-widest text-slate-500">SQUAD</span><span className="mt-1 block text-xl font-black">Player profiles</span><span className="mt-1 block text-sm text-slate-400">Bio + improvement notes</span></span><span className="text-xl text-blue-400">→</span></Link>
        </section>
      </div>
    </main>
  );
}
