import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {console.log("=== ANALYSE ROUTE HIT ===");
  try {
    const { filename, address, propertyType } = await req.json();

    const filePath = path.join(process.cwd(), "public", "uploads", filename);
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

HMO SCORING RULES

The HMO score must represent the overall investment quality.

Score using these criteria:

• Maximum achievable HMO size (35 points)
• Layout efficiency (20 points)
• Planning/licensing feasibility (15 points)
• Rental income potential (15 points)
• Estimated conversion cost (15 points)

Score guide:

90–100 = Exceptional investment
75–89 = Strong Buy
60–74 = Good Investment
40–59 = Average
0–39 = Poor

A realistic 7-bedroom HMO should rarely score below 75 unless there are major planning or layout problems.

The HMO score, verdict and investor summary must all agree with each other.

Never return contradictory results.

You must build TWO complete digital floor plan models.

Model 1: originalFloorPlan

This must represent the property exactly as uploaded.

Model 2: proposedFloorPlan

This must represent the recommended HMO conversion.

Rules:

• Preserve the same building footprint.
• Preserve the same number of floors.
• Preserve stair locations wherever possible.
• Preserve the general room arrangement wherever practical.
• Only modify rooms that are realistically changed during the HMO conversion.
• Never invent extra floors.
• Never invent rooms that cannot physically fit.

For every room include:

• Unique room id
• Room name
• Room type
• Approximate width (metres)
• Approximate depth (metres)
• Approximate floor area (sqm)
• Adjacent rooms
• Door locations
• Window locations
• Notes
• Confidence

The proposedFloorPlan must contain the converted version of the property after all recommended HMO alterations have been completed.
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

  "originalFloorPlan": {
    "floors": [
      {
        "name": "",
        "level": 0,
        "rooms": [
          {
            "id": "",
            "name": "",
            "type": "",
            "approxAreaSqm": 0,
            "approxWidthM": 0,
            "approxDepthM": 0,
            "shape": "",
            "adjacentRooms": [],
            "doors": [
              {
                "connectsTo": "",
                "wall": ""
              }
            ],
            "windows": [
              {
                "wall": ""
              }
            ],
            "canBecomeBedroom": false,
            "notes": "",
            "confidence": ""
          }
        ]
      }
    ]
  },

  "proposedFloorPlan": {
    "floors": [
      {
        "name": "",
        "level": 0,
        "rooms": [
          {
            "id": "",
            "name": "",
            "type": "",
            "approxAreaSqm": 0,
            "approxWidthM": 0,
            "approxDepthM": 0,
            "shape": "",
            "adjacentRooms": [],
            "doors": [
              {
                "connectsTo": "",
                "wall": ""
              }
            ],
            "windows": [
              {
                "wall": ""
              }
            ],
            "convertedFrom": "",
            "notes": ""
          }
        ]
      }
    ]
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

    // Generate an AI floor plan from the recommended layout
const layoutImage = await openai.images.generate({
  model: "gpt-image-1",
  
prompt: `
You are an architectural floor plan designer.

Your task is NOT to invent a new property.

Your task is to redesign the EXISTING uploaded property into its recommended HMO layout.

Original property structure:

${JSON.stringify(result.floorPlan, null, 2)}

Recommended HMO conversion:

${result.recommendedLayout.join("\n")}

Requirements:

• Preserve the external walls and overall building footprint wherever possible.
• Preserve the number of floors.
• Preserve staircase locations and orientation unless absolutely necessary.
• Preserve window positions wherever practical.
• Maintain the same overall proportions as the original building.

You MAY:

• Convert rooms into bedrooms.
• Split oversized rooms into compliant bedrooms.
• Add or remove internal partition walls.
• Relocate kitchens and bathrooms where practical.
• Add en-suites.
• Improve circulation routes.

Do NOT invent a different building.

The final drawing should look like an architect has taken the ORIGINAL floor plan and redrawn it as a proposed HMO conversion.

Render each floor separately.

Label every room.

Produce a clean black-and-white estate-agent style architectural floor plan.
`,
  size: "1024x1024",
});

const generatedImage = layoutImage.data?.[0];

if (generatedImage?.b64_json) {
  result.generatedLayoutImage = `data:image/png;base64,${generatedImage.b64_json}`;
} else if (generatedImage?.url) {
  result.generatedLayoutImage = generatedImage.url;
} else {
  result.generatedLayoutImage = "";
}

return NextResponse.json({
  success: true,
  result,
});

  } catch (error: any) {
  console.error("========== FULL ERROR ==========");
  console.dir(error, { depth: null });

  if (error instanceof Error) {
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
  }
  return NextResponse.json({
    success: false,
    error: error.message || "Analysis failed.",
  });
}
}
