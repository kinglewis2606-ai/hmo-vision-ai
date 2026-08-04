export interface AIRoom {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AIWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AIFloor {
  name: string;
  rooms: AIRoom[];
  proposedWalls: AIWall[];
}

export interface AIAnalysis {
  floors: AIFloor[];
}

export async function analyseFloorPlan(
  imageBase64: string
): Promise<AIAnalysis> {

  // This is where we'll call the Vision model next.

  return {
    floors: []
  };
}
