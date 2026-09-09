import fs from "fs";
import { DetectedRoom, RoomLabel } from "@/lib/types/floorPlan";
import { openai, parseAIJson, OPENAI_REQUEST_TIMEOUT_MS } from "@/lib/openai";

interface VisionRoomLabelingResponse {
  labels: Array<{ roomId: string; name: string; type: string; areaSqm?: number; widthM?: number; depthM?: number; confidence?: string; notes?: string }>;
  confidenceOverall: string;
  notes?: string;
}

export async function labelDetectedRooms(filePath: string, detectedRooms: DetectedRoom[]): Promise<RoomLabel[]> {
  if (!fs.existsSync(filePath)) throw new Error(`Floor plan file not found: ${filePath}`);
  if (!detectedRooms || detectedRooms.length === 0) return [];

  const base64 = fs.readFileSync(filePath).toString("base64");
  const mimeType = filePath.toLowerCase().endsWith(".png") ? "image/png" : filePath.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
  const roomsList = detectedRooms.map((r, idx) => `- Room ${idx + 1} (id: ${r.id}): bounds (${r.x},${r.y}) to (${r.x + r.width},${r.y + r.height}), size ~${Math.round((r.width * r.height) / 10000)}m²`).join("\n");
  const prompt = `You are a professional UK property surveyor and HMO consultant.

You have already identified the following rooms in this floor plan:

${roomsList}

Classify each room as bedroom, living room, dining room, kitchen, bathroom, shower room, toilet/WC, hallway/landing/circulation, stairs, storage, utility/laundry, or other. Estimate area in square meters, width and depth in meters, and confidence.

Return ONLY valid JSON with no markdown, explanation, or additional text.

{"labels":[{"roomId":"room1","name":"Main Bedroom","type":"bedroom","areaSqm":15.5,"widthM":4.5,"depthM":3.5,"confidence":"High"}],"confidenceOverall":"High"}`;

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-4o-mini",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${mimeType};base64,${base64}`, detail: "high" },
          ],
        }],
        max_output_tokens: 2000,
      },
      { timeout: OPENAI_REQUEST_TIMEOUT_MS }
    );

    const textContent = response.output_text;
    if (typeof textContent !== "string" || !textContent.trim()) throw new Error("Vision returned non-text response for room labeling");
    const parsed = parseAIJson<VisionRoomLabelingResponse>(textContent);

    if (!Array.isArray(parsed.labels) || parsed.labels.length === 0) {
      return detectedRooms.map((room, idx) => ({ roomId: room.id, name: `Room ${idx + 1}`, type: "other", confidence: "Low" }));
    }

    return parsed.labels
      .map((label) => ({ roomId: label.roomId, name: label.name || `Room ${label.roomId}`, type: label.type || "other", areaSqm: label.areaSqm, widthM: label.widthM, depthM: label.depthM, confidence: label.confidence }))
      .filter((label) => detectedRooms.some((r) => r.id === label.roomId));
  } catch (error: any) {
    console.error(`[labelDetectedRooms] Vision request failed: ${error?.message || error}`);
    return detectedRooms.map((room, idx) => ({ roomId: room.id, name: `Room ${idx + 1}`, type: "other", confidence: "Low" }));
  }
}
