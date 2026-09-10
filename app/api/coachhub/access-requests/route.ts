import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";

const statuses = ["PENDING", "APPROVED", "REJECTED", "REVOKED"] as const;

export async function GET() {
  const team = await ensureCoachHubData();
  const requests = await prisma.parentAccessRequest.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: "desc" },
    include: { player: { select: { id: true, firstName: true, lastName: true, position: true } } },
  });
  return NextResponse.json({ team: { id: team.id, name: team.name }, requests });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const team = await ensureCoachHubData();

  if (body?.action === "request") {
    const parentName = String(body.parentName || "").trim();
    const parentEmail = String(body.parentEmail || "").trim().toLowerCase();
    const childFirstName = String(body.childFirstName || "").trim();
    const childLastName = String(body.childLastName || "").trim();
    if (!parentName || !parentEmail || !childFirstName || !childLastName || !/^\S+@\S+\.\S+$/.test(parentEmail)) {
      return NextResponse.json({ error: "Parent name, valid email and child's full name are required" }, { status: 400 });
    }

    const child = await prisma.player.findFirst({
      where: { teamId: team.id, firstName: childFirstName, lastName: childLastName },
    });
    if (!child) return NextResponse.json({ error: "We could not match that child to this team" }, { status: 404 });

    const existing = await prisma.parentAccessRequest.findFirst({
      where: { teamId: team.id, playerId: child.id, parentEmail, status: "PENDING" },
    });
    if (existing) return NextResponse.json({ error: "A pending access request already exists" }, { status: 409 });

    const created = await prisma.parentAccessRequest.create({
      data: { teamId: team.id, playerId: child.id, parentName, parentEmail, status: "PENDING" },
      include: { player: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json({ request: created, message: "Access request sent to the coach for approval" }, { status: 201 });
  }

  const id = String(body?.id || "");
  const status = body?.status;
  if (!id || !statuses.includes(status)) return NextResponse.json({ error: "Request id and valid status are required" }, { status: 400 });

  const existing = await prisma.parentAccessRequest.findFirst({ where: { id, teamId: team.id } });
  if (!existing) return NextResponse.json({ error: "Access request not found" }, { status: 404 });
  if (status === "APPROVED" && existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be approved" }, { status: 400 });
  if (status === "REJECTED" && existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be rejected" }, { status: 400 });

  const updated = await prisma.parentAccessRequest.update({
    where: { id },
    data: {
      status,
      reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
      reviewedAt: status === "PENDING" ? null : new Date(),
    },
    include: { player: { select: { firstName: true, lastName: true } } },
  });
  return NextResponse.json(updated);
}
