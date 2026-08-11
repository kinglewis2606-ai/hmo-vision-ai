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
      const fontSize = Math.max(24, Math.min(44, Math.min(room.width, room.height) / 4));
      const badgeWidth = Math.max(150, Math.min(240, room.width * 0.8));
      const badgeHeight = fontSize + 28;
      const badgeX = Math.max(4, Math.min(width - badgeWidth - 4, room.x + 8));
      const badgeY = Math.max(4, Math.min(height - badgeHeight - 4, room.y + 8));
      const floorLabel = floor.name.replace(" Floor", "").toUpperCase();
      return `
        <rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"
          fill="none" stroke="#ff0055" stroke-width="6" stroke-dasharray="16 9"/>
        <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}"
          rx="10" fill="#ff0055" fill-opacity="0.96" stroke="white" stroke-width="3"/>
        <text x="${badgeX + badgeWidth / 2}" y="${badgeY + fontSize * 0.72}"
          text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="white">${room.id}</text>
        <text x="${badgeX + badgeWidth / 2}" y="${badgeY + fontSize + 18}"
          text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="white">${floorLabel}</text>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#ff0055"
          stroke="white" stroke-width="4" paint-order="stroke">${room.id}</text>
      `;
    })
  ).join("\n");

  const floorLegend = floorPlan.floors.map((floor: any) => {
    const ids = floor.rooms.map((room: any) => room.id).join(", ");
    return `${floor.name}: ${ids || "none"}`;
  }).join(" | ");

  const legendHeight = 72;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + legendHeight}">
    <rect width="100%" height="100%" fill="white"/>
    <image href="data:${mime};base64,${source.toString("base64")}" x="0" y="${legendHeight}" width="${width}" height="${height}" preserveAspectRatio="none"/>
    <rect x="0" y="0" width="100%" height="${legendHeight}" fill="#111827"/>
    <text x="24" y="28" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="white">ROOM-ID MAP — READ THE ID INSIDE EACH RED BOX</text>
    <text x="24" y="55" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#fca5a5">${floorLegend}</text>
    <g transform="translate(0, ${legendHeight})">${labels}</g>
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

      const roomsById = new Map<string, { room: any; floorName: string }>();
      for (const floor of originalFloorPlan.floors) {
        for (const room of floor.rooms) roomsById.set(room.id, { room, floorName: floor.name });
      }

      const labelsById = new Map<string, any>();
      for (const label of roomLabels) labelsById.set(String(label?.roomId ?? ""), label);

      const validRoomIds = new Set(roomsById.keys());
      const validChanges = changes.filter((change: any) => {
        const id = String(change?.roomId ?? "");
        if (!validRoomIds.has(id)) return false;

        const geometry = roomsById.get(id)!;
        const label = labelsById.get(id);
        const declaredFloor = String(label?.floor ?? "").trim().toLowerCase();
        const actualFloor = geometry.floorName.trim().toLowerCase();

        // A vision mistake that assigns a room to the wrong floor must never
        // become a real overlay. The geometry's floor is authoritative.
        if (declaredFloor && declaredFloor !== actualFloor) {
          console.warn(`Dropping change for ${id}: AI floor=${label?.floor}, geometry floor=${geometry.floorName}`);
          return false;
        }

        const action = String(change?.action ?? "").toLowerCase().replace(/[^a-z]/g, "");
        const labelType = String(label?.type ?? "").toLowerCase();

        // Do not allow a bathroom/WC/landing/kitchen to be silently turned into
        // a bedroom just because the model selected the wrong ID.
        if (action === "converttobedroom" && /(bath|shower|wc|toilet|landing|hall|kitchen|dining)/.test(labelType)) {
          console.warn(`Dropping unsafe bedroom conversion for ${id}: label type=${label?.type}`);
          return false;
        }

        // A communal kitchen/diner proposal must live on the ground floor for
        // this HMO workflow; never paint one over an upstairs room.
        if (action === "converttokitchen" && geometry.floorName !== "Ground Floor") {
          console.warn(`Dropping upstairs kitchen conversion for ${id}`);
          return false;
        }

        return true;
      });

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
        changesRequested: changes.length,
        changesApplied: validChanges.length,
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
      { success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 }
    );
  }
}

function extToMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
