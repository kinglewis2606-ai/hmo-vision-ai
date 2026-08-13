import { DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";
import { getVisionDetectedRooms } from "./detectFloors";
import { detectRoomsContours } from "./detectRoomsFromContours";

export async function detectRooms(imagePath: string, floors: DetectedFloor[]): Promise<DetectedRoom[]> {
  const visionRooms = getVisionDetectedRooms(imagePath);
  if (visionRooms?.length) {
    console.log(`Vision room recognition: ${visionRooms.length} room(s)`);
    return visionRooms;
  }
  console.warn("Vision room recognition unavailable; falling back to contour geometry");
  return detectRoomsContours(imagePath, floors);
}
