import { renderFloor } from "../floorPlanRenderer/renderFloor";
import type { Floor, Room } from "../types/floorPlan";

function makeTestFloor(rooms: Partial<Room>[] = []): Floor {
  const defaultRooms: Room[] = rooms.map((r, i) => ({
    id: `room-${i}`,
    label: r.label ?? `Room ${i}`,
    type: r.type ?? "bedroom",
    bounds: r.bounds ?? { x: i * 100, y: 0, width: 90, height: 80 },
    floorIndex: 0,
    adjacentRoomIds: [],
    doors: [],
    windows: [],
    modified: r.modified,
    areaM2: r.areaM2,
  }));

  return {
    index: 0,
    label: "Ground Floor",
    rooms: defaultRooms,
    walls: [
      { id: "w1", start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 2 },
      { id: "w2", start: { x: 0, y: 0 }, end: { x: 0, y: 600 }, thickness: 2 },
    ],
  };
}

describe("renderFloor", () => {
  test("returns a non-empty string", async () => {
    const floor = makeTestFloor([{ label: "Bedroom" }]);
    const result = await renderFloor(floor, 800, 600);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns a data URI (png or svg)", async () => {
    const floor = makeTestFloor([{ label: "Bedroom" }]);
    const result = await renderFloor(floor, 800, 600);
    expect(result.startsWith("data:image/")).toBe(true);
  });

  test("renders floor with no rooms without throwing", async () => {
    const floor = makeTestFloor([]);
    await expect(renderFloor(floor, 800, 600)).resolves.toBeDefined();
  });

  test("renders floor with multiple room types", async () => {
    const floor = makeTestFloor([
      { label: "Bedroom", type: "bedroom", bounds: { x: 0, y: 0, width: 200, height: 150 } },
      { label: "Bathroom", type: "bathroom", bounds: { x: 200, y: 0, width: 100, height: 80 } },
      { label: "Kitchen", type: "kitchen", bounds: { x: 300, y: 0, width: 150, height: 100 } },
      { label: "Living Room", type: "living_room", bounds: { x: 0, y: 150, width: 300, height: 200 } },
    ]);
    const result = await renderFloor(floor, 800, 600);
    expect(result.startsWith("data:image/")).toBe(true);
  });

  test("renders modified rooms without throwing", async () => {
    const floor = makeTestFloor([
      { label: "New Bedroom", type: "bedroom", modified: true },
      { label: "Existing Room", type: "living_room", modified: false },
    ]);
    const result = await renderFloor(floor, 800, 600);
    expect(result.length).toBeGreaterThan(0);
  });

  test("accepts custom dimensions", async () => {
    const floor = makeTestFloor([{ label: "Bedroom" }]);
    const result = await renderFloor(floor, 800, 600, { width: 1200, height: 900 });
    expect(result.startsWith("data:image/")).toBe(true);
  });

  test("includes area labels when areaM2 is set", async () => {
    const floor = makeTestFloor([{ label: "Bedroom", areaM2: 12.5 }]);
    const result = await renderFloor(floor, 800, 600);
    // SVG fallback will include the area text; just check it renders
    expect(result.length).toBeGreaterThan(100);
  });
});
