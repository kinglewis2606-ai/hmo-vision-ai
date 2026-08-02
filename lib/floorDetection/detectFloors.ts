import sharp from "sharp";

export interface DetectedFloor {
  name: string;
  top: number;
  bottom: number;
}

export async function detectFloors(
  imagePath: string
): Promise<DetectedFloor[]> {

  const image = sharp(imagePath);

  const metadata = await image.metadata();

  console.log("Image size:", metadata.width, metadata.height);

  return [];
}
