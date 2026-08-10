import { applyRoomChanges } from "../applyRoomChanges";
import type { FloorPlan, Room, RoomChange } from "../types/floorPlan";

function makeFloorPlan(rooms: Room[]): FloorPlan {
  return {
    id: "test-plan",
    floors: [
      {
        index: 0,
        label: "Ground Floor",
        rooms,
        walls: [],
      },
    ],
    metadata: {
      sourceFilename: "test.jpg",
      imageWidthPx: 800,
      imageHeightPx: 600,
      detectedAt: new Date().toISOString(),
    },
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    label: "Living Room",
    type: "living_room",
    bounds: { x: 10, y: 10, width: 200, height: 150 },
    floorIndex: 0,
    adjacentRoomIds: [],
    doors: [],
    windows: [],
    ...overrides,
  };
}

describe("applyRoomChanges", () => {
  test("does not mutate the original floor plan", () => {
    const original = makeFloorPlan([makeRoom()]);
    const originalJson = JSON.stringify(original);

    const changes: RoomChange[] = [
      {
        type: "ConvertToBedroom",
        roomId: "room-1",
        description: "Convert to bedroom",
        step: 1,
      },
    ];

    applyRoomChanges(original, changes);
    expect(JSON.stringify(original)).toBe(originalJson);
  });

  test("ConvertToBedroom changes room type and label", () => {
    const original = makeFloorPlan([makeRoom()]);
    const changes: RoomChange[] = [
      {
        type: "ConvertToBedroom",
        roomId: "room-1",
        description: "Convert to bedroom",
        step: 1,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    const room = proposed.floors[0].rooms[0];
    expect(room.type).toBe("bedroom");
    expect(room.label).toBe("Bedroom");
    expect(room.modified).toBe(true);
  });

  test("SplitRoom creates two rooms (vertical)", () => {
    const original = makeFloorPlan([makeRoom()]);
    const changes: RoomChange[] = [
      {
        type: "SplitRoom",
        roomId: "room-1",
        splitAxis: "vertical",
        description: "Split room vertically",
        step: 1,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    expect(proposed.floors[0].rooms.length).toBe(2);

    const [a, b] = proposed.floors[0].rooms;
    // Combined width should equal original width
    expect(a.bounds.width + b.bounds.width).toBe(200);
    // Heights unchanged
    expect(a.bounds.height).toBe(150);
    expect(b.bounds.height).toBe(150);
    // Both marked as modified
    expect(a.modified).toBe(true);
    expect(b.modified).toBe(true);
  });

  test("SplitRoom creates two rooms (horizontal)", () => {
    const original = makeFloorPlan([makeRoom()]);
    const changes: RoomChange[] = [
      {
        type: "SplitRoom",
        roomId: "room-1",
        splitAxis: "horizontal",
        description: "Split room horizontally",
        step: 1,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    expect(proposed.floors[0].rooms.length).toBe(2);

    const [a, b] = proposed.floors[0].rooms;
    expect(a.bounds.height + b.bounds.height).toBe(150);
  });

  test("ExtendBathroom absorbs space from adjacent room", () => {
    const bathroom = makeRoom({
      id: "bath-1",
      label: "Bathroom",
      type: "bathroom",
      bounds: { x: 10, y: 10, width: 80, height: 100 },
      adjacentRoomIds: ["room-2"],
    });

    const adjacent = makeRoom({
      id: "room-2",
      label: "Bedroom",
      type: "bedroom",
      bounds: { x: 90, y: 10, width: 100, height: 100 },
      adjacentRoomIds: ["bath-1"],
    });

    const original = makeFloorPlan([bathroom, adjacent]);
    const changes: RoomChange[] = [
      {
        type: "ExtendBathroom",
        roomId: "bath-1",
        description: "Extend bathroom",
        step: 1,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    const newBath = proposed.floors[0].rooms.find((r) => r.id === "bath-1")!;
    const newAdj = proposed.floors[0].rooms.find((r) => r.id === "room-2")!;

    expect(newBath.bounds.width).toBeGreaterThan(80);
    expect(newAdj.bounds.width).toBeLessThan(100);
    expect(newBath.modified).toBe(true);
  });

  test("skips unknown roomId gracefully", () => {
    const original = makeFloorPlan([makeRoom()]);
    const changes: RoomChange[] = [
      {
        type: "ConvertToBedroom",
        roomId: "nonexistent",
        description: "Convert to bedroom",
        step: 1,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    // Room should be unchanged
    expect(proposed.floors[0].rooms[0].type).toBe("living_room");
  });

  test("applies multiple changes in sequence", () => {
    const room2 = makeRoom({
      id: "room-2",
      label: "Dining Room",
      type: "dining_room",
      bounds: { x: 210, y: 10, width: 100, height: 150 },
    });
    const original = makeFloorPlan([makeRoom(), room2]);

    const changes: RoomChange[] = [
      {
        type: "ConvertToBedroom",
        roomId: "room-1",
        description: "Convert living room to bedroom",
        step: 1,
      },
      {
        type: "ConvertToBedroom",
        roomId: "room-2",
        description: "Convert dining room to bedroom",
        step: 2,
      },
    ];

    const proposed = applyRoomChanges(original, changes);
    expect(proposed.floors[0].rooms[0].type).toBe("bedroom");
    expect(proposed.floors[0].rooms[1].type).toBe("bedroom");
  });
});
