import Link from "next/link";
import HomePolls from "./HomePolls";

const roles = [
  { href: "/dashboard", title: "Coach", text: "Run your team, publish polls, manage matches and messages." },
  { href: "/player", title: "Player", text: "See your polls, schedule and development." },
  { href: "/parent", title: "Parent", text: "Quickly tell the coach if your child is available." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-5xl py-8 sm:py-12">
        <header className="text-center">
          <div className="mb-5 text-6xl">⚽</div>
          <h1 className="text-5xl font-black">CoachHub</h1>
          <p className="mt-4 text-xl text-slate-400">The simple way to run your football team.</p>
          <p className="mt-2 text-slate-500">Availability · Matches · Messages · Players</p>
        </header>

        <HomePolls />

        <section className="mt-8 grid gap-4 text-left md:grid-cols-3">
          {roles.map((role) => (
            <Link key={role.href} href={role.href} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500 hover:bg-slate-800">
              <h2 className="text-lg font-black">{role.title} →</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{role.text}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
