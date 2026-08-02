import { loadImage } from "./loadImage";


export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

import { DetectedFloor } from "./detectFloors";

export async function detectWalls(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<WallLine[]> {
  
  const image = await loadImage(imagePath);
  const pixels = image.data;
const width = image.width;
  
  console.log("Processing", floors.length, "floors");

  console.log("Image loaded:", image.width, "x", image.height);

 const walls: WallLine[] = [];

for (const floor of floors) {

  console.log("Scanning", floor.name);

  for (let y = floor.top; y < floor.bottom; y++) {

    const rowOffset = y * width;

    // Real pixel scanning will go here.
  }

}

return walls;
