import { Room, Floor, FloorPlan, RoomChange } from "@/lib/types/floorPlan";

export function applyRoomChanges(
  floorPlan: FloorPlan,
  changes: RoomChange[]
): FloorPlan {
  if (!changes || changes.length === 0) {
    return floorPlan;
  }

  const updated = structuredClone(floorPlan);

  for (const change of changes) {
    for (const floor of updated.floors) {
      for (const room of floor.rooms) {
        if (room.id === change.roomId) {
          // Apply the change to this room
          if (change.newType) {
            room.type = change.newType;
          }
          if (change.newName) {
            room.name = change.newName;
          }
          // Store the change reason for audit trail if provided
          if (change.reason && !room.notes) {
            room.notes = change.reason;
          }
        }
      }
    }
  }

  return updated;
}
