import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function MatchesLayout({ children }: { children: React.ReactNode }) { const user = await getCurrentUser(); if (!user) redirect("/login?next=/matches"); if (user.role !== "COACH") redirect(user.role === "PLAYER" ? "/player" : "/parent"); return children; }
