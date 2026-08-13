import { FloorPlan, RoomChange, Point } from "@/lib/types/floorPlan";

function escapeXml(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
function norm(value: unknown): string { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function isBedroom(room: any): boolean { return norm(room?.type).includes("bedroom") || norm(room?.name).includes("bedroom"); }
function isEnsuite(room: any): boolean { return /ensuite|en-suite/i.test(`${room?.type || ""} ${room?.name || ""}`); }
function polygonPoints(points?: Point[]): string | null { if (!points || points.length < 3) return null; return points.map(p => `${Number(p.x)},${Number(p.y)}`).join(" "); }
function roomCenter(room: any): { x: number; y: number } {
  const points = room?.polygon as Point[] | undefined;
  if (!points || points.length < 3) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; const cross = a.x * b.y - b.x * a.y; area2 += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross; }
  if (Math.abs(area2) < 1e-6) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}
function roomFill(room: any): string { if (isEnsuite(room)) return "#38bdf8"; if (isBedroom(room)) return "#8b5cf6"; return "#64748b"; }
function renderRoom(room: any, label: string, kind: "bedroom" | "ensuite", clipId?: string): string {
  const x = Number(room?.x), y = Number(room?.y), w = Number(room?.width), h = Number(room?.height); if (!(w > 0 && h > 0)) return "";
  const points = polygonPoints(room?.polygon), fill = roomFill(room), stroke = kind === "ensuite" ? "#075985" : "#6d28d9";
  const shape = points ? `<polygon points="${points}" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="6" vector-effect="non-scaling-stroke"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="6"/>`;
  const center = roomCenter(room), font = Math.max(11, Math.min(22, Math.min(w, h) / 5)), badge = label.length > 12 ? 150 : 120, badgeH = Math.max(25, Math.min(42, h * 0.2)), bx = center.x - badge / 2, by = center.y - badgeH / 2;
  const clip = clipId ? ` clip-path="url(#${clipId})"` : "";
  return `<g${clip}>${shape}<rect x="${bx}" y="${by}" width="${badge}" height="${badgeH}" rx="7" fill="${stroke}" fill-opacity="0.96" stroke="white" stroke-width="2"/><text x="${center.x}" y="${center.y + font * 0.34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="800" fill="white">${escapeXml(label)}</text></g>`;
}
function makeClipPath(id: string, room: any): string { const points = polygonPoints(room?.polygon); return points ? `<clipPath id="${id}"><polygon points="${points}"/></clipPath>` : `<clipPath id="${id}"><rect x="${Number(room.x)}" y="${Number(room.y)}" width="${Number(room.width)}" height="${Number(room.height)}"/></clipPath>`; }
function maskOriginal(room: any): string { const points = polygonPoints(room?.polygon); return points ? `<polygon points="${points}" fill="white" fill-opacity="0.82"/>` : `<rect x="${Number(room.x)}" y="${Number(room.y)}" width="${Number(room.width)}" height="${Number(room.height)}" fill="white" fill-opacity="0.82"/>`; }
function sameGeometry(a: any, b: any): boolean {
  if (!a || !b || norm(a.type) !== norm(b.type) || String(a.name || "") !== String(b.name || "")) return false;
  const ap = polygonPoints(a.polygon), bp = polygonPoints(b.polygon); if (ap && bp) return ap === bp;
  return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y) && Number(a.width) === Number(b.width) && Number(a.height) === Number(b.height);
}

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, changes: RoomChange[] = []): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600, height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;
  const originals = new Map<string, any>(), proposedRooms = new Map<string, any>();
  for (const floor of original.floors) for (const room of floor.rooms) originals.set(String(room.id).trim().toLowerCase(), room);
  for (const floor of proposed.floors) for (const room of floor.rooms) proposedRooms.set(String(room.id).trim().toLowerCase(), room);
  const defs: string[] = [], overlays: string[] = [], rendered = new Set<string>();
  const changedIds = new Set(changes.map(c => String(c?.roomId || "").trim().toLowerCase()).filter(Boolean));

  for (const id of changedIds) { const before = originals.get(id); if (!before) continue; const clipId = `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`; defs.push(makeClipPath(clipId, before)); overlays.push(`<g clip-path="url(#${clipId})">${maskOriginal(before)}</g>`); }

  // The final proposed geometry is the visual source of truth. This includes
  // newly-created split children such as en-suites, which have no original ID.
  for (const [id, room] of proposedRooms) {
    const bedroom = isBedroom(room), ensuite = isEnsuite(room); if (!bedroom && !ensuite) continue;
    const originalRoom = originals.get(id), changed = changedIds.has(id) || !originalRoom || !sameGeometry(originalRoom, room);
    if (!changed && !bedroom && !ensuite) continue;
    const clipId = originalRoom ? `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
    overlays.push(renderRoom(room, ensuite ? "EN-SUITE" : String(room.name || "BEDROOM").toUpperCase(), ensuite ? "ensuite" : "bedroom", clipId));
    rendered.add(id);
  }

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase(), room = proposedRooms.get(id);
    if (!room || rendered.has(id) || isBedroom(room) || isEnsuite(room)) continue;
    const originalRoom = originals.get(id), clipId = originalRoom ? `source-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
    overlays.push(renderRoom(room, String(room.name || room.type || "PROPOSED").toUpperCase(), "bedroom", clipId));
  }

  const finalBedrooms = [...proposedRooms.values()].filter(isBedroom).length, finalEnsuites = [...proposedRooms.values()].filter(isEnsuite).length;
  const bannerText = `${finalBedrooms} BEDROOMS  |  ${finalEnsuites} PRIVATE EN-SUITES`, bannerWidth = Math.min(width - 30, Math.max(430, bannerText.length * 14));
  const banner = `<g><rect x="15" y="15" width="${bannerWidth}" height="46" rx="10" fill="#14532d" fill-opacity="0.96"/><text x="35" y="45" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="white">${escapeXml(bannerText)}</text></g>`;
  const legend = `<g><rect x="18" y="${height - 54}" width="${Math.min(width - 36, 570)}" height="36" rx="8" fill="#111827" fill-opacity="0.93"/><circle cx="38" cy="${height - 36}" r="7" fill="#8b5cf6"/><text x="52" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="white">BEDROOM</text><circle cx="155" cy="${height - 36}" r="7" fill="#38bdf8"/><text x="169" y="${height - 31}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="white">PRIVATE EN-SUITE</text></g>`;
  const emptyWarning = overlays.length === 0 ? `<g><rect x="20" y="70" width="${Math.min(width - 40, 620)}" height="58" rx="8" fill="#b91c1c" fill-opacity="0.96"/><text x="42" y="107" font-family="Arial,sans-serif" font-size="21" font-weight="800" fill="white">NO VALID PROPOSED GEOMETRY</text></g>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join("")}</defs><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${overlays.join("")}</g>${banner}${legend}${emptyWarning}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
