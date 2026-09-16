import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireRole("COACH");
  if (!user?.teamId) return NextResponse.json({ error: "Coach access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const playerId = String(body?.playerId || "");
  if (!playerId) return NextResponse.json({ error: "Player is required" }, { status: 400 });
  const player = await prisma.player.findFirst({ where: { id: playerId, teamId: user.teamId }, include: { user: true } });
  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (player.user) return NextResponse.json({ error: "This player already has a login" }, { status: 409 });
  const inviteCode = randomBytes(18).toString("base64url");
  await prisma.player.update({ where: { id: player.id }, data: { inviteCode } });
  return NextResponse.json({ inviteCode, invitePath: `/player/register?code=${encodeURIComponent(inviteCode)}`, player: { id: player.id, firstName: player.firstName, lastName: player.lastName } });
}
