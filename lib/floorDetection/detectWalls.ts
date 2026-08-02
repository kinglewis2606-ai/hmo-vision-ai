import { loadImage } from "./loadImage";

export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export async function detectWalls(
  imagePath: string
): Promise<WallLine[]> {

  const image = await loadImage(imagePath);

  console.log("Image loaded:", image.length, "bytes");

  // Real wall detection comes next.
  return [];
}
