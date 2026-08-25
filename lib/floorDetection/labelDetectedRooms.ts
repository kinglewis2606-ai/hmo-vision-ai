import { DetectedRoom } from "@/lib/types/floorPlan";

/** Room recognition is performed in the single authoritative vision pass in detectFloors.
 * This stage deliberately performs no second AI call; geometry and labels stay attached to the
 * same stable candidate, preventing a second model response from remapping rooms incorrectly.
 */
export async function labelDetectedRooms(_imagePath: string, rooms: DetectedRoom[]): Promise<DetectedRoom[]> {
  console.log(`Room label stage complete: ${rooms.length} labelled geometry candidate(s)`);
  return rooms;
}
