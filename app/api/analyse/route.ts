import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();

    const filePath = path.join(process.cwd(), "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: "Uploaded floor plan not found.",
      });
    }

    const image = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    let mime = "image/jpeg";

    if (ext === ".png") mime = "image/png";
    if (ext === ".webp") mime = "image/webp";

    const base64 = image.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are an experienced UK HMO consultant, architect and property investor.

Analyse this floor plan.

Property Address:
${address || "Unknown"}

Property Type:
${propertyType || "Unknown"}

IMPORTANT

Only recommend HMOs with FOUR OR MORE BEDROOMS.

If the property cannot realistically become a legal 4-bedroom HMO, clearly explain why.

Return ONLY valid JSON in exactly this format:

{
  "summary": {
    "bedrooms": 0,
    "bathrooms": 0,
    "kitchen": false,
    "livingRoom": false,
    "possibleHMOBedrooms": 0,
    "confidence": ""
  },
  "hmoScore": 0,
  "verdict": "",
  "highestPossibleHMO": {
    "bedrooms": 0,
    "score": 0,
    "reason": ""
  },
  "recommendedLayout": [],
  "conversionSteps": [],
  "recommendations": [],
  "compliance": [],
  "fireSafety": [],
  "planningRisk": "",
  "estimatedConversionCost": {
    "low": 0,
    "high": 0
  },
  "estimatedMonthlyRent": 0,
  "estimatedAnnualRent": 0,
  "estimatedYield": "",
  "estimatedROI": "",
  "investorSummary": ""
}
`,
            },
            {
              type: "input_image",
              image_url: `data:${mime};base64,${base64}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    const text = response.output_text ?? "";

    const cleaned = text
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error("AI returned invalid JSON:");
      console.error(cleaned);

      return NextResponse.json({
        success: false,
        error: "OpenAI returned invalid JSON.",
      });
    }

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message || "Analysis failed.",
    });
  }
}