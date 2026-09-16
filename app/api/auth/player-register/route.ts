import { NextResponse } from "next/server";
import { createUser, startSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = String(body?.code || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!code || !email || !password) return NextResponse.json({ error: "Invite code, email and password are required" }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { inviteCode: code }, include: { user: true } });
  if (!player) return NextResponse.json({ error: "This player invite is invalid or has expired" }, { status: 404 });
  if (player.user) return NextResponse.json({ error: "This player already has a login" }, { status: 409 });

  try {
    const user = await createUser({ email, password, role: "PLAYER", teamId: player.teamId, playerId: player.id });
    await prisma.player.update({ where: { id: player.id }, data: { inviteCode: null } });
    await startSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, teamId: user.teamId, playerId: user.playerId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create player account" }, { status: 400 });
  }
}
