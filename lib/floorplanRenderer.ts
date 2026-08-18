import { FloorPlan, RoomChange, Point } from "@/lib/types/floorPlan";

function escapeXml(text: string): string { return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function norm(value: unknown): string { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function isBedroom(room: any): boolean { return norm(room?.type).includes("bedroom") || norm(room?.name).includes("bedroom"); }
function isEnsuite(room: any): boolean { return /ensuite|en-suite/i.test(`${room?.type || ""} ${room?.name || ""}`); }
function polygonPoints(points?: Point[]): string | null { if (!points || points.length < 3) return null; return points.map(p => `${Number(p.x)},${Number(p.y)}`).join(" "); }
function roomCenter(room: any): { x: number; y: number } {
  const points = room?.polygon as Point[] | undefined;
  if (!points || points.length < 3) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length], cross = a.x * b.y - b.x * a.y; area2 += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross; }
  if (Math.abs(area2) < 1e-6) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}
function roomFill(room: any, floorIndex: number): string { if (isEnsuite(room)) return "#38bdf8"; const fills = ["#facc15", "#86efac", "#f0a3d7", "#c4b5fd", "#fdba74"]; return fills[Math.max(0, floorIndex) % fills.length]; }
function renderRoom(room: any, label: string, kind: "bedroom" | "ensuite", floorIndex: number, clipId?: string): string {
  const x = Number(room?.x), y = Number(room?.y), w = Number(room?.width), h = Number(room?.height); if (!(w > 0 && h > 0)) return "";
  const points = polygonPoints(room?.polygon), fill = roomFill(room, floorIndex), stroke = kind === "ensuite" ? "#075985" : "#334155";
  const shape = points ? `<polygon points="${points}" fill="${fill}" fill-opacity="0.58" stroke="${stroke}" stroke-width="5" vector-effect="non-scaling-stroke"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="0.58" stroke="${stroke}" stroke-width="5"/>`;
  const center = roomCenter(room), font = Math.max(10, Math.min(20, Math.min(w, h) / 5)), badge = Math.max(70, Math.min(145, label.length * 10 + 28)), badgeH = Math.max(22, Math.min(38, h * 0.18)), bx = center.x - badge / 2, by = center.y - badgeH / 2;
  const clip = clipId ? ` clip-path="url(#${clipId})"` : "";
  return `<g${clip}>${shape}<rect x="${bx}" y="${by}" width="${badge}" height="${badgeH}" rx="6" fill="${stroke}" fill-opacity="0.96"/><text x="${center.x}" y="${center.y + font * 0.34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="800" fill="white">${escapeXml(label)}</text></g>`;
}
function makeClipPath(id: string, room: any): string { const points = polygonPoints(room?.polygon); return points ? `<clipPath id="${id}"><polygon points="${points}"/></clipPath>` : `<clipPath id="${id}"><rect x="${Number(room.x)}" y="${Number(room.y)}" width="${Number(room.width)}" height="${Number(room.height)}"/></clipPath>`; }
function maskOriginal(room: any): string { const points = polygonPoints(room?.polygon); return points ? `<polygon points="${points}" fill="white" fill-opacity="0.78"/>` : `<rect x="${Number(room.x)}" y="${Number(room.y)}" width="${Number(room.width)}" height="${Number(room.height)}" fill="white" fill-opacity="0.78"/>`; }

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, changes: RoomChange[] = []): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;
  const originals = new Map<string, any>();
  for (const floor of original.floors) for (const room of floor.rooms) originals.set(String(room.id).trim().toLowerCase(), room);

  const defs: string[] = [], overlays: string[] = [], rendered = new Set<string>();
  const changedIds = new Set(changes.map(c => String(c?.roomId || "").trim().toLowerCase()).filter(Boolean));
  const proposedBedrooms: Array<{ room: any; floorIndex: number; id: string }> = [];
  const proposedEnsuites: Array<{ room: any; floorIndex: number; id: string }> = [];

  proposed.floors.forEach((floor, floorIndex) => {
    floor.rooms.forEach(room => {
      const id = String(room.id).trim().toLowerCase();
      if (isBedroom(room)) proposedBedrooms.push({ room, floorIndex, id });
      if (isEnsuite(room)) proposedEnsuites.push({ room, floorIndex, id });
    });
  });

  // Mask only source rooms whose geometry/type actually changed. Unchanged
  // bedrooms remain visible in the source image and are then explicitly
  // annotated below as part of the final proposed scheme.
  for (const id of changedIds) {
    const before = originals.get(id); if (!before) continue;
    const clipId = `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    defs.push(makeClipPath(clipId, before));
    overlays.push(`<g clip-path="url(#${clipId})">${maskOriginal(before)}</g>`);
  }

  // IMPORTANT: render every final bedroom, not only changed bedrooms. The
  // previous renderer produced an empty overlay for a valid scheme where all
  // existing bedrooms were retained, which incorrectly displayed "NO VALID
  // PROPOSED GEOMETRY" despite the final plan containing valid bedrooms.
  proposedBedrooms.forEach(({ room, floorIndex, id }, index) => {
    const originalRoom = originals.get(id);
    const changed = changedIds.has(id) || !originalRoom || !sameGeometry(originalRoom, room);
    const clipId = changed && originalRoom ? `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
    const label = `Bedroom ${index + 1}`;
    const renderedRoom = renderRoom(room, label, "bedroom", floorIndex, clipId);
    if (renderedRoom) { overlays.push(renderedRoom); rendered.add(id); }
  });

  proposedEnsuites.forEach(({ room, floorIndex }) => {
    const renderedRoom = renderRoom(room, "En-suite", "ensuite", floorIndex);
    if (renderedRoom) overlays.push(renderedRoom);
  });

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase();
    if (!id || rendered.has(id)) continue;
    const floor = proposed.floors.find(f => f.rooms.some(r => String(r.id).trim().toLowerCase() === id));
    const room = floor?.rooms.find(r => String(r.id).trim().toLowerCase() === id);
    if (!room || isBedroom(room) || isEnsuite(room)) continue;
    const originalRoom = originals.get(id), clipId = originalRoom ? `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
    const renderedRoom = renderRoom(room, String(room.name || room.type || "PROPOSED").toUpperCase(), "bedroom", floor?.level ?? 0, clipId);
    if (renderedRoom) overlays.push(renderedRoom);
  }

  const finalBedrooms = proposedBedrooms.length;
  const finalEnsuites = proposedEnsuites.length;
  const bannerText = `${finalBedrooms} BEDROOMS  |  ${finalEnsuites} PRIVATE EN-SUITES`;
  const bannerWidth = Math.min(width - 30, Math.max(430, bannerText.length * 14));
  const banner = `<g><rect x="15" y="15" width="${bannerWidth}" height="46" rx="10" fill="#14532d" fill-opacity="0.96"/><text x="35" y="45" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="white">${escapeXml(bannerText)}</text></g>`;
  const legend = `<g><rect x="18" y="${height - 54}" width="${Math.min(width - 36, 610)}" height="36" rx="8" fill="#111827" fill-opacity="0.93"/><circle cx="38" cy="${height - 36}" r="7" fill="#facc15"/><text x="52" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="white">BEDROOM</text><circle cx="155" cy="${height - 36}" r="7" fill="#38bdf8"/><text x="169" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="white">PRIVATE EN-SUITE</text><text x="360" y="${height - 31}" font-family="Arial,sans-serif" font-size="14" font-weight="600" fill="#d1d5db">FINAL VALIDATED GEOMETRY</text></g>`;
  const emptyWarning = finalBedrooms === 0 ? `<g><rect x="20" y="70" width="${Math.min(width - 40, 620)}" height="58" rx="8" fill="#b91c1c" fill-opacity="0.96"/><text x="42" y="107" font-family="Arial,sans-serif" font-size="21" font-weight="800" fill="white">NO VALID BEDROOM GEOMETRY</text></g>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join("")}</defs><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${overlays.join("")}</g>${banner}${legend}${emptyWarning}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function sameGeometry(a: any, b: any): boolean {
  if (!a || !b) return false;
  const ap = polygonPoints(a.polygon), bp = polygonPoints(b.polygon);
  if (ap && bp) return ap === bp;
  return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y) && Number(a.width) === Number(b.width) && Number(a.height) === Number(b.height) && norm(a.type) === norm(b.type);
}
