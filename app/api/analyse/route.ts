import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import fs from "fs";
import path from "path";
import { detectWalls } from "@/lib/floorDetection/detectWalls";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
// import { applyRoomChanges } from "@/lib/applyRoomChanges";

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

    const detectedFloors = await detectFloors(filePath);

const detectedWalls = await detectWalls(
  filePath,
  detectedFloors
);

const detectedRooms = await detectRooms(detectedWalls);

const originalFloorPlan = buildOriginalFloorPlan(
  detectedFloors,
  detectedRooms
);
    const originalFloorPlanJson = JSON.stringify(
  originalFloorPlan,
  null,
  2
);
    
    console.log("Detected floors:");
console.dir(detectedFloors, { depth: null });

    const floorContext = JSON.stringify(detectedFloors, null, 2);
    
    const image = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    let mime = "image/jpeg";

    if (ext === ".png") mime = "image/png";
    if (ext === ".webp") mime = "image/webp";

    const base64 = image.toString("base64");
    
console.log("Detected walls:");
console.dir(detectedWalls, { depth: null });

console.log("Detected rooms:");
console.dir(detectedRooms, { depth: null });
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

Uploaded Floor Plan

The original floor plan has already been detected.

Use the following JSON as the authoritative building geometry.

Do NOT recreate the building.

Do NOT invent new coordinates.

Here is the detected floor plan:

${originalFloorPlanJson}

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

Return EXACTLY the originalFloorPlan JSON provided above.

Do not modify it.

Model 2: Create proposedFloorPlan by COPYING originalFloorPlan.

Only modify:

- room name
- room type
- notes
- changes

Keep:

- id
- x
- y
- width
- height
- shape
- doors
- windows
- adjacentRooms

unless a wall is genuinely moved.

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

• x position
• y position
• width
• height

These coordinates already come from the detected floor plan.


Adjacent rooms should have adjacent coordinates.

The relative positioning of rooms is more important than exact dimensions.

Keep the same coordinate system in originalFloorPlan and proposedFloorPlan.

If a room is unchanged, its x, y, width and height should remain the same.

Only modify coordinates when walls are genuinely moved during the HMO conversion.

Also include:

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
VALIDATION RULES

Before returning your JSON, verify that:

• No two rooms overlap.
• Every room fits inside the original building footprint.
• Every floor keeps the same overall outline.
• Existing hallways and stairs remain connected.
• Every proposed room occupies real space from the original floor plan.
Every room in proposedFloorPlan must correspond to a room in originalFloorPlan.

If a room is unchanged between the original and proposed layouts, preserve its geometry where practical.

If a room has changed:

• Update the room's name and type to reflect the proposed HMO layout.
• Record every modification in the "changes" array.

Example:

Room name = Bedroom 4

changes =

- Convert Living Room to Bedroom
- Add en-suite
- Relocate doorway


Populate the "changes" array using clear architectural actions such as:

- Convert Living Room to Bedroom
- Add En-suite
- Remove internal wall
- Add partition wall
- Relocate doorway
- Widen opening
- Combine with adjacent room
- Split room into two
- Extend bathroom
- Convert cupboard into shower room

Do not leave the changes array empty unless the room is completely unchanged.

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

  "x": 0,

  "y": 0,

  "width": 0,

  "height": 0,

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

  "x": 0,

  "y": 0,

  "width": 0,

  "height": 0,

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

  "changes": [],

  "notes": "",

  "confidence": ""
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

      for (const floor of result.proposedFloorPlan.floors) {
  if (!floor.rooms || floor.rooms.length === 0) {
    throw new Error(
      `AI returned an empty floor: ${floor.name}`
    );
  }
      }

      console.log("############################################");
console.log("NEW BUILD 5 AUG 2026");
console.log("############################################");

      console.log("========== AI RESPONSE ==========");
console.log("===== ORIGINAL =====");

result.originalFloorPlan.floors.forEach((floor: any) => {
  console.log(floor.name);

  floor.rooms.forEach((room: any) => {
    console.log(
      room.name,
      `x=${room.x}`,
      `y=${room.y}`,
      `w=${room.width}`,
      `h=${room.height}`
    );
  });
});

console.log("===== PROPOSED =====");

result.proposedFloorPlan.floors.forEach((floor: any) => {
  console.log(floor.name);

  floor.rooms.forEach((room: any) => {
    console.log(
      room.name,
      `x=${room.x}`,
      `y=${room.y}`,
      `w=${room.width}`,
      `h=${room.height}`
    );
  });
});
console.log("================================");
      
      
    } catch (err: any) {
  console.error("JSON ERROR:", err?.name, err?.message);

  console.error("FIRST:");
  console.error(cleaned.slice(0, 500));

  console.error("LAST:");
  console.error(cleaned.slice(-500));

  console.error("LEN:", cleaned.length);

  return NextResponse.json({
    success: false,
    error: "OpenAI returned invalid JSON.",
  });
    }
console.log(
  `AI returned ${result.originalFloorPlan.floors.reduce(
    (t: number, f: any) => t + f.rooms.length,
    0
  )} rooms`
);

result.generatedLayoutImage = renderFloorPlan(
  result.originalFloorPlan,
  result.proposedFloorPlan
);

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
