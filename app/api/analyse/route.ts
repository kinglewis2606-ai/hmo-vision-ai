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

function isBathroomType(type: string): boolean {
  const value = type.toLowerCase();
  return value.includes("bath") || value.includes("shower") || value.includes("ensuite");
}

function applyRoomLabels(floorPlan: any, labels: any[]): void {
  const roomsById = new Map<string, any>();
  for (const floor of floorPlan.floors) {
    for (const room of floor.rooms) roomsById.set(room.id, room);
  }

  for (const label of labels) {
    const room = roomsById.get(String(label?.roomId ?? ""));
    if (!room) continue;
    if (label.name) room.name = String(label.name);
    if (label.type) room.type = String(label.type);
    if (label.confidence) room.confidence = String(label.confidence);
  }
}

function reconcileCurrentCounts(result: any, changes: any[]): void {
  const labels = Array.isArray(result?.roomLabels) ? result.roomLabels : [];
  const detectedBedrooms = labels.filter((label: any) =>
    String(label?.type ?? "").toLowerCase().includes("bedroom")
  ).length;
  const detectedBathrooms = labels.filter((label: any) =>
    isBathroomType(String(label?.type ?? ""))
  ).length;

  // The room labels are tied to real detected geometry, so they are the
  // authoritative source for the existing-property counts.
  if (detectedBedrooms > 0) result.summary.bedrooms = detectedBedrooms;
  if (detectedBathrooms > 0) result.summary.bathrooms = detectedBathrooms;

  const bedroomConversions = changes.filter(isBedroomChange).length;
  const currentBedrooms = Number(result?.summary?.bedrooms);
  const proposedBedrooms = Number(result?.summary?.possibleHMOBedrooms);

  if (Number.isFinite(currentBedrooms) && bedroomConversions > 0) {
    const minimumProposed = currentBedrooms + bedroomConversions;
    if (!Number.isFinite(proposedBedrooms) || proposedBedrooms < minimumProposed) {
      result.summary.possibleHMOBedrooms = minimumProposed;
    }
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
      const roomLabels = Array.isArray(result.roomLabels) ? result.roomLabels : [];
      const changes = Array.isArray(result.changes) ? result.changes : [];

      // First label the real detected geometry. Then apply the planning
      // changes to those exact same room IDs. No second/invented geometry set.
      applyRoomLabels(originalFloorPlan, roomLabels);
      result.originalFloorPlan = originalFloorPlan;
      reconcileCurrentCounts(result, changes);
      result.proposedFloorPlan = applyRoomChanges(originalFloorPlan, changes);

      const validRoomIds = new Set(
        originalFloorPlan.floors.flatMap((floor: any) => floor.rooms.map((room: any) => room.id))
      );
      const invalidChanges = changes.filter((change: any) => !validRoomIds.has(change?.roomId));
      if (invalidChanges.length) {
        console.warn("Ignoring changes with unknown room IDs:", invalidChanges);
      }

      console.log("Detected rooms:", detectedRooms.length);
      console.log("AI room labels:", roomLabels.length);
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
