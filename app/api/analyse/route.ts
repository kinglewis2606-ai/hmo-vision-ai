import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { applyRoomChanges } from "@/lib/applyRoomChanges";
import { renderFloor } from "@/lib/floorPlanRenderer/renderFloor";
import { checkRateLimit, rateLimitRetryAfter } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { config } from "@/lib/config";
import {
  recordAnalysisStarted,
  recordAnalysisSuccess,
  recordAnalysisFailed,
  recordDetectionTime,
  recordAiTime,
} from "@/lib/metrics";
import type { RoomChange, HMOAnalysisResult, AnalysisPipelineResult } from "@/lib/types/floorPlan";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  const startTime = Date.now();

  // Rate limiting by IP (Next.js request headers)
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown";

  if (!checkRateLimit(ip)) {
    const retryAfter = rateLimitRetryAfter(ip);
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  recordAnalysisStarted();

  let filename: string;
  let address: string;
  let propertyType: string;

  try {
    const body = await req.json();
    filename = (body.filename ?? "").trim();
    address = (body.address ?? "").trim();
    propertyType = (body.propertyType ?? "").trim();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  // Input validation
  if (!filename || filename.length > 300) {
    return NextResponse.json(
      { success: false, error: "Invalid filename." },
      { status: 400 }
    );
  }

  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json(
      { success: false, error: "Invalid filename." },
      { status: 400 }
    );
  }

  if (address.length > 500) {
    return NextResponse.json(
      { success: false, error: "Address too long." },
      { status: 400 }
    );
  }

  if (propertyType.length > 200) {
    return NextResponse.json(
      { success: false, error: "Property type too long." },
      { status: 400 }
    );
  }

  const filePath = path.join(process.cwd(), config.upload.dir, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { success: false, error: "Uploaded floor plan not found." },
      { status: 404 }
    );
  }

  logger.info("analysis started", { filename, address });

  try {
    // ── Phase 1: Detect floor plan ─────────────────────────────────────────
    const detectionStart = Date.now();
    const originalFloorPlan = await buildOriginalFloorPlan(filePath);
    recordDetectionTime(Date.now() - detectionStart);

    // ── Phase 2: AI analysis ───────────────────────────────────────────────
    const image = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" : ext === ".pdf" ? "image/jpeg" : "image/jpeg";
    const base64 = image.toString("base64");

    const aiStart = Date.now();
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), config.ai.timeoutMs);

    let hmoAnalysis: HMOAnalysisResult;

    try {
      const response = await openai.responses.create(
        {
          model: config.ai.model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildPrompt(address, propertyType),
                },
                {
                  type: "input_image",
                  image_url: `data:${mime};base64,${base64}`,
                  detail: "high",
                },
              ],
            },
          ],
        },
        { signal: aiController.signal }
      );

      clearTimeout(aiTimeout);
      recordAiTime(Date.now() - aiStart);

      const text = response.output_text ?? "";
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      hmoAnalysis = JSON.parse(cleaned) as HMOAnalysisResult;
    } catch (err: unknown) {
      clearTimeout(aiTimeout);
      if (err instanceof Error && err.name === "AbortError") {
        logger.error("AI analysis timed out", { filename });
        recordAnalysisFailed();
        return NextResponse.json(
          { success: false, error: "AI analysis timed out." },
          { status: 504 }
        );
      }
      throw err;
    }

    // ── Phase 3: Apply recommended room changes ────────────────────────────
    const changes: RoomChange[] = normaliseRoomChanges(
      hmoAnalysis.recommendedLayout ?? [],
      originalFloorPlan
    );
    const proposedFloorPlan = applyRoomChanges(originalFloorPlan, changes);

    // ── Phase 4: Render both layouts ───────────────────────────────────────
    const imgW = originalFloorPlan.metadata.imageWidthPx;
    const imgH = originalFloorPlan.metadata.imageHeightPx;

    const renderPromises = originalFloorPlan.floors.map(async (floor, i) => {
      const origImg = await renderFloor(floor, imgW, imgH);
      const propFloor = proposedFloorPlan.floors[i] ?? floor;
      const propImg = await renderFloor(propFloor, imgW, imgH);
      return { floorIndex: i, original: origImg, proposed: propImg };
    });

    const renderedFloors = await Promise.all(renderPromises);

    const result: AnalysisPipelineResult = {
      originalFloorPlan,
      proposedFloorPlan,
      hmoAnalysis,
      originalLayoutImage: renderedFloors[0]?.original,
      proposedLayoutImage: renderedFloors[0]?.proposed,
      sourceFilename: filename,
    };

    recordAnalysisSuccess(Date.now() - startTime);
    logger.info("analysis completed", {
      filename,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    recordAnalysisFailed();
    const message = err instanceof Error ? err.message : "Analysis failed.";
    logger.error("analysis failed", { filename, error: message });

    return NextResponse.json(
      { success: false, error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPrompt(address: string, propertyType: string): string {
  return `You are an experienced UK HMO consultant, architect and property investor.

Analyse this floor plan.

Property Address: ${address || "Unknown"}
Property Type: ${propertyType || "Unknown"}

IMPORTANT: Only recommend HMOs with FOUR OR MORE BEDROOMS.

Return ONLY valid JSON in EXACTLY this structure (no markdown, no explanations):

{
  "summary": {
    "bedrooms": 0,
    "bathrooms": 0,
    "kitchen": false,
    "livingRoom": false,
    "possibleHMOBedrooms": 0,
    "confidence": ""
  },
  "hmoScore": 0,
  "verdict": "",
  "highestPossibleHMO": {
    "bedrooms": 0,
    "score": 0,
    "reason": ""
  },
  "recommendedLayout": [
    {
      "type": "ConvertToBedroom",
      "roomId": "",
      "description": "",
      "step": 1
    }
  ],
  "conversionSteps": [],
  "recommendations": [],
  "compliance": [],
  "fireSafety": [],
  "planningRisk": "",
  "estimatedConversionCost": {
    "low": 0,
    "high": 0
  },
  "estimatedMonthlyRent": 0,
  "estimatedAnnualRent": 0,
  "estimatedYield": "",
  "estimatedROI": "",
  "investorSummary": ""
}

For recommendedLayout, use type values from: ConvertToBedroom, SplitRoom, ExtendBathroom, AddBathroom, RemoveWall, ConvertToKitchen.
Leave roomId as empty string if unknown — the system will match rooms by step order.
Return JSON only.`;
}

/**
 * Normalise AI-returned recommendedLayout changes to ensure they reference
 * real room IDs.  If the AI left roomId empty, assign rooms by order.
 */
function normaliseRoomChanges(
  raw: RoomChange[],
  floorPlan: import("@/lib/types/floorPlan").FloorPlan
): RoomChange[] {
  // Collect all rooms across all floors, ordered by floor then position
  const allRooms = floorPlan.floors.flatMap((f) => f.rooms);

  let assignIdx = 0;

  return raw.map((change, i) => {
    const step = change.step ?? i + 1;

    // If AI gave a valid roomId that exists, use it
    if (change.roomId && allRooms.some((r) => r.id === change.roomId)) {
      return { ...change, step };
    }

    // Otherwise assign the next available room
    const room = allRooms[assignIdx++];
    return {
      ...change,
      roomId: room?.id ?? "",
      step,
    };
  });
}
