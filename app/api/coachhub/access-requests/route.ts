import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCoachHubData } from "@/lib/coachhub";
import { getCurrentUser } from "@/lib/auth";

const statuses = ["PENDING", "APPROVED", "REJECTED", "REVOKED"] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "COACH" || !user.teamId) return NextResponse.json({ error: "Coach access required" }, { status: 403 });
  const requests = await prisma.parentAccessRequest.findMany({
    where: { teamId: user.teamId },
    orderBy: { createdAt: "desc" },
    include: { player: { select: { id: true, firstName: true, lastName: true, position: true } } },
  });
  const team = await prisma.team.findUnique({ where: { id: user.teamId }, select: { id: true, name: true } });
  return NextResponse.json({ team, requests });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const currentUser = await getCurrentUser();

  if (body?.action === "request") {
    if (!currentUser || currentUser.role !== "PARENT") return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    const team = await ensureCoachHubData();
    const parentName = String(body.parentName || "").trim();
    const parentEmail = currentUser.email;
    const childFirstName = String(body.childFirstName || "").trim();
    const childLastName = String(body.childLastName || "").trim();
    if (!parentName || !childFirstName || !childLastName) return NextResponse.json({ error: "Parent name and child's full name are required" }, { status: 400 });

    const child = await prisma.player.findFirst({ where: { teamId: team.id, firstName: childFirstName, lastName: childLastName } });
    if (!child) return NextResponse.json({ error: "We could not match that child to this team" }, { status: 404 });

    const existing = await prisma.parentAccessRequest.findFirst({ where: { teamId: team.id, playerId: child.id, userId: currentUser.id, status: "PENDING" } });
    if (existing) return NextResponse.json({ error: "A pending access request already exists" }, { status: 409 });

    const created = await prisma.parentAccessRequest.create({
      data: { teamId: team.id, playerId: child.id, userId: currentUser.id, parentName, parentEmail, status: "PENDING" },
      include: { player: { select: { firstName: true, lastName: true } } },
    });
    return NextResponse.json({ request: created, message: "Access request sent to the coach for approval" }, { status: 201 });
  }

  if (!currentUser || currentUser.role !== "COACH" || !currentUser.teamId) return NextResponse.json({ error: "Coach access required" }, { status: 403 });
  const id = String(body?.id || "");
  const status = body?.status;
  if (!id || !statuses.includes(status)) return NextResponse.json({ error: "Request id and valid status are required" }, { status: 400 });

  const existing = await prisma.parentAccessRequest.findFirst({ where: { id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Access request not found" }, { status: 404 });
  if (status === "APPROVED" && existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be approved" }, { status: 400 });
  if (status === "REJECTED" && existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be rejected" }, { status: 400 });

  const updated = await prisma.parentAccessRequest.update({
    where: { id },
    data: { status, reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null, reviewedAt: status === "PENDING" ? null : new Date() },
    include: { player: { select: { firstName: true, lastName: true } } },
  });
  if (status === "APPROVED" && existing.userId) {
    await prisma.user.update({ where: { id: existing.userId }, data: { teamId: currentUser.teamId, playerId: existing.playerId } });
  }
  if (status === "REVOKED" && existing.userId) {
    await prisma.user.update({ where: { id: existing.userId }, data: { teamId: null, playerId: null } });
  }
  return NextResponse.json(updated);
}
