import { FloorPlan, RoomChange, Point, WallSide } from "./types/floorPlan";
import { polygonContainsPolygon } from "./geometryValidation";

// ORIGINAL EXTERNAL SHELL PRESERVED: proposed geometry is rendered as an overlay on the uploaded source image.

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function norm(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBedroom(room: any): boolean {
  return norm(`${room?.type || ""} ${room?.name || ""}`).includes("bedroom");
}

function isEnsuite(room: any): boolean {
  return /ensuite|en-suite/i.test(`${room?.type || ""} ${room?.name || ""}`);
}

function polygonPoints(points?: Point[]): string | null {
  if (!points || points.length < 3) return null;
  return points.map(p => `${Number(p.x)},${Number(p.y)}`).join(" ");
}

function polygonEdges(points?: Point[]): Array<[Point, Point]> {
  if (!points || points.length < 3) return [];
  return points.map((p, i) => [p, points[(i + 1) % points.length]]);
}

function roomCenter(room: any): { x: number; y: number } {
  const p = room?.polygon as Point[] | undefined;
  if (!p || p.length < 3) {
    return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  }
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const cross = a.x * b.y - b.x * a.y;
    a2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return Math.abs(a2) < 1e-6 ? { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 } : { x: cx / (3 * a2), y: cy / (3 * a2) };
}

function baseId(id: string): string { return id.replace(/-split-2$/i, ""); }

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

function bounds(room: any): { x: number; y: number; width: number; height: number } {
  const p = room?.polygon as Point[] | undefined;
  if (!p?.length) return { x: Number(room.x), y: Number(room.y), width: Number(room.width), height: Number(room.height) };
  const xs = p.map(v => v.x), ys = p.map(v => v.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function wallLineFor(room: any, wall: WallSide): { x1: number; y1: number; x2: number; y2: number } {
  if (wall === "top") return { x1: room.x, y1: room.y, x2: room.x + room.width, y2: room.y };
  if (wall === "bottom") return { x1: room.x, y1: room.y + room.height, x2: room.x + room.width, y2: room.y + room.height };
  if (wall === "left") return { x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.height };
  return { x1: room.x + room.width, y1: room.y, x2: room.x + room.width, y2: room.y + room.height };
}

function roomOpenings(room: any, kind: "doors" | "windows"): Array<{ wall: WallSide; start?: number; end?: number }> {
  const raw = Array.isArray(room?.[kind]) ? room[kind] : [];
  return raw.filter((o: any) => ["top", "bottom", "left", "right"].includes(o?.wall));
}

function openingGap(room: any, opening: { wall: WallSide; start?: number; end?: number }): string {
  const line = wallLineFor(room, opening.wall);
  const start = Number(opening.start), end = Number(opening.end);
  const horizontal = opening.wall === "top" || opening.wall === "bottom";
  const axisStart = horizontal ? room.x : room.y;
  const axisEnd = horizontal ? room.x + room.width : room.y + room.height;
  const s = Number.isFinite(start) && Number.isFinite(end) && end > start ? start : axisStart + (axisEnd - axisStart) * 0.42;
  const e = Number.isFinite(start) && Number.isFinite(end) && end > start ? end : axisStart + (axisEnd - axisStart) * 0.58;
  const pad = Math.max(3, (e - s) * 0.04);
  const a = s + pad, b = e - pad;
  if (horizontal) return `<line x1="${a}" y1="${line.y1}" x2="${b}" y2="${line.y1}" stroke="white" stroke-width="12" vector-effect="non-scaling-stroke"/>`;
  return `<line x1="${line.x1}" y1="${a}" x2="${line.x1}" y2="${b}" stroke="white" stroke-width="12" vector-effect="non-scaling-stroke"/>`;
}

function renderDoorSymbol(room: any, opening: { wall: WallSide; start?: number; end?: number }): string {
  const line = wallLineFor(room, opening.wall);
  const horizontal = opening.wall === "top" || opening.wall === "bottom";
  const axisStart = horizontal ? room.x : room.y;
  const axisEnd = horizontal ? room.x + room.width : room.y + room.height;
  const rawStart = Number(opening.start), rawEnd = Number(opening.end);
  const s = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart ? rawStart : axisStart + (axisEnd - axisStart) * 0.42;
  const e = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart ? rawEnd : axisStart + (axisEnd - axisStart) * 0.58;
  const centre = (s + e) / 2;
  const span = Math.max(18, e - s);
  const radius = span * 0.9;
  if (horizontal) {
    const y = line.y1;
    const hingeX = opening.wall === "top" ? s : e;
    const leafX = opening.wall === "top" ? Math.min(e, hingeX + span) : Math.max(s, hingeX - span);
    const direction = opening.wall === "top" ? -1 : 1;
    return `${openingGap(room, opening)}<path d="M ${hingeX} ${y} Q ${centre} ${y + direction * radius} ${leafX} ${y + direction * radius}" fill="none" stroke="#1e293b" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
  }
  const x = line.x1;
  const hingeY = opening.wall === "left" ? s : e;
  const leafY = opening.wall === "left" ? Math.min(e, hingeY + span) : Math.max(s, hingeY - span);
  const direction = opening.wall === "left" ? 1 : -1;
  return `${openingGap(room, opening)}<path d="M ${x} ${hingeY} Q ${x + direction * radius} ${centre} ${x + direction * radius} ${leafY}" fill="none" stroke="#1e293b" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
}

function renderWindowSymbol(room: any, opening: { wall: WallSide; start?: number; end?: number }): string {
  const line = wallLineFor(room, opening.wall);
  const horizontal = opening.wall === "top" || opening.wall === "bottom";
  const axisStart = horizontal ? room.x : room.y;
  const axisEnd = horizontal ? room.x + room.width : room.y + room.height;
  const rawStart = Number(opening.start), rawEnd = Number(opening.end);
  const s = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart ? rawStart : axisStart + (axisEnd - axisStart) * 0.35;
  const e = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart ? rawEnd : axisStart + (axisEnd - axisStart) * 0.65;
  if (horizontal) {
    const y = line.y1;
    return `<line x1="${s}" y1="${y}" x2="${e}" y2="${y}" stroke="white" stroke-width="16" vector-effect="non-scaling-stroke"/><line x1="${s}" y1="${y - 5}" x2="${e}" y2="${y - 5}" stroke="#64748b" stroke-width="3" vector-effect="non-scaling-stroke"/><line x1="${s}" y1="${y + 5}" x2="${e}" y2="${y + 5}" stroke="#64748b" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
  }
  const x = line.x1;
  return `<line x1="${x}" y1="${s}" x2="${x}" y2="${e}" stroke="white" stroke-width="16" vector-effect="non-scaling-stroke"/><line x1="${x - 5}" y1="${s}" x2="${x - 5}" y2="${e}" stroke="#64748b" stroke-width="3" vector-effect="non-scaling-stroke"/><line x1="${x + 5}" y1="${s}" x2="${x + 5}" y2="${e}" stroke="#64748b" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
}

function renderBoundary(room: any, stroke = "#172033", width = 7): string {
  return polygonEdges(room?.polygon).map(([a, b]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${width}" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="square"/>`).join("");
}

function renderNewInternalWalls(proposedRooms: any[]): string {
  const lines: string[] = [];
  for (let i = 0; i < proposedRooms.length; i++) {
    for (let j = i + 1; j < proposedRooms.length; j++) {
      const a = proposedRooms[i]?.polygon as Point[] | undefined;
      const b = proposedRooms[j]?.polygon as Point[] | undefined;
      if (!a || !b) continue;
      for (const [a1, a2] of polygonEdges(a)) for (const [b1, b2] of polygonEdges(b)) {
        const sameHorizontal = Math.abs(a1.y - a2.y) < 1 && Math.abs(b1.y - b2.y) < 1 && Math.abs(a1.y - b1.y) < 2;
        const sameVertical = Math.abs(a1.x - a2.x) < 1 && Math.abs(b1.x - b2.x) < 1 && Math.abs(a1.x - b1.x) < 2;
        if (sameHorizontal) {
          const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
          const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
          if (hi - lo > 8) lines.push(`<line x1="${lo}" y1="${a1.y}" x2="${hi}" y2="${a1.y}" stroke="#172033" stroke-width="9" vector-effect="non-scaling-stroke"/>`);
        }
        if (sameVertical) {
          const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
          const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
          if (hi - lo > 8) lines.push(`<line x1="${a1.x}" y1="${lo}" x2="${a1.x}" y2="${hi}" stroke="#172033" stroke-width="9" vector-effect="non-scaling-stroke"/>`);
        }
      }
    }
  }
  return Array.from(new Set(lines)).join("");
}

function renderLabel(room: any, label: string, kind: "bedroom" | "ensuite"): string {
  const c = roomCenter(room), b = bounds(room);
  const font = Math.max(12, Math.min(24, Math.min(b.width, b.height) / 5));
  const fill = kind === "ensuite" ? "#e0f2fe" : "#ffffff";
  const stroke = kind === "ensuite" ? "#0369a1" : "#172033";
  const badge = Math.max(110, Math.min(220, label.length * 13 + 34));
  const h = Math.max(30, font + 16);
  return `<g><rect x="${c.x - badge / 2}" y="${c.y - h / 2}" width="${badge}" height="${h}" rx="4" fill="${fill}" fill-opacity="0.94" stroke="${stroke}" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="${c.x}" y="${c.y + font * 0.34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="800" fill="#0f172a">${escapeXml(label)}</text></g>`;
}

function renderRoomMask(room: any, fill: string): string {
  const points = polygonPoints(room?.polygon);
  return points ? `<polygon points="${points}" fill="${fill}" fill-opacity="0.96" stroke="none"/>` : "";
}

function sourceOpeningSymbols(room: any): string {
  const doors = roomOpenings(room, "doors").map(o => renderDoorSymbol(room, o)).join("");
  const windows = roomOpenings(room, "windows").map(o => renderWindowSymbol(room, o)).join("");
  return doors + windows;
}

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, changes: RoomChange[] = []): string {
  void changes;
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;
  const originals = new Map<string, any>();
  for (const floor of original.floors) for (const room of floor.rooms) originals.set(String(room.id).trim().toLowerCase(), room);
  const proposedBedrooms: Array<{ room: any; floorIndex: number; id: string; source: any }> = [];
  const proposedEnsuites: Array<{ room: any; floorIndex: number; source: any }> = [];
  proposed.floors.forEach((floor, floorIndex) => floor.rooms.forEach(room => {
    const source = sourceFor(room, originals);
    if (isBedroom(room) && source && validAnchored(room, source)) proposedBedrooms.push({ room, floorIndex, id: String(room.id).trim().toLowerCase(), source });
    if (isEnsuite(room) && source && validAnchored(room, source)) proposedEnsuites.push({ room, floorIndex, source });
  }));
  const changedBedroomSources = proposedBedrooms.filter(x => !sameGeometry(x.source, x.room));
  const modifiedMasks = [...changedBedroomSources.map(x => renderRoomMask(x.source, "#ffffff")), ...proposedEnsuites.map(x => renderRoomMask(x.room, "#ffffff"))].join("");
  const newWalls = [...changedBedroomSources.map(x => renderBoundary(x.room)), ...proposedEnsuites.map(x => renderBoundary(x.room, "#172033", 6))].join("");
  const labels = proposedBedrooms.map((x, i) => renderLabel(x.room, `Bedroom ${i + 1}`, "bedroom")).join("") + proposedEnsuites.map(x => renderLabel(x.room, "En-suite", "ensuite")).join("");
  const openingSymbols = changedBedroomSources.map(x => sourceOpeningSymbols(x.source)).join("") + proposedEnsuites.map(x => sourceOpeningSymbols(x.room)).join("");
  const internalWalls = renderNewInternalWalls(changedBedroomSources.map(x => x.room).concat(proposedEnsuites.map(x => x.room)));
  const bannerText = `${proposedBedrooms.length} BEDROOMS  |  ${proposedEnsuites.length} PRIVATE EN-SUITES`;
  const bannerWidth = Math.min(width - 30, Math.max(430, bannerText.length * 14));
  const legend = `<g><rect x="18" y="${height - 54}" width="${Math.min(width - 36, 610)}" height="36" rx="6" fill="#ffffff" fill-opacity="0.94" stroke="#172033" stroke-width="2"/><rect x="32" y="${height - 44}" width="16" height="16" fill="#ffffff" stroke="#172033" stroke-width="2"/><text x="58" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#172033">BEDROOM</text><rect x="150" y="${height - 44}" width="16" height="16" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/><text x="176" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#172033">PRIVATE EN-SUITE</text><text x="390" y="${height - 31}" font-family="Arial,sans-serif" font-size="14" font-weight="600" fill="#475569">SOURCE-LOCKED PROPOSED GEOMETRY</text></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="blueprint-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.22"/></filter></defs><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${modifiedMasks}</g><g filter="url(#blueprint-shadow)">${newWalls}${internalWalls}${openingSymbols}</g><g>${labels}</g><g><rect x="15" y="15" width="${bannerWidth}" height="46" rx="6" fill="#ffffff" fill-opacity="0.96" stroke="#172033" stroke-width="2"/><text x="35" y="45" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="#172033">${escapeXml(bannerText)}</text></g>${legend}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
