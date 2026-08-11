import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roomFill(type: string): string {
  const value = type.toLowerCase();
  if (value.includes("bed")) return "#4f8cff";
  if (value.includes("bath") || value.includes("ensuite") || value.includes("shower")) return "#34d399";
  if (value.includes("kitchen")) return "#f59e0b";
  return "#a78bfa";
}

function normaliseAction(action?: string): string {
  return String(action || "").toLowerCase().replace(/[^a-z]/g, "");
}

function targetType(change: RoomChange): string {
  const explicit = String(change.newType || "").trim().toLowerCase();
  if (explicit) return explicit;

  switch (normaliseAction(change.action)) {
    case "converttobedroom": return "bedroom";
    case "converttokitchen": return "kitchen";
    case "converttobathroom": return "bathroom";
    case "converttoensuite": return "ensuite";
    default: return "";
  }
}

function isNoOpConversion(beforeType: string, target: string): boolean {
  const before = beforeType.toLowerCase();
  const after = target.toLowerCase();

  if (!after) return true;
  if (after.includes("bedroom")) return before.includes("bedroom");
  if (after.includes("bathroom")) return before.includes("bathroom") || before.includes("shower") || before.includes("ensuite");
  if (after.includes("kitchen")) return before.includes("kitchen");
  if (after.includes("ensuite")) return before.includes("ensuite");
  return before === after;
}

function shouldRenderChange(change: RoomChange, before: any, after: any): boolean {
  const action = normaliseAction(change.action);
  if (!action || action === "nochange") return false;

  const target = targetType(change);
  if (target && isNoOpConversion(String(before?.type || ""), target)) {
    return false;
  }

  return true;
}

/**
 * Render the immutable uploaded plan and highlight ONLY rooms referenced by
 * meaningful AI changes. Room labels are deliberately excluded from the
 * change detection path so labelling every detected room cannot colour the
 * whole plan.
 */
export function renderFloorPlan(
  original: FloorPlan,
  proposed: FloorPlan,
  originalImageDataUri: string,
  changes: RoomChange[] = []
): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;

  const originalRooms = new Map<string, any>();
  for (const floor of original.floors) {
    for (const room of floor.rooms) originalRooms.set(room.id.trim().toLowerCase(), room);
  }

  const proposedRooms = new Map<string, any>();
  for (const floor of proposed.floors) {
    for (const room of floor.rooms) proposedRooms.set(room.id.trim().toLowerCase(), room);
  }

  const changedRooms: any[] = [];
  const seen = new Set<string>();

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase();
    if (!id || seen.has(id)) continue;

    const before = originalRooms.get(id);
    const after = proposedRooms.get(id);
    if (!before || !after) continue;
    if (!shouldRenderChange(change, before, after)) continue;

    const action = normaliseAction(change.action);
    const typeChanged = String(before.type || "").toLowerCase() !== String(after.type || "").toLowerCase();
    const structuralChange = /split|merge|extend|partition|doorway|opening/.test(action);

    if (!typeChanged && !structuralChange) continue;

    changedRooms.push({ room: after, change });
    seen.add(id);
  }

  const overlays = changedRooms.map(({ room, change }) => {
    const label = escapeXml(room.name || room.type || "Proposed Room");
    const fill = roomFill(room.type || "");
    const fontSize = Math.max(12, Math.min(30, Math.min(room.width, room.height) / 6));
    const actionLabel = normaliseAction(change.action).includes("bedroom") ? "Proposed Bedroom" : label;

    return `
      <rect
        x="${room.x}"
        y="${room.y}"
        width="${room.width}"
        height="${room.height}"
        fill="${fill}"
        fill-opacity="0.32"
        stroke="#2563eb"
        stroke-width="5"
        stroke-dasharray="12 7"
      />
      <text
        x="${room.x + room.width / 2}"
        y="${room.y + room.height / 2}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#111827"
        stroke="white"
        stroke-width="4"
        paint-order="stroke"
      >${escapeXml(actionLabel)}</text>
    `;
  }).join("\n");

  const emptyMessage = changedRooms.length === 0
    ? `<text x="${width / 2}" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#166534" stroke="white" stroke-width="5" paint-order="stroke">Original layout retained — no verified geometry changes</text>`
    : "";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  <g>${overlays}</g>
  ${emptyMessage}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
