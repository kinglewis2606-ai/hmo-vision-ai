import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CELL_SIZE = 8;

const MIN_ROOM_AREA = 2000;

const MAX_ROOM_AREA = 1000000;

export async function detectRooms(
  walls: WallLine[]
): Promise<DetectedRoom[]> {
  const horizontal = walls
    
