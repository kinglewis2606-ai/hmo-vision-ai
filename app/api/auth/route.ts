import { NextResponse } from "next/server";
import { authenticate, endSession, startSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "login");

  if (action === "logout") {
    await endSession();
    return NextResponse.json({ ok: true });
  }

  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  const user = await authenticate(email, password);
  if (!user) return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });

  await startSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, teamId: user.teamId, playerId: user.playerId } });
}
