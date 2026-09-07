import fs from "fs";
import sharp from "sharp";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";
import { openai, parseAIJson } from "@/lib/openai";

interface VisionRoomDetectionResponse {
  rooms: Array<{
    id: string;
    name?: string;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    polygon?: Array<{ x: number; y: number }>;
    openingWalls?: string[];
  }>;
  totalRoomsDetected: number;
  confidence: string;
  notes?: string;
}

/**
 * Detect individual rooms/spaces within each floor using vision analysis.
 * Returns DetectedRoom objects with bounding boxes and optional polygons.
 */
export async function detectRooms(
  filePath: string,
  floors: DetectedFloor[]
): Promise<DetectedRoom[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Floor plan file not found: ${filePath}`);
  }

  if (!floors || floors.length === 0) {
    throw new Error("No floors provided for room detection");
  }

  const image = fs.readFileSync(filePath);
  const base64 = image.toString("base64");

  const metadata = await sharp(filePath).metadata();
  const imageHeight = metadata.height || 1200;
  const mimeType = filePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : filePath.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  const floorsList = floors
    .map((f) => `- ${f.name} (level ${f.level}): pixels ${f.top} to ${f.bottom}`)
    .join("\n");

  const prompt = `You are a professional architectural plan analyst.

Analyse this floor plan and identify all distinct rooms, spaces, and enclosed areas.

For each room:
- Assign a unique ID (room1, room2, etc.)
- Provide approximate bounding box (x, y, width, height in pixels)
- List which walls have doors or windows (top, bottom, left, right)
- If possible, provide the exact polygon vertices (array of {x, y} points)

Floors in this image:
${floorsList}

Return ONLY valid JSON with no markdown, explanation, or additional text.

{
  "rooms": [
    {
      "id": "room1",
      "name": "Bedroom",
      "bounds": {
        "x": 100,
        "y": 50,
        "width": 400,
        "height": 350
      },
      "polygon": [
        {"x": 100, "y": 50},
        {"x": 500, "y": 50},
        {"x": 500, "y": 400},
        {"x": 100, "y": 400}
      ],
      "openingWalls": ["left", "top"]
    }
  ],
  "totalRoomsDetected": 1,
  "confidence": "High",
  "notes": "Optional observations"
}`;

  let textContent: string;
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      max_output_tokens: 3000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    textContent = response.output_text;
  } catch (error: any) {
    const reason = error?.name === "AbortError" || /timed out|timeout|aborted/i.test(String(error?.message))
      ? "the room-detection vision request exceeded its time budget"
      : String(error?.message || error);
    throw new Error(`Room detection vision request failed: ${reason}`);
  }

  if (typeof textContent !== "string" || !textContent.trim()) {
    throw new Error("Room detection vision request returned an empty response.");
  }

  const parsed = parseAIJson<VisionRoomDetectionResponse>(textContent);

  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    throw new Error(
      "Room detection vision request did not identify any enclosed rooms in the uploaded floor plan."
    );
  }

  const result: DetectedRoom[] = parsed.rooms.map((room, idx) => ({
    id: room.id || `room${idx + 1}`,
    x: room.bounds?.x ?? 0,
    y: room.bounds?.y ?? 0,
    width: room.bounds?.width ?? 300,
    height: room.bounds?.height ?? 250,
    polygon: room.polygon
      ? (room.polygon as Point[])
      : undefined,
    openingWalls: room.openingWalls as any,
  }));

  console.log(`[detectRooms] Detected ${result.length} room(s) from vision`);
  return result;
}
