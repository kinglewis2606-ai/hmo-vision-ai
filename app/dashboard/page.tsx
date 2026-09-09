"use client";

import { useEffect, useMemo, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; position: string; availability: { eventId: string; status: string; reason?: string | null }[]; feedback: { needsWork?: string | null }[] };
type Event = { id: string; type: "TRAINING" | "MATCH"; title: string; opponent?: string | null; startsAt: string; endsAt?: string | null; venue: string; availability: { playerId: string; status: string }[] };
type Feedback = { id: string; player: Player; wentWell?: string | null; needsWork?: string | null; focusNext?: string | null; createdAt: string };

function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function initials(p: Player) { return `${p.firstName[0]}${p.lastName[0]}`; }

export default function Dashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const res = await fetch("/api/coachhub", { cache: "no-store" }); if (res.ok) { const data = await res.json(); setPlayers(data.players); setEvents(data.events); setFeedback(data.feedback); } setLoading(false); }
  useEffect(() => { load(); }, []);
  const match = events.find((e) => e.type === "MATCH");
  const training = events.find((e) => e.type === "TRAINING");
  const matchCounts = useMemo(() => ({ available: match?.availability.filter((a) => a.status === "AVAILABLE").length ?? 0, pending: match?.availability.filter((a) => a.status === "PENDING").length ?? 0 }), [match]);
  async function sendMessage() { if (!message.trim()) return; const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", message }) }); if (res.ok) { setMessage(""); setNotice("Message sent to the squad"); setTimeout(() => setNotice(""), 2500); } }
  if (loading) return <main className="shell"><div className="loading">Loading your squad…</div></main>;
  return <main className="shell">
    <header className="topbar"><div><div className="brand">CoachHub</div><div className="muted">The football operating system for grassroots coaches.</div></div><div className="coach-chip"><span className="avatar">C</span><span>Coach</span></div></header>
    <section className="hero"><div><div className="eyebrow">COACH DASHBOARD</div><h1>Caversham Falcons U10s</h1><p>Plan, communicate, train, match and develop — all in one place.</p></div><button className="primary" onClick={() => document.getElementById("message-box")?.scrollIntoView({ behavior: "smooth" })}>Message squad</button></section>
    <section className="stats-grid">
      <article className="card"><div className="label">NEXT MATCH</div><h2>{match ? `${formatDate(match.startsAt)} · ${match.opponent}` : "No match scheduled"}</h2><div className="big-number">{matchCounts.available} <span>available</span></div><div className="muted">{matchCounts.pending} awaiting a response</div></article>
      <article className="card"><div className="label">NEXT TRAINING</div><h2>{training ? formatDate(training.startsAt) : "No training scheduled"}</h2><div className="big-number">{training ? formatTime(training.startsAt) : "—"} <span>{training?.title}</span></div><div className="muted">{training?.venue}</div></article>
      <article className="card attention"><div className="label">NEEDS ATTENTION</div><ul><li>{matchCounts.pending} match replies missing</li><li>{feedback.filter((f) => f.needsWork).length} development notes to review</li><li>Squad selection not finished</li></ul></article>
    </section>
    <section className="content-grid">
      <article className="card"><div className="section-head"><div><div className="label">AVAILABILITY</div><h2>Squad for the next match</h2></div><span className="pill">{matchCounts.available} available</span></div><div className="players">{players.map((p) => { const a = match?.availability.find((x) => x.playerId === p.id)?.status ?? "PENDING"; return <div className="player" key={p.id}><span className="avatar">{initials(p)}</span><div className="player-name"><strong>{p.firstName} {p.lastName}</strong><span>{p.position}</span></div><span className={`status ${a.toLowerCase()}`}>{a === "AVAILABLE" ? "Available" : a === "UNAVAILABLE" ? "Unavailable" : a === "MAYBE" ? "Maybe" : "Awaiting"}</span></div>; })}</div></article>
      <article className="card"><div className="label">THINGS TO WORK ON</div><h2>Development focus</h2><div className="focus-list">{feedback.slice(0, 3).map((f) => <div className="focus" key={f.id}><strong>{f.player.firstName} {f.player.lastName}</strong><span>{f.needsWork || "Keep building consistency"}</span></div>)}<div className="focus"><strong>Team</strong><span>Playing out from the back under pressure</span></div></div></article>
    </section>
    <section className="content-grid lower">
      <article className="card"><div className="section-head"><div><div className="label">RECENT FEEDBACK</div><h2>Keep the conversation going</h2></div></div>{feedback.slice(0, 3).map((f) => <div className="feedback" key={f.id}><div className="feedback-top"><strong>{f.player.firstName} {f.player.lastName}</strong><span>{formatDate(f.createdAt)}</span></div><div><b>Went well:</b> {f.wentWell || "—"}</div><div><b>Next:</b> {f.focusNext || f.needsWork || "—"}</div></div>)}</article>
      <article className="card" id="message-box"><div className="label">COMMUNICATION</div><h2>Message the squad</h2><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Please arrive 15 minutes early on Saturday…" /><button className="primary full" onClick={sendMessage}>Send to all parents & players</button>{notice && <div className="success">{notice}</div>}</article>
    </section>
    <footer className="footer">CoachHub · Plan → Communicate → Availability → Train → Match → Feedback → Develop</footer>
  </main>;
}
