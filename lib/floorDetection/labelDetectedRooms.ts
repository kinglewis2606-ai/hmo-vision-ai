import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedRoom } from "@/lib/types/floorPlan";

type LabelResult = {
  candidateId?: number;
  name?: string;
  type?: string;
  confidence?: string;
  areaSqm?: number;
  widthM?: number;
  depthM?: number;
};

function cleanJson(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

function canonicalType(name: string, type: string): string {
  const value = `${type} ${name}`.toLowerCase().replace(/[^a-z]/g, "");
  if (value.includes("bedroom")) return "bedroom";
  if (value.includes("living") || value.includes("lounge") || value.includes("reception")) return "living";
  if (value.includes("dining") || value.includes("diner")) return "dining";
  if (value.includes("kitchen")) return "kitchen";
  if (value.includes("shower") || value.includes("bathroom") || value === "bath" || value.includes("toilet") || value === "wc") return "bathroom";
  if (value.includes("landing") || value.includes("hall") || value.includes("entrance") || value.includes("stair")) return "circulation";
  return type || "unknown";
}

/**
 * Labels geometry candidates directly from the unmodified source image.
 * This is deliberately separate from the HMO strategy response: existing
 * bedrooms must be recognised before the optimiser is allowed to change them.
 */
export async function labelDetectedRooms(imagePath: string, rooms: DetectedRoom[]): Promise<DetectedRoom[]> {
  if (!rooms.length) return rooms;

  const source = fs.readFileSync(imagePath);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return rooms;

  const image = await sharp(source)
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const candidates = rooms.map((room, index) => ({
    candidateId: index + 1,
    id: room.id,
    x: Math.round(room.x),
    y: Math.round(room.y),
    width: Math.round(room.width),
    height: Math.round(room.height),
  }));

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Classify EVERY geometry candidate against the ORIGINAL floor-plan image. This is a room-recognition task, NOT an HMO design task. Return exactly one result for every supplied candidate, in the same order, even when uncertain. Read the printed room name inside the candidate from the source image. In particular, do NOT omit existing bedrooms. Bedroom 1/2/3/4/etc = type bedroom. Lounge/Living Room/Reception = living. Dining Room = dining. Kitchen = kitchen. Shower Room/Bathroom/WC/Toilet = bathroom. Landing/Hall/Entrance/Stairs = circulation. Never merge candidates, never invent a room, and never return a label for a different candidate. Use the candidate geometry only to know which printed room you are reading. Return JSON only: {"rooms":[{"candidateId":1,"name":"Bedroom 1","type":"bedroom","confidence":"high"}]}. Original image size: ${width}x${height}. Candidates: ${JSON.stringify(candidates)}`,
          },
          { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
        ],
      }],
    });

    const parsed = JSON.parse(cleanJson(response.output_text || "{}"));
    if (!Array.isArray(parsed.rooms) || parsed.rooms.length !== rooms.length) {
      console.warn(`Room label pass returned ${Array.isArray(parsed.rooms) ? parsed.rooms.length : 0}/${rooms.length} candidates`);
      return rooms;
    }

    const byCandidate = new Map<number, LabelResult>();
    for (const item of parsed.rooms as LabelResult[]) {
      const candidateId = Number(item.candidateId);
      if (Number.isInteger(candidateId) && candidateId >= 1 && candidateId <= rooms.length) byCandidate.set(candidateId, item);
    }
    if (byCandidate.size !== rooms.length) return rooms;

    return rooms.map((room, index) => {
      const label = byCandidate.get(index + 1)!;
      const name = String(label.name || "Unknown Room").trim();
      const type = canonicalType(name, String(label.type || "unknown"));
      return {
        ...room,
        name,
        type,
        ...(label.confidence ? { confidence: String(label.confidence) } : {}),
        ...(Number(label.areaSqm) > 0 ? { approxAreaSqm: Number(label.areaSqm) } : {}),
        ...(Number(label.widthM) > 0 ? { approxWidthM: Number(label.widthM) } : {}),
        ...(Number(label.depthM) > 0 ? { approxDepthM: Number(label.depthM) } : {}),
      } as DetectedRoom;
    });
  } catch (error) {
    console.warn("Dedicated room label pass failed; retaining geometry candidates", error);
    return rooms;
  }
}
