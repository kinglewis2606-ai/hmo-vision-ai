import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";
import { getCurrentUser } from "@/lib/auth";

const statuses = ["AVAILABLE", "UNAVAILABLE"] as const;
const squadRoles = ["STARTING", "SUBSTITUTE", "NOT_SELECTED"] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "COACH" || !user.teamId) return NextResponse.json({ error: "Coach access required" }, { status: 403 });
  const team = await prisma.team.findUnique({ where: { id: user.teamId }, include: { players: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const [events, players, feedback, messages] = await Promise.all([
    prisma.event.findMany({ where: { teamId: team.id }, orderBy: { startsAt: "asc" }, include: { availability: true, selections: { include: { player: true }, orderBy: { createdAt: "asc" } }, eventMessages: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.player.findMany({ where: { teamId: team.id }, orderBy: { lastName: "asc" }, include: { feedback: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.feedback.findMany({ where: { player: { teamId: team.id } }, orderBy: { createdAt: "desc" }, take: 10, include: { player: true } }),
    prisma.message.findMany({ where: { teamId: team.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ team, events, players, feedback, messages });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Action is required" }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  if (body.action === "availability") {
    if (user.role !== "COACH" && user.role !== "PLAYER") return NextResponse.json({ error: "Coach or player access required" }, { status: 403 });
    if (!user.teamId) return NextResponse.json({ error: "Team access required" }, { status: 403 });
    const eventId = String(body.eventId || "");
    const playerId = String(body.playerId || "");
    const status = body.status;
    if (!eventId || !playerId || !statuses.includes(status)) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
    if (user.role === "PLAYER" && user.playerId !== playerId) return NextResponse.json({ error: "You can only answer your own poll" }, { status: 403 });
    const event = await prisma.event.findFirst({ where: { id: eventId, teamId: user.teamId } });
    const player = await prisma.player.findFirst({ where: { id: playerId, teamId: user.teamId } });
    if (!event || !player) return NextResponse.json({ error: "Event or player not found" }, { status: 404 });
    return NextResponse.json(await prisma.availability.upsert({ where: { eventId_playerId: { eventId, playerId } }, update: { status, reason: null, respondedAt: new Date() }, create: { eventId, playerId, status, respondedAt: new Date() } }));
  }

  if (user.role !== "COACH" || !user.teamId) return NextResponse.json({ error: "Coach access required" }, { status: 403 });
  const team = await ensureCoachHubData();
  if (user.teamId !== team.id) return NextResponse.json({ error: "You do not belong to this team" }, { status: 403 });

  if (body.action === "event") {
    const type = body.type === "MATCH" ? "MATCH" : body.type === "TRAINING" ? "TRAINING" : null;
    const title = String(body.title || "").trim();
    const venue = String(body.venue || "").trim();
    const instructions = String(body.instructions || "").trim() || null;
    const startsAt = new Date(String(body.startsAt || ""));
    if (!type || !title || !venue || Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Type, title, venue and a valid start time are required" }, { status: 400 });
    const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
    const arrivalTime = body.arrivalTime ? new Date(String(body.arrivalTime)) : null;
    if ((endsAt && Number.isNaN(endsAt.getTime())) || (arrivalTime && Number.isNaN(arrivalTime.getTime()))) return NextResponse.json({ error: "Invalid event time" }, { status: 400 });
    if (endsAt && endsAt <= startsAt) return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
    if (arrivalTime && arrivalTime > startsAt) return NextResponse.json({ error: "Player arrival must be at or before the start time" }, { status: 400 });
    const event = await prisma.event.create({ data: { teamId: team.id, type, title, opponent: type === "MATCH" ? String(body.opponent || "").trim() || null : null, startsAt, endsAt, venue, arrivalTime, instructions } });
    await prisma.availability.createMany({ data: team.players.map((player) => ({ eventId: event.id, playerId: player.id, status: "PENDING" })) });
    return NextResponse.json(event, { status: 201 });
  }

  if (body.action === "message") {
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    const eventId = body.eventId ? String(body.eventId) : null;
    if (eventId && !(await prisma.event.findFirst({ where: { id: eventId, teamId: team.id } }))) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (eventId) return NextResponse.json(await prisma.eventMessage.create({ data: { eventId, sender: user.email, body: message } }));
    return NextResponse.json(await prisma.message.create({ data: { teamId: team.id, sender: user.email, body: message } }));
  }

  if (body.action === "squad") {
    const eventId = String(body.eventId || "");
    const playerId = String(body.playerId || "");
    const role = body.role;
    const position = body.position ? String(body.position).trim() : null;
    const isCaptain = Boolean(body.isCaptain);
    if (!eventId || !playerId || !squadRoles.includes(role)) return NextResponse.json({ error: "Invalid squad selection" }, { status: 400 });
    const event = await prisma.event.findFirst({ where: { id: eventId, teamId: team.id } });
    const player = await prisma.player.findFirst({ where: { id: playerId, teamId: team.id } });
    if (!event || !player || event.type !== "MATCH") return NextResponse.json({ error: "Match or player not found" }, { status: 404 });
    if (isCaptain && role !== "STARTING") return NextResponse.json({ error: "Only a starting player can be captain" }, { status: 400 });
    const selection = await prisma.$transaction(async (tx) => {
      if (isCaptain) await tx.matchSelection.updateMany({ where: { eventId, isCaptain: true }, data: { isCaptain: false } });
      return tx.matchSelection.upsert({ where: { eventId_playerId: { eventId, playerId } }, update: { role, position, isCaptain }, create: { eventId, playerId, role, position, isCaptain } });
    });
    return NextResponse.json(selection);
  }

  if (body.action === "match") {
    const eventId = String(body.eventId || "");
    const event = await prisma.event.findFirst({ where: { id: eventId, teamId: team.id, type: "MATCH" } });
    if (!event) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    const scoreFor = body.scoreFor === "" || body.scoreFor == null ? null : Number(body.scoreFor);
    const scoreAgainst = body.scoreAgainst === "" || body.scoreAgainst == null ? null : Number(body.scoreAgainst);
    if ((scoreFor !== null && (!Number.isInteger(scoreFor) || scoreFor < 0)) || (scoreAgainst !== null && (!Number.isInteger(scoreAgainst) || scoreAgainst < 0))) return NextResponse.json({ error: "Scores must be whole numbers 0 or higher" }, { status: 400 });
    return NextResponse.json(await prisma.event.update({ where: { id: eventId }, data: { matchFormation: body.formation ? String(body.formation).trim() : null, matchKit: body.kit ? String(body.kit).trim() : null, matchResult: body.result ? String(body.result).trim() : null, matchScoreFor: scoreFor, matchScoreAgainst: scoreAgainst, matchNotes: body.notes ? String(body.notes).trim() : null } }));
  }

  if (body.action === "feedback") {
    const playerId = String(body.playerId || "");
    const eventId = body.eventId ? String(body.eventId) : null;
    const player = await prisma.player.findFirst({ where: { id: playerId, teamId: team.id } });
    const linkedEvent = eventId ? await prisma.event.findFirst({ where: { id: eventId, teamId: team.id } }) : null;
    if (!player || (eventId && !linkedEvent) || (!body.wentWell && !body.needsWork && !body.focusNext)) return NextResponse.json({ error: "Player, valid event and feedback are required" }, { status: 400 });
    return NextResponse.json(await prisma.feedback.create({ data: { playerId: player.id, eventId: linkedEvent?.id || null, coachName: user.email, wentWell: body.wentWell, needsWork: body.needsWork, focusNext: body.focusNext, passing: body.passing, firstTouch: body.firstTouch, positioning: body.positioning, confidence: body.confidence } }));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
