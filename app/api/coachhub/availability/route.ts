import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const eventId = String(body?.eventId || "");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { team: true } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const responses = await prisma.availability.findMany({ where: { eventId }, include: { player: true } });
  const counts = {
    available: responses.filter((r) => r.status === "AVAILABLE").length,
    unavailable: responses.filter((r) => r.status === "UNAVAILABLE").length,
    maybe: responses.filter((r) => r.status === "MAYBE").length,
    pending: responses.filter((r) => r.status === "PENDING").length,
  };
  return NextResponse.json({ event, responses, counts });
}
