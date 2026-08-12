import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function escapeXml(text: string): string { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
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
function renderRoom(room: any, label: string, isEnsuite = false, clipId?: string): string {
  const x = Number(room.x), y = Number(room.y), w = Number(room.width), h = Number(room.height);
  if (!(w > 0 && h > 0)) return "";
  const badgeW = Math.max(1, Math.min(w - 6, Math.min(220, Math.max(48, w * 0.72))));
  const badgeH = Math.max(18, Math.min(h - 6, 24));
  const bx = x + (w - badgeW) / 2, by = y + (h - badgeH) / 2;
  const font = Math.max(8, Math.min(16, Math.min(w, h) / 7));
  const clip = clipId ? ` clip-path="url(#${clipId})"` : "";
  return `<g${clip}>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill(room.type || "")}" fill-opacity="0.22" stroke="${isEnsuite ? "#047857" : "#1d4ed8"}" stroke-width="3" stroke-dasharray="8 5"/>
    <rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4" fill="#111827" fill-opacity="0.92"/>
    <text x="${x + w / 2}" y="${y + h / 2 + font * 0.34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="700" fill="white">${escapeXml(label)}</text>
  </g>`;
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
    defs.push(`<clipPath id="${clipId}"><rect x="${Number(before.x)}" y="${Number(before.y)}" width="${Number(before.width)}" height="${Number(before.height)}"/></clipPath>`);
    const action = normaliseAction(change.action);
    const label = action === "converttobedroom" ? (change.newName || "Bedroom") : action === "converttobathroom" ? (change.newName || "Shower Room") : action === "splitroom" ? (change.split?.firstName || after.name || "Bedroom") : after.name || after.type || "Proposed Room";
    overlays.push(renderRoom(after, label, false, clipId));
    rendered.add(id);
    if (action === "converttoensuite") {
      const ensuite = proposedRooms.get(`${id}-ensuite`);
      if (ensuite) overlays.push(renderRoom(ensuite, "EN-SUITE", true, clipId));
    }
    if (action === "splitroom") {
      const second = [...proposedRooms.values()].find((candidate: any) => String(candidate?.notes || "").includes(`Created by split of ${before.id}`));
      if (second) overlays.push(renderRoom(second, /ensuite|bath|shower/i.test(String(second.type || "")) ? "EN-SUITE" : (change.split?.secondName || "Bedroom"), /ensuite|bath|shower/i.test(String(second.type || "")), clipId));
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join("")}</defs><image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${overlays.join("")}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
