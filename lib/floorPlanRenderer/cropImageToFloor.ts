/**
 * cropImageToFloor.ts
 *
 * Given a base-64 data-URI of the full uploaded image and a floor's yRange,
 * returns a base-64 data-URI cropped to just that floor's vertical band.
 *
 * Uses the 'canvas' package when available; falls back to returning the full
 * image unchanged (the overlay will still align correctly because coordinates
 * are in full-image space even on the fallback path).
 */

import type { Floor } from "../types/floorPlan";

/**
 * Crop a data-URI image to the vertical band described by `floor.yRange`.
 * Returns the original data-URI unchanged if yRange is absent, the image
 * spans the full height, or the canvas package is unavailable.
 */
export async function cropImageToFloor(
  imageDataUri: string,
  floor: Floor,
  imageWidthPx: number,
  imageHeightPx: number
): Promise<string> {
  const { yRange } = floor;

  // No crop needed when there is only one floor or yRange is not set
  if (!yRange || (yRange.top === 0 && yRange.bottom >= imageHeightPx - 1)) {
    return imageDataUri;
  }

  const cropTop = Math.max(0, yRange.top);
  const cropBottom = Math.min(imageHeightPx - 1, yRange.bottom);
  const cropHeight = cropBottom - cropTop + 1;

  if (cropHeight <= 0) return imageDataUri;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { createCanvas, loadImage } = require(/* turbopackIgnore: true */ "canvas") as any;
    const src = await loadImage(imageDataUri);
    const canvas = createCanvas(imageWidthPx, cropHeight);
    const ctx = canvas.getContext("2d");
    // Draw the source image shifted upward so cropTop aligns to y=0
    ctx.drawImage(src, 0, -cropTop, imageWidthPx, imageHeightPx);
    return canvas.toDataURL("image/png") as string;
  } catch {
    // canvas not available — return full image; overlay coords will still be correct
    return imageDataUri;
  }
}
