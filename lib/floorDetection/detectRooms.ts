import { DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";
import { getVisionDetectedRooms } from "./detectFloors";

export async function detectRooms(imagePath: string, _floors: DetectedFloor[]): Promise<DetectedRoom[]> {
  const rooms = getVisionDetectedRooms(imagePath) || [];
  console.log(`Room geometry stage complete: ${rooms.length} detected room(s)`);
  return rooms;
}
