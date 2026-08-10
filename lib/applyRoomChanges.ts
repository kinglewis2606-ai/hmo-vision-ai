// applyRoomChanges.ts
// Applies recommended HMO room changes to a FloorPlan to produce a new
// proposedFloorPlan. The original FloorPlan is NEVER mutated.

import { v4 as uuid } from "uuid";
import type {
  FloorPlan,
  Floor,
  Room,
  RoomChange,
  RoomType,
} from "./types/floorPlan";
import { logger } from "./logger";

/**
 * Apply a list of RoomChange operations to the original floor plan.
 * Returns a deep-cloned proposed floor plan with the changes applied.
 * The originalFloorPlan is not modified.
 */
export function applyRoomChanges(
  originalFloorPlan: FloorPlan,
  changes: RoomChange[]
): FloorPlan {
  // Deep clone so we never mutate the original
  const proposed: FloorPlan = deepCloneFloorPlan(originalFloorPlan);

  for (const change of changes) {
    try {
      applyChange(proposed, change);
    } catch (err) {
      logger.warn("Failed to apply room change", {
        type: change.type,
        roomId: change.roomId,
        error: String(err),
      });
    }
  }

  return proposed;
}

function applyChange(floorPlan: FloorPlan, change: RoomChange): void {
  const { room, floor } = findRoom(floorPlan, change.roomId);

  if (!room || !floor) {
    logger.warn("Room not found for change", { roomId: change.roomId });
    return;
  }

  switch (change.type) {
    case "ConvertToBedroom":
      convertToBedroom(room, change);
      break;

    case "SplitRoom":
      splitRoom(floor, room, change);
      break;

    case "ExtendBathroom":
      extendBathroom(floor, room, change);
      break;

    case "AddBathroom":
      addBathroom(floor, room, change);
      break;

    case "RemoveWall":
      removeWall(floor, room, change);
      break;

    case "ConvertToKitchen":
      room.type = "kitchen";
      room.label = change.newLabel ?? "Kitchen";
      room.modified = true;
      break;

    default:
      logger.warn("Unknown room change type", { type: (change as RoomChange).type });
  }
}

// ─── Individual transformations ─────────────────────────────────────────────

function convertToBedroom(room: Room, change: RoomChange): void {
  room.type = (change.newType as RoomType) ?? "bedroom";
  room.label = change.newLabel ?? "Bedroom";
  room.modified = true;
}

function splitRoom(floor: Floor, room: Room, change: RoomChange): void {
  const axis = change.splitAxis ?? "vertical";

  if (axis === "vertical") {
    const origWidth = room.bounds.width;
    const halfWidth = Math.floor(origWidth / 2);

    // Room A: left half (mutate in-place)
    room.bounds = {
      ...room.bounds,
      width: halfWidth,
    };
    room.label = change.newLabel ?? `${room.label} A`;
    room.modified = true;

    // Room B: right half (use origWidth, not post-mutation room.bounds.width)
    const roomB: Room = {
      id: uuid(),
      label: `${change.newLabel ?? room.label} B`,
      type: room.type,
      bounds: {
        x: room.bounds.x + halfWidth,
        y: room.bounds.y,
        width: origWidth - halfWidth,
        height: room.bounds.height,
      },
      areaM2: room.areaM2 != null ? room.areaM2 / 2 : undefined,
      floorIndex: room.floorIndex,
      adjacentRoomIds: [room.id, ...room.adjacentRoomIds],
      doors: [],
      windows: [],
      modified: true,
    };

    room.adjacentRoomIds.push(roomB.id);
    floor.rooms.push(roomB);
  } else {
    // Horizontal split
    const origHeight = room.bounds.height;
    const halfHeight = Math.floor(origHeight / 2);

    room.bounds = {
      ...room.bounds,
      height: halfHeight,
    };
    room.label = change.newLabel ?? `${room.label} A`;
    room.modified = true;

    const roomB: Room = {
      id: uuid(),
      label: `${change.newLabel ?? room.label} B`,
      type: room.type,
      bounds: {
        x: room.bounds.x,
        y: room.bounds.y + halfHeight,
        width: room.bounds.width,
        height: origHeight - halfHeight,
      },
      areaM2: room.areaM2 != null ? room.areaM2 / 2 : undefined,
      floorIndex: room.floorIndex,
      adjacentRoomIds: [room.id, ...room.adjacentRoomIds],
      doors: [],
      windows: [],
      modified: true,
    };

    room.adjacentRoomIds.push(roomB.id);
    floor.rooms.push(roomB);
  }
}

function extendBathroom(floor: Floor, room: Room, change: RoomChange): void {
  // Find an adjacent room to absorb space from
  const adjacent = floor.rooms.find(
    (r) => r.id !== room.id && room.adjacentRoomIds.includes(r.id)
  );

  if (adjacent) {
    // Extend bathroom into adjacent room: take 20% of adjacent's width
    const extension = Math.floor(adjacent.bounds.width * 0.2);

    if (adjacent.bounds.x > room.bounds.x) {
      // Adjacent is to the right: extend bathroom rightward
      room.bounds.width += extension;
      adjacent.bounds.x += extension;
      adjacent.bounds.width -= extension;
    } else {
      // Adjacent is to the left: extend bathroom leftward
      room.bounds.x -= extension;
      room.bounds.width += extension;
      adjacent.bounds.width -= extension;
    }

    if (adjacent.areaM2 != null) {
      const ratio = extension / (adjacent.bounds.width + extension);
      const transferred = adjacent.areaM2 * ratio;
      adjacent.areaM2 = Math.max(0, adjacent.areaM2 - transferred);
      if (room.areaM2 != null) room.areaM2 += transferred;
    }

    adjacent.modified = true;
  }

  room.type = "bathroom";
  room.label = change.newLabel ?? "Bathroom";
  room.modified = true;
}

function addBathroom(floor: Floor, room: Room, change: RoomChange): void {
  // Carve a new small bathroom (2.5m × 1.8m) off one corner of the room
  const pxPerM = 20;
  const bathW = Math.min(Math.floor(2.5 * pxPerM), Math.floor(room.bounds.width * 0.35));
  const bathH = Math.min(Math.floor(1.8 * pxPerM), Math.floor(room.bounds.height * 0.35));

  if (bathW < 20 || bathH < 20) {
    logger.warn("Room too small to add bathroom", { roomId: room.id });
    return;
  }

  // Reduce the source room
  room.bounds.width -= bathW;
  room.modified = true;

  const newBath: Room = {
    id: uuid(),
    label: change.newLabel ?? "New Bathroom",
    type: "bathroom",
    bounds: {
      x: room.bounds.x + room.bounds.width,
      y: room.bounds.y,
      width: bathW,
      height: bathH,
    },
    areaM2: (bathW * bathH) / (pxPerM * pxPerM),
    floorIndex: room.floorIndex,
    adjacentRoomIds: [room.id],
    doors: [],
    windows: [],
    modified: true,
  };

  room.adjacentRoomIds.push(newBath.id);
  floor.rooms.push(newBath);
}

function removeWall(floor: Floor, room: Room, change: RoomChange): void {
  // Merge the room with its first adjacent room (the one most likely intended)
  const adjacentIdx = floor.rooms.findIndex(
    (r) => r.id !== room.id && room.adjacentRoomIds.includes(r.id)
  );

  if (adjacentIdx === -1) return;

  const adjacent = floor.rooms[adjacentIdx];

  // Expand room to encompass both bounding boxes
  const newX = Math.min(room.bounds.x, adjacent.bounds.x);
  const newY = Math.min(room.bounds.y, adjacent.bounds.y);
  const newRight = Math.max(
    room.bounds.x + room.bounds.width,
    adjacent.bounds.x + adjacent.bounds.width
  );
  const newBottom = Math.max(
    room.bounds.y + room.bounds.height,
    adjacent.bounds.y + adjacent.bounds.height
  );

  room.bounds = {
    x: newX,
    y: newY,
    width: newRight - newX,
    height: newBottom - newY,
  };

  if (room.areaM2 != null && adjacent.areaM2 != null) {
    room.areaM2 += adjacent.areaM2;
  }

  room.label = change.newLabel ?? room.label;
  room.type = change.newType ?? room.type;
  room.modified = true;

  // Remove the adjacent room
  floor.rooms.splice(adjacentIdx, 1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findRoom(
  floorPlan: FloorPlan,
  roomId: string
): { room: Room | undefined; floor: Floor | undefined } {
  for (const floor of floorPlan.floors) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (room) return { room, floor };
  }
  return { room: undefined, floor: undefined };
}

function deepCloneFloorPlan(fp: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(fp)) as FloorPlan;
}
