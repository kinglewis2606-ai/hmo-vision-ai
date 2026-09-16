import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

async function getApprovedChild(userId: string) {
  return prisma.parentAccessRequest.findFirst({ where: { userId, status: "APPROVED" }, orderBy: { reviewedAt: "desc" }, include: { player: true, team: true } });
}

export async function GET() {
  const user = await requireRole("PARENT");
  if (!user) return NextResponse.json({ error: "Parent access required" }, { status: 403 });
  const access = await getApprovedChild(user.id);
  if (!access) return NextResponse.json({ error: "Parent access is awaiting coach approval" }, { status: 403 });
  const child = await prisma.player.findFirst({ where: { id: access.playerId, teamId: access.teamId }, include: { feedback: { orderBy: { createdAt: "desc" }, take: 10 }, availability: { orderBy: { respondedAt: "desc" } } } });
  if (!child) return NextResponse.json({ error: "Child profile not found" }, { status: 404 });
  const [events, messages] = await Promise.all([
    prisma.event.findMany({ where: { teamId: access.teamId }, orderBy: { startsAt: "asc" }, take: 20, include: { availability: { where: { playerId: child.id } }, selections: { where: { playerId: child.id } }, eventMessages: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.message.findMany({ where: { teamId: access.teamId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ team: { id: access.team.id, name: access.team.name, ageGroup: access.team.ageGroup, club: access.team.club }, child, events, messages, entitlements: { role: "PARENT", canViewTeamMessages: true, canViewOwnChildProfile: true, canViewOtherPlayers: false, canViewCoachDashboard: false, canManageSquads: false, canCreateEvents: false, canWriteCoachingNotes: false } });
}

export async function POST(request: Request) {
  const user = await requireRole("PARENT");
  if (!user) return NextResponse.json({ error: "Parent access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action !== "availability") return NextResponse.json({ error: "Parents can only update availability" }, { status: 403 });
  const access = await getApprovedChild(user.id);
  if (!access) return NextResponse.json({ error: "Parent access is awaiting coach approval" }, { status: 403 });
  const eventId = String(body.eventId || ""); const status = body.status;
  if (!eventId || !["AVAILABLE", "UNAVAILABLE"].includes(status)) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, teamId: access.teamId } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json(await prisma.availability.upsert({ where: { eventId_playerId: { eventId, playerId: access.playerId } }, update: { status, reason: body.reason ? String(body.reason).trim() : null, respondedAt: new Date() }, create: { eventId, playerId: access.playerId, status, reason: body.reason ? String(body.reason).trim() : null, respondedAt: new Date() } }));
}
