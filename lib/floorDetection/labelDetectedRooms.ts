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
 * Labels each detected geometry against a dedicated crop of the ORIGINAL plan.
 * The previous implementation showed the entire plan while asking the model to
 * map tiny printed labels back to candidate IDs. That is unreliable on multi-
 * floor plans. Each candidate now gets its own enlarged crop so existing
 * Bedroom 1/2/3/4 labels cannot be silently lost during HMO planning.
 */
export async function labelDetectedRooms(imagePath: string, rooms: DetectedRoom[]): Promise<DetectedRoom[]> {
  if (!rooms.length) return rooms;

  const source = fs.readFileSync(imagePath);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return rooms;

  const margin = 45;
  const content: any[] = [{
    type: "input_text",
    text: `Classify EVERY supplied room candidate from its dedicated crop. This is EXISTING ROOM RECOGNITION, not HMO design. Return exactly one result for every candidate, in the same order. Read the printed room label inside each crop. Never merge candidates. Never invent a room. Never omit an existing bedroom. Bedroom 1/2/3/4/etc MUST be type bedroom. Lounge/Living Room/Reception=living. Dining Room=dining. Kitchen=kitchen. Shower Room/Bathroom/WC/Toilet=bathroom. Landing/Hall/Entrance/Stairs=c irculation. If the printed label is clear, copy it accurately. If the crop is uncertain, use the visible room layout/text conservatively and set confidence low rather than inventing a different room. Return JSON only: {"rooms":[{"candidateId":1,"name":"Bedroom 1","type":"bedroom","confidence":"high"}]}. Candidates: ${JSON.stringify(rooms.map((room, index) => ({ candidateId: index + 1, id: room.id, x: Math.round(room.x), y: Math.round(room.y), width: Math.round(room.width), height: Math.round(room.height) })))}`
  }];

  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index];
    const left = Math.max(0, Math.floor(room.x - margin));
    const top = Math.max(0, Math.floor(room.y - margin));
    const right = Math.min(width, Math.ceil(room.x + room.width + margin));
    const bottom = Math.min(height, Math.ceil(room.y + room.height + margin));
    const cropWidth = Math.max(40, right - left);
    const cropHeight = Math.max(40, bottom - top);

    try {
      const crop = await sharp(source)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .resize({ width: 720, height: 720, fit: "contain", withoutEnlargement: false })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 94, mozjpeg: true })
        .toBuffer();

      content.push({
        type: "input_text",
        text: `Candidate ${index + 1}: read ONLY this candidate crop. The red/geometry candidate boundary is the room to classify.`
      });
      content.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${crop.toString("base64")}`,
        detail: "high",
      });
    } catch (error) {
      console.warn(`Could not prepare room-label crop ${index + 1}`, error);
    }
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [{ role: "user", content }],
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
    if (byCandidate.size !== rooms.length) {
      console.warn(`Room label pass mapped ${byCandidate.size}/${rooms.length} candidate IDs`);
      return rooms;
    }

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
    console.warn("Dedicated per-room label pass failed; retaining geometry candidates", error);
    return rooms;
  }
}
