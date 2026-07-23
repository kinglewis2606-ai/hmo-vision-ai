import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();

    const filePath = path.join(process.cwd(), "uploads", filename);

    console.log("Filename received:", filename);
    console.log("Looking for:", filePath);
    console.log("Exists:", fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: "Uploaded file not found",
      });
    }

    const image = fs.readFileSync(filePath);
    const base64 = image.toString("base64");

    console.log("Calling OpenAI...");

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyse this floor plan and return ONLY valid JSON with this exact structure:

{
  "summary": {
    "bedrooms": 0,
    "bathrooms": 0,
    "kitchen": false,
    "livingRoom": false,
    "possibleHMOBedrooms": 0,
    "confidence": "High"
  },
  "hmoScore": 0,
  "verdict": "",
  "recommendations": [],
  "compliance": [],
  "estimatedConversionCost": {
    "low": 0,
    "high": 0
  },
  "estimatedMonthlyRent": 0
}`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    console.log("OpenAI finished");

    const result =
      response.output_text ||
      JSON.stringify(response, null, 2);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message || "Unknown error",
    });
  }
}