// floorPlanRenderer.ts
// Renders a single floor from a FloorPlan to a PNG buffer using Canvas API.
// Works in Node.js via the 'canvas' package (optional), or produces an SVG
// fallback that is then returned as a data-URI if canvas is unavailable.

import type { Floor, Room, Wall } from "../types/floorPlan";

export interface RenderOptions {
  /** Target canvas width in pixels (default 800) */
  width?: number;
  /** Target canvas height in pixels (default 600) */
  height?: number;
  /** Background colour (default white) */
  background?: string;
  /** Wall colour */
  wallColour?: string;
  /** Highlight colour for modified rooms */
  modifiedColour?: string;
}

const ROOM_COLOURS: Record<string, string> = {
  bedroom: "#d0e8ff",
  bathroom: "#d8f5e8",
  kitchen: "#fff9c4",
  living_room: "#ffe0cc",
  dining_room: "#fce4ec",
  hallway: "#f5f5f5",
  staircase: "#e8eaf6",
  storage: "#f3e5f5",
  utility: "#e0f2f1",
  unknown: "#eceff1",
};

const MODIFIED_COLOUR = "#fff3cd";

/**
 * Render a floor to a base-64 PNG string.
 * Falls back to an SVG data-URI if the 'canvas' native module is unavailable.
 */
export async function renderFloor(
  floor: Floor,
  imageWidth: number,
  imageHeight: number,
  options: RenderOptions = {}
): Promise<string> {
  const targetW = options.width ?? 800;
  const targetH = options.height ?? 600;

  // Scale factor: map image-pixel coordinates to canvas coordinates
  const scaleX = targetW / Math.max(imageWidth, 1);
  const scaleY = targetH / Math.max(imageHeight, 1);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { createCanvas } = require(/* turbopackIgnore: true */ "canvas") as any;
    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = options.background ?? "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);

    // Draw rooms
    for (const room of floor.rooms) {
      const rx = Math.round(room.bounds.x * scaleX);
      const ry = Math.round(room.bounds.y * scaleY);
      const rw = Math.round(room.bounds.width * scaleX);
      const rh = Math.round(room.bounds.height * scaleY);

      ctx.fillStyle = room.modified
        ? (options.modifiedColour ?? MODIFIED_COLOUR)
        : (ROOM_COLOURS[room.type] ?? ROOM_COLOURS.unknown);
      ctx.fillRect(rx, ry, rw, rh);

      // Room border
      ctx.strokeStyle = "#555555";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);

      // Room label
      if (rw > 30 && rh > 18) {
        ctx.fillStyle = "#333333";
        const fontSize = Math.max(9, Math.min(13, Math.floor(rw / 7)));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          room.label,
          rx + rw / 2,
          ry + rh / 2,
          rw - 6
        );
        if (room.areaM2 != null && rh > 32) {
          ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
          ctx.fillStyle = "#666666";
          ctx.fillText(
            `${room.areaM2}m²`,
            rx + rw / 2,
            ry + rh / 2 + fontSize + 2,
            rw - 6
          );
        }
      }
    }

    // Draw walls
    ctx.strokeStyle = options.wallColour ?? "#222222";
    ctx.lineWidth = 2;
    for (const wall of floor.walls) {
      ctx.beginPath();
      ctx.moveTo(
        Math.round(wall.start.x * scaleX),
        Math.round(wall.start.y * scaleY)
      );
      ctx.lineTo(
        Math.round(wall.end.x * scaleX),
        Math.round(wall.end.y * scaleY)
      );
      ctx.stroke();
    }

    return canvas.toDataURL("image/png");
  } catch {
    // canvas package not available — produce SVG fallback
    return renderFloorSVG(floor, imageWidth, imageHeight, targetW, targetH, options);
  }
}

/** SVG fallback renderer */
function renderFloorSVG(
  floor: Floor,
  imageWidth: number,
  imageHeight: number,
  targetW: number,
  targetH: number,
  options: RenderOptions
): string {
  const scaleX = targetW / Math.max(imageWidth, 1);
  const scaleY = targetH / Math.max(imageHeight, 1);

  const bg = options.background ?? "#ffffff";
  const wallColour = options.wallColour ?? "#222222";

  const roomElements = floor.rooms
    .map((room) => {
      const rx = room.bounds.x * scaleX;
      const ry = room.bounds.y * scaleY;
      const rw = room.bounds.width * scaleX;
      const rh = room.bounds.height * scaleY;
      const fill = room.modified
        ? (options.modifiedColour ?? MODIFIED_COLOUR)
        : (ROOM_COLOURS[room.type] ?? ROOM_COLOURS.unknown);
      const label = escapeXml(room.label);
      const area = room.areaM2 != null ? `${room.areaM2}m²` : "";
      return `
  <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"
        fill="${fill}" stroke="#555" stroke-width="1.5"/>
  ${rw > 30 && rh > 18 ? `<text x="${(rx + rw / 2).toFixed(1)}" y="${(ry + rh / 2).toFixed(1)}"
        font-size="11" text-anchor="middle" dominant-baseline="middle" fill="#333">${label}</text>` : ""}
  ${area && rh > 32 ? `<text x="${(rx + rw / 2).toFixed(1)}" y="${(ry + rh / 2 + 14).toFixed(1)}"
        font-size="9" text-anchor="middle" dominant-baseline="middle" fill="#666">${area}</text>` : ""}`;
    })
    .join("\n");

  const wallElements = floor.walls
    .map((wall) => {
      const x1 = (wall.start.x * scaleX).toFixed(1);
      const y1 = (wall.start.y * scaleY).toFixed(1);
      const x2 = (wall.end.x * scaleX).toFixed(1);
      const y2 = (wall.end.y * scaleY).toFixed(1);
      return `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${wallColour}" stroke-width="2"/>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}">
  <rect width="${targetW}" height="${targetH}" fill="${bg}"/>
${roomElements}
${wallElements}
</svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
