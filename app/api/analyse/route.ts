import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();

    const filePath = path.join(process.cwd(), "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: "Uploaded file not found",
      });
    }

    const image = fs.readFileSync(filePath);
    const base64 = image.toString("base64");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Analyse this floor plan.

Return ONLY valid JSON in exactly this format:

{
  "summary": {
    "bedrooms": 0,
    "bathrooms": 0,
    "kitchen": false,
    "livingRoom": false,
    "stairs": false,
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
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: JSON.stringify(data),
      });
    }

    const text =
      data.output?.[0]?.content?.find(
        (c: any) => c.type === "output_text"
      )?.text;

    if (!text) {
      return NextResponse.json({
        success: false,
        error: "OpenAI returned no text.",
      });
    }

    return NextResponse.json({
      success: true,
      result: text,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message || "Unknown error",
    });
  }
}