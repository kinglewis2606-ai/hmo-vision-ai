import fs from "fs";
import { DetectedFloor } from "@/lib/types/floorPlan";
import { openai, parseAIJson, OPENAI_REQUEST_TIMEOUT_MS } from "@/lib/openai";

interface VisionFloorDetectionResponse {
  floors: Array<{
    name: string;
    level: number;
    boundaries?: {
      top: number;
      bottom: number;
      left?: number;
      right?: number;
    };
  }>;
  confidence: string;
  notes?: string;
}

interface VisionStrategyResponse {
  strategy?: {
    hmoScore?: number;
    investmentRating?: string;
    recommendations?: string[];
    compliance?: string[];
  };
  changes: Array<{
    roomIndex: number;
    action: string;
    newName?: string;
    newType?: string;
    reason?: string;
    split?: {
      firstName?: string;
      firstType?: string;
      secondName?: string;
      secondType?: string;
      direction?: "vertical" | "horizontal";
      firstRatio?: number;
    };
  }>;
}

let cachedVisionStrategy: VisionStrategyResponse | null = null;

export async function detectFloors(
  filePath: string,
  context?: { address?: string; propertyType?: string }
): Promise<DetectedFloor[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Floor plan file not found: ${filePath}`);
  }

  const image = fs.readFileSync(filePath);
  const base64 = image.toString("base64");
  const mimeType = filePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : filePath.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  const addressContext = context?.address
    ? `\nProperty address: ${context.address}`
    : "";
  const propertyContext = context?.propertyType
    ? `\nProperty type: ${context.propertyType}`
    : "";

  const prompt = `You are a professional architectural plan reader.

Analyse this floor plan and identify all individual floors/levels present.

For each floor:
- Detect the floor name (Ground Floor, First Floor, Second Floor, etc.)
- Assign a numerical level (0 for ground, 1 for first, etc.)
- Identify the vertical bounds (top/bottom pixel coordinates where this floor exists)

Return ONLY valid JSON with no markdown, explanation, or additional text.

${addressContext}${propertyContext}

{
  "floors": [
    {
      "name": "Ground Floor",
      "level": 0,
      "boundaries": {
        "top": 0,
        "bottom": 500
      }
    }
  ],
  "confidence": "High",
  "notes": "Optional observations"
}`;

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-4o-mini",
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
        max_tokens: 1000,
      },
      {
        timeout: OPENAI_REQUEST_TIMEOUT_MS,
      }
    );

    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent !== "string") {
      throw new Error("Vision returned non-text response for floor detection");
    }

    const parsed = parseAIJson<VisionFloorDetectionResponse>(textContent);

    if (!Array.isArray(parsed.floors) || parsed.floors.length === 0) {
      console.warn("[detectFloors] No floors detected by vision, returning default");
      return [{ name: "Ground Floor", level: 0, top: 0, bottom: 1200 }];
    }

    const result: DetectedFloor[] = parsed.floors.map((f) => ({
      name: f.name || `Floor ${f.level}`,
      level: Number.isInteger(f.level) ? f.level : 0,
      top: f.boundaries?.top ?? 0,
      bottom: f.boundaries?.bottom ?? 1200,
      left: f.boundaries?.left,
      right: f.boundaries?.right,
    }));

    console.log(`[detectFloors] Detected ${result.length} floor(s) from vision`);
    return result;
  } catch (error: any) {
    console.error(`[detectFloors] Vision request failed: ${error?.message || error}`);
    console.warn("[detectFloors] Returning fallback single-floor layout");
    return [{ name: "Ground Floor", level: 0, top: 0, bottom: 1200 }];
  }
}

export function getVisionStrategy(): VisionStrategyResponse {
  return cachedVisionStrategy || { strategy: {}, changes: [] };
}

export function setVisionStrategy(strategy: VisionStrategyResponse): void {
  cachedVisionStrategy = strategy;
}
