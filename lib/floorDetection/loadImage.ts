import sharp from "sharp";

export interface LoadedImage {
  data: Uint8Array;
  width: number;
  height: number;
}

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
  };
}
