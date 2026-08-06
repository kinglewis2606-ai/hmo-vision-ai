import { loadImage } from "./loadImage";
import { DetectedFloor } from "./detectFloors";
import { findEnclosedRooms } from "./findEnclosedRooms";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const WALL_THRESHOLD = 170;
const MIN_ROOM_AREA = 3500;
const MAX_ROOM_AREA = 400000;

function index(
  width: number,
  x: number,
  y: number
): number {
  return y * width + x;
}

function isWall(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number
): boolean {
  return pixels[index(width, x, y)] < WALL_THRESHOLD;
}

function insideFloor(
  y: number,
  floor: DetectedFloor
): boolean {
  return y >= floor.top && y < floor.bottom;
}

function floodFill(
  pixels: Uint8Array,
  width: number,
  height: number,
  visited: Uint8Array,
  startX: number,
  startY: number,
  floor: DetectedFloor
): Point[] {

  const queue: Point[] = [
    {
      x: startX,
      y: startY,
    },
  ];

  const region: Point[] = [];

  visited[index(width, startX, startY)] = 1;

  while (queue.length > 0) {

    const current = queue.pop()!;

    region.push(current);

    const neighbours = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const n of neighbours) {

      if (
        n.x < 0 ||
        n.y < 0 ||
        n.x >= width ||
        n.y >= height
      ) {
        continue;
      }

      if (!insideFloor(n.y, floor)) {
        continue;
      }

      const i = index(width, n.x, n.y);

      if (visited[i]) {
        continue;
      }

      if (isWall(pixels, width, n.x, n.y)) {
        continue;
      }

      visited[i] = 1;

      queue.push(n);
    }
  }

  return region;
}

function boundingBox(points: Point[]) {

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {

    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;

  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    area: points.length,
  };
}
export async function detectRoomsContours(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<DetectedRoom[]> {

  const image = await loadImage(imagePath);

  const rooms = await findEnclosedRooms(
    image,
    floors
  );

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
                 }
