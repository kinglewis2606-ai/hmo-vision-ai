import fs from "fs";
import { DetectedFloor } from "@/lib/types/floorPlan";
import { openai, parseAIJson } from "@/lib/openai";

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

/**
 * Detect floors in a floor plan image using vision analysis.
 * Returns the list of detected floors with boundaries.
 */
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

  let textContent: string;
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      max_output_tokens: 1000,
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
      ? "the floor-detection vision request exceeded its time budget"
      : String(error?.message || error);
    throw new Error(`Floor detection vision request failed: ${reason}`);
  }

  if (typeof textContent !== "string" || !textContent.trim()) {
    throw new Error("Floor detection vision request returned an empty response.");
  }

  const parsed = parseAIJson<VisionFloorDetectionResponse>(textContent);

  if (!Array.isArray(parsed.floors) || parsed.floors.length === 0) {
    throw new Error("Floor detection vision request did not return any usable floors.");
  }

  const result: DetectedFloor[] = parsed.floors.map((f) => ({
    name: f.name || `Floor ${f.level}`,
    level: Number.isInteger(f.level) ? f.level : 0,
    top: f.boundaries?.top ?? 0,
    bottom: f.boundaries?.bottom ?? 1200,
    left: f.boundaries?.left,
    right: f.boundaries?.right,
  }));

  console.log(
    `[detectFloors] Detected ${result.length} floor(s) from vision`
  );
  return result;
}

/**
 * Get the vision strategy that was cached during floor detection.
 * This is called later during the analysis pipeline.
 */
export function getVisionStrategy(): VisionStrategyResponse {
  return (
    cachedVisionStrategy || {
      strategy: {},
      changes: [],
    }
  );
}

/**
 * Cache the vision strategy for later use in the pipeline.
 * (Internal; called by the analysis orchestrator)
 */
export function setVisionStrategy(strategy: VisionStrategyResponse): void {
  cachedVisionStrategy = strategy;
}
