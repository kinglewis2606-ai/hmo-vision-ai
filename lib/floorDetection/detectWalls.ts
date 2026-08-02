export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export async function detectWalls(imagePath: string): Promise<WallLine[]> {
  console.log("Wall detection started:", imagePath);

  // Placeholder until the real wall detection is implemented.
  return [];
}
