import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedFloor, DetectedRoom } from "@/lib/types/floorPlan";

type VisionPlan = {
  floors?: Array<{ name?: string; x?: number; y?: number; width?: number; height?: number }>;
  rooms?: Array<{ floorIndex?: number; x?: number; y?: number; width?: number; height?: number }>;
};

let cachePath = "";
let cache: VisionPlan | null = null;

function cleanJson(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function detectWithVision(filePath: string): Promise<VisionPlan | null> {
  const source = fs.readFileSync(filePath);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return null;

  // Geometry recognition does not need the slower general-purpose model. Keep the
  // image detailed enough to read walls/room boundaries, but cap its size so an
  // unusually large upload cannot turn room detection into a multi-minute request.
  const image = await sharp(source)
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Act as a floor-plan geometry detector. Detect the actual floor-plan panels and every distinct enclosed room in this image. Do NOT assume three floors, equal-sized panels, a fixed orientation, or a fixed room count. Return JSON only in this exact shape: {"floors":[{"name":"","x":0,"y":0,"width":0,"height":0}],"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0}]}. Coordinates must be pixels in the original ${width}x${height} image, so scale coordinates back from the supplied image if it was resized. Include every enclosed room visible: bedroom, living/lounge, dining, kitchen, bathroom, shower room, WC, hall, landing, stairs, utility/storage and other distinct enclosed spaces. Do not invent rooms. Do not merge clearly separated rooms. Do not split one room merely because furniture or text appears inside it. Prioritise wall boundaries and doors over labels.`,
        },
        {
          type: "input_image",
          image_url: `data:image/jpeg;base64,${image.toString("base64")}`,
          detail: "high",
        },
      ],
    }],
  });

  try {
    return JSON.parse(cleanJson(response.output_text || "")) as VisionPlan;
  } catch {
    return null;
  }
}

export async function detectFloors(filePath: string): Promise<DetectedFloor[]> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return [];

  if (cachePath === filePath && cache?.floors?.length) {
    return cache.floors.map((floor, index) => ({
      name: floor.name || `Floor ${index + 1}`,
      level: index,
      top: Math.max(0, Math.round(floor.y || 0)),
      left: Math.max(0, Math.round(floor.x || 0)),
      bottom: Math.min(height, Math.round((floor.y || 0) + (floor.height || 0))),
      right: Math.min(width, Math.round((floor.x || 0) + (floor.width || 0))),
    }));
  }

  try {
    const detected = await detectWithVision(filePath);
    if (detected?.floors?.length && (detected.rooms?.length ?? 0) >= 2) {
      cachePath = filePath;
      cache = detected;
      return detected.floors.map((floor, index) => ({
        name: floor.name || `Floor ${index + 1}`,
        level: index,
        top: Math.max(0, Math.round(floor.y || 0)),
        left: Math.max(0, Math.round(floor.x || 0)),
        bottom: Math.min(height, Math.round((floor.y || 0) + (floor.height || 0))),
        right: Math.min(width, Math.round((floor.x || 0) + (floor.width || 0))),
      }));
    }
  } catch (error) {
    console.warn("Vision floor/room detection failed; using contour fallback", error);
  }

  cachePath = filePath;
  cache = null;
  return [{ name: "Floor Plan", level: 0, top: 0, bottom: height, left: 0, right: width }];
}

export function getVisionDetectedRooms(filePath: string): DetectedRoom[] | null {
  if (cachePath !== filePath || !cache?.rooms?.length) return null;
  return cache.rooms
    .map((room, index) => ({
      id: `room-${index + 1}`,
      x: Math.round(room.x || 0),
      y: Math.round(room.y || 0),
      width: Math.round(room.width || 0),
      height: Math.round(room.height || 0),
    }))
    .filter((room) => room.width >= 20 && room.height >= 20);
}
