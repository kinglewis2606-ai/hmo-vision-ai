import { DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";
import { getVisionDetectedRooms } from "./detectFloors";

export async function detectRooms(imagePath: string, floors: DetectedFloor[]): Promise<DetectedRoom[]> {
  const visionRooms = getVisionDetectedRooms(imagePath);
  if (visionRooms) {
    console.log(`Vision room recognition: ${visionRooms.length} verified room(s)`);
    return visionRooms;
  }
  console.warn("Vision room recognition unavailable; contour fallback disabled to prevent invented or merged room geometry");
  return [];
}
