"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Event = {
  id: string;
  type: "MATCH" | "TRAINING";
  title: string;
  opponent?: string | null;
  startsAt: string;
  arrivalTime?: string | null;
  venue: string;
  instructions?: string | null;
  availability: { status: string }[];
};

type Data = { events: Event[] };

const fmt = (value: string) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HomePolls() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/coachhub", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: Data) => setEvents((data.events || []).filter((event) => new Date(event.startsAt) >= new Date()).slice(0, 4)))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <section className="mt-10 rounded-3xl border border-slate-800 bg-slate-900 p-6 text-left text-slate-400">Loading team polls…</section>;

  return <section className="mt-10 space-y-4 text-left">
    <div><p className="text-xs font-black tracking-widest text-blue-400">TEAM POLLS</p><h2 className="mt-1 text-2xl font-black">Upcoming availability</h2><p className="mt-1 text-sm text-slate-500">Coaches publish match and training polls here for the whole team.</p></div>
    {events.length === 0 ? <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-400">No upcoming polls have been published yet.</div> : <div className="grid gap-4 md:grid-cols-2">{events.map((event) => {
      const available = event.availability.filter((item) => item.status === "AVAILABLE").length;
      const unavailable = event.availability.filter((item) => item.status === "UNAVAILABLE").length;
      const pending = event.availability.filter((item) => item.status === "PENDING").length;
      return <article key={event.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <p className="text-xs font-black uppercase tracking-widest text-blue-400">{event.type === "MATCH" ? "⚽ Match poll" : "🏃 Training poll"}</p>
        <h3 className="mt-2 text-xl font-black">{event.title}{event.opponent ? ` vs ${event.opponent}` : ""}</h3>
        <p className="mt-2 text-sm text-slate-400">{fmt(event.startsAt)} · {event.venue}</p>
        {event.arrivalTime && <p className="mt-1 text-xs text-slate-500">Arrival: {fmt(event.arrivalTime)}</p>}
        {event.instructions && <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Team information</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{event.instructions}</p></div>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold"><div className="rounded-xl bg-emerald-950 p-3 text-emerald-300"><b className="block text-lg">{available}</b>Available</div><div className="rounded-xl bg-rose-950 p-3 text-rose-300"><b className="block text-lg">{unavailable}</b>Not available</div><div className="rounded-xl bg-slate-950 p-3 text-slate-400"><b className="block text-lg">{pending}</b>Awaiting</div></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Link href="/player" className="rounded-xl bg-blue-600 px-3 py-3 text-center text-sm font-black hover:bg-blue-500">Player response</Link><Link href="/parent" className="rounded-xl border border-slate-700 px-3 py-3 text-center text-sm font-black hover:border-blue-600">Parent response</Link></div>
      </article>;
    })}</div>}
  </section>;
}
