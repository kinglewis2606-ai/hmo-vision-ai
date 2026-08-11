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
  if (value.includes("bath") || value.includes("ensuite")) return "#34d399";
  if (value.includes("kitchen")) return "#f59e0b";
  return "#a78bfa";
}

export function renderFloorPlan(
  original: FloorPlan,
  proposed: FloorPlan,
  originalImageDataUri: string
): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;

  const roomOverlays = proposed.floors.flatMap(floor =>
    floor.rooms.map(room => ({ floor, room }))
  );

  const overlays = roomOverlays.map(({ floor, room }) => {
    const label = escapeXml(room.name || room.type || "Room");
    const changed = original.floors
      .flatMap(f => f.rooms)
      .find(r => r.id === room.id)?.type !== room.type ||
      original.floors.flatMap(f => f.rooms).find(r => r.id === room.id)?.name !== room.name;

    const fill = roomFill(room.type || "");
    const opacity = changed ? 0.34 : 0.12;
    const stroke = changed ? "#2563eb" : "#ffffff";

    const fontSize = Math.max(12, Math.min(28, Math.min(room.width, room.height) / 7));

    return `
      <rect
        x="${room.x}"
        y="${room.y}"
        width="${room.width}"
        height="${room.height}"
        fill="${fill}"
        fill-opacity="${opacity}"
        stroke="${stroke}"
        stroke-width="4"
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
        stroke-width="3"
        paint-order="stroke"
      >${label}</text>
    `;
  }).join("\n");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  <g>${overlays}</g>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
