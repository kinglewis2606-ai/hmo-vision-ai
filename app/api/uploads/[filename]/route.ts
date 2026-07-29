import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    const filePath = path.join(
      process.cwd(),
      "public",
      "uploads",
      filename
    );

    const file = await fs.readFile(filePath);

    const ext = path.extname(filename).toLowerCase();

    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

    return new Response(file, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
