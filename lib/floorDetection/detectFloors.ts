import sharp from "sharp";
import { DetectedFloor } from "@/lib/types/floorPlan";

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
      level: 0,
      top: 0,
      bottom: sectionHeight,
    },
    {
      name: "First Floor",
      level: 1,
      top: sectionHeight,
      bottom: sectionHeight * 2,
    },
    {
      name: "Second Floor",
      level: 2,
      top: sectionHeight * 2,
      bottom: height,
    },
  ];
}
