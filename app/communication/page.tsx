"use client";

import { useEffect, useState } from "react";

type Event = { id: string; type: "MATCH" | "TRAINING"; title: string; opponent: string | null; startsAt: string; eventMessages: { id: string; sender: string; body: string; createdAt: string }[] };
type Message = { id: string; sender: string; body: string; createdAt: string };

export default function CommunicationPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [eventId, setEventId] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/coachhub", { cache: "no-store" });
    const data = await res.json();
    setEvents(data.events || []); setMessages(data.messages || []); setEventId((v) => v || data.events?.[0]?.id || "");
  }
  useEffect(() => { load(); }, []);

  const selected = events.find((e) => e.id === eventId);
  async function send() {
    if (!body.trim()) return;
    setSaving(true); setNotice("");
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", message: body, eventId: eventId || undefined }) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setNotice(data.error || "Could not send"); return; }
    setBody(""); setNotice("Message sent"); await load();
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-sky-400">COACHHUB · COMMUNICATION</p><h1 className="mt-1 text-3xl font-bold">Team communication</h1><p className="mt-1 text-slate-400">Keep the whole team aligned, or send a message against a specific event.</p></div><a href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">← Dashboard</a></header>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="flex flex-col gap-3 sm:flex-row"><select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm sm:w-72"><option value="">Team-wide message</option>{events.map((e) => <option key={e.id} value={e.id}>{e.type === "MATCH" ? "Match" : "Training"}: {e.title}{e.opponent ? ` vs ${e.opponent}` : ""}</option>)}</select><input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm" placeholder={selected ? `Message about ${selected.title}…` : "Write a team message…"} /><button disabled={saving || !body.trim()} onClick={send} className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold disabled:opacity-40">{saving ? "Sending…" : "Send"}</button></div>{notice && <p className="mt-3 text-sm text-slate-400">{notice}</p>}</section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-lg font-semibold">Team messages</h2><div className="mt-4 space-y-3">{messages.length ? messages.map((m) => <article key={m.id} className="rounded-xl bg-black/10 p-4"><div className="flex justify-between gap-3"><span className="text-sm font-medium">{m.sender}</span><time className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString("en-GB")}</time></div><p className="mt-2 text-sm text-slate-300">{m.body}</p></article>) : <p className="text-sm text-slate-500">No team messages yet.</p>}</div></section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-lg font-semibold">Event communication</h2><div className="mt-4 space-y-4">{events.slice(0, 8).map((e) => <div key={e.id} className="rounded-xl bg-black/10 p-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{e.title}{e.opponent ? ` vs ${e.opponent}` : ""}</p><p className="text-xs text-slate-500">{new Date(e.startsAt).toLocaleString("en-GB")}</p></div><button onClick={() => setEventId(e.id)} className="text-xs text-sky-400">Message</button></div><div className="mt-3 space-y-2">{e.eventMessages.length ? e.eventMessages.slice(0, 4).map((m) => <p key={m.id} className="rounded-lg border border-white/5 px-3 py-2 text-sm text-slate-300"><span className="font-medium text-white">{m.sender}:</span> {m.body}</p>) : <p className="text-xs text-slate-600">No event messages.</p>}</div></div>)}</div></section></div>
  </div></main>;
}
