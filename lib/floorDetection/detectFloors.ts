import fs from "fs";
import sharp from "sharp";
import { openai } from "@/lib/openai";
import { DetectedFloor, DetectedRoom, Point } from "@/lib/types/floorPlan";

type VisionRoom = {
  candidateId?: number;
  floorIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  polygon?: Point[];
};

type VisionPlan = {
  floors?: Array<{
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
  rooms?: VisionRoom[];
};

let cachePath = "";
let cache: VisionPlan | null = null;

function cleanJson(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

function validRoom(room: VisionRoom, width: number, height: number): boolean {
  const x = Number(room.x);
  const y = Number(room.y);
  const w = Number(room.width);
  const h = Number(room.height);

  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w >= 20 &&
    h >= 20 &&
    w <= width &&
    h <= height &&
    x >= 0 &&
    y >= 0 &&
    x + w <= width + 2 &&
    y + h <= height + 2
  );
}

function normalisePolygon(room: VisionRoom): Point[] | undefined {
  if (!Array.isArray(room.polygon) || room.polygon.length < 3) return undefined;

  const polygon = room.polygon.map((p) => ({
    x: Number(p.x),
    y: Number(p.y),
  }));

  const x = Number(room.x);
  const y = Number(room.y);
  const right = x + Number(room.width);
  const bottom = y + Number(room.height);

  if (
    polygon.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < x - 3 ||
        p.y < y - 3 ||
        p.x > right + 3 ||
        p.y > bottom + 3
    )
  ) {
    return undefined;
  }

  return polygon;
}

function normaliseRoomCoordinates(room: VisionRoom, floors: NonNullable<VisionPlan["floors"]>): VisionRoom {
  const floorIndex = Number(room.floorIndex);
  const floor = Number.isInteger(floorIndex) ? floors[floorIndex] : undefined;
  if (!floor) return room;

  const x = Number(room.x);
  const y = Number(room.y);
  const width = Number(room.width);
  const height = Number(room.height);
  const floorX = Number(floor.x ?? 0);
  const floorY = Number(floor.y ?? 0);
  const floorWidth = Number(floor.width ?? 0);
  const floorHeight = Number(floor.height ?? 0);
  if (![x, y, width, height, floorX, floorY, floorWidth, floorHeight].every(Number.isFinite)) return room;
  if (!(floorWidth > 0 && floorHeight > 0)) return room;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const insideGlobalFloor =
    centerX >= floorX && centerX <= floorX + floorWidth &&
    centerY >= floorY && centerY <= floorY + floorHeight;

  // Vision sometimes returns coordinates relative to each detected floor panel
  // even though the prompt requests original-image coordinates. Convert those
  // local coordinates to the single global image coordinate system used by the
  // renderer. This is especially important when floors are side-by-side.
  const looksLikeFloorLocal =
    centerX >= 0 && centerY >= 0 &&
    centerX <= floorWidth && centerY <= floorHeight;

  if (insideGlobalFloor || !looksLikeFloorLocal) return room;

  const offsetX = floorX;
  const offsetY = floorY;
  const polygon = Array.isArray(room.polygon)
    ? room.polygon.map((p) => ({ x: Number(p.x) + offsetX, y: Number(p.y) + offsetY }))
    : room.polygon;

  return {
    ...room,
    x: x + offsetX,
    y: y + offsetY,
    polygon,
  };
}

function normalisePlanRoomCoordinates(detected: VisionPlan): VisionPlan {
  const floors = Array.isArray(detected.floors) ? detected.floors : [];
  if (!floors.length || !Array.isArray(detected.rooms)) return detected;
  return {
    ...detected,
    rooms: detected.rooms.map((room) => normaliseRoomCoordinates(room, floors)),
  };
}

async function detectWithVision(filePath: string): Promise<VisionPlan | null> {
  const source = fs.readFileSync(filePath);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) return null;

  const image = await sharp(source)
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Act as a strict architectural floor-plan geometry detector. Detect the actual floor-plan panels and every distinct enclosed room in this image. Do not assume three floors, equal-sized panels, a fixed orientation, or a fixed room count. Return JSON only: {"floors":[{"name":"","x":0,"y":0,"width":0,"height":0}],"rooms":[{"floorIndex":0,"x":0,"y":0,"width":0,"height":0,"polygon":[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}]}]}. Coordinates MUST be pixels in the original ${width}x${height} image. A room boundary is the interior face of its enclosing walls; do not draw a box around text, furniture, whitespace, compass, watermark or a whole floor panel. Every returned room geometry MUST sit directly over a genuinely enclosed room visible in the source image. Follow wall lines and door openings. Do not invent or split rooms. Prefer a conservative boundary inside the walls over a floating or oversized rectangle. If you reason about a floor panel using its local coordinates, convert every room coordinate back to the original full-image coordinate system before returning it.`,
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${image.toString("base64")}`,
            detail: "high",
          },
        ],
      },
    ],
  });

  try {
    return JSON.parse(cleanJson(response.output_text || "")) as VisionPlan;
  } catch {
    return null;
  }
}

async function verifyAndCorrectRooms(
  filePath: string,
  detected: VisionPlan,
  width: number,
  height: number
): Promise<VisionPlan> {
  const rooms = Array.isArray(detected.rooms)
    ? detected.rooms.filter((room) => validRoom(room, width, height))
    : [];

  if (!rooms.length) return detected;

  const source = fs.readFileSync(filePath);
  const image = await sharp(source)
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const candidates = rooms.map((room, index) => ({
    candidateId: index + 1,
    floorIndex: Number.isFinite(Number(room.floorIndex))
      ? Number(room.floorIndex)
      : undefined,
    x: Math.round(Number(room.x)),
    y: Math.round(Number(room.y)),
    width: Math.round(Number(room.width)),
    height: Math.round(Number(room.height)),
  }));

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `You are the final geometry verification pass for a floor-plan analysis. The supplied image is the ORIGINAL floor plan. Candidate room rectangles are listed below. Inspect the actual wall lines and correct each candidate so it overlays the real enclosed room, not blank page space, text, watermark, compass or a neighbouring room. Preserve a candidate only if it is a real enclosed room. You may adjust x/y/width/height and return an optional polygon following the visible room boundary. Do not invent rooms and do not move a room to another floor. Coordinates are ORIGINAL ${width}x${height} image pixels. A candidate is valid only when it visibly overlays an enclosed room. Reject floating squares/rectangles that do not coincide with walls. Candidates: ${JSON.stringify(candidates)}`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${image.toString("base64")}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    const parsed = JSON.parse(cleanJson(response.output_text || "{}"));
    if (!Array.isArray(parsed.rooms)) return detected;

    const corrected: VisionRoom[] = parsed.rooms
      .map((room: any) => ({
        candidateId: Number(room.candidateId),
        floorIndex: Number.isFinite(Number(room.floorIndex))
          ? Number(room.floorIndex)
          : undefined,
        x: Number(room.x),
        y: Number(room.y),
        width: Number(room.width),
        height: Number(room.height),
        polygon: room.polygon,
      }))
      .filter(
        (room: VisionRoom) =>
          Number.isInteger(room.candidateId) &&
          room.candidateId! >= 1 &&
          room.candidateId! <= rooms.length &&
          validRoom(room, width, height)
      )
      .sort(
        (a: VisionRoom, b: VisionRoom) =>
          Number(a.candidateId) - Number(b.candidateId)
      );

    if (corrected.length < Math.max(2, Math.floor(rooms.length * 0.55))) {
      return detected;
    }

    return { ...detected, rooms: corrected };
  } catch (error) {
    console.warn(
      "Room geometry verification failed; retaining first-pass geometry",
      error
    );
    return detected;
  }
}

export async function detectFloors(
  filePath: string
): Promise<DetectedFloor[]> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) return [];

  if (cachePath === filePath && cache?.floors?.length) {
    return cache.floors.map((floor, index) => ({
      name: floor.name || `Floor ${index + 1}`,
      level: index,
      top: Math.max(0, Math.round(floor.y || 0)),
      left: Math.max(0, Math.round(floor.x || 0)),
      bottom: Math.min(
        height,
        Math.round((floor.y || 0) + (floor.height || 0))
      ),
      right: Math.min(
        width,
        Math.round((floor.x || 0) + (floor.width || 0))
      ),
    }));
  }

  try {
    const detected = await detectWithVision(filePath);

    if (detected?.floors?.length && (detected.rooms?.length ?? 0) >= 2) {
      const normalised = normalisePlanRoomCoordinates(detected);
      const verified = await verifyAndCorrectRooms(
        filePath,
        normalised,
        width,
        height
      );

      cachePath = filePath;
      cache = verified;

      return (verified.floors || normalised.floors || detected.floors).map((floor, index) => ({
        name: floor.name || `Floor ${index + 1}`,
        level: index,
        top: Math.max(0, Math.round(floor.y || 0)),
        left: Math.max(0, Math.round(floor.x || 0)),
        bottom: Math.min(
          height,
          Math.round((floor.y || 0) + (floor.height || 0))
        ),
        right: Math.min(
          width,
          Math.round((floor.x || 0) + (floor.width || 0))
        ),
      }));
    }
  } catch (error) {
    console.warn(
      "Vision floor/room detection failed; using contour fallback",
      error
    );
  }

  cachePath = filePath;
  cache = null;

  return [
    {
      name: "Floor Plan",
      level: 0,
      top: 0,
      bottom: height,
      left: 0,
      right: width,
    },
  ];
}

export function getVisionDetectedRooms(
  filePath: string
): DetectedRoom[] | null {
  if (cachePath !== filePath || !cache?.rooms?.length) return null;

  return cache.rooms
    .map((room, index) => {
      const x = Math.round(Number(room.x) || 0);
      const y = Math.round(Number(room.y) || 0);
      const width = Math.round(Number(room.width) || 0);
      const height = Math.round(Number(room.height) || 0);
      const polygon = normalisePolygon(room);

      return {
        id: `room-${index + 1}`,
        x,
        y,
        width,
        height,
        ...(polygon ? { polygon } : {}),
      };
    })
    .filter((room) => room.width >= 20 && room.height >= 20);
}
