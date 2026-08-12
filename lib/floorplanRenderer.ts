import { FloorPlan, RoomChange, Point } from "@/lib/types/floorPlan";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
function normaliseAction(action?: string): string { return String(action || "").toLowerCase().replace(/[^a-z]/g, ""); }
function targetType(change: RoomChange): string {
  const explicit = String(change.newType || "").trim().toLowerCase();
  if (explicit) return explicit;
  const action = normaliseAction(change.action);
  if (action === "converttobedroom") return "bedroom";
  if (action === "converttokitchen") return "kitchen";
  if (action === "converttobathroom") return "bathroom";
  if (action === "converttoensuite") return "ensuite";
  return "";
}
function isNoOp(before: string, target: string): boolean {
  const b = before.toLowerCase(), t = target.toLowerCase();
  if (!t) return true;
  if (t.includes("bedroom")) return b.includes("bedroom");
  if (t.includes("bathroom")) return b.includes("bathroom") || b.includes("shower") || b.includes("ensuite");
  if (t.includes("kitchen")) return b.includes("kitchen");
  if (t.includes("ensuite")) return b.includes("ensuite");
  return b === t;
}
function shouldRender(change: RoomChange, before: any, after: any): boolean {
  const action = normaliseAction(change.action);
  if (!action || action === "nochange") return false;
  const target = targetType(change);
  if (target && isNoOp(String(before?.type || ""), target) && action !== "converttoensuite") return false;
  return String(before?.type || "").toLowerCase() !== String(after?.type || "").toLowerCase() || /split|merge|extend|partition|doorway|opening/.test(action) || action === "converttoensuite";
}
function fill(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("bed")) return "#4f8cff";
  if (t.includes("bath") || t.includes("shower") || t.includes("ensuite")) return "#34d399";
  if (t.includes("kitchen")) return "#f59e0b";
  return "#a78bfa";
}
function polygonPoints(points?: Point[]): string | null {
  if (!points || points.length < 3) return null;
  return points.map(point => `${Number(point.x)},${Number(point.y)}`).join(" ");
}
function roomCenter(room: any): { x: number; y: number } {
  const points = room.polygon as Point[] | undefined;
  if (!points || points.length < 3) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < 1e-6) return { x: Number(room.x) + Number(room.width) / 2, y: Number(room.y) + Number(room.height) / 2 };
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}
function renderRoom(room: any, label: string, isEnsuite = false, clipId?: string, splitPart = false): string {
  const x = Number(room.x), y = Number(room.y), w = Number(room.width), h = Number(room.height);
  if (!(w > 0 && h > 0)) return "";
  const points = polygonPoints(room.polygon);
  const stroke = isEnsuite ? "#047857" : "#1d4ed8";
  const shape = points
    ? `<polygon points="${points}" fill="${fill(room.type || "")}" fill-opacity="0.28" stroke="${stroke}" stroke-width="${splitPart ? 2 : 2.5}" stroke-dasharray="${splitPart ? "6 4" : "none"}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill(room.type || "")}" fill-opacity="0.28" stroke="${stroke}" stroke-width="${splitPart ? 2 : 2.5}" stroke-dasharray="${splitPart ? "6 4" : "none"}/>`;
  const center = roomCenter(room);
  const badgeW = Math.max(48, Math.min(190, w * 0.62));
  const badgeH = Math.max(18, Math.min(24, h - 6));
  const bx = center.x - badgeW / 2, by = center.y - badgeH / 2;
  const font = Math.max(8, Math.min(15, Math.min(w, h) / 7));
  const clip = clipId ? ` clip-path="url(#${clipId})"` : "";
  return `<g${clip}>${shape}<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4" fill="#111827" fill-opacity="0.88"/><text x="${center.x}" y="${center.y + font * 0.34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="700" fill="white">${escapeXml(label)}</text></g>`;
}
function makeClipPath(id: string, room: any): string {
  const points = polygonPoints(room?.polygon);
  if (points) return `<clipPath id="${id}"><polygon points="${points}"/></clipPath>`;
  return `<clipPath id="${id}"><rect x="${Number(room?.x)}" y="${Number(room?.y)}" width="${Number(room?.width)}" height="${Number(room?.height)}"/></clipPath>`;
}

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, changes: RoomChange[] = []): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;
  const originals = new Map<string, any>(), proposedRooms = new Map<string, any>();
  for (const floor of original.floors) for (const room of floor.rooms) originals.set(room.id.trim().toLowerCase(), room);
  for (const floor of proposed.floors) for (const room of floor.rooms) proposedRooms.set(room.id.trim().toLowerCase(), room);
  const defs: string[] = [], overlays: string[] = [], rendered = new Set<string>();

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase();
    if (!id || rendered.has(id)) continue;
    const before = originals.get(id), after = proposedRooms.get(id);
    if (!before || !after || !shouldRender(change, before, after)) continue;
    const clipId = `clip-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    defs.push(makeClipPath(clipId, before));
    const action = normaliseAction(change.action);

    if (action === "splitroom") {
      // Render the two resulting polygons separately. Both are clipped to the
      // ORIGINAL bedroom boundary, so a proposed partition can never spill into
      // the corridor, another room, or outside the source room.
      overlays.push(renderRoom(after, change.split?.firstName || after.name || "Bedroom", false, clipId, true));
      const second = [...proposedRooms.values()].find((candidate: any) => String(candidate?.notes || "").includes(`Created by split of ${before.id}`));
      if (second) {
        const ensuite = /ensuite|bath|shower/i.test(String(second.type || ""));
        overlays.push(renderRoom(second, ensuite ? "EN-SUITE" : (change.split?.secondName || "Bedroom"), ensuite, clipId, true));
      }
    } else {
      const label = action === "converttobedroom" ? (change.newName || "Bedroom") : action === "converttobathroom" ? (change.newName || "Shower Room") : after.name || after.type || "Proposed Room";
      overlays.push(renderRoom(after, label, false, clipId));
      if (action === "converttoensuite") {
        const ensuite = proposedRooms.get(`${id}-ensuite`);
        if (ensuite) overlays.push(renderRoom(ensuite, "EN-SUITE", true, clipId, true));
      }
    }
    rendered.add(id);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join("")}</defs><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${overlays.join("")}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
