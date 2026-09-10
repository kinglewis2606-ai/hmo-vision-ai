import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";

const statuses = ["AVAILABLE", "UNAVAILABLE", "MAYBE"] as const;

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

  if (body.action === "event") {
    const type = body.type === "MATCH" ? "MATCH" : body.type === "TRAINING" ? "TRAINING" : null;
    const title = String(body.title || "").trim();
    const venue = String(body.venue || "").trim();
    const startsAt = new Date(String(body.startsAt || ""));
    if (!type || !title || !venue || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "Type, title, venue and a valid start time are required" }, { status: 400 });
    }
    const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
    const arrivalTime = body.arrivalTime ? new Date(String(body.arrivalTime)) : null;
    if ((endsAt && Number.isNaN(endsAt.getTime())) || (arrivalTime && Number.isNaN(arrivalTime.getTime()))) {
      return NextResponse.json({ error: "Invalid event time" }, { status: 400 });
    }
    if (endsAt && endsAt <= startsAt) return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
    if (arrivalTime && arrivalTime > startsAt) return NextResponse.json({ error: "Player arrival must be at or before the start time" }, { status: 400 });
    const event = await prisma.event.create({
      data: {
        teamId: team.id,
        type,
        title,
        opponent: type === "MATCH" ? String(body.opponent || "").trim() || null : null,
        startsAt,
        endsAt,
        venue,
        arrivalTime,
      },
    });
    await prisma.availability.createMany({ data: team.players.map((player) => ({ eventId: event.id, playerId: player.id, status: "PENDING" })) });
    return NextResponse.json(event, { status: 201 });
  }

  if (body.action === "availability") {
    const { eventId, playerId, status, reason } = body;
    if (!eventId || !playerId || !statuses.includes(status)) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
    const event = await prisma.event.findFirst({ where: { id: eventId, teamId: team.id } });
    const player = await prisma.player.findFirst({ where: { id: playerId, teamId: team.id } });
    if (!event || !player) return NextResponse.json({ error: "Event or player not found" }, { status: 404 });
    const result = await prisma.availability.upsert({ where: { eventId_playerId: { eventId, playerId } }, update: { status, reason: reason || null, respondedAt: new Date() }, create: { eventId, playerId, status, reason: reason || null, respondedAt: new Date() } });
    return NextResponse.json(result);
  }

  if (body.action === "message") {
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    return NextResponse.json(await prisma.message.create({ data: { teamId: team.id, sender: "Coach", body: message } }));
  }

  if (body.action === "feedback") {
    const { playerId, eventId, wentWell, needsWork, focusNext, passing, firstTouch, positioning, confidence } = body;
    const player = await prisma.player.findFirst({ where: { id: String(playerId || ""), teamId: team.id } });
    if (!player || (!wentWell && !needsWork && !focusNext)) return NextResponse.json({ error: "Player and feedback are required" }, { status: 400 });
    return NextResponse.json(await prisma.feedback.create({ data: { playerId: player.id, eventId: eventId || null, coachName: "Coach", wentWell, needsWork, focusNext, passing, firstTouch, positioning, confidence } }));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
