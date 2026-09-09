import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";

export async function GET() {
  const team = await ensureCoachHubData();
  const [events, players, feedback, messages] = await Promise.all([
    prisma.event.findMany({ where: { teamId: team.id }, orderBy: { startsAt: "asc" }, include: { availability: true } }),
    prisma.player.findMany({ where: { teamId: team.id }, orderBy: { lastName: "asc" }, include: { feedback: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.feedback.findMany({ where: { player: { teamId: team.id } }, orderBy: { createdAt: "desc" }, take: 10, include: { player: true } }),
    prisma.message.findMany({ where: { teamId: team.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return NextResponse.json({ team, events, players, feedback, messages });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Action is required" }, { status: 400 });
  const team = await ensureCoachHubData();

  if (body.action === "availability") {
    const { eventId, playerId, status, reason } = body;
    if (!eventId || !playerId || !["AVAILABLE", "UNAVAILABLE", "MAYBE"].includes(status)) {
      return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
    }
    const result = await prisma.availability.upsert({
      where: { eventId_playerId: { eventId, playerId } },
      update: { status, reason: reason || null, respondedAt: new Date() },
      create: { eventId, playerId, status, reason: reason || null, respondedAt: new Date() },
    });
    return NextResponse.json(result);
  }

  if (body.action === "message") {
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    const result = await prisma.message.create({ data: { teamId: team.id, sender: "Coach", body: message } });
    return NextResponse.json(result);
  }

  if (body.action === "feedback") {
    const { playerId, eventId, wentWell, needsWork, focusNext, passing, firstTouch, positioning, confidence } = body;
    if (!playerId || (!wentWell && !needsWork && !focusNext)) return NextResponse.json({ error: "Player and feedback are required" }, { status: 400 });
    const result = await prisma.feedback.create({ data: { playerId, eventId: eventId || null, coachName: "Coach", wentWell, needsWork, focusNext, passing, firstTouch, positioning, confidence } });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
