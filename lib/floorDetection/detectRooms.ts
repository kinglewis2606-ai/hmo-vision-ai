import { loadImage } from "./loadImage";
import { DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";

const DARK_THRESHOLD = 130;
const DILATION_SIZE = 5;
const MAX_ANALYSIS_DIMENSION = 1000;

interface Region {
  area: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function buildBarrier(data: Uint8Array): Uint8Array {
  const barrier = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    barrier[i] = data[i] < DARK_THRESHOLD ? 1 : 0;
  }
  return barrier;
}

function resizeNearest(
  source: Uint8Array,
  width: number,
  height: number,
  scale: number
): { data: Uint8Array; width: number; height: number } {
  if (scale <= 1) return { data: source, width, height };

  const outWidth = Math.max(1, Math.ceil(width / scale));
  const outHeight = Math.max(1, Math.ceil(height / scale));
  const output = new Uint8Array(outWidth * outHeight);

  for (let y = 0; y < outHeight; y++) {
    const sourceY = Math.min(height - 1, Math.floor(y * scale));
    for (let x = 0; x < outWidth; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x * scale));
      output[y * outWidth + x] = source[sourceY * width + sourceX];
    }
  }

  return { data: output, width: outWidth, height: outHeight };
}

function dilateBinary(
  source: Uint8Array,
  width: number,
  height: number,
  size: number
): Uint8Array {
  const radius = Math.floor(size / 2);
  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (source[yy * width + xx]) {
            found = true;
            break;
          }
        }
      }
      output[y * width + x] = found ? 1 : 0;
    }
  }

  return output;
}

function findEnclosedRegions(
  barrier: Uint8Array,
  width: number,
  height: number
): Region[] {
  const closed = dilateBinary(barrier, width, height, DILATION_SIZE);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const regions: Region[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const start = y * width + x;
      if (closed[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let touchesEdge = false;

      queue[tail++] = start;
      visited[start] = 1;

      while (head < tail) {
        const current = queue[head++];
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        area++;

        if (cx <= 1 || cy <= 1 || cx >= width - 2 || cy >= height - 2) touchesEdge = true;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbours = [current - 1, current + 1, current - width, current + width];
        for (const next of neighbours) {
          if (next < 0 || next >= closed.length || closed[next] || visited[next]) continue;
          const ny = Math.floor(next / width);
          const nx = next - ny * width;
          if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }

      if (touchesEdge) continue;

      regions.push({
        area,
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  return regions;
}

function isRoomRegion(region: Region, floorWidth: number, floorHeight: number): boolean {
  const floorArea = floorWidth * floorHeight;
  const fraction = region.area / floorArea;
  const aspect = Math.max(
    region.width / Math.max(1, region.height),
    region.height / Math.max(1, region.width)
  );

  return (
    region.area >= Math.max(80, floorArea * 0.008) &&
    fraction <= 0.18 &&
    region.width >= 8 &&
    region.height >= 8 &&
    aspect <= 6
  );
}

function dedupeRegions(regions: Region[]): Region[] {
  const sorted = [...regions].sort((a, b) => b.area - a.area);
  const kept: Region[] = [];

  for (const region of sorted) {
    const overlaps = kept.some(existing => {
      const left = Math.max(region.x, existing.x);
      const top = Math.max(region.y, existing.y);
      const right = Math.min(region.x + region.width, existing.x + existing.width);
      const bottom = Math.min(region.y + region.height, existing.y + existing.height);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      const smaller = Math.min(region.width * region.height, existing.width * existing.height);
      return smaller > 0 && intersection / smaller > 0.75;
    });

    if (!overlaps) kept.push(region);
  }

  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function detectRooms(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<DetectedRoom[]> {
  if (!floors?.length) {
    console.log("Room detector received no floor bounds");
    return [];
  }

  const image = await loadImage(imagePath);
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / MAX_ANALYSIS_DIMENSION));
  const source = resizeNearest(buildBarrier(image.data), image.width, image.height, scale);

  console.log(
    `Room geometry analysis: ${image.width}x${image.height} -> ${source.width}x${source.height} (scale ${scale})`
  );

  const rooms: DetectedRoom[] = [];
  let nextId = 1;

  for (const floor of floors) {
    const fullLeft = Math.max(0, floor.left ?? 0);
    const fullTop = Math.max(0, floor.top ?? 0);
    const fullRight = Math.min(image.width, floor.right ?? image.width);
    const fullBottom = Math.min(image.height, floor.bottom ?? image.height);

    const left = Math.floor(fullLeft / scale);
    const top = Math.floor(fullTop / scale);
    const right = Math.max(left + 1, Math.ceil(fullRight / scale));
    const bottom = Math.max(top + 1, Math.ceil(fullBottom / scale));

    const floorWidth = right - left;
    const floorHeight = bottom - top;
    const local = new Uint8Array(floorWidth * floorHeight);

    for (let y = 0; y < floorHeight; y++) {
      for (let x = 0; x < floorWidth; x++) {
        const sx = Math.min(source.width - 1, left + x);
        const sy = Math.min(source.height - 1, top + y);
        local[y * floorWidth + x] = source.data[sy * source.width + sx];
      }
    }

    const regions = findEnclosedRegions(local, floorWidth, floorHeight)
      .filter(region => isRoomRegion(region, floorWidth, floorHeight));
    const uniqueRegions = dedupeRegions(regions);

    for (const region of uniqueRegions) {
      rooms.push({
        id: `room-${nextId++}`,
        x: fullLeft + region.x * scale,
        y: fullTop + region.y * scale,
        width: Math.max(1, region.width * scale),
        height: Math.max(1, region.height * scale),
      });
    }

    console.log(`${floor.name}: ${uniqueRegions.length} enclosed room regions`);
  }

  console.log(`Detected ${rooms.length} rooms from real pixel geometry`);
  return rooms;
}
