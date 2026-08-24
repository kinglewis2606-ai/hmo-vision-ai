import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedRoom, Point } from "@/lib/types/floorPlan";

const cleanJson = (v: string) => v.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

function boxPolygon(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function valid(x: number, y: number, width: number, height: number, imageWidth: number, imageHeight: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height) && width >= 25 && height >= 25 && x >= 0 && y >= 0 && x + width <= imageWidth + 2 && y + height <= imageHeight + 2;
}

function intersectionOverUnion(a: DetectedRoom, b: DetectedRoom): number {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y), right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export async function recoverRooms(imagePath: string, existing: DetectedRoom[] = []): Promise<DetectedRoom[]> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0, height = metadata.height || 0;
  if (!width || !height) return existing;

  const source = fs.readFileSync(imagePath);
  const scale = Math.min(1, 2200 / Math.max(width, height));
  const iw = Math.max(1, Math.round(width * scale)), ih = Math.max(1, Math.round(height * scale));
  const image = await sharp(source).resize({ width: iw, height: ih, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 96, mozjpeg: true }).toBuffer();

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      text: { format: { type: "json_object" } },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `RECOVERY PASS FOR AN ARCHITECTURAL FLOOR PLAN. The primary detector missed rooms. Inspect the COMPLETE supplied floor-plan image carefully. Detect EVERY distinct enclosed room bounded by visible wall lines. This is geometry detection, not room classification.

Rules:
- Never merge two rooms separated by a visible internal wall.
- Never treat a landing, staircase, corridor or hall as part of an adjacent bedroom.
- Include every bedroom separately, including upper floors.
- Include every kitchen, living room, lounge, dining room, bathroom, shower room and WC.
- Small wet rooms count.
- Ignore furniture, text, dimensions, compass, logos and blank margins.
- Do not invent a room merely because a label exists; visible enclosing walls must support the box.
- Return a conservative interior bounding box for each room.
- Return rooms in approximate top-to-bottom, then left-to-right order.
- floorIndex is 0 for the top/first visible floor-plan panel, 1 for the next, 2 for the next, etc. If the plan is arranged horizontally, identify the panel containing the room by its horizontal position.

Return JSON only: {"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0}]}. Coordinates are pixels in the supplied ${iw}x${ih} image.` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" },
        ],
      }],
    });

    const parsed = JSON.parse(cleanJson(response.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return existing;

    const sx = width / iw, sy = height / ih;
    const recovered: DetectedRoom[] = parsed.rooms.map((q: any, index: number) => {
      const x = Number(q.x) * sx, y = Number(q.y) * sy, roomWidth = Number(q.width) * sx, roomHeight = Number(q.height) * sy;
      return { id: `recovery-room-${index + 1}`, x, y, width: roomWidth, height: roomHeight, polygon: boxPolygon(x, y, roomWidth, roomHeight) };
    }).filter((r: DetectedRoom) => valid(r.x, r.y, r.width, r.height, width, height));

    const merged = [...existing];
    for (const candidate of recovered) {
      if (merged.some(existingRoom => intersectionOverUnion(existingRoom, candidate) >= 0.65)) continue;
      merged.push(candidate);
    }

    console.log(`Vision recovery room pass: primary=${existing.length}, recovered=${recovered.length}, merged=${merged.length}`);
    return merged;
  } catch (error) {
    console.warn("Vision recovery room pass failed; retaining primary geometry", error);
    return existing;
  }
}
