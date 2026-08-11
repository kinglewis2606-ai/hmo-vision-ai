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

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const bedroomConversions = changes.filter((change: any) => {
    if (!isBedroomChange(change)) return false;
    const label = labels.find((candidate: any) => String(candidate?.roomId ?? "") === String(change?.roomId ?? ""));
    const currentType = String(label?.type ?? "").toLowerCase();
    return !currentType.includes("bedroom");
  }).length;

  const currentBedrooms = Number(result?.summary?.bedrooms);
  const proposedBedrooms = Number(result?.summary?.possibleHMOBedrooms);

  if (Number.isFinite(currentBedrooms) && bedroomConversions > 0) {
    const minimumProposed = currentBedrooms + bedroomConversions;
    if (!Number.isFinite(proposedBedrooms) || proposedBedrooms < minimumProposed) {
      result.summary.possibleHMOBedrooms = minimumProposed;
    }
  }
}

async function buildAnnotatedAnalysisImage(
  filePath: string,
  floorPlan: any
): Promise<{ dataUri: string; mime: string }> {
  const source = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let mime = "image/jpeg";
  if (ext === ".png") mime = "image/png";
  if (ext === ".webp") mime = "image/webp";

  const width = floorPlan.metadata?.imageWidth ?? 1600;
  const height = floorPlan.metadata?.imageHeight ?? 1200;
  const labels = floorPlan.floors.flatMap((floor: any) =>
    floor.rooms.map((room: any) => {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      const fontSize = Math.max(18, Math.min(34, Math.min(room.width, room.height) / 5));
      return `
        <rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"
          fill="none" stroke="#ff0055" stroke-width="4" stroke-dasharray="10 6"/>
        <rect x="${cx - 55}" y="${cy - fontSize - 8}" width="110" height="${fontSize + 16}"
          rx="8" fill="#ff0055" fill-opacity="0.92"/>
        <text x="${cx}" y="${cy + 2}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${room.id}</text>
      `;
    })
  ).join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/>
    <image href="data:${mime};base64,${source.toString("base64")}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>
    <g>${labels}</g>
  </svg>`;

  const annotated = await sharp(Buffer.from(svg)).png().toBuffer();
  return { dataUri: `data:image/png;base64,${annotated.toString("base64")}`, mime: "image/png" };
}

export async function POST(req: Request) {
  console.log("=== ANALYSE ROUTE HIT ===");
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });
    }

    console.log("Analyse stage 1: detecting floors");
    const detectedFloors = await detectFloors(filePath);
    console.log("Analyse stage 2: detecting rooms");
    const detectedRooms = await detectRooms(filePath, detectedFloors);
    const originalFloorPlan = buildOriginalFloorPlan(detectedFloors, detectedRooms);

    const imageMetadata = await sharp(filePath).metadata();
    originalFloorPlan.metadata = {
      imageWidth: imageMetadata.width,
      imageHeight: imageMetadata.height,
      imageDpi: imageMetadata.density,
    };

    console.log(`Analyse geometry complete: ${detectedFloors.length} floors, ${detectedRooms.length} rooms`);

    const originalFloorPlanJson = JSON.stringify(originalFloorPlan, null, 2);
    const promptText = buildHMOAnalysisPrompt(address, propertyType)
      .replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", originalFloorPlanJson);

    console.log("Analyse stage 3: building visual room-ID map");
    const annotated = await buildAnnotatedAnalysisImage(filePath, originalFloorPlan);

    console.log("Analyse stage 4: calling vision model");
    const response = await openai.responses.create({
      model: "gpt-5",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: annotated.dataUri, detail: "high" },
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

      const labelledFloorPlan = structuredClone(originalFloorPlan);
      applyRoomLabels(labelledFloorPlan, roomLabels);
      reconcileCurrentCounts(result, changes);

      const validRoomIds = new Set(
        originalFloorPlan.floors.flatMap((floor: any) => floor.rooms.map((room: any) => room.id))
      );
      const validChanges = changes.filter((change: any) => validRoomIds.has(String(change?.roomId ?? "")));

      const proposedFloorPlan = applyRoomChanges(labelledFloorPlan, validChanges);
      result.originalFloorPlan = originalFloorPlan;
      result.proposedFloorPlan = proposedFloorPlan;
      result.generatedLayoutImage = renderFloorPlan(
        labelledFloorPlan,
        proposedFloorPlan,
        `data:${extToMime(filename)};base64,${fs.readFileSync(filePath).toString("base64")}`,
        validChanges
      );

      console.log("Analyse complete", {
        detectedRooms: detectedRooms.length,
        roomLabels: roomLabels.length,
        changes: validChanges.length,
      });

      return NextResponse.json({ success: true, result });
    } catch (err: any) {
      console.error("JSON ERROR:", err?.message);
      console.error(cleaned.slice(0, 3000));
      return NextResponse.json({ success: false, error: `AI returned invalid analysis JSON: ${err?.message || "unknown error"}` }, { status: 502 });
    }
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Analysis failed on the server." },
      { status: 500 }
    );
  }
}

function extToMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
