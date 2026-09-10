"use client";

import { useEffect, useMemo, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; position: string };
type Selection = { id: string; playerId: string; role: "STARTING" | "SUBSTITUTE" | "NOT_SELECTED"; position: string | null; isCaptain: boolean; player: Player };
type Event = { id: string; type: "MATCH" | "TRAINING"; title: string; opponent: string | null; startsAt: string; venue: string; matchFormation: string | null; matchKit: string | null; matchResult: string | null; matchScoreFor: number | null; matchScoreAgainst: number | null; matchNotes: string | null; selections: Selection[] };

const roleLabels = { STARTING: "Starting XI", SUBSTITUTE: "Substitutes", NOT_SELECTED: "Not selected" } as const;

export default function MatchesPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [matchForm, setMatchForm] = useState({ formation: "7-a-side", kit: "Home", result: "", scoreFor: "", scoreAgainst: "", notes: "" });

  async function load() {
    const res = await fetch("/api/coachhub", { cache: "no-store" });
    const data = await res.json();
    const matches = (data.events || []).filter((e: Event) => e.type === "MATCH");
    setEvents(matches);
    setPlayers(data.players || []);
    setSelectedId((current) => current || matches[0]?.id || "");
  }

  useEffect(() => { load(); }, []);

  const match = events.find((e) => e.id === selectedId) || events[0];
  const selections = match?.selections || [];
  const selectedMap = useMemo(() => new Map(selections.map((s) => [s.playerId, s])), [selections]);
  const starting = selections.filter((s) => s.role === "STARTING");
  const substitutes = selections.filter((s) => s.role === "SUBSTITUTE");

  useEffect(() => {
    if (!match) return;
    setMatchForm({ formation: match.matchFormation || "7-a-side", kit: match.matchKit || "Home", result: match.matchResult || "", scoreFor: match.matchScoreFor?.toString() || "", scoreAgainst: match.matchScoreAgainst?.toString() || "", notes: match.matchNotes || "" });
  }, [match?.id]);

  async function post(body: Record<string, unknown>) {
    setSaving(true); setNotice("");
    const res = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setNotice(data.error || "Could not save"); return false; }
    await load();
    setNotice("Saved");
    return true;
  }

  async function setRole(player: Player, role: "STARTING" | "SUBSTITUTE" | "NOT_SELECTED") {
    const current = selectedMap.get(player.id);
    await post({ action: "squad", eventId: match.id, playerId: player.id, role, position: current?.position || player.position, isCaptain: current?.isCaptain && role === "STARTING" });
  }

  async function captain(player: Player) {
    const current = selectedMap.get(player.id);
    await post({ action: "squad", eventId: match.id, playerId: player.id, role: "STARTING", position: current?.position || player.position, isCaptain: true });
  }

  async function saveMatch() { await post({ action: "match", eventId: match.id, ...matchForm }); }

  if (!match) return <main className="min-h-screen bg-slate-950 px-6 py-10 text-white"><div className="mx-auto max-w-5xl"><p className="text-sm text-slate-400">CoachHub</p><h1 className="mt-2 text-3xl font-bold">Match management</h1><p className="mt-3 text-slate-400">Create a match from the dashboard first, then manage its squad here.</p></div></main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-sky-400">COACHHUB · MATCHES</p><h1 className="mt-1 text-3xl font-bold">Squad & match day</h1><p className="mt-1 text-slate-400">Select your team, assign positions and finish the match record.</p></div><a href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">← Dashboard</a></header>
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase tracking-wider text-slate-500">Match</p><h2 className="text-xl font-semibold">{match.title}{match.opponent ? ` vs ${match.opponent}` : ""}</h2><p className="text-sm text-slate-400">{new Date(match.startsAt).toLocaleString("en-GB")} · {match.venue}</p></div><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">{events.map((e) => <option key={e.id} value={e.id}>{e.title}{e.opponent ? ` vs ${e.opponent}` : ""}</option>)}</select></div></div>
    <section className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]"><div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Starting XI · {starting.length}</h2><span className="text-xs text-slate-500">Tap captain ★</span></div><div className="mt-4 space-y-2">{players.map((p) => { const s = selectedMap.get(p.id); return <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-black/10 p-3"><div className="min-w-40 flex-1"><p className="font-medium">{p.firstName} {p.lastName} {s?.isCaptain && <span className="text-amber-300">★</span>}</p><p className="text-xs text-slate-500">{s?.position || p.position}</p></div><button onClick={() => setRole(p, "STARTING")} className={`rounded-lg px-3 py-1.5 text-xs ${s?.role === "STARTING" ? "bg-sky-500 text-white" : "bg-white/5 text-slate-300"}`}>Start</button><button onClick={() => setRole(p, "SUBSTITUTE")} className={`rounded-lg px-3 py-1.5 text-xs ${s?.role === "SUBSTITUTE" ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300"}`}>Sub</button><button onClick={() => setRole(p, "NOT_SELECTED")} className={`rounded-lg px-3 py-1.5 text-xs ${s?.role === "NOT_SELECTED" || !s ? "bg-white/5 text-slate-300" : "bg-white/5 text-slate-500"}`}>Out</button><button disabled={s?.role !== "STARTING"} onClick={() => captain(p)} className="rounded-lg px-2 py-1.5 text-xs text-amber-300 disabled:opacity-30">★</button></div> })}</div></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-lg font-semibold">Squad summary</h2><div className="mt-4 grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-white/5 p-4"><p className="text-2xl font-bold">{starting.length}</p><p className="text-xs text-slate-500">Starting</p></div><div className="rounded-xl bg-white/5 p-4"><p className="text-2xl font-bold">{substitutes.length}</p><p className="text-xs text-slate-500">Subs</p></div><div className="rounded-xl bg-white/5 p-4"><p className="text-2xl font-bold">{players.length - starting.length - substitutes.length}</p><p className="text-xs text-slate-500">Not selected</p></div></div><div className="mt-4 space-y-2">{[...starting, ...substitutes].map((s) => <div key={s.id} className="flex justify-between rounded-lg bg-black/10 px-3 py-2 text-sm"><span>{s.player.firstName} {s.player.lastName}</span><span className="text-slate-500">{roleLabels[s.role]} · {s.position || s.player.position}</span></div>)}</div></div>
    </div><aside className="space-y-6"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-lg font-semibold">Match details</h2><div className="mt-4 space-y-3">{([['formation','Formation'],['kit','Kit'],['result','Result']] as const).map(([key,label]) => <label key={key} className="block text-xs text-slate-400">{label}<input value={matchForm[key]} onChange={(e) => setMatchForm({ ...matchForm, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder={label} /></label>)}<div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Us<input inputMode="numeric" value={matchForm.scoreFor} onChange={(e) => setMatchForm({ ...matchForm, scoreFor: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" /></label><label className="text-xs text-slate-400">Them<input inputMode="numeric" value={matchForm.scoreAgainst} onChange={(e) => setMatchForm({ ...matchForm, scoreAgainst: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" /></label></div><label className="block text-xs text-slate-400">Match notes<textarea value={matchForm.notes} onChange={(e) => setMatchForm({ ...matchForm, notes: e.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" /></label><button disabled={saving} onClick={saveMatch} className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save match"}</button></div></div>{notice && <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">{notice}</p>}</aside></section>
  </div></main>;
}
