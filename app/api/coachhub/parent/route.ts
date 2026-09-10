import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";

/**
 * Parent-facing CoachHub data boundary.
 *
 * This endpoint deliberately never returns the squad list, squad availability,
 * other players' selections, or other players' feedback. The eventual auth
 * session will bind `childId` to the authenticated parent; until then the
 * seeded parent experience is bound to the first seeded player.
 */
export async function GET() {
  const team = await ensureCoachHubData();
  const child = await prisma.player.findFirst({
    where: { teamId: team.id },
    orderBy: { lastName: "asc" },
    include: {
      feedback: { orderBy: { createdAt: "desc" }, take: 10 },
      availability: { orderBy: { respondedAt: "desc" } },
    },
  });

  if (!child) return NextResponse.json({ error: "Child profile not found" }, { status: 404 });

  const events = await prisma.event.findMany({
    where: { teamId: team.id },
    orderBy: { startsAt: "asc" },
    take: 20,
    include: {
      availability: { where: { playerId: child.id } },
      selections: { where: { playerId: child.id } },
      eventMessages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  const messages = await prisma.message.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    team: { id: team.id, name: team.name, ageGroup: team.ageGroup, club: team.club },
    child,
    events,
    messages,
    entitlements: {
      role: "PARENT",
      canViewTeamMessages: true,
      canViewOwnChildProfile: true,
      canViewOtherPlayers: false,
      canViewCoachDashboard: false,
      canManageSquads: false,
      canCreateEvents: false,
      canWriteCoachingNotes: false,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body?.action !== "availability") return NextResponse.json({ error: "Parents can only update availability" }, { status: 403 });

  const team = await ensureCoachHubData();
  const child = await prisma.player.findFirst({ where: { teamId: team.id }, orderBy: { lastName: "asc" } });
  const eventId = String(body.eventId || "");
  const status = body.status;
  if (!child || !eventId || !["AVAILABLE", "UNAVAILABLE"].includes(status)) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });

  const event = await prisma.event.findFirst({ where: { id: eventId, teamId: team.id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json(await prisma.availability.upsert({
    where: { eventId_playerId: { eventId, playerId: child.id } },
    update: { status, reason: body.reason ? String(body.reason).trim() : null, respondedAt: new Date() },
    create: { eventId, playerId: child.id, status, reason: body.reason ? String(body.reason).trim() : null, respondedAt: new Date() },
  }));
}
