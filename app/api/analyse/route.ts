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
    const base64 = image.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are HMO Vision AI.

You are an experienced UK HMO consultant, architect, planning specialist and professional property investor.

Your job is NOT simply to describe the floor plan.

Your job is to determine the MAXIMUM REALISTIC HMO this property could become.

Always think like an experienced HMO developer looking to maximise the property's value.

Property Address:
${address || "Unknown"}

Property Type:
${propertyType || "Unknown"}

IMPORTANT RULES

• Only recommend legal and realistic HMO layouts.
• Never invent rooms that clearly cannot exist.
• Consider converting lounges, dining rooms, studies and oversized bedrooms where appropriate.
• Consider relocating kitchens or bathrooms if realistic.
• Always search for the maximum achievable bedroom count.
• If a higher bedroom count creates an impractical layout, recommend the best balanced option instead.
• Explain WHY every additional bedroom is possible.

Analyse the property in this order.

STEP 1

Identify:

• Existing bedrooms
• Bathrooms
• Reception rooms
• Kitchen
• Utility rooms
• Hallways
• Stairs

STEP 2

Estimate which existing rooms could become additional bedrooms.

STEP 3

Work through every realistic HMO option.

Consider:

• 4 Bedroom HMO
• 5 Bedroom HMO
• 6 Bedroom HMO
• 7 Bedroom HMO

Stop only when no further realistic bedrooms can be achieved.

STEP 4

Choose the best investment option.

STEP 5

Explain your reasoning.

Before returning your answer ask yourself:

"Have I found every realistic opportunity to create another bedroom?"

If the answer is no, reassess the floor plan.

Return ONLY valid JSON using EXACTLY this structure.

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
              image_url: `data:image/jpeg;base64,${base64}`,
              detail: "high",
            },
          ],
        },
      ],
    });

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
      error: error.message || "Analysis failed.",
    });
  }
}
