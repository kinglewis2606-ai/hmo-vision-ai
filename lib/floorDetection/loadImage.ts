import sharp from "sharp";
import { LoadedImage } from "@/lib/types/floorPlan";

export async function loadImage(
  imagePath: string
): Promise<LoadedImage> {

  const {
    data,
    info,
  } = await sharp(imagePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    dpi: info.density || 96,
  };
}
