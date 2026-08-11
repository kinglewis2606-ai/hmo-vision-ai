import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOAnalysisPrompt } from "@/lib/prompts/hmoAnalysisPrompt";
import { applyRoomChanges } from "@/lib/applyRoomChanges";

function isBedroomChange(change: any): boolean {
  const action = String(change?.action ?? "").toLowerCase().replace(/\s+/g, "");
  const type = String(change?.newType ?? "").toLowerCase();
  return action === "converttobedroom" || type.includes("bedroom");
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

    // Immutable geometry source of truth.
    const detectedFloors = await detectFloors(filePath);
    const detectedRooms = await detectRooms(filePath, detectedFloors);
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

      // Semantic baseline: same real geometry, now with the AI's room
      // classifications. This is separate from result.originalFloorPlan so
      // labels cannot masquerade as proposed construction work.
      const labelledFloorPlan = structuredClone(originalFloorPlan);
      applyRoomLabels(labelledFloorPlan, roomLabels);
      reconcileCurrentCounts(result, changes);

      const validRoomIds = new Set(
        originalFloorPlan.floors.flatMap((floor: any) => floor.rooms.map((room: any) => room.id))
      );
      const validChanges = changes.filter((change: any) => validRoomIds.has(String(change?.roomId ?? "")));
      const invalidChanges = changes.filter((change: any) => !validRoomIds.has(String(change?.roomId ?? "")));
      if (invalidChanges.length) {
        console.warn("Ignoring changes with unknown room IDs:", invalidChanges);
      }

      // Apply only explicit proposed works to the semantic baseline. Geometry
      // remains the detected geometry; no AI-generated coordinates are used.
      const proposedFloorPlan = applyRoomChanges(labelledFloorPlan, validChanges);

      result.originalFloorPlan = originalFloorPlan;
      result.proposedFloorPlan = proposedFloorPlan;

      console.log("Detected rooms:", detectedRooms.length);
      console.log("AI room labels:", roomLabels.length);
      console.log("AI changes:", validChanges.length);
      console.log(
        "Proposed rooms:",
        proposedFloorPlan.floors.reduce(
          (total: number, floor: any) => total + floor.rooms.length,
          0
        )
      );

      // Compare semantic room classifications, but always draw them over the
      // untouched uploaded image. Therefore existing bedrooms remain untouched
      // and only a genuine conversion (e.g. living room -> bedroom) is shown.
      result.generatedLayoutImage = renderFloorPlan(
        labelledFloorPlan,
        proposedFloorPlan,
        `data:${mime};base64,${base64}`,
        validChanges
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
