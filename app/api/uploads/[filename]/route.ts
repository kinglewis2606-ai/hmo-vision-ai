import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();

    let mime = "image/jpeg";
    if (ext === ".png") mime = "image/png";
    if (ext === ".webp") mime = "image/webp";
    if (ext === ".pdf") mime = "application/pdf";

    const fileBuffer = fs.readFileSync(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
