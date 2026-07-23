import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();

    console.log("Filename received:", filename);

    const filePath = path.join(process.cwd(), "uploads", filename);

    console.log("Looking for:", filePath);
    console.log("Exists:", fs.existsSync(filePath));

    return NextResponse.json({
      success: true,
      filename,
      exists: fs.existsSync(filePath),
      filePath,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}