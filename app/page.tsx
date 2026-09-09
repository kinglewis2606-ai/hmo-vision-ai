"use client";

import { useMemo, useState } from "react";

type Availability = "available" | "maybe" | "unavailable" | "pending";

type Player = {
  id: number;
  name: string;
  position: string;
  availability: Availability;
  attendance: number;
  focus: string;
};

const initialPlayers: Player[] = [
  { id: 1, name: "Jack Thompson", position: "GK", availability: "available", attendance: 96, focus: "Distribution" },
  { id: 2, name: "Noah Williams", position: "DEF", availability: "available", attendance: 91, focus: "Defensive positioning" },
  { id: 3, name: "Oliver Smith", position: "MID", availability: "pending", attendance: 88, focus: "Scanning" },
  { id: 4, name: "Harry Brown", position: "MID", availability: "available", attendance: 94, focus: "First touch" },
  { id: 5, name: "Charlie Jones", position: "FWD", availability: "maybe", attendance: 82, focus: "Finishing" },
  { id: 6, name: "Leo Davies", position: "DEF", availability: "unavailable", attendance: 79, focus: "1v1 defending" },
  { id: 7, name: "Archie Wilson", position: "FWD", availability: "available", attendance: 97, focus: "Movement" },
  { id: 8, name: "Alfie Taylor", position: "MID", availability: "available", attendance: 90, focus: "Passing tempo" },
];

const navItems = ["Dashboard", "Calendar", "Squad", "Messages", "Development"];

function AvailabilityBadge({ status }: { status: Availability }) {
  const config = {
    available: ["Available", "bg-emerald-100 text-emerald-700"],
    maybe: ["Maybe", "bg-amber-100 text-amber-700"],
    unavailable: ["Unavailable", "bg-rose-100 text-rose-700"],
    pending: ["Awaiting", "bg-slate-100 text-slate-600"],
  }[status];

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config[1]}`}>{config[0]}</span>;
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [players, setPlayers] = useState(initialPlayers);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");

  const counts = useMemo(() => ({
    available: players.filter((p) => p.availability === "available").length,
    maybe: players.filter((p) => p.availability === "maybe").length,
    unavailable: players.filter((p) => p.availability === "unavailable").length,
    pending: players.filter((p) => p.availability === "pending").length,
  }), [players]);

  function updateAvailability(id: number, availability: Availability) {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, availability } : player));
    setToast("Availability updated");
    window.setTimeout(() => setToast(""), 1800);
  }

  function sendMessage() {
    if (!message.trim()) return;
    setMessage("");
    setToast("Message sent to the squad");
    window.setTimeout(() => setToast(""), 1800);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col bg-[#071525] px-5 py-6 text-white lg:flex">
          <div className="mb-9 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl">⚽</div>
            <div>
              <div className="font-bold tracking-tight">CoachHub</div>
              <div className="text-xs text-slate-400">Grassroots football</div>
            </div>
          </div>

          <div className="mb-3 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">Team management</div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button key={item} onClick={() => setActiveNav(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${activeNav === item ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                <span>{({ Dashboard: "▦", Calendar: "◷", Squad: "♙", Messages: "✉", Development: "↗" } as Record<string, string>)[item]}</span>
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-slate-400">CURRENT TEAM</div>
            <div className="mt-2 font-bold">Falcons U10</div>
            <div className="mt-1 text-xs text-slate-400">2026 / 27 season</div>
            <button className="mt-4 w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">Team settings</button>
          </div>
        </aside>

        <section className="flex-1 overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-8">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 lg:hidden">CoachHub</div>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">{activeNav}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 sm:block">Invite player</button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">LW</div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
            <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
              <div className="rounded-3xl bg-gradient-to-br from-[#0b2340] to-[#0d4ea6] p-6 text-white shadow-sm md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-blue-200">Saturday • 12 September</p>
                    <h2 className="mt-2 text-2xl font-bold md:text-3xl">Falcons U10 vs Reading City</h2>
                    <p className="mt-2 text-sm text-blue-100">Kick-off 10:30 • Arrive 10:00 • Home</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">MATCH</span>
                </div>
                <div className="mt-7 grid grid-cols-4 gap-2 rounded-2xl bg-black/10 p-3 text-center">
                  <div><div className="text-2xl font-bold">{counts.available}</div><div className="text-[11px] text-blue-100">Available</div></div>
                  <div><div className="text-2xl font-bold">{counts.maybe}</div><div className="text-[11px] text-blue-100">Maybe</div></div>
                  <div><div className="text-2xl font-bold">{counts.unavailable}</div><div className="text-[11px] text-blue-100">Unavailable</div></div>
                  <div><div className="text-2xl font-bold">{counts.pending}</div><div className="text-[11px] text-blue-100">Awaiting</div></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={() => setActiveNav("Calendar")} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Manage match</button>
                  <button onClick={() => setFeedbackOpen(true)} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15">Add feedback</button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="font-bold">Next training</h3><span className="text-xs font-semibold text-slate-400">FRI 18:00</span></div>
                <p className="mt-2 text-sm text-slate-500">Caversham Rec • Pitch 2</p>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <div><div className="text-2xl font-bold">14 / 16</div><div className="text-xs text-slate-500">confirmed attendance</div></div>
                  <button onClick={() => setActiveNav("Calendar")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">View</button>
                </div>
                <div className="mt-4 flex -space-x-2">
                  {players.slice(0, 7).map((player) => <div key={player.id} title={player.name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[10px] font-bold text-blue-700">{player.name.split(" ").map((n) => n[0]).join("")}</div>)}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-500">+7</div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Squad</div><div className="mt-2 text-3xl font-bold">16</div><div className="mt-1 text-sm text-slate-500">players registered</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Attendance</div><div className="mt-2 text-3xl font-bold">91%</div><div className="mt-1 text-sm text-emerald-600">+4% this month</div></div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5"><div className="text-xs font-bold uppercase tracking-wider text-rose-500">Needs attention</div><div className="mt-2 text-3xl font-bold text-rose-700">{counts.pending + 2}</div><div className="mt-1 text-sm text-rose-600">items to review</div></div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="font-bold">Match availability</h3><p className="mt-1 text-sm text-slate-500">Saturday's squad response</p></div><button onClick={() => setActiveNav("Squad")} className="text-sm font-bold text-blue-600">View squad →</button></div>
                <div className="divide-y divide-slate-100">
                  {players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 px-6 py-4">
                      <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{player.name.split(" ").map((n) => n[0]).join("")}</div><div className="min-w-0"><div className="truncate text-sm font-semibold">{player.name}</div><div className="text-xs text-slate-400">{player.position} • {player.attendance}% attendance</div></div></div>
                      <div className="flex shrink-0 items-center gap-2"><AvailabilityBadge status={player.availability} /><select aria-label={`Availability for ${player.name}`} value={player.availability} onChange={(e) => updateAvailability(player.id, e.target.value as Availability)} className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs sm:block"><option value="available">Available</option><option value="maybe">Maybe</option><option value="unavailable">Unavailable</option><option value="pending">Awaiting</option></select></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold">Things to work on</h3><p className="mt-1 text-sm text-slate-500">Development priorities</p></div><button onClick={() => setFeedbackOpen(true)} className="text-sm font-bold text-blue-600">Add →</button></div><div className="mt-5 space-y-3"><div className="rounded-2xl bg-amber-50 p-4"><div className="text-sm font-bold text-amber-900">Defensive positioning</div><div className="mt-1 text-xs text-amber-700">4 players • Next training</div></div><div className="rounded-2xl bg-blue-50 p-4"><div className="text-sm font-bold text-blue-900">First touch under pressure</div><div className="mt-1 text-xs text-blue-700">3 players • Session focus</div></div><div className="rounded-2xl bg-emerald-50 p-4"><div className="text-sm font-bold text-emerald-900">Communication</div><div className="mt-1 text-xs text-emerald-700">Team goal • This month</div></div></div></div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-bold">Message the squad</h3><p className="mt-1 text-sm text-slate-500">Send a quick team update.</p><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Please remember boots and water..." className="mt-4 h-24 w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button onClick={sendMessage} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Send to squad</button></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {feedbackOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 md:items-center"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Session feedback</h2><p className="mt-1 text-sm text-slate-500">Capture what went well and what needs work.</p></div><button onClick={() => setFeedbackOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm">✕</button></div><div className="mt-5 space-y-4"><label className="block"><span className="text-sm font-semibold">What went well?</span><textarea className="mt-2 h-20 w-full rounded-2xl border border-slate-200 p-3 text-sm" placeholder="Great movement, attitude, passing..." /></label><label className="block"><span className="text-sm font-semibold">What needs work?</span><textarea className="mt-2 h-20 w-full rounded-2xl border border-slate-200 p-3 text-sm" placeholder="Defending, first touch, communication..." /></label><label className="block"><span className="text-sm font-semibold">Next session focus</span><input className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-sm" placeholder="e.g. First touch under pressure" /></label></div><button onClick={() => { setFeedbackOpen(false); setToast("Feedback saved"); window.setTimeout(() => setToast(""), 1800); }} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700">Save feedback</button></div></div>}
      {toast && <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>}
    </main>
  );
}
