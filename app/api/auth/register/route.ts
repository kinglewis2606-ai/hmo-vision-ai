import { NextResponse } from "next/server";
import { createUser, startSession } from "@/lib/auth";
import { ensureCoachHubData } from "@/lib/coachhub";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const role = body?.role === "COACH" ? "COACH" : body?.role === "PARENT" ? "PARENT" : null;
  if (!role || !email || !password) return NextResponse.json({ error: "Role, email and password are required" }, { status: 400 });

  try {
    if (role === "COACH") {
      const code = String(body?.coachCode || "");
      if (!process.env.COACHHUB_COACH_SIGNUP_CODE || code !== process.env.COACHHUB_COACH_SIGNUP_CODE) {
        return NextResponse.json({ error: "Coach registration requires the team setup code" }, { status: 403 });
      }
      const team = await ensureCoachHubData();
      const user = await createUser({ email, password, role, teamId: team.id });
      await startSession(user.id);
      return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, teamId: user.teamId, playerId: user.playerId } }, { status: 201 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    const user = await createUser({ email, password, role });
    await startSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, teamId: user.teamId, playerId: user.playerId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create account" }, { status: 400 });
  }
}
