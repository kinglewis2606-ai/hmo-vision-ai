import Link from "next/link";

const roles = [
  { href: "/dashboard", title: "Coach Dashboard", text: "Run the team, events, squad and feedback." },
  { href: "/player", title: "Player View", text: "See your schedule, availability and development." },
  { href: "/parent", title: "Parent View", text: "Quickly tell the coach if your child is available." },
];

export default function Home() {
  return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto flex min-h-[90vh] max-w-4xl items-center justify-center"><div className="w-full text-center"><div className="mb-5 text-6xl">⚽</div><h1 className="text-5xl font-black">CoachHub</h1><p className="mt-4 text-xl text-slate-400">The simple way to run your football team.</p><p className="mt-2 text-slate-500">Availability · Communication · Feedback · Development</p><div className="mt-10 grid gap-4 text-left md:grid-cols-3">{roles.map((role) => <Link key={role.href} href={role.href} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500 hover:bg-slate-800"><h2 className="text-lg font-black">{role.title} →</h2><p className="mt-2 text-sm leading-6 text-slate-400">{role.text}</p></Link>)}</div></div></div></main>;
}
