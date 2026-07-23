import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import fs from "fs";
import path from "path";

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("No JSON found in AI response.");
  }

  return JSON.parse(text.substring(start, end + 1));
}

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
    const base64 = image.toString("base64");

    let parsedResult: any = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `
You are an experienced UK HMO consultant.

Analyse this UK residential floor plan.

Property Address:
${address || "Unknown"}

Property Type:
${propertyType || "Unknown"}

IMPORTANT:

- Only recommend HMOs with FOUR OR MORE bedrooms.
- Never invent rooms that do not reasonably fit.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside the JSON.

Return exactly this structure:

{
  "summary":{
    "bedrooms":0,
    "bathrooms":0,
    "kitchen":false,
    "livingRoom":false,
    "possibleHMOBedrooms":0,
    "confidence":""
  },
  "hmoScore":0,
  "verdict":"",
  "highestPossibleHMO":{
    "bedrooms":0,
    "score":0,
    "reason":""
  },
  "recommendedLayout":[],
  "conversionSteps":[],
  "recommendations":[],
  "compliance":[],
  "fireSafety":[],
  "planningRisk":"",
  "estimatedConversionCost":{
    "low":0,
    "high":0
  },
  "estimatedMonthlyRent":0,
  "estimatedAnnualRent":0,
  "estimatedYield":"",
  "estimatedROI":"",
  "investorSummary":""
}
`,
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

        const text =
          response.output_text ||
          JSON.stringify(response, null, 2);

        parsedResult = extractJson(text);

        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!parsedResult) {
      return NextResponse.json({
        success: false,
        error: lastError?.message || "AI failed to produce valid JSON.",
      });
    }

    return NextResponse.json({
      success: true,
      result: JSON.stringify(parsedResult),
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message || "Unexpected server error.",
    });
  }
}