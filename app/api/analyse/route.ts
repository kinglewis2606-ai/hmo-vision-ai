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

type WallSide = "top" | "bottom" | "left" | "right";
type RoomLabel = { roomId?: string; name?: string; type?: string; floor?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number; windows?: WallSide[]; doors?: WallSide[]; [key: string]: unknown };

function norm(v: unknown): string { return String(v ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
function isBedroom(v: unknown): boolean { return norm(v).includes("bedroom"); }
function isBathroom(v: unknown): boolean { const x = norm(v); return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x === "wc" || x.includes("toilet"); }
function isBedroomChange(c: any): boolean { return norm(c?.action) === "converttobedroom" || String(c?.newType ?? "").toLowerCase().includes("bedroom"); }

function applyLabels(plan: any, labels: RoomLabel[]): void {
  const byId = new Map<string, any>(); for (const f of plan.floors) for (const r of f.rooms) byId.set(r.id, r);
  for (const l of labels) {
    const r = byId.get(String(l.roomId ?? "")); if (!r) continue;
    if (l.name) r.name = String(l.name);
    if (l.type) r.type = String(l.type);
    if (l.confidence) r.confidence = String(l.confidence);
    if (Array.isArray(l.windows)) r.windows = l.windows.filter((w): w is WallSide => ["top", "bottom", "left", "right"].includes(w));
    if (Array.isArray(l.doors)) r.doors = l.doors.filter((d): d is WallSide => ["top", "bottom", "left", "right"].includes(d)).map(wall => ({ wall }));
  }
}

function noOpChange(c: any, plan: any): boolean {
  const action = norm(c?.action); if (!action || action === "nochange") return true;
  const room = plan.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === String(c?.roomId ?? ""));
  if (!room) return true;
  if (action === "splitroom" || action === "converttoensuite") return false;
  const current = norm(room.type), target = norm(c?.newType || (action === "converttobedroom" ? "bedroom" : action === "converttokitchen" ? "kitchen" : action === "converttobathroom" ? "bathroom" : ""));
  if (!target) return false;
  if (target.includes("bedroom")) return current.includes("bedroom");
  if (target.includes("bath") || target.includes("shower") || target.includes("ensuite") || target === "wc" || target.includes("toilet")) return isBathroom(room.type);
  return target === current;
}

function addBestRoomConversions(plan: any, labels: RoomLabel[], changes: any[], result: any): any[] {
  const output = [...changes];
  const byId = new Map<string, RoomLabel>(); for (const l of labels) byId.set(String(l.roomId ?? ""), l);
  const existing = labels.filter(l => isBedroom(l.type)).length;
  const converted = new Set(output.filter(isBedroomChange).map(c => String(c.roomId ?? "")));
  const candidates = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => ({ r, floor: f.name, l: byId.get(r.id) })))
    .filter((x: any) => x.l && !isBedroom(x.l.type))
    .filter((x: any) => ["lounge", "living", "reception"].some(k => norm(x.l.type).includes(k)))
    .filter((x: any) => Number(x.r.approxAreaSqm || 0) >= 6.51 && !converted.has(x.r.id));
  const hasKitchen = labels.some(l => norm(l.type).includes("kitchen"));
  const hasDining = labels.some(l => norm(l.type).includes("dining"));
  let proposedCount = existing + output.filter(isBedroomChange).filter(c => !isBedroom(byId.get(String(c.roomId))?.type)).length;
  for (const x of candidates.sort((a: any, b: any) => Number(b.r.approxAreaSqm || 0) - Number(a.r.approxAreaSqm || 0))) {
    if (proposedCount >= 6) break;
    if (!hasKitchen || (!hasDining && candidates.length <= 1 && proposedCount >= 5)) continue;
    output.push({ roomId: x.r.id, action: "ConvertToBedroom", newName: `Bedroom ${proposedCount + 1}`, newType: "bedroom", reason: `Viable ${x.l.name || x.l.type} conversion based on detected geometry while retaining communal kitchen${hasDining ? " and dining" : ""}.` });
    converted.add(x.r.id); proposedCount++;
  }
  result.summary = { ...(result.summary || {}), possibleHMOBedrooms: Math.max(Number(result.summary?.possibleHMOBedrooms) || 0, proposedCount) };
  if (proposedCount > existing) result.highestPossibleHMO = { bedrooms: proposedCount, score: Number(result.hmoScore || 0), reason: "Selected from detected viable living/reception geometry rather than fixed room IDs." };
  return output;
}

function addSafeEnsuites(plan: any, labels: RoomLabel[], changes: any[]): any[] {
  const output = [...changes];
  const byId = new Map<string, RoomLabel>(); for (const l of labels) byId.set(String(l.roomId ?? ""), l);
  for (const floor of plan.floors) for (const room of floor.rooms) {
    const label = byId.get(room.id); if (!label || !isBedroom(label.type)) continue;
    const area = Number(label.areaSqm || room.approxAreaSqm || 0); if (area < 18) continue;
    if (output.some(c => String(c.roomId) === room.id && (norm(c.action) === "splitroom" || norm(c.action) === "converttoensuite"))) continue;
    const windows: WallSide[] = Array.isArray(label.windows) ? label.windows : [];
    if (windows.length === 0) continue;
    const hasTop = windows.includes("top"), hasBottom = windows.includes("bottom"), hasLeft = windows.includes("left"), hasRight = windows.includes("right");
    let direction: "horizontal" | "vertical";
    if (hasTop !== hasBottom) direction = "horizontal";
    else if (hasLeft !== hasRight) direction = "vertical";
    else continue;
    output.push({ roomId: room.id, action: "SplitRoom", reason: `Internal ensuite for ${label.name || room.id}; detected window wall ${windows.join(", ")} is retained with the bedroom and the ensuite is placed at the opposite/internal end.`, split: { firstName: label.name || room.name || "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite", direction, firstRatio: 0.72 } });
  }
  return output;
}

function annotatedImage(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath); const width = plan.metadata?.imageWidth || 1600, height = plan.metadata?.imageHeight || 1200;
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("\n");
  const mime = path.extname(filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:${mime};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer().then(b => `data:image/png;base64,${b.toString("base64")}`);
}

export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });
    const floors = await detectFloors(filePath), detectedRooms = await detectRooms(filePath, floors);
    const original = buildOriginalFloorPlan(floors, detectedRooms), meta = await sharp(filePath).metadata();
    original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const image = await annotatedImage(filePath, original);
    const response = await openai.responses.create({ model: "gpt-5", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const cleaned = (response.output_text || "").replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    const result = JSON.parse(cleaned), labels: RoomLabel[] = Array.isArray(result.roomLabels) ? result.roomLabels : [];
    const labelled = structuredClone(original); applyLabels(labelled, labels);
    const roomsById = new Map<string, { room: any; floor: string }>(); for (const f of original.floors) for (const r of f.rooms) roomsById.set(r.id, { room: r, floor: f.name });
    const labelsById = new Map<string, RoomLabel>(); for (const l of labels) labelsById.set(String(l.roomId ?? ""), l);
    const requested = Array.isArray(result.changes) ? result.changes : [];
    const valid = requested.filter((c: any) => { const id = String(c?.roomId || ""); if (!roomsById.has(id) || noOpChange(c, labelled)) return false; const l = labelsById.get(id); if (l?.floor && String(l.floor).toLowerCase() !== String(roomsById.get(id)!.floor).toLowerCase()) return false; return true; });
    const withConversions = addBestRoomConversions(labelled, labels, valid, result);
    const finalChanges = addSafeEnsuites(labelled, labels, withConversions);
    const proposed = applyRoomChanges(labelled, finalChanges);
    const appliedChanges = finalChanges.filter((c: any) => { const before = roomsById.get(String(c.roomId))?.room; if (!before) return false; if (norm(c.action) === "splitroom" || norm(c.action) === "converttoensuite") return proposed.floors.some((f: any) => f.rooms.some((r: any) => r.id === `${before.id}-split-2`)); const after = proposed.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === before.id); return !!after && (after.type !== before.type || after.name !== before.name); });
    result.changes = appliedChanges; result.originalFloorPlan = original; result.proposedFloorPlan = proposed;
    result.generatedLayoutImage = renderFloorPlan(labelled, proposed, `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`, appliedChanges);
    return NextResponse.json({ success: true, result });
  } catch (error: any) { console.error("ANALYSE ERROR:", error); return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 }); }
}
