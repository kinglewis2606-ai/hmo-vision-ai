import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";

type VisionRoom = { floorIndex?: number; x?: number; y?: number; width?: number; height?: number; polygon?: Point[] };
type VisionFloor = { name?: string; x?: number; y?: number; width?: number; height?: number };
type VisionPlan = { floors?: VisionFloor[]; rooms?: VisionRoom[] };

let cacheKey = "";
let cache: VisionPlan | null = null;
const cleanJson = (v: string) => v.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

function validRoom(r: VisionRoom, w: number, h: number) {
  const x = Number(r.x), y = Number(r.y), rw = Number(r.width), rh = Number(r.height);
  return [x, y, rw, rh].every(Number.isFinite) && rw >= 20 && rh >= 20 && x >= 0 && y >= 0 && x + rw <= w + 2 && y + rh <= h + 2;
}

function validPolygon(r: VisionRoom): Point[] | undefined {
  if (!Array.isArray(r.polygon) || r.polygon.length < 3) return;
  const x = Number(r.x), y = Number(r.y), right = x + Number(r.width), bottom = y + Number(r.height);
  const p = r.polygon.map(q => ({ x: Number(q.x), y: Number(q.y) }));
  return p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y) && q.x >= x - 3 && q.y >= y - 3 && q.x <= right + 3 && q.y <= bottom + 3) ? p : undefined;
}

function boxPolygon(r: VisionRoom): Point[] | undefined {
  const x = Number(r.x), y = Number(r.y), width = Number(r.width), height = Number(r.height);
  if (![x, y, width, height].every(Number.isFinite) || width < 20 || height < 20) return;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function usableFloor(f: VisionFloor, width: number, height: number): VisionFloor | undefined {
  const x = Math.max(0, Math.round(Number(f.x ?? 0))), y = Math.max(0, Math.round(Number(f.y ?? 0)));
  const right = Math.min(width, Math.round(x + Number(f.width ?? 0))), bottom = Math.min(height, Math.round(y + Number(f.height ?? 0)));
  if (right - x < 40 || bottom - y < 40) return;
  return { name: f.name, x, y, width: right - x, height: bottom - y };
}

async function detectFloorPanels(filePath: string, width: number, height: number): Promise<VisionFloor[]> {
  const source = fs.readFileSync(filePath), scale = Math.min(1, 1800 / Math.max(width, height));
  const iw = Math.max(1, Math.round(width * scale)), ih = Math.max(1, Math.round(height * scale));
  const image = await sharp(source).resize({ width: iw, height: ih, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  try {
    const r = await openai.responses.create({
      model: "gpt-5-mini",
      text: { format: { type: "json_object" } },
      input: [{ role: "user", content: [
        { type: "input_text", text: `Detect ONLY distinct architectural floor-plan panels. A panel is the visible drawing area for one floor, not an individual room. Ignore furniture, labels, compass, watermarks and blank margins. If the image contains one floor plan, return exactly one panel covering the complete architectural drawing. Preserve vertical order for multiple floors. Coordinates are pixels in the supplied ${iw}x${ih} image. Return JSON only: {"floors":[{"name":"Ground Floor","x":0,"y":0,"width":0,"height":0}]}.` },
        { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
      ] }],
    });
    const parsed = JSON.parse(cleanJson(r.output_text || "{}"));
    return Array.isArray(parsed.floors) ? parsed.floors : [];
  } catch (e) {
    console.warn("Floor panel detection failed; using full-image fallback", e);
    return [];
  }
}

async function detectRoomsPerFloor(filePath: string, width: number, height: number, floor: VisionFloor, floorIndex: number): Promise<VisionRoom[]> {
  const left = Math.max(0, Math.round(Number(floor.x || 0))), top = Math.max(0, Math.round(Number(floor.y || 0)));
  const fw = Math.min(width - left, Math.round(Number(floor.width || 0))), fh = Math.min(height - top, Math.round(Number(floor.height || 0)));
  if (fw < 40 || fh < 40) return [];
  const source = fs.readFileSync(filePath), scale = Math.min(1, 1800 / Math.max(fw, fh));
  const iw = Math.max(1, Math.round(fw * scale)), ih = Math.max(1, Math.round(fh * scale));
  const crop = await sharp(source).extract({ left, top, width: fw, height: fh }).resize({ width: iw, height: ih, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  const sx = fw / iw, sy = fh / ih;
  try {
    const r = await openai.responses.create({
      model: "gpt-5-mini",
      text: { format: { type: "json_object" } },
      input: [{ role: "user", content: [
        { type: "input_text", text: `You are the PRIMARY architectural room-boundary detector for ONE floor only. Detect EVERY genuinely enclosed room visible in this crop. A room is bounded by visible internal/external wall lines. NEVER merge two rooms separated by a visible internal wall. NEVER include a landing, staircase, corridor, WC, shower room or another room inside a bedroom. Include every real enclosed WC, bathroom and shower room, including small ones. Do not use room text, furniture, compass, watermark or blank space as geometry. Do not invent rooms or split one enclosed room into multiple rooms. Door openings do not make two adjacent rooms one room; follow wall boundaries. Follow recesses where clearly visible. Return separately labelled bedrooms separately. Return each room with a bounding box and, when possible, a polygon following the wall boundary. If polygon tracing is uncertain, still return the correct bounding box. JSON only: {"rooms":[{"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}]}]}. Coordinates are pixels in this ${iw}x${ih} crop.` },
        { type: "input_image", image_url: `data:image/jpeg;base64,${crop.toString("base64")}`, detail: "high" },
      ] }],
    });
    const parsed = JSON.parse(cleanJson(r.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return [];
    return parsed.rooms.map((q: any) => {
      const base: VisionRoom = {
        floorIndex,
        x: Number(q.x) * sx + left,
        y: Number(q.y) * sy + top,
        width: Number(q.width) * sx,
        height: Number(q.height) * sy,
        polygon: Array.isArray(q.polygon) ? q.polygon.map((v: any) => ({ x: Number(v.x) * sx + left, y: Number(v.y) * sy + top })) : undefined,
      };
      if (!base.polygon) base.polygon = boxPolygon(base);
      return base;
    }).filter((q: VisionRoom) => validRoom(q, width, height) && !!validPolygon(q));
  } catch (e) {
    console.warn(`Room detection failed on floor ${floorIndex + 1}`, e);
    return [];
  }
}

async function fallbackWholeImageRoomDetection(filePath: string, width: number, height: number): Promise<VisionRoom[]> {
  const source = fs.readFileSync(filePath);
  const image = await sharp(source).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  const meta = await sharp(image).metadata();
  const iw = meta.width || width, ih = meta.height || height;
  const sx = width / iw, sy = height / ih;
  try {
    const r = await openai.responses.create({
      model: "gpt-5-mini",
      text: { format: { type: "json_object" } },
      input: [{ role: "user", content: [
        { type: "input_text", text: `Emergency room-detection pass. The previous architectural detector returned zero usable rooms. Inspect the COMPLETE floor-plan image and identify every distinct enclosed room that is actually bounded by visible walls. Do not rely on labels alone. Do not merge rooms across visible internal walls. Include bedrooms, living rooms, dining rooms, kitchens, bathrooms, shower rooms and WCs. Ignore blank margins, furniture, text, dimensions, compass and title blocks. For each room return a conservative bounding box covering the room interior. Do not return a room unless its enclosing wall boundary is visibly traceable. Return JSON only: {"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0}]}. Coordinates are pixels in the supplied ${iw}x${ih} image.` },
        { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
      ] }],
    });
    const parsed = JSON.parse(cleanJson(r.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return [];
    return parsed.rooms.map((q: any) => {
      const room: VisionRoom = { floorIndex: Number.isFinite(Number(q.floorIndex)) ? Number(q.floorIndex) : 0, x: Number(q.x) * sx, y: Number(q.y) * sy, width: Number(q.width) * sx, height: Number(q.height) * sy };
      room.polygon = boxPolygon(room);
      return room;
    }).filter((q: VisionRoom) => validRoom(q, width, height) && !!q.polygon);
  } catch (e) {
    console.warn("Emergency whole-image room detection failed", e);
    return [];
  }
}

async function verifyRooms(filePath: string, plan: VisionPlan, width: number, height: number): Promise<VisionPlan> {
  const rooms = (plan.rooms || []).filter(r => validRoom(r, width, height)).map(r => ({ ...r, polygon: validPolygon(r) || boxPolygon(r) })).filter(r => r.polygon);
  if (!rooms.length) return { ...plan, rooms: [] };
  const source = fs.readFileSync(filePath), image = await sharp(source).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const candidates = rooms.map((r, i) => ({ candidateId: i + 1, floorIndex: r.floorIndex, x: Math.round(Number(r.x)), y: Math.round(Number(r.y)), width: Math.round(Number(r.width)), height: Math.round(Number(r.height)) }));
  try {
    const r = await openai.responses.create({
      model: "gpt-5-mini",
      text: { format: { type: "json_object" } },
      input: [{ role: "user", content: [
        { type: "input_text", text: `Quality-control audit only. For EACH supplied candidate, decide whether it overlays ONE real enclosed architectural room in the original floor plan. Reject only obvious false positives: blank space, furniture-only regions, compass/watermark areas, merged rooms crossing a visible internal wall, or geometry that clearly contains another separate room. Do NOT invent, move, resize or redraw candidates. Return ONLY candidateId and valid. JSON only: {"rooms":[{"candidateId":1,"valid":true}]}. Candidates: ${JSON.stringify(candidates)}` },
        { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
      ] }],
    });
    const parsed = JSON.parse(cleanJson(r.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return { ...plan, rooms };
    const acceptedIds = new Set<number>(parsed.rooms.filter((q: any) => q && q.valid === true && Number.isInteger(Number(q.candidateId))).map((q: any) => Number(q.candidateId)).filter((id: number) => id >= 1 && id <= rooms.length));
    const minimumAccepted = Math.max(1, Math.ceil(rooms.length * 0.5));
    if (acceptedIds.size < minimumAccepted) {
      console.warn(`Room verification rejected too many candidates (${acceptedIds.size}/${rooms.length}); retaining primary geometry`);
      return { ...plan, rooms };
    }
    return { ...plan, rooms: rooms.filter((_, index) => acceptedIds.has(index + 1)) };
  } catch (e) {
    console.warn("Room geometry verification failed; retaining primary geometry", e);
    return { ...plan, rooms };
  }
}

function floorResult(plan: VisionPlan, width: number, height: number): DetectedFloor[] {
  return (plan.floors || []).map((f, i) => ({
    name: f.name || `Floor ${i + 1}`,
    level: i,
    top: Math.max(0, Math.round(Number(f.y || 0))),
    left: Math.max(0, Math.round(Number(f.x || 0))),
    bottom: Math.min(height, Math.round(Number(f.y || 0) + Number(f.height || 0))),
    right: Math.min(width, Math.round(Number(f.x || 0) + Number(f.width || 0))),
  }));
}

export async function detectFloors(filePath: string): Promise<DetectedFloor[]> {
  const m = await sharp(filePath).metadata(), width = m.width ?? 0, height = m.height ?? 0;
  if (!width || !height) return [];
  const stat = fs.statSync(filePath), currentKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  if (cacheKey === currentKey && cache?.floors?.length) return floorResult(cache, width, height);
  try {
    const raw = await detectFloorPanels(filePath, width, height), scale = Math.min(1, 1800 / Math.max(width, height));
    let floors = raw.map(f => ({ ...f, x: Number(f.x || 0) / scale, y: Number(f.y || 0) / scale, width: Number(f.width || 0) / scale, height: Number(f.height || 0) / scale })).map(f => usableFloor(f, width, height)).filter((f): f is VisionFloor => !!f);
    if (!floors.length) {
      console.warn("No floor panel detected; using full-image architectural panel fallback");
      floors = [{ name: "Ground Floor", x: 0, y: 0, width, height }];
    }
    let rooms: VisionRoom[] = [];
    for (let i = 0; i < floors.length; i++) rooms.push(...await detectRoomsPerFloor(filePath, width, height, floors[i], i));
    if (!rooms.length) {
      console.warn("Primary room detector returned zero rooms; running emergency whole-image room detection");
      rooms = await fallbackWholeImageRoomDetection(filePath, width, height);
      if (rooms.length && floors.length === 1) rooms = rooms.map(r => ({ ...r, floorIndex: 0 }));
    }
    const primary: VisionPlan = { floors, rooms }, plan = rooms.length ? await verifyRooms(filePath, primary, width, height) : primary;
    cacheKey = currentKey;
    cache = plan;
    console.log(`Vision floor recognition: ${floors.length} floor(s), ${plan.rooms?.length || 0} room(s)`);
    return floorResult(plan, width, height);
  } catch (e) {
    console.warn("Vision floor/room detection failed", e);
    cacheKey = currentKey;
    cache = { floors: [], rooms: [] };
    return [];
  }
}

export function getVisionDetectedRooms(filePath: string): DetectedRoom[] | null {
  const stat = (() => { try { return fs.statSync(filePath); } catch { return null; } })(), currentKey = stat ? `${filePath}:${stat.size}:${stat.mtimeMs}` : filePath;
  if (cacheKey !== currentKey || !cache) return null;
  return (cache.rooms || []).map((r, i) => {
    const x = Math.round(Number(r.x) || 0), y = Math.round(Number(r.y) || 0), width = Math.round(Number(r.width) || 0), height = Math.round(Number(r.height) || 0), polygon = validPolygon(r) || boxPolygon(r);
    return { id: `room-${i + 1}`, x, y, width, height, ...(polygon ? { polygon } : {}) };
  }).filter(r => r.width >= 20 && r.height >= 20);
}
