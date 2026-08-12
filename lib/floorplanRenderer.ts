import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  if (target && isNoOpConversion(String(before?.type || ""), target) && action !== "converttoensuite") return false;
  const typeChanged = String(before?.type || "").toLowerCase() !== String(after?.type || "").toLowerCase();
  const structuralChange = /split|merge|extend|partition|doorway|opening/.test(action);
  return typeChanged || structuralChange || action === "converttoensuite";
}

function fixtureOverlay(room: any): string {
  const type = String(room.type || "").toLowerCase();
  if (!(type.includes("bath") || type.includes("shower") || type.includes("ensuite"))) return "";
  const x = Number(room.x), y = Number(room.y), w = Number(room.width), h = Number(room.height);
  if (!(w > 20 && h > 20)) return "";
  const pad = Math.max(6, Math.min(w, h) * 0.10);
  const shower = Math.max(18, Math.min(w, h) * 0.38);
  const sx = x + w - shower - pad;
  const sy = y + pad;
  const cx = x + pad + Math.min(w * 0.18, 26);
  const cy = y + h - pad - Math.min(h * 0.22, 26);
  return `
    <rect x="${sx}" y="${sy}" width="${shower}" height="${shower}" rx="4" fill="none" stroke="#047857" stroke-width="3"/>
    <circle cx="${sx + shower / 2}" cy="${sy + shower / 2}" r="${Math.max(3, shower * 0.08)}" fill="none" stroke="#047857" stroke-width="2"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${Math.max(6, w * 0.07)}" ry="${Math.max(8, h * 0.10)}" fill="none" stroke="#047857" stroke-width="2"/>
    <circle cx="${x + w * 0.43}" cy="${y + h * 0.78}" r="${Math.max(4, Math.min(w, h) * 0.04)}" fill="white" stroke="#047857" stroke-width="2"/>`;
}

function actionLabel(change: RoomChange, room: any): string {
  const action = normaliseAction(change.action);
  if (action === "converttobedroom") return change.newName || "Bedroom";
  if (action === "converttobathroom") return change.newName || "Shower Room";
  if (action === "converttoensuite") return "Bedroom + En-suite";
  if (action === "splitroom") return change.newName || change.split?.firstName || room.name || "Bedroom";
  return change.newName || room.name || room.type || "Proposed Room";
}

function renderRoomOverlay(room: any, change: RoomChange, isEnsuite = false): string {
  const fill = roomFill(room.type || "");
  const w = Number(room.width), h = Number(room.height), x = Number(room.x), y = Number(room.y);
  const label = escapeXml(isEnsuite ? "EN-SUITE" : actionLabel(change, room));
  const labelSize = Math.max(11, Math.min(22, Math.min(w, h) / 8));
  const badgeWidth = Math.min(Math.max(w * 0.70, 92), 220);
  const badgeHeight = labelSize + 18;
  const badgeX = x + (w - badgeWidth) / 2;
  const badgeY = y + (h - badgeHeight) / 2;
  const fixture = isEnsuite ? fixtureOverlay(room) : "";
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="0.18" stroke="${isEnsuite ? "#047857" : "#1d4ed8"}" stroke-width="4" stroke-dasharray="10 7"/>
    ${fixture}
    <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="6" fill="#111827" fill-opacity="0.90"/>
    <text x="${x + w / 2}" y="${y + h / 2 + labelSize * 0.34}" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700" text-anchor="middle" fill="white">${label}</text>`;
}

export function renderFloorPlan(original: FloorPlan, proposed: FloorPlan, originalImageDataUri: string, changes: RoomChange[] = []): string {
  const width = original.metadata?.imageWidth ?? proposed.metadata?.imageWidth ?? 1600;
  const height = original.metadata?.imageHeight ?? proposed.metadata?.imageHeight ?? 1200;

  const originalRooms = new Map<string, any>();
  for (const floor of original.floors) for (const room of floor.rooms) originalRooms.set(room.id.trim().toLowerCase(), room);
  const proposedRooms = new Map<string, any>();
  for (const floor of proposed.floors) for (const room of floor.rooms) proposedRooms.set(room.id.trim().toLowerCase(), room);

  const overlays: string[] = [];
  const rendered = new Set<string>();

  for (const change of changes) {
    const id = String(change?.roomId || "").trim().toLowerCase();
    if (!id || rendered.has(id)) continue;
    const before = originalRooms.get(id);
    const after = proposedRooms.get(id);
    if (!before || !after || !shouldRenderChange(change, before, after)) continue;

    const action = normaliseAction(change.action);
    overlays.push(renderRoomOverlay(after, change, false));
    rendered.add(id);

    if (action === "converttoensuite") {
      const ensuite = proposedRooms.get(`${id}-ensuite`);
      if (ensuite) overlays.push(renderRoomOverlay(ensuite, { ...change, action: "ConvertToEnsuite", newName: "En-suite" }, true));
    }

    if (action === "splitroom") {
      const second = [...proposedRooms.values()].find((candidate: any) => String(candidate?.notes || "").includes(`Created by split of ${before.id}`));
      if (second) {
        const secondIsEnsuite = /ensuite|bath|shower/i.test(String(second.type || ""));
        overlays.push(renderRoomOverlay(second, {
          ...change,
          action: secondIsEnsuite ? "ConvertToEnsuite" : "ConvertToBedroom",
          newName: secondIsEnsuite ? "En-suite" : (change.split?.secondName || "Bedroom 2"),
          newType: second.type,
          split: undefined,
        }, secondIsEnsuite));
      }
    }
  }

  const emptyMessage = overlays.length === 0
    ? `<text x="${width / 2}" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#166534" stroke="white" stroke-width="5" paint-order="stroke">Original layout retained — no verified geometry changes</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <image href="${escapeXml(originalImageDataUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>
    <g>${overlays.join("\n")}</g>
    ${emptyMessage}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
