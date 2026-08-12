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
  if (target && isNoOpConversion(String(before?.type || ""), target)) return false;

  const typeChanged = String(before?.type || "").toLowerCase() !== String(after?.type || "").toLowerCase();
  const structuralChange = /split|merge|extend|partition|doorway|opening/.test(action);
  const amenityChange = action === "converttoensuite" || action === "extendbathroom";

  return typeChanged || structuralChange || amenityChange;
}

function fixtureOverlay(room: any, change: RoomChange): string {
  const action = normaliseAction(change.action);
  const type = String(room.type || "").toLowerCase();
  const x = Number(room.x);
  const y = Number(room.y);
  const w = Number(room.width);
  const h = Number(room.height);

  if (!(w > 20 && h > 20)) return "";

  const parts: string[] = [];
  const isWetRoom =
    type.includes("bath") ||
    type.includes("shower") ||
    type.includes("ensuite") ||
    /converttobathroom|converttoensuite|extendbathroom/.test(action);

  if (isWetRoom) {
    const pad = Math.max(8, Math.min(w, h) * 0.08);
    const showerW = Math.max(24, Math.min(w * 0.42, h * 0.42));
    const showerH = showerW;
    const sx = x + w - showerW - pad;
    const sy = y + pad;

    parts.push(`<rect x="${sx}" y="${sy}" width="${showerW}" height="${showerH}" rx="4" fill="none" stroke="#047857" stroke-width="4"/>`);
    parts.push(`<circle cx="${sx + showerW / 2}" cy="${sy + showerH / 2}" r="${Math.max(4, showerW * 0.08)}" fill="none" stroke="#047857" stroke-width="3"/>`);
    parts.push(`<path d="M ${sx + showerW * 0.72} ${sy + showerH * 0.2} q ${showerW * 0.2} ${showerH * 0.15} 0 ${showerH * 0.35}" fill="none" stroke="#047857" stroke-width="3"/>`);

    const cx = x + pad + Math.min(w * 0.16, 34);
    const cy = y + h - pad - Math.min(h * 0.18, 34);
    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(8, w * 0.07)}" ry="${Math.max(11, h * 0.09)}" fill="none" stroke="#047857" stroke-width="3"/>`);
    parts.push(`<circle cx="${x + pad + Math.min(w * 0.36, 60)}" cy="${y + h - pad - Math.min(h * 0.2, 38)}" r="${Math.max(6, Math.min(w, h) * 0.045)}" fill="white" stroke="#047857" stroke-width="3"/>`);
  }

  if (action === "splitroom" && change.split) {
    if (change.split.direction === "vertical") {
      const px = x + w / 2;
      parts.push(`<line x1="${px}" y1="${y}" x2="${px}" y2="${y + h}" stroke="#dc2626" stroke-width="6" stroke-dasharray="14 8"/>`);
    } else {
      const py = y + h / 2;
      parts.push(`<line x1="${x}" y1="${py}" x2="${x + w}" y2="${py}" stroke="#dc2626" stroke-width="6" stroke-dasharray="14 8"/>`);
    }
  }

  return parts.join("\n");
}

function actionLabel(change: RoomChange, room: any): string {
  const action = normaliseAction(change.action);
  if (action === "converttobedroom") return change.newName || "Proposed Bedroom";
  if (action === "converttobathroom") return change.newName || "Proposed Shower Room";
  if (action === "converttoensuite") return change.newName || "Bedroom + En-suite";
  if (action === "splitroom") {
    const first = change.split?.firstName || "Room A";
    const second = change.split?.secondName || "Room B";
    return `${first} + ${second}`;
  }
  return change.newName || room.name || room.type || "Proposed Room";
}

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

  const changedRooms: Array<{ room: any; change: RoomChange }> = [];
  const seen = new Set<string>();

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase();
    if (!id || seen.has(id)) continue;

    const before = originalRooms.get(id);
    const after = proposedRooms.get(id);
    if (!before || !after) continue;
    if (!shouldRenderChange(change, before, after)) continue;

    changedRooms.push({ room: after, change });
    seen.add(id);

    // A real split creates a second proposed room. Render that second geometry
    // too; otherwise the UI would claim two bedrooms while visually showing one.
    if (normaliseAction(change.action) === "splitroom") {
      const second = [...proposedRooms.values()].find((candidate: any) =>
        String(candidate?.notes || "").includes(`Created by split of ${before.id}`)
      );
      if (second) {
        changedRooms.push({
          room: second,
          change: {
            ...change,
            action: "ConvertToBedroom",
            newName: change.split?.secondName || "Bedroom 2",
            split: undefined,
          },
        });
      }
    }
  }

  const overlays = changedRooms.map(({ room, change }) => {
    const fill = roomFill(room.type || "");
    const fontSize = Math.max(12, Math.min(28, Math.min(room.width, room.height) / 7));
    const label = escapeXml(actionLabel(change, room));
    const fixture = fixtureOverlay(room, change);
    const badgeWidth = Math.min(Math.max(room.width * 0.84, 120), 300);
    const badgeX = room.x + room.width / 2 - badgeWidth / 2;
    const badgeY = room.y + room.height / 2 - fontSize - 12;

    return `
      <rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"
        fill="${fill}" fill-opacity="0.22" stroke="#1d4ed8" stroke-width="5" stroke-dasharray="12 7" />
      ${fixture}
      <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${fontSize + 24}" rx="8" fill="#111827" fill-opacity="0.86" />
      <text x="${room.x + room.width / 2}" y="${room.y + room.height / 2}"
        font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700"
        text-anchor="middle" dominant-baseline="middle" fill="white">${label}</text>`;
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
