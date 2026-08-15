import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

// The analysis pipeline is image-based end-to-end. PDFs are deliberately
// rejected here rather than allowing raw PDF bytes to reach Sharp/Vision and
// later be mislabeled as image/jpeg. Raster floor plans are the authoritative
// source used by detection, AI annotation and the final aligned overlay.
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      return NextResponse.json(
        {
          success: false,
          error: "PDF floor plans are not supported yet. Please upload the floor plan as JPG, PNG or WebP so the original image can be preserved and aligned with the proposed HMO overlay.",
          supportedTypes: ["JPG", "PNG", "WebP"],
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type. Please upload a JPG, PNG or WebP floor plan.",
          supportedTypes: ["JPG", "PNG", "WebP"],
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "File exceeds 15MB limit." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const extension = path.extname(file.name) || ({
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
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
    return NextResponse.json({ success: false, error: error?.message || "Upload failed." }, { status: 500 });
  }
}
