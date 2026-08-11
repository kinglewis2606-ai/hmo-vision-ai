import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectWalls } from "@/lib/floorDetection/detectWalls";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOAnalysisPrompt } from "@/lib/prompts/hmoAnalysisPrompt";
import { applyRoomChanges } from "@/lib/applyRoomChanges";

function isBedroomChange(change: any): boolean {
  const action = String(change?.action ?? "").toLowerCase();
  const type = String(change?.newType ?? "").toLowerCase();
  return action.includes("converttobedroom") ||
    action.includes("convert to bedroom") ||
    type.includes("bedroom");
}

function reconcileCurrentBedroomCount(result: any, changes: any[]): void {
  const potential = Number(result?.summary?.possibleHMOBedrooms);
  const reportedCurrent = Number(result?.summary?.bedrooms);
  const conversions = changes.filter(isBedroomChange).length;

  if (!Number.isFinite(potential) || !Number.isFinite(reportedCurrent)) return;

  // Keep "Current Bedrooms" separate from the proposed HMO total. If the AI
  // accidentally reports the proposed count as current and explicitly lists
  // bedroom conversions, derive the current count from those same decisions.
  if (conversions > 0 && reportedCurrent >= potential) {
    result.summary.bedrooms = Math.max(0, potential - conversions);
  }
}

export async function POST(req: Request) {
  console.log("=== ANALYSE ROUTE HIT ===");
  try {
    const { filename, address, propertyType } = await req.json();
    const filePath = path.join(process.cwd(), "public", "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: "Uploaded floor plan not found." });
    }

    const detectedFloors = await detectFloors(filePath);
    const detectedWalls = await detectWalls(filePath, detectedFloors);
    const detectedRooms = await detectRooms(detectedWalls, detectedFloors);
    const originalFloorPlan = buildOriginalFloorPlan(detectedFloors, detectedRooms);

    const imageMetadata = await sharp(filePath).metadata();
    originalFloorPlan.metadata = {
      imageWidth: imageMetadata.width,
      imageHeight: imageMetadata.height,
      imageDpi: imageMetadata.density,
    };

    const originalFloorPlanJson = JSON.stringify(originalFloorPlan, null, 2);
    const image = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    let mime = "image/jpeg";
    if (ext === ".png") mime = "image/png";
    if (ext === ".webp") mime = "image/webp";
    const base64 = image.toString("base64");

    const promptText = buildHMOAnalysisPrompt(address, propertyType)
      .replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", originalFloorPlanJson);

    const response = await openai.responses.create({
      model: "gpt-5",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "high" },
        ],
      }],
    });

    const cleaned = (response.output_text ?? "")
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      const result = JSON.parse(cleaned);
      result.originalFloorPlan = originalFloorPlan;

      const changes = Array.isArray(result.changes) ? result.changes : [];
      reconcileCurrentBedroomCount(result, changes);
      result.proposedFloorPlan = applyRoomChanges(originalFloorPlan, changes);

      console.log("Detected rooms:", detectedRooms.length);
      console.log("AI changes:", changes.length);
      console.log(
        "Proposed rooms:",
        result.proposedFloorPlan.floors.reduce(
          (total: number, floor: any) => total + floor.rooms.length,
          0
        )
      );

      result.generatedLayoutImage = renderFloorPlan(
        result.originalFloorPlan,
        result.proposedFloorPlan,
        `data:${mime};base64,${base64}`
      );

      return NextResponse.json({ success: true, result });
    } catch (err: any) {
      console.error("JSON ERROR:", err?.message);
      console.error(cleaned.slice(0, 3000));
      return NextResponse.json({ success: false, error: err.message });
    }
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message || "Analysis failed." });
  }
}
