import { loadImage } from "./loadImage";
import { DetectedRoom, DetectedFloor, Point } from "@/lib/types/floorPlan";

const DARK_THRESHOLD = 130;
const BASE_DILATION_SIZE = 5;
const DOOR_CLOSING_DILATION_SIZE = 15;
const MAX_ANALYSIS_DIMENSION = 1000;

interface Region {
  area: number;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon: Point[];
}

function buildBarrier(data: Uint8Array): Uint8Array {
  const barrier = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) barrier[i] = data[i] < DARK_THRESHOLD ? 1 : 0;
  return barrier;
}

function resizeNearest(source: Uint8Array, width: number, height: number, scale: number): { data: Uint8Array; width: number; height: number } {
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

function dilateBinary(source: Uint8Array, width: number, height: number, size: number): Uint8Array {
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
          if (source[yy * width + xx]) { found = true; break; }
        }
      }
      output[y * width + x] = found ? 1 : 0;
    }
  }
  return output;
}

type Edge = { a: Point; b: Point };
function pointKey(point: Point): string { return `${point.x},${point.y}`; }

function simplifyPolygon(points: Point[]): Point[] {
  if (points.length < 4) return points;
  const cleaned: Point[] = [];
  for (const point of points) {
    const last = cleaned[cleaned.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) cleaned.push(point);
  }
  if (cleaned.length > 1) {
    const first = cleaned[0], last = cleaned[cleaned.length - 1];
    if (first.x === last.x && first.y === last.y) cleaned.pop();
  }
  if (cleaned.length < 3) return cleaned;
  let changed = true;
  let current = cleaned;
  while (changed && current.length >= 3) {
    changed = false;
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const prev = current[(i - 1 + current.length) % current.length];
      const point = current[i];
      const following = current[(i + 1) % current.length];
      const collinear = (prev.x === point.x && point.x === following.x) || (prev.y === point.y && point.y === following.y);
      if (collinear) { changed = true; continue; }
      next.push(point);
    }
    current = next;
  }
  return current;
}

function polygonFromCells(cells: number[], width: number, height: number, closed: Uint8Array): Point[] {
  const edges: Edge[] = [];
  for (const cell of cells) {
    const y = Math.floor(cell / width);
    const x = cell - y * width;
    const open = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < width && ny < height && !closed[ny * width + nx];
    if (!open(x, y - 1)) edges.push({ a: { x, y }, b: { x: x + 1, y } });
    if (!open(x + 1, y)) edges.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 } });
    if (!open(x, y + 1)) edges.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 } });
    if (!open(x - 1, y)) edges.push({ a: { x, y: y + 1 }, b: { x, y } });
  }
  if (!edges.length) return [];
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = pointKey(edge.a);
    const list = outgoing.get(key) || [];
    list.push(edge);
    outgoing.set(key, list);
  }
  const used = new Set<string>();
  const loops: Point[][] = [];
  const edgeKey = (edge: Edge) => `${pointKey(edge.a)}>${pointKey(edge.b)}`;
  for (const start of edges) {
    if (used.has(edgeKey(start))) continue;
    const loop: Point[] = [];
    let edge = start;
    let guard = 0;
    while (guard++ < edges.length + 10) {
      const key = edgeKey(edge);
      if (used.has(key)) break;
      used.add(key);
      if (!loop.length) loop.push(edge.a);
      loop.push(edge.b);
      if (pointKey(edge.b) === pointKey(start.a)) break;
      const candidates = (outgoing.get(pointKey(edge.b)) || []).filter(candidate => !used.has(edgeKey(candidate)));
      if (!candidates.length) break;
      edge = candidates[0];
    }
    if (loop.length >= 4 && pointKey(loop[0]) === pointKey(loop[loop.length - 1])) loops.push(loop.slice(0, -1));
  }
  if (!loops.length) return [];
  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return simplifyPolygon(loops[0]);
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function findEnclosedRegions(barrier: Uint8Array, width: number, height: number, dilationSize: number): Region[] {
  const closed = dilateBinary(barrier, width, height, dilationSize);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const regions: Region[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const start = y * width + x;
      if (closed[start] || visited[start]) continue;
      let head = 0, tail = 0, area = 0;
      let minX = x, minY = y, maxX = x, maxY = y, touchesEdge = false;
      const cells: number[] = [];
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const current = queue[head++];
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        cells.push(current);
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
      const polygon = polygonFromCells(cells, width, height, closed);
      regions.push({ area, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, polygon });
    }
  }
  return regions;
}

function isRoomRegion(region: Region, floorWidth: number, floorHeight: number): boolean {
  const floorArea = floorWidth * floorHeight;
  const fraction = region.area / floorArea;
  const aspect = Math.max(region.width / Math.max(1, region.height), region.height / Math.max(1, region.width));
  return region.area >= Math.max(80, floorArea * 0.008) && fraction <= 0.18 && region.width >= 8 && region.height >= 8 && aspect <= 6;
}

function dedupeRegions(regions: Region[]): Region[] {
  const sorted = [...regions].sort((a, b) => b.area - a.area);
  const kept: Region[] = [];
  for (const region of sorted) {
    const overlaps = kept.some(existing => {
      const left = Math.max(region.x, existing.x), top = Math.max(region.y, existing.y);
      const right = Math.min(region.x + region.width, existing.x + existing.width), bottom = Math.min(region.y + region.height, existing.y + existing.height);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      const smaller = Math.min(region.width * region.height, existing.width * existing.height);
      return smaller > 0 && intersection / smaller > 0.75;
    });
    if (!overlaps) kept.push(region);
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

function scoreRegions(regions: Region[], floorWidth: number, floorHeight: number): number {
  if (!regions.length) return -Infinity;
  const floorArea = floorWidth * floorHeight;
  const usable = regions.reduce((sum, r) => sum + r.area, 0) / floorArea;
  if (usable < 0.05) return -Infinity;
  return regions.length * 10 + Math.min(usable, 0.9);
}

export async function detectRooms(imagePath: string, floors: DetectedFloor[]): Promise<DetectedRoom[]> {
  if (!floors?.length) {
    console.log("Room detector received no floor bounds");
    return [];
  }
  const image = await loadImage(imagePath);
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / MAX_ANALYSIS_DIMENSION));
  const source = resizeNearest(buildBarrier(image.data), image.width, image.height, scale);
  console.log(`Room geometry analysis: ${image.width}x${image.height} -> ${source.width}x${source.height} (scale ${scale})`);

  const rooms: DetectedRoom[] = [];
  let nextId = 1;
  for (const floor of floors) {
    const fullLeft = Math.max(0, floor.left ?? 0);
    const fullTop = Math.max(0, floor.top ?? 0);
    const fullRight = Math.min(image.width, floor.right ?? image.width);
    const fullBottom = Math.min(image.height, floor.bottom ?? image.height);
    const left = Math.floor(fullLeft / scale), top = Math.floor(fullTop / scale);
    const right = Math.max(left + 1, Math.ceil(fullRight / scale)), bottom = Math.max(top + 1, Math.ceil(fullBottom / scale));
    const floorWidth = right - left, floorHeight = bottom - top;
    const local = new Uint8Array(floorWidth * floorHeight);
    for (let y = 0; y < floorHeight; y++) {
      for (let x = 0; x < floorWidth; x++) {
        const sx = Math.min(source.width - 1, left + x), sy = Math.min(source.height - 1, top + y);
        local[y * floorWidth + x] = source.data[sy * source.width + sx];
      }
    }
    const base = dedupeRegions(findEnclosedRegions(local, floorWidth, floorHeight, BASE_DILATION_SIZE).filter(region => isRoomRegion(region, floorWidth, floorHeight)));
    const closedDoors = dedupeRegions(findEnclosedRegions(local, floorWidth, floorHeight, DOOR_CLOSING_DILATION_SIZE).filter(region => isRoomRegion(region, floorWidth, floorHeight)));
    const uniqueRegions = scoreRegions(closedDoors, floorWidth, floorHeight) > scoreRegions(base, floorWidth, floorHeight) ? closedDoors : base;
    for (const region of uniqueRegions) {
      const polygon = region.polygon.map(point => ({ x: fullLeft + point.x * scale, y: fullTop + point.y * scale }));
      rooms.push({ id: `room-${nextId++}`, x: fullLeft + region.x * scale, y: fullTop + region.y * scale, width: Math.max(1, region.width * scale), height: Math.max(1, region.height * scale), polygon });
    }
    console.log(`${floor.name}: ${uniqueRegions.length} enclosed room regions (base=${base.length}, door-close=${closedDoors.length})`);
  }
  console.log(`Detected ${rooms.length} rooms from real pixel geometry`);
  return rooms;
}
