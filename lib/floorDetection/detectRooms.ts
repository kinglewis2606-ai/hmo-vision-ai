import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectRooms(
  walls: WallLine[]
): Promise<DetectedRoom[]> {

  console.log("Detecting rooms from", walls.length, "walls");

  // Placeholder until geometry detection is implemented.
  return [
    {
      id: "room-1",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    },
  ];
}
