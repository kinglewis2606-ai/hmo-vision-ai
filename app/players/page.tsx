"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Feedback = { id: string; playerId: string; coachName: string; needsWork?: string | null; createdAt: string };
type Player = { id: string; firstName: string; lastName: string; position: string; parentName?: string | null; parentEmail?: string | null; feedback: Feedback[] };

function initials(player: Player) { return `${player.firstName[0]}${player.lastName[0]}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/coachhub", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setPlayers(data.players || []);
    setAllFeedback(data.feedback || []);
    setSelectedId((current: string) => current || data.players?.[0]?.id || "");
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => players.find((player) => player.id === selectedId) || null, [players, selectedId]);
  const selectedFeedback = useMemo(() => allFeedback.filter((item) => item.playerId === selectedId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [allFeedback, selectedId]);

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!selected || !note.trim()) return;
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/coachhub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "feedback", playerId: selected.id, needsWork: note.trim() }) });
    if (response.ok) {
      setNote("");
      setNotice("Improvement note saved");
      await load();
    } else {
      const data = await response.json().catch(() => null);
      setNotice(data?.error || "Could not save note");
    }
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div><Link href="/dashboard" className="text-sm font-bold text-blue-400 hover:text-blue-300">← CoachHub</Link><h1 className="mt-2 text-3xl font-black">Players</h1><p className="mt-1 text-slate-400">Select a player to open their bio and coaching notes.</p></div>
          <nav className="flex flex-wrap gap-1 text-sm font-bold"><Link href="/dashboard" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Home</Link><Link href="/matches" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Matches</Link><Link href="/communication" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Messages</Link></nav>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-4 py-3 text-xs font-black tracking-widest text-slate-500">SQUAD · {players.length}</div>
            <div className="divide-y divide-slate-800">{players.map((player) => <button key={player.id} onClick={() => { setSelectedId(player.id); setNotice(""); }} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selectedId === player.id ? "bg-blue-950/50" : "hover:bg-slate-800/60"}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 font-black text-slate-300">{initials(player)}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{player.firstName} {player.lastName}</span><span className="text-xs text-slate-500">{player.position}</span></span>{player.feedback[0]?.needsWork && <span className="h-2 w-2 rounded-full bg-amber-400" title="Has an improvement note" />}</button>)}</div>
          </section>

          {selected ? <section className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-blue-600 text-2xl font-black">{initials(selected)}</div><div className="min-w-0 flex-1"><div className="text-xs font-black tracking-widest text-blue-400">PLAYER BIO</div><h2 className="mt-1 text-3xl font-black">{selected.firstName} {selected.lastName}</h2><p className="mt-1 text-slate-400">{selected.position}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Parent / guardian</div><div className="mt-1 font-semibold">{selected.parentName || "Not added"}</div></div><div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact</div><div className="mt-1 truncate font-semibold">{selected.parentEmail || "Not added"}</div></div></div></div></div>
            </div>

            <form onSubmit={saveNote} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="text-xs font-black tracking-widest text-amber-400">COACHING NOTES</div><h3 className="mt-1 text-xl font-black">What does {selected.firstName} need to work on?</h3><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="e.g. Scan before receiving, open body shape and play the next pass quicker." className="mt-4 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none placeholder:text-slate-600 focus:border-blue-500" /><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-slate-500">Saved directly to {selected.firstName}'s profile.</span><button disabled={saving || !note.trim()} className="rounded-xl bg-blue-600 px-5 py-3 font-black hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save note"}</button></div>{notice && <div className="mt-3 text-sm font-bold text-emerald-400">{notice}</div>}</form>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="text-xs font-black tracking-widest text-slate-500">NOTE HISTORY</div>{selectedFeedback.length ? <div className="mt-4 divide-y divide-slate-800">{selectedFeedback.map((item) => <div key={item.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{item.coachName}</span><span>{formatDate(item.createdAt)}</span></div><p className="mt-2 leading-6 text-slate-200">{item.needsWork}</p></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No coaching notes yet.</p>}</div>
          </section> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-800 text-slate-500">No players found.</div>}
        </div>
      </div>
    </main>
  );
}
