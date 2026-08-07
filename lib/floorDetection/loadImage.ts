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

  // Sharp's metadata object doesn't expose density directly in all versions.
  // Default to 96 DPI if not available.
  const dpi = (info as any).density || 96;

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    dpi,
  };
}
