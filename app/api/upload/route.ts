import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { config } from "@/lib/config";

const ALLOWED_EXTENSIONS = new Set(config.upload.allowedExtensions);

/** Verify file magic bytes to guard against MIME spoofing */
function checkMagicBytes(buf: Buffer, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8;
  }
  if (ext === ".png") {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (ext === ".pdf") {
    return buf.toString("ascii", 0, 4) === "%PDF";
  }
  return false;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const originalName = file.name ?? "";

  if (!originalName || originalName.length > 200) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Path traversal guard
  if (originalName.includes("..") || originalName.includes("/") || originalName.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const ext = path.extname(originalName).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as Set<string>).has(ext)) {
    return NextResponse.json(
      { error: `File type not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (buffer.byteLength > config.upload.maxFileSizeBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${config.upload.maxFileSizeBytes / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  if (!checkMagicBytes(buffer, originalName)) {
    return NextResponse.json(
      { error: "File content does not match declared extension" },
      { status: 400 }
    );
  }

  const uploadDir = path.join(process.cwd(), config.upload.dir);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${uuid()}-${safeBase}`;
  const filePath = path.join(uploadDir, filename);

  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({
    success: true,
    filename,
  });
}
