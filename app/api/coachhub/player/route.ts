import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const statuses = ["AVAILABLE", "UNAVAILABLE"] as const;

export async function GET() {
  const user = await requireRole("PLAYER");
  if (!user || !user.teamId || !user.playerId) return NextResponse.json({ error: "Player access required" }, { status: 403 });

  const player = await prisma.player.findFirst({
    where: { id: user.playerId, teamId: user.teamId },
    include: {
      availability: { orderBy: { respondedAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!player) return NextResponse.json({ error: "Player profile not found" }, { status: 404 });

  const [team, events, messages] = await Promise.all([
    prisma.team.findUnique({ where: { id: user.teamId }, select: { id: true, name: true, ageGroup: true, club: true } }),
    prisma.event.findMany({
      where: { teamId: user.teamId },
      orderBy: { startsAt: "asc" },
      take: 20,
      include: {
        availability: { where: { playerId: player.id } },
        selections: { where: { playerId: player.id } },
        eventMessages: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
    prisma.message.findMany({ where: { teamId: user.teamId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return NextResponse.json({ team, player, events, messages, entitlements: { role: "PLAYER", canViewOtherPlayers: false, canManageSquads: false, canCreateEvents: false } });
}

export async function POST(request: Request) {
  const user = await requireRole("PLAYER");
  if (!user || !user.teamId || !user.playerId) return NextResponse.json({ error: "Player access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action !== "availability") return NextResponse.json({ error: "Players can only update availability" }, { status: 403 });

  const eventId = String(body.eventId || "");
  const status = body.status;
  if (!eventId || !statuses.includes(status)) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, teamId: user.teamId } });
  const player = await prisma.player.findFirst({ where: { id: user.playerId, teamId: user.teamId } });
  if (!event || !player) return NextResponse.json({ error: "Event or player not found" }, { status: 404 });

  return NextResponse.json(await prisma.availability.upsert({
    where: { eventId_playerId: { eventId, playerId: player.id } },
    update: { status, reason: null, respondedAt: new Date() },
    create: { eventId, playerId: player.id, status, respondedAt: new Date() },
  }));
}
