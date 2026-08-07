import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import fs from "fs";
import path from "path";
import { detectWalls } from "@/lib/floorDetection/detectWalls";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOAnalysisPrompt } from "@/lib/prompts/hmoAnalysisPrompt";
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
    
const detectedRooms = await detectRooms(
  detectedWalls,
  detectedFloors
);

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
    
console.log("Detected rooms:");
console.dir(detectedRooms, { depth: null });

    const promptText = buildHMOAnalysisPrompt(address, propertyType)
      .replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", originalFloorPlanJson);

    const response = await openai.responses.create({
      model: "gpt-4-vision",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: promptText,
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
      result.originalFloorPlan = originalFloorPlan;
result.proposedFloorPlan =
  structuredClone(originalFloorPlan);
      // result.proposedFloorPlan = applyRoomChanges(
      //   result.proposedFloorPlan,
      //   result.changes
      // );
      
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
  console.error(cleaned.slice(0, 3000));

  console.error("LAST:");
  console.error(cleaned.slice(-500));

  console.error("LEN:", cleaned.length);

  return NextResponse.json({
  success: false,
  error: err.message,
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
