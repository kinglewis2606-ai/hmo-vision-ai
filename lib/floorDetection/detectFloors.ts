import sharp from "sharp";

export interface DetectedFloor {
  name: string;
  top: number;
  bottom: number;
}

export async function detectFloors(
  imagePath: string
): Promise<DetectedFloor[]> {

  const metadata = await sharp(imagePath).metadata();

  const height = metadata.height ?? 0;

  if (!height) {
    return [];
  }

  const sectionHeight = Math.floor(height / 3);

  return [
    {
      name: "Ground Floor",
      top: 0,
      bottom: sectionHeight,
    },
    {
      name: "First Floor",
      top: sectionHeight,
      bottom: sectionHeight * 2,
    },
    {
      name: "Second Floor",
      top: sectionHeight * 2,
      bottom: height,
    },
  ];
}
