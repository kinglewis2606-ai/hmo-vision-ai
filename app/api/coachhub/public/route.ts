import { NextResponse } from "next/server";
import { ensureCoachHubData } from "@/lib/coachhub";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const team = await ensureCoachHubData();
  const events = await prisma.event.findMany({
    where: { teamId: team.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 10,
    include: { availability: { select: { status: true } } },
  });
  return NextResponse.json({ team: { id: team.id, name: team.name, ageGroup: team.ageGroup, club: team.club }, events: events.map((event) => ({ id: event.id, type: event.type, title: event.title, opponent: event.opponent, startsAt: event.startsAt, endsAt: event.endsAt, venue: event.venue, arrivalTime: event.arrivalTime, instructions: event.instructions, counts: { available: event.availability.filter((a) => a.status === "AVAILABLE").length, unavailable: event.availability.filter((a) => a.status === "UNAVAILABLE").length, pending: event.availability.filter((a) => a.status === "PENDING").length } })) });
}
