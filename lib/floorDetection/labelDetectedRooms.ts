import fs from "fs";
import { DetectedRoom, RoomLabel } from "@/lib/types/floorPlan";
import { openai, parseAIJson, OPENAI_REQUEST_TIMEOUT_MS } from "@/lib/openai";

interface VisionRoomLabelingResponse {
  labels: Array<{
    roomId: string;
    name: string;
    type: string;
    areaSqm?: number;
    widthM?: number;
    depthM?: number;
    confidence?: string;
    notes?: string;
  }>;
  confidenceOverall: string;
  notes?: string;
}

/**
 * Assign labels and room types to detected rooms using vision analysis.
 * Returns RoomLabel objects for each detected room.
 */
export async function labelDetectedRooms(
  filePath: string,
  detectedRooms: DetectedRoom[]
): Promise<RoomLabel[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Floor plan file not found: ${filePath}`);
  }

  if (!detectedRooms || detectedRooms.length === 0) {
    console.warn("[labelDetectedRooms] No rooms to label");
    return [];
  }

  const image = fs.readFileSync(filePath);
  const base64 = image.toString("base64");
  const mimeType = filePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : filePath.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  const roomsList = detectedRooms
    .map(
      (r, idx) =>
        `- Room ${idx + 1} (id: ${r.id}): bounds (${r.x},${r.y}) to (${r.x + r.width},${r.y + r.height}), size ~${Math.round((r.width * r.height) / 10000)}m²`
    )
    .join("\n");

  const prompt = `You are a professional UK property surveyor and HMO consultant.

You have already identified the following rooms in this floor plan:

${roomsList}

Now classify each room by its type and purpose. Common types:
- bedroom
- living room / lounge / reception
- dining room / diner
- kitchen
- bathroom / ensuite
- shower room
- toilet / WC
- hallway / landing / circulation
- stairs
- storage / cupboard
- utility / laundry
- other

For each room, estimate:
- Approximate area in square meters
- Approximate width and depth in meters
- Confidence level (High, Medium, Low)

Return ONLY valid JSON with no markdown, explanation, or additional text.

{
  "labels": [
    {
      "roomId": "room1",
      "name": "Main Bedroom",
      "type": "bedroom",
      "areaSqm": 15.5,
      "widthM": 4.5,
      "depthM": 3.5,
      "confidence": "High",
      "notes": "Optional observations"
    }
  ],
  "confidenceOverall": "High",
  "notes": "Optional observations about the floor plan"
}`;

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-4o-mini",
        timeout: OPENAI_REQUEST_TIMEOUT_MS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      },
      {
        timeout: OPENAI_REQUEST_TIMEOUT_MS,
      }
    );

    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent !== "string") {
      throw new Error("Vision returned non-text response for room labeling");
    }

    const parsed = parseAIJson<VisionRoomLabelingResponse>(textContent);

    if (!Array.isArray(parsed.labels) || parsed.labels.length === 0) {
      console.warn(
        "[labelDetectedRooms] No labels returned by vision, creating defaults"
      );
      return detectedRooms.map((room, idx) => ({
        roomId: room.id,
        name: `Room ${idx + 1}`,
        type: "other",
        confidence: "Low",
      }));
    }

    const result: RoomLabel[] = parsed.labels
      .map((label) => ({
        roomId: label.roomId,
        name: label.name || `Room ${label.roomId}`,
        type: label.type || "other",
        areaSqm: label.areaSqm,
        widthM: label.widthM,
        depthM: label.depthM,
        confidence: label.confidence,
      }))
      .filter((label) => detectedRooms.some((r) => r.id === label.roomId));

    console.log(`[labelDetectedRooms] Labeled ${result.length} room(s)`);
    return result;
  } catch (error: any) {
    console.error(
      `[labelDetectedRooms] Vision request failed: ${error?.message || error}`
    );
    console.warn("[labelDetectedRooms] Creating default labels");
    return detectedRooms.map((room, idx) => ({
      roomId: room.id,
      name: `Room ${idx + 1}`,
      type: "other",
      confidence: "Low",
    }));
  }
}
