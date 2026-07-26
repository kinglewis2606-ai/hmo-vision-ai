import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          success: false,
          error: "No file uploaded.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "File exceeds 15MB limit.",
        },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const extension =
      path.extname(file.name) ||
      ({
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "application/pdf": ".pdf",
      }[file.type] ?? "");

    const filename = crypto.randomUUID() + extension.toLowerCase();

    const filepath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());

    fs.writeFileSync(filepath, buffer);

    return NextResponse.json({
      success: true,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (error: any) {
    console.error("UPLOAD ERROR");
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Upload failed.",
      },
      { status: 500 }
    );
  }
}
