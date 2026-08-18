import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";

type VisionRoom = { candidateId?: number; floorIndex?: number; x?: number; y?: number; width?: number; height?: number; polygon?: Point[] };
type VisionPlan = {
  floors?: Array<{ name?: string; x?: number; y?: number; width?: number; height?: number }>;
  rooms?: VisionRoom[];
};

let cachePath = "";
let cache: VisionPlan | null = null;

function cleanJson(value: string): string { return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim(); }
function validRoom(room: VisionRoom, width: number, height: number): boolean {
  const x = Number(room.x), y = Number(room.y), w = Number(room.width), h = Number(room.height);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w >= 20 && h >= 20 && w <= width && h <= height && x >= 0 && y >= 0 && x + w <= width + 2 && y + h <= height + 2;
}
function normalisePolygon(room: VisionRoom): Point[] | undefined {
  if (!Array.isArray(room.polygon) || room.polygon.length < 3) return undefined;
  const polygon = room.polygon.map(p => ({ x: Number(p.x), y: Number(p.y) }));
  const x = Number(room.x), y = Number(room.y), right = x + Number(room.width), bottom = y + Number(room.height);
  if (polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < x - 3 || p.y < y - 3 || p.x > right + 3 || p.y > bottom + 3)) return undefined;
  return polygon;
}

async function detectWithVision(filePath: string): Promise<VisionPlan | null> {
  const source = fs.readFileSync(filePath), metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0, height = metadata.height ?? 0;
  if (!width || !height) return null;
  const image = await sharp(source).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const response = await openai.responses.create({ model: "gpt-5-mini", input: [{ role: "user", content: [
    { type: "input_text", text: `Act as a strict architectural floor-plan geometry detector. Detect the actual floor-plan panels and every distinct enclosed room in this image. Do not assume three floors, equal-sized panels, a fixed orientation, or a fixed room count. Return JSON only: {"floors":[{"name":"","x":0,"y":0,"width":0,"height":0}],"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}]}]}. Coordinates MUST be pixels in the original ${width}x${height} image. A room boundary is the interior face of its enclosing walls; do not draw a box around text, furniture, whitespace, compass, watermark or a whole floor panel. Every returned room geometry MUST sit directly over a genuinely enclosed room visible in the source image. Follow wall lines and door openings. Do not invent or split rooms. Prefer a conservative boundary inside the walls over a floating or oversized rectangle.` },
    { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
  ] } }] });
  try { return JSON.parse(cleanJson(response.output_text || "")) as VisionPlan; } catch { return null; }
}

async function verifyAndCorrectRooms(filePath: string, detected: VisionPlan, width: number, height: number): Promise<VisionPlan> {
  const rooms = Array.isArray(detected.rooms) ? detected.rooms.filter(r => validRoom(r, width, height)) : [];
  if (!rooms.length) return detected;
  const source = fs.readFileSync(filePath), image = await sharp(source).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const candidates = rooms.map((r, i) => ({ candidateId: i + 1, floorIndex: Number.isFinite(Number(r.floorIndex)) ? Number(r.floorIndex) : undefined, x: Math.round(Number(r.x)), y: Math.round(Number(r.y)), width: Math.round(Number(r.width)), height: Math.round(Number(r.height)) }));
  try {
    const response = await openai.responses.create({ model: "gpt-5-mini", input: [{ role: "user", content: [
      { type: "input_text", text: `You are the final geometry verification pass for a floor-plan analysis. The supplied image is the ORIGINAL floor plan. Candidate room rectangles are listed below. Inspect the actual wall lines and correct each candidate so it overlays the real enclosed room, not blank page space, text, watermark, compass or a neighbouring room. Preserve a candidate only if it is a real enclosed room. You may adjust x/y/width/height and return an optional polygon following the visible room boundary. Do not invent rooms and do not move a room to another floor. Coordinates are ORIGINAL ${width}x${height} image pixels. Return JSON only: {"rooms":[{"candidateId":1,"floorIndex":0,"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}]}]}. A candidate is valid only when it visibly overlays an enclosed room. Reject floating squares/rectangles that do not coincide with walls. Candidates: ${JSON.stringify(candidates)}` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
    ] } }] });
    const parsed = JSON.parse(cleanJson(response.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return detected;
    const corrected = parsed.rooms.map((r: any) => ({ candidateId: Number(r.candidateId), floorIndex: Number.isFinite(Number(r.floorIndex)) ? Number(r.floorIndex) : undefined, x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height), polygon: r.polygon })).filter((r: VisionRoom) => Number.isInteger(r.candidateId) && r.candidateId! >= 1 && r.candidateId! <= rooms.length && validRoom(r, width, height)).sort((a: VisionRoom, b: VisionRoom) => Number(a.candidateId) - Number(b.candidateId));
    if (corrected.length < Math.max(2, Math.floor(rooms.length * 0.55))) return detected;
    return { ...detected, rooms: corrected };
  } catch (error) { console.warn("Room geometry verification failed; retaining first-pass geometry", error); return detected; }
}

export async function detectFloors(filePath: string): Promise<DetectedFloor[]> {
  const metadata = await sharp(filePath).metadata(), width = metadata.width ?? 0, height = metadata.height ?? 0;
  if (!width || !height) return [];
  if (cachePath === filePath && cache?.floors?.length) return cache.floors.map((floor, index) => ({ name: floor.name || `Floor ${index + 1}`, level: index, top: Math.max(0, Math.round(floor.y || 0)), left: Math.max(0, Math.round(floor.x || 0)), bottom: Math.min(height, Math.round((floor.y || 0) + (floor.height || 0))), right: Math.min(width, Math.round((floor.x || 0) + (floor.width || 0))) }));
  try {
    const detected = await detectWithVision(filePath);
    if (detected?.floors?.length && (detected.rooms?.length ?? 0) >= 2) {
      const verified = await verifyAndCorrectRooms(filePath, detected, width, height);
      cachePath = filePath; cache = verified;
      return (verified.floors || detected.floors).map((floor, index) => ({ name: floor.name || `Floor ${index + 1}`, level: index, top: Math.max(0, Math.round(floor.y || 0)), left: Math.max(0, Math.round(floor.x || 0)), bottom: Math.min(height, Math.round((floor.y || 0) + (floor.height || 0))), right: Math.min(width, Math.round((floor.x || 0) + (floor.width || 0))) }));
    }
  } catch (error) { console.warn("Vision floor/room detection failed; using contour fallback", error); }
  cachePath = filePath; cache = null;
  return [{ name: "Floor Plan", level: 0, top: 0, bottom: height, left: 0, right: width }];
}

export function getVisionDetectedRooms(filePath: string): DetectedRoom[] | null {
  if (cachePath !== filePath || !cache?.rooms?.length) return null;
  return cache.rooms.map((room, index) => {
    const x = Math.round(Number(room.x) || 0), y = Math.round(Number(room.y) || 0), width = Math.round(Number(room.width) || 0), height = Math.round(Number(room.height) || 0), polygon = normalisePolygon(room);
    return { id: `room-${index + 1}`, x, y, width, height, ...(polygon ? { polygon } : {}) };
  }).filter(room => room.width >= 20 && room.height >= 20);
}
