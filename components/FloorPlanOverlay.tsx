"use client";

import type { FloorPlan, Point, Room } from "@/lib/types/floorPlan";
import { areasConserve, pointInPolygon, polygonArea, polygonSelfIntersects } from "@/lib/geometryValidation";

interface Props {
  image: string;
  originalFloorPlan?: FloorPlan | null;
  proposedFloorPlan?: FloorPlan | null;
}

const normalise = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isBedroom = (room: Room) => normalise(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite = (room: Room) => normalise(`${room.type} ${room.name}`).includes("ensuite");

function allRooms(plan?: FloorPlan | null): Room[] {
  return plan?.floors?.flatMap((floor) => floor.rooms || []) || [];
}

function baseSourceRoom(roomId: string, originals: Map<string, Room>): Room | undefined {
  let id = roomId;
  while (id) {
    const exact = originals.get(normalise(id));
    if (exact) return exact;
    if (!id.endsWith("-split-2")) break;
    id = id.slice(0, -8);
  }
  return undefined;
}

function polygon(points?: Point[]) {
  return points && points.length >= 3 ? points : undefined;
}

function polygonInside(source: Point[] | undefined, child: Point[] | undefined) {
  if (!source || !child || source.length < 3 || child.length < 3) return false;
  if (polygonSelfIntersects(source) || polygonSelfIntersects(child)) return false;
  return child.every((point) => pointInPolygon(point, source));
}

function sourceRoomForEnsuite(ensuite: Room, proposed: Map<string, Room>, originals: Map<string, Room>) {
  const parentId = ensuite.id.endsWith("-split-2") ? ensuite.id.slice(0, -8) : "";
  const parent = parentId ? proposed.get(normalise(parentId)) : undefined;
  const source = parent ? baseSourceRoom(parent.id, originals) : undefined;
  return { parent, source };
}

function validEnsuite(ensuite: Room, proposed: Map<string, Room>, originals: Map<string, Room>) {
  const { parent, source } = sourceRoomForEnsuite(ensuite, proposed, originals);
  if (!parent || !source) return false;
  const sourcePolygon = polygon(source.polygon);
  const parentPolygon = polygon(parent.polygon);
  const ensuitePolygon = polygon(ensuite.polygon);
  if (!sourcePolygon || !parentPolygon || !ensuitePolygon) return false;
  if (!polygonInside(sourcePolygon, ensuitePolygon)) return false;
  if (!polygonInside(sourcePolygon, parentPolygon)) return false;

  // For a direct source room, the two resulting polygons must conserve its area.
  // For a previously split room, the server has already validated the exact
  // parent subdivision; the UI only enforces containment so it never paints
  // an ensuite into blank space outside the detected source geometry.
  if (parent.id === source.id) {
    return areasConserve(source, parentPolygon, ensuitePolygon, 0.02);
  }
  return polygonArea(ensuitePolygon) > 0;
}

export default function FloorPlanOverlay({ image, originalFloorPlan, proposedFloorPlan }: Props) {
  const width = Number(originalFloorPlan?.metadata?.imageWidth || proposedFloorPlan?.metadata?.imageWidth || 1000);
  const height = Number(originalFloorPlan?.metadata?.imageHeight || proposedFloorPlan?.metadata?.imageHeight || 1400);
  const originals = new Map(allRooms(originalFloorPlan).map((room) => [normalise(room.id), room]));
  const proposedRooms = allRooms(proposedFloorPlan);
  const proposed = new Map(proposedRooms.map((room) => [normalise(room.id), room]));
  const overlays = proposedRooms.filter((room) => {
    if (!room.polygon?.length) return false;
    if (isEnsuite(room)) return validEnsuite(room, proposed, originals);
    if (!isBedroom(room)) return false;
    const source = baseSourceRoom(room.id, originals);
    return !!source?.polygon?.length && polygonInside(source.polygon, room.polygon);
  });

  return (
    <div className="relative w-full bg-white">
      <img src={image} className="block h-auto w-full" alt="Original floor plan with validated proposed HMO geometry" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {overlays.map((room, index) => {
          const points = room.polygon!.map((point) => `${point.x},${point.y}`).join(" ");
          const ensuite = isEnsuite(room);
          const label = ensuite ? "En-suite" : `Bedroom ${index + 1}`;
          const fill = ensuite ? "#38bdf8" : "#86efac";
          const stroke = ensuite ? "#075985" : "#166534";
          const xs = room.polygon!.map((point) => point.x);
          const ys = room.polygon!.map((point) => point.y);
          const cx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
          const cy = ys.reduce((sum, value) => sum + value, 0) / ys.length;
          return (
            <g key={`${room.id}-${index}`}>
              <polygon points={points} fill={fill} fillOpacity="0.48" stroke={stroke} strokeWidth="5" vectorEffect="non-scaling-stroke" />
              <text x={cx} y={cy} fill="white" textAnchor="middle" fontSize="18" fontWeight="800" paintOrder="stroke" stroke={stroke} strokeWidth="6">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {overlays.length === 0 && (
        <div className="absolute left-4 top-4 rounded-lg bg-red-700/95 px-4 py-2 text-sm font-extrabold text-white shadow-lg">
          NO VALID PROPOSED GEOMETRY
        </div>
      )}
    </div>
  );
}
