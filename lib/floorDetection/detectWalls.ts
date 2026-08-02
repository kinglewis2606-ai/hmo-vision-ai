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

  // Temporary fake wall so we can verify the pipeline works.
  const walls = [
  {
    x1: 100,
    y1: 100,
    x2: 500,
    y2: 100,
  },
];


return walls;
