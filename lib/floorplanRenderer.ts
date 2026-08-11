import { FloorPlan } from "@/lib/types/floorPlan";

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

function roomKey(room: { id: string }): string {
  return room.id.trim().toLowerCase();
}

/**
 * Render the original uploaded plan as the immutable base image and draw only
 * verified changes on top. Unchanged rooms are intentionally not labelled:
 * the source image already contains the original walls/room annotations and
 * duplicating them creates the misleading "coloured copy" effect.
 */
export function renderFloorPlan(
  original: FloorPlan,
  proposed: FloorPlan,
  originalImageDataUri: string
): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;

  const originalRooms = new Map<string, any>();
  for (const floor of original.floors) {
    for (const room of floor.rooms) originalRooms.set(roomKey(room), room);
  }

  const changedRooms: any[] = [];
  for (const floor of proposed.floors) {
    for (const room of floor.rooms) {
      const before = originalRooms.get(roomKey(room));
      if (!before) continue;

      const typeChanged = String(before.type || "").toLowerCase() !== String(room.type || "").toLowerCase();
      const nameChanged = String(before.name || "").toLowerCase() !== String(room.name || "").toLowerCase();
      const notesChanged = String(before.notes || "") !== String(room.notes || "");

      if (typeChanged || nameChanged || notesChanged) {
        changedRooms.push({ room, before });
      }
    }
  }

  const overlays = changedRooms.map(({ room }) => {
    const label = escapeXml(room.name || room.type || "Proposed Room");
    const fill = roomFill(room.type || "");
    const fontSize = Math.max(12, Math.min(30, Math.min(room.width, room.height) / 6));

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
      >${label}</text>
    `;
  }).join("\n");

  const emptyMessage = changedRooms.length === 0
    ? `<text x="${width / 2}" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#b91c1c" stroke="white" stroke-width="5" paint-order="stroke">No verified room changes to draw</text>`
    : "";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  <g>${overlays}</g>
  ${emptyMessage}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
