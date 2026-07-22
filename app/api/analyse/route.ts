import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();

    const filePath = path.join(process.cwd(), "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: "Uploaded file not found"
      });
    }

    const image = fs.readFileSync(filePath);
    const base64 = image.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Analyse this floor plan and return ONLY JSON in this format:

{
  "bedrooms":0,
  "bathrooms":0,
  "kitchen":false,
  "livingRoom":false,
  "stairs":false,
  "possibleHMOBedrooms":0,
  "confidence":"High"
}`
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${base64}`
          }
        ]
      }]
    });

    return NextResponse.json({
      success: true,
      result: response.output_text
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    });
  }
}
npm run build
