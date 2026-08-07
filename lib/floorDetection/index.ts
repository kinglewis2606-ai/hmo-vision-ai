import { loadImage } from "./loadImage";
import { detectFloors } from "./detectFloors";
import { detectWalls } from "./detectWalls";
import { detectRoomsFromContours } from "./detectRoomsFromContours";
import { buildOriginalFloorPlan } from "./buildOriginalFloorPlan";
import { FloorPlan } from "@/lib/types/floorPlan";

/**
 * Main detection pipeline orchestrator
 * 
 * Coordinates the full detection workflow:
 * 1. Load image and extract DPI metadata
 * 2. Detect floor boundaries
 * 3. Detect wall geometry (structural elements)
 * 4. Detect rooms (enclosed spaces) with DPI-aware calibration
 * 5. Build canonical floor plan (immutable model preserving all geometry)
 * 
 * Returns the authoritative FloorPlan model for downstream AI analysis.
 */
export async function detectFloorPlan(
  imagePath: string
): Promise<FloorPlan> {
  console.log(`\n========================================`);
  console.log(`DETECTION PIPELINE: ${imagePath}`);
  console.log(`========================================\n`);

  // LAYER 1: Load image and extract metadata
  console.log(`[1/5] Loading image...`);
  const image = await loadImage(imagePath);
  console.log(`      Image size: ${image.width} x ${image.height}`);
  console.log(`      DPI: ${image.dpi || 96} (default: 96)`);

  // LAYER 2: Detect floor boundaries
  console.log(`\n[2/5] Detecting floor boundaries...`);
  const floors = await detectFloors(imagePath);
  console.log(`      Detected ${floors.length} floors:`);
  floors.forEach(f => {
    console.log(
      `        - ${f.name} (y: ${f.top}–${f.bottom})`
    );
  });

  if (floors.length === 0) {
    throw new Error(
      "No floors detected. Image may be invalid or too small."
    );
  }

  // LAYER 3: Detect wall geometry
  console.log(`\n[3/5] Detecting wall geometry...`);
  const walls = await detectWalls(imagePath, floors);
  console.log(`      Detected ${walls.length} merged wall segments`);

  if (walls.length === 0) {
    console.warn(
      "⚠ No walls detected. Room detection may fail."
    );
  }

  // LAYER 4: Detect rooms with DPI-calibrated thresholds
  console.log(`\n[4/5] Detecting rooms (DPI-aware)...`);
  const rooms = await detectRoomsFromContours(
    imagePath,
    floors,
    image.dpi
  );
  console.log(`      Detected ${rooms.length} rooms`);
  rooms.slice(0, 5).forEach(r => {
    const areaSqm = (r.width * r.height) / 10000;
    console.log(
      `        - ${r.id}: ${r.width}×${r.height}px (${areaSqm.toFixed(1)}m²)`
    );
  });

  if (rooms.length > 5) {
    console.log(`        ... and ${rooms.length - 5} more`);
  }

  // LAYER 5: Build immutable canonical model
  console.log(`\n[5/5] Building canonical floor plan...`);
  const floorPlan = buildOriginalFloorPlan(
    floors,
    rooms,
    walls
  );

  const totalRooms = floorPlan.floors.reduce(
    (sum, floor) => sum + floor.rooms.length,
    0
  );

  console.log(`      Built canonical model`);
  console.log(`      Total rooms: ${totalRooms}`);
  console.log(`      Total walls: ${floorPlan.walls?.length ?? 0}`);

  console.log(`\n========================================`);
  console.log(`DETECTION COMPLETE ✓`);
  console.log(`========================================\n`);

  return floorPlan;
}

/**
 * Legacy detection function for backward compatibility
 * 
 * Delegates to detectFloorPlan() but catches errors gracefully
 * for non-critical detection failures.
 */
export async function detectFloorPlanSafe(
  imagePath: string
): Promise<FloorPlan | null> {
  try {
    return await detectFloorPlan(imagePath);
  } catch (error) {
    console.error(
      "Detection pipeline failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
