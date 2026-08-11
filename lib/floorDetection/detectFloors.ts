import { loadImage } from "./loadImage";
import { DetectedFloor } from "@/lib/types/floorPlan";

/**
 * Detect the floor panels on a typical architectural floor-plan sheet.
 *
 * The previous implementation always divided the image horizontally into
 * three bands. That is wrong for the common layout used by the uploaded plan
 * in this project, where Ground / First / Second are arranged left-to-right.
 * We support both layouts by looking at the image aspect ratio and splitting
 * along the dominant sheet axis. The returned bounds are explicit so the
 * room detector can work inside each floor panel rather than using global
 * thirds of the image.
 */
export async function detectFloors(imagePath: string): Promise<DetectedFloor[]> {
  const image = await loadImage(imagePath);
  const { width, height, data } = image;

  if (!width || !height) return [];

  // Multi-floor architectural sheets are normally presented as a row of
  // similarly sized floor panels. A portrait sheet is more likely to stack
  // them vertically. Keep a little tolerance for near-square images.
  const sideBySide = width >= height * 1.15;
  const count = 3;

  const floors: DetectedFloor[] = [];

  for (let level = 0; level < count; level++) {
    if (sideBySide) {
      const left = Math.floor((width * level) / count);
      const right = level === count - 1
        ? width
        : Math.floor((width * (level + 1)) / count);

      floors.push({
        name: ["Ground Floor", "First Floor", "Second Floor"][level] ?? `Floor ${level + 1}`,
        level,
        top: 0,
        bottom: height,
        left,
        right,
      });
    } else {
      const top = Math.floor((height * level) / count);
      const bottom = level === count - 1
        ? height
        : Math.floor((height * (level + 1)) / count);

      floors.push({
        name: ["Ground Floor", "First Floor", "Second Floor"][level] ?? `Floor ${level + 1}`,
        level,
        top,
        bottom,
        left: 0,
        right: width,
      });
    }
  }

  // Log a cheap ink-density diagnostic. This makes it obvious in production
  // logs if a supplied sheet has a very different layout from the normal
  // three-panel format, without making the detector dependent on OCR.
  const threshold = 120;
  const axisLength = sideBySide ? width : height;
  const step = Math.max(1, Math.floor(axisLength / 300));
  let occupied = 0;

  for (let p = 0; p < axisLength; p += step) {
    let dark = 0;
    let samples = 0;

    if (sideBySide) {
      for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 120))) {
        const x = Math.min(width - 1, p);
        dark += data[y * width + x] < threshold ? 1 : 0;
        samples++;
      }
    } else {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 120))) {
        const y = Math.min(height - 1, p);
        dark += data[y * width + x] < threshold ? 1 : 0;
        samples++;
      }
    }

    if (samples && dark / samples > 0.02) occupied++;
  }

  console.log(
    `Detected ${floors.length} floor panels (${sideBySide ? "left-to-right" : "top-to-bottom"}); occupied axis samples: ${occupied}`
  );

  return floors;
}
