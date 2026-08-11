import { loadImage } from "./loadImage";
import { DetectedFloor } from "@/lib/types/floorPlan";

const DARK_THRESHOLD = 130;
const DILATION_SIZE = 7;
const FLOOR_COUNT = 3;

function buildBarrier(data: Uint8Array): Uint8Array {
  const barrier = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    barrier[i] = data[i] < DARK_THRESHOLD ? 1 : 0;
  }
  return barrier;
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

function countCandidateRooms(
  barrier: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): number {
  const width = right - left;
  const height = bottom - top;
  if (width < 10 || height < 10) return 0;

  const local = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      local[y * width + x] = barrier[(top + y) * imageWidth + left + x];
    }
  }

  const closed = dilateBinary(local, width, height, DILATION_SIZE);
  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  const floorArea = width * height;
  let candidates = 0;

  const index = (x: number, y: number) => y * width + x;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const start = index(x, y);
      if (closed[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      queueX[tail] = x;
      queueY[tail] = y;
      tail++;
      visited[start] = 1;
      let touchesEdge = false;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        area++;

        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        if (cx <= 1 || cy <= 1 || cx >= width - 2 || cy >= height - 2) {
          touchesEdge = true;
        }

        const neighbours = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbours) {
          if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
          const ni = index(nx, ny);
          if (closed[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail++;
        }
      }

      if (touchesEdge) continue;

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const fraction = area / floorArea;
      const aspect = Math.max(
        componentWidth / Math.max(1, componentHeight),
        componentHeight / Math.max(1, componentWidth)
      );

      if (
        area >= Math.max(250, floorArea * 0.008) &&
        fraction <= 0.18 &&
        componentWidth >= 10 &&
        componentHeight >= 10 &&
        aspect <= 6
      ) {
        candidates++;
      }
    }
  }

  return candidates;
}

function orientationScore(
  barrier: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  sideBySide: boolean
): number {
  let score = 0;

  for (let level = 0; level < FLOOR_COUNT; level++) {
    if (sideBySide) {
      const left = Math.floor((imageWidth * level) / FLOOR_COUNT);
      const right = level === FLOOR_COUNT - 1
        ? imageWidth
        : Math.floor((imageWidth * (level + 1)) / FLOOR_COUNT);
      score += countCandidateRooms(
        barrier,
        imageWidth,
        imageHeight,
        left,
        0,
        right,
        imageHeight
      );
    } else {
      const top = Math.floor((imageHeight * level) / FLOOR_COUNT);
      const bottom = level === FLOOR_COUNT - 1
        ? imageHeight
        : Math.floor((imageHeight * (level + 1)) / FLOOR_COUNT);
      score += countCandidateRooms(
        barrier,
        imageWidth,
        imageHeight,
        0,
        top,
        imageWidth,
        bottom
      );
    }
  }

  return score;
}

export async function detectFloors(imagePath: string): Promise<DetectedFloor[]> {
  const image = await loadImage(imagePath);
  const { width, height, data } = image;

  if (!width || !height) return [];

  const barrier = buildBarrier(data);
  const horizontalScore = orientationScore(barrier, width, height, true);
  const verticalScore = orientationScore(barrier, width, height, false);
  const sideBySide = horizontalScore >= verticalScore;

  console.log(
    `Floor orientation scores: left-to-right=${horizontalScore}, top-to-bottom=${verticalScore}; selected=${sideBySide ? "left-to-right" : "top-to-bottom"}`
  );

  const floors: DetectedFloor[] = [];

  for (let level = 0; level < FLOOR_COUNT; level++) {
    const name = ["Ground Floor", "First Floor", "Second Floor"][level] ?? `Floor ${level + 1}`;

    if (sideBySide) {
      floors.push({
        name,
        level,
        top: 0,
        bottom: height,
        left: Math.floor((width * level) / FLOOR_COUNT),
        right: level === FLOOR_COUNT - 1
          ? width
          : Math.floor((width * (level + 1)) / FLOOR_COUNT),
      });
    } else {
      floors.push({
        name,
        level,
        top: Math.floor((height * level) / FLOOR_COUNT),
        bottom: level === FLOOR_COUNT - 1
          ? height
          : Math.floor((height * (level + 1)) / FLOOR_COUNT),
        left: 0,
        right: width,
      });
    }
  }

  return floors;
}
