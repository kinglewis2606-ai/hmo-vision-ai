import { DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";
import { getVisionDetectedRooms } from "./detectFloors";
import { recoverRooms } from "./recoverRooms";

export async function detectRooms(imagePath: string, floors: DetectedFloor[]): Promise<DetectedRoom[]> {
  let visionRooms = getVisionDetectedRooms(imagePath) || [];

  if (visionRooms.length < 5) {
    console.warn(`Vision room recognition returned only ${visionRooms.length} room(s); running whole-plan recovery.`);
    visionRooms = await recoverRooms(imagePath, visionRooms);
  }

  if (visionRooms.length) {
    console.log(`Vision room recognition: ${visionRooms.length} room(s) available for labelling`);
    return visionRooms;
  }

  console.warn("Vision room recognition unavailable; no geometry can be safely analysed.");
  return [];
}
