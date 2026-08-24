import { FloorPlan, RoomChange, Point } from "./types/floorPlan";
import { polygonContainsPolygon } from "./geometryValidation";

function escapeXml(text: unknown): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBedroom(room: any): boolean {
  return norm(`${room?.type || ""} ${room?.name || ""}`).includes("bedroom");
}

function isEnsuite(room: any): boolean {
  return norm(`${room?.type || ""} ${room?.name || ""}`).includes("ensuite");
}

function polygonPoints(points?: Point[]): string | null {
  if (!points || points.length < 3) return null;
  return points.map((p) => `${Number(p.x)},${Number(p.y)}`).join(" ");
}

function polygonArea(points?: Point[]): number {
  if (!points || points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

function roomCenter(room: any): { x: number; y: number } {
  const p = room?.polygon as Point[] | undefined;
  if (!p || p.length < 3) {
    return {
      x: Number(room?.x || 0) + Number(room?.width || 0) / 2,
      y: Number(room?.y || 0) + Number(room?.height || 0) / 2,
    };
  }
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const cross = a.x * b.y - b.x * a.y;
    a2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(a2) < 1e-6) {
    return { x: Number(room?.x || 0) + Number(room?.width || 0) / 2, y: Number(room?.y || 0) + Number(room?.height || 0) / 2 };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

function baseId(id: string): string {
  return id.replace(/-split-2$/i, "");
}

function sourceFor(room: any, originals: Map<string, any>): any | undefined {
  const id = String(room?.id || "").trim().toLowerCase();
  return originals.get(id) || originals.get(baseId(id));
}

function validAnchored(room: any, source: any): boolean {
  const p = room?.polygon as Point[] | undefined;
  const sp = source?.polygon as Point[] | undefined;
  if (!p || p.length < 3 || !sp || sp.length < 3) return false;
  return polygonContainsPolygon(sp, p);
}

function sameGeometry(a: any, b: any): boolean {
  const ap = polygonPoints(a?.polygon);
  const bp = polygonPoints(b?.polygon);
  return !!ap && !!bp && ap === bp;
}

function roomColour(room: any): { fill: string; stroke: string } {
  if (isEnsuite(room)) return { fill: "#38bdf8", stroke: "#075985" };
  if (isBedroom(room)) return { fill: "#facc15", stroke: "#334155" };
  return { fill: "#cbd5e1", stroke: "#475569" };
}

function labelFor(room: any, index: number): string {
  if (isEnsuite(room)) return "EN-SUITE";
  if (isBedroom(room)) return `BEDROOM ${index + 1}`;
  const name = String(room?.name || room?.type || "ROOM").trim();
  return name.length > 24 ? name.slice(0, 24) : name;
}

function renderChangedRoom(room: any, source: any, label: string, isNewInternalSpace: boolean): string {
  const points = polygonPoints(room?.polygon);
  if (!points) return "";
  const { fill, stroke } = roomColour(room);
  const center = roomCenter(room);
  const approxArea = Number(room?.approxAreaSqm || 0);
  const pxArea = polygonArea(room?.polygon);
  const areaText = approxArea > 0 ? `${approxArea.toFixed(1)} m²` : pxArea > 0 ? "" : "";
  const font = Math.max(12, Math.min(20, Math.min(Number(room?.width || 100), Number(room?.height || 100)) / 5));
  const badgeWidth = Math.max(92, Math.min(175, label.length * 9 + 34));
  const badgeHeight = areaText ? 42 : 30;
  const bx = center.x - badgeWidth / 2;
  const by = center.y - badgeHeight / 2;
  const sourceClip = polygonPoints(source?.polygon);
  const clipId = sourceClip ? `clip-${String(room.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` : "";
  const fillOpacity = isNewInternalSpace ? 0.72 : 0.22;
  const strokeWidth = isNewInternalSpace ? 6 : 4;
  const clipDef = sourceClip ? `<clipPath id="${clipId}"><polygon points="${sourceClip}"/></clipPath>` : "";
  const clipAttr = clipId ? ` clip-path="url(#${clipId})"` : "";
  const areaLine = areaText ? `<text x="${center.x}" y="${center.y + 14}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="white">${escapeXml(areaText)}</text>` : "";
  const hatch = isNewInternalSpace
    ? `<path d="M ${bx - 8} ${by + badgeHeight + 5} L ${bx + badgeWidth + 8} ${by - 5}" stroke="white" stroke-width="2" opacity="0.35"/>`
    : "";
  return `${clipDef}<g${clipAttr} data-room-id="${escapeXml(room.id)}"><polygon points="${points}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><rect x="${bx}" y="${by}" width="${badgeWidth}" height="${badgeHeight}" rx="6" fill="${stroke}" fill-opacity="0.94"/><text x="${center.x}" y="${center.y - (areaText ? 2 : -5)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="800" fill="white">${escapeXml(label)}</text>${areaLine}${hatch}</g>`;
}

function renderChangedRooms(original: FloorPlan, proposed: FloorPlan): string {
  const originals = new Map<string, any>();
  for (const floor of original.floors) {
    for (const room of floor.rooms) originals.set(String(room.id).trim().toLowerCase(), room);
  }
  const defs: string[] = [];
  const overlays: string[] = [];
  const rendered = new Set<string>();
  let bedroomIndex = 0;

  for (const floor of proposed.floors) {
    for (const room of floor.rooms) {
      const source = sourceFor(room, originals);
      if (!source || !validAnchored(room, source)) continue;
      const id = String(room.id).trim().toLowerCase();
      const changed = !sameGeometry(source, room);
      if (!changed) continue;
      const label = labelFor(room, bedroomIndex);
      if (isBedroom(room)) bedroomIndex += 1;
      const sourcePoints = polygonPoints(source?.polygon);
      if (sourcePoints) defs.push(`<clipPath id="clip-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}"><polygon points="${sourcePoints}"/></clipPath>`);
      overlays.push(renderChangedRoom(room, source, label, isEnsuite(room) || id.endsWith("-split-2")));
      rendered.add(id);
    }
  }

  // If the deterministic planner retained an original bedroom unchanged, it is
  // already visible in the source drawing and must not be painted over.
  // Only genuinely changed geometry is therefore rendered here.
  return `<defs>${defs.join("")}</defs><g>${overlays.filter(Boolean).join("")}</g>`;
}

function renderLegend(width: number, height: number): string {
  const y = height - 54;
  return `<g><rect x="18" y="${y}" width="${Math.min(width - 36, 700)}" height="36" rx="8" fill="#111827" fill-opacity="0.94"/><circle cx="38" cy="${y + 18}" r="7" fill="#facc15"/><text x="52" y="${y + 23}" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="white">BEDROOM</text><circle cx="155" cy="${y + 18}" r="7" fill="#38bdf8"/><text x="169" y="${y + 23}" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="white">PRIVATE EN-SUITE</text><text x="350" y="${y + 23}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#d1d5db">ORIGINAL EXTERNAL SHELL PRESERVED</text></g>`;
}

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, _changes: RoomChange[] = []): string {
  const width = Number(original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600);
  const height = Number(original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200);
  const bedroomCount = proposed.floors.flatMap((f) => f.rooms).filter(isBedroom).length;
  const ensuiteCount = proposed.floors.flatMap((f) => f.rooms).filter(isEnsuite).length;
  const overlay = renderChangedRooms(original, proposed);
  const bannerText = `${bedroomCount} BEDROOMS  |  ${ensuiteCount} PRIVATE EN-SUITES`;
  const bannerWidth = Math.min(width - 30, Math.max(430, bannerText.length * 14));
  const banner = `<g><rect x="15" y="15" width="${bannerWidth}" height="46" rx="10" fill="#14532d" fill-opacity="0.96"/><text x="35" y="45" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="white">${escapeXml(bannerText)}</text></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>${overlay}${banner}${renderLegend(width, height)}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
