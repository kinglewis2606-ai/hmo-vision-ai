import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function PlayersLayout({ children }: { children: React.ReactNode }) { const user = await getCurrentUser(); if (!user) redirect("/login?next=/players"); if (user.role !== "COACH") redirect(user.role === "PLAYER" ? "/player" : "/parent"); return children; }
