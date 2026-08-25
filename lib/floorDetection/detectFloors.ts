import fs from "fs";
import sharp from "sharp";
import { openai, parseAIJson } from "@/lib/openai";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";

type VisionRoom = {
  floorIndex?: number; x?: number; y?: number; width?: number; height?: number;
  polygon?: Point[]; name?: string; type?: string; confidence?: string;
  areaSqm?: number; widthM?: number; depthM?: number;
};
type VisionChange = {
  roomIndex?: number; action?: string; newName?: string; newType?: string; reason?: string;
  split?: { firstName?: string; firstType?: string; secondName?: string; secondType?: string; direction?: string; firstRatio?: number };
};
type VisionPlan = { floors?: Array<{ name?: string; x?: number; y?: number; width?: number; height?: number }>; rooms?: VisionRoom[]; changes?: VisionChange[]; strategy?: Record<string, unknown> };
type DetectionContext = { address?: string; propertyType?: string };

let cacheKey = "";
let cache: VisionPlan | null = null;

function boxPolygon(r: VisionRoom): Point[] | undefined {
  const x = Number(r.x), y = Number(r.y), w = Number(r.width), h = Number(r.height);
  if (![x, y, w, h].every(Number.isFinite) || w < 20 || h < 20) return undefined;
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}
function validPolygon(r: VisionRoom): Point[] | undefined {
  if (Array.isArray(r.polygon) && r.polygon.length >= 3) {
    const p = r.polygon.map(q => ({ x: Number(q.x), y: Number(q.y) }));
    if (p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y))) return p;
  }
  return boxPolygon(r);
}
function validRoom(r: VisionRoom, w: number, h: number): boolean {
  const x = Number(r.x), y = Number(r.y), rw = Number(r.width), rh = Number(r.height);
  return [x, y, rw, rh].every(Number.isFinite) && rw >= 20 && rh >= 20 && x >= 0 && y >= 0 && x + rw <= w + 3 && y + rh <= h + 3;
}
function usableFloor(f: { name?: string; x?: number; y?: number; width?: number; height?: number }, w: number, h: number) {
  const x = Math.max(0, Math.round(Number(f.x ?? 0))), y = Math.max(0, Math.round(Number(f.y ?? 0)));
  const right = Math.min(w, Math.round(x + Number(f.width ?? 0))), bottom = Math.min(h, Math.round(y + Number(f.height ?? 0)));
  if (right - x < 40 || bottom - y < 40) return undefined;
  return { name: String(f.name || "Floor"), x, y, width: right - x, height: bottom - y };
}
function dedupeRooms(rooms: VisionRoom[]): VisionRoom[] {
  const result: VisionRoom[] = [];
  for (const room of rooms) {
    const duplicate = result.some(existing => existing.floorIndex === room.floorIndex && Math.abs(Number(existing.x) - Number(room.x)) < 8 && Math.abs(Number(existing.y) - Number(room.y)) < 8 && Math.abs(Number(existing.width) - Number(room.width)) < 8 && Math.abs(Number(existing.height) - Number(room.height)) < 8);
    if (!duplicate) result.push(room);
  }
  return result;
}

async function detectPlan(filePath: string, width: number, height: number, context: DetectionContext): Promise<VisionPlan> {
  const source = fs.readFileSync(filePath);
  // 1800px is enough to read normal plan labels while materially reducing vision latency/payload size.
  const scale = Math.min(1, 1800 / Math.max(width, height));
  const iw = Math.max(1, Math.round(width * scale));
  const ih = Math.max(1, Math.round(height * scale));
  const image = await sharp(source).resize({ width: iw, height: ih, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

  const prompt = `Analyse this real architectural floor plan for an HMO conversion. This is the ONLY AI vision pass. Detect every distinct enclosed room bounded by visible wall lines and classify it from its printed label/layout. Do not invent rooms, merge rooms separated by walls, or use furniture/text alone as geometry. Detect every floor-plan panel and preserve their order.

For each detected room return a conservative interior bounding box and polygon. The polygon must stay inside the bounding box and image. Include the visible room name/type and confidence. Use 0 for physical dimensions you cannot reliably read; never invent an area.

After detecting rooms, provide a SMALL HMO strategy using ONLY the detected room array. Do not create geometry or coordinates. Every strategy change MUST refer to the zero-based roomIndex in the rooms array. The deterministic application will decide whether a change is physically possible. Prefer existing bedrooms and only suggest conversions/splits that make architectural sense. Never suggest an ensuite as geometry; it is only a strategy hint for the deterministic geometry engine.

Property address: ${context.address || "Unknown"}
Property type: ${context.propertyType || "Unknown"}

Return JSON only in exactly this shape:
{"floors":[{"name":"Ground Floor","x":0,"y":0,"width":0,"height":0}],"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}],"name":"Bedroom 1","type":"bedroom","confidence":"high","areaSqm":0,"widthM":0,"depthM":0}],"changes":[{"roomIndex":0,"action":"ConvertToBedroom","newName":"Bedroom 1","newType":"bedroom","reason":"Existing labelled bedroom"}],"strategy":{"verdict":"","recommendations":[],"planningRisk":""}}

Allowed actions: ConvertToBedroom, ConvertToKitchen, ConvertToBathroom, ConvertToEnsuite, ExtendBathroom, SplitRoom, MergeRoom. For SplitRoom include split:{firstName,firstType,secondName,secondType,direction,firstRatio}. Keep changes concise. Do not return room IDs because the application assigns stable floor-specific IDs after detection.
Coordinates are pixels in the supplied ${iw}x${ih} image.`;

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" }] }],
    max_output_tokens: 5000,
  });
  return parseAIJson<VisionPlan>(response.output_text || "");
}

function floorResult(plan: VisionPlan, width: number, height: number): DetectedFloor[] {
  return (plan.floors || []).map((f, i) => ({
    name: String(f.name || `Floor ${i + 1}`), level: i,
    top: Math.max(0, Math.round(Number(f.y || 0))), left: Math.max(0, Math.round(Number(f.x || 0))),
    bottom: Math.min(height, Math.round(Number(f.y || 0) + Number(f.height || 0))), right: Math.min(width, Math.round(Number(f.x || 0) + Number(f.width || 0))),
  })).filter(f => f.bottom - f.top >= 40 && (f.right ?? 0) - (f.left ?? 0) >= 40);
}

export async function detectFloors(filePath: string, context: DetectionContext = {}): Promise<DetectedFloor[]> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0, height = metadata.height ?? 0;
  if (!width || !height) return [];
  const stat = fs.statSync(filePath);
  const key = `${filePath}:${stat.size}:${stat.mtimeMs}:${context.address || ""}:${context.propertyType || ""}`;
  if (cacheKey === key && cache) return floorResult(cache, width, height);

  const raw = await detectPlan(filePath, width, height, context);
  const scale = Math.min(1, 1800 / Math.max(width, height));
  let floors = (raw.floors || []).map(f => ({ ...f, x: Number(f.x || 0) / scale, y: Number(f.y || 0) / scale, width: Number(f.width || 0) / scale, height: Number(f.height || 0) / scale })).map(f => usableFloor(f, width, height)).filter((f): f is NonNullable<typeof f> => !!f);
  if (!floors.length) floors = [{ name: "Ground Floor", x: 0, y: 0, width, height }];

  const rooms = dedupeRooms((raw.rooms || []).map(r => ({
    ...r,
    floorIndex: Number.isFinite(Number(r.floorIndex)) ? Number(r.floorIndex) : 0,
    x: Number(r.x) / scale, y: Number(r.y) / scale, width: Number(r.width) / scale, height: Number(r.height) / scale,
    polygon: validPolygon({ ...r, x: Number(r.x) / scale, y: Number(r.y) / scale, width: Number(r.width) / scale, height: Number(r.height) / scale }),
  })).filter(r => validRoom(r, width, height) && !!r.polygon));

  cacheKey = key;
  cache = { ...raw, floors, rooms };
  console.log(`Vision detection complete: ${floors.length} floor(s), ${rooms.length} room(s), ${raw.changes?.length || 0} strategy change(s) in one AI pass`);
  return floorResult(cache, width, height);
}

export function getVisionDetectedRooms(filePath: string): DetectedRoom[] | null {
  if (!cache || cacheKey !== `${filePath}:${fs.statSync(filePath).size}:${fs.statSync(filePath).mtimeMs}:${""}:${""}` && !cacheKey.startsWith(`${filePath}:`)) return null;
  const rooms = dedupeRooms(cache.rooms || []);
  const perFloorCount = new Map<number, number>();
  return rooms.map(room => {
    const floorIndex = Number(room.floorIndex || 0);
    const ordinal = (perFloorCount.get(floorIndex) || 0) + 1;
    perFloorCount.set(floorIndex, ordinal);
    const prefix = String(cache?.floors?.[floorIndex]?.name || `Floor ${floorIndex + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `floor-${floorIndex + 1}`;
    return {
      id: `${prefix}-room-${ordinal}`,
      x: Number(room.x), y: Number(room.y), width: Number(room.width), height: Number(room.height), polygon: validPolygon(room),
      ...(room.name ? { name: String(room.name) } : {}), ...(room.type ? { type: String(room.type) } : {}), ...(room.confidence ? { confidence: String(room.confidence) } : {}),
      ...(Number(room.areaSqm) > 0 ? { approxAreaSqm: Number(room.areaSqm) } : {}), ...(Number(room.widthM) > 0 ? { approxWidthM: Number(room.widthM) } : {}), ...(Number(room.depthM) > 0 ? { approxDepthM: Number(room.depthM) } : {}),
    } as DetectedRoom & Record<string, unknown>;
  });
}

export function getVisionStrategy(): { changes: VisionChange[]; strategy: Record<string, unknown> } {
  return { changes: Array.isArray(cache?.changes) ? cache!.changes : [], strategy: cache?.strategy || {} };
}
