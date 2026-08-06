export interface Door {
  wall: string;
  connectsTo: string;
}

export interface Window {
  wall: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;

  x: number;
  y: number;

  width: number;
  height: number;

  shape?: string;

adjacentRooms?: string[];

doors?: Door[];
windows?: Window[];

  notes?: string;
}

export interface Floor {
  name: string;
  level: number;
  rooms: Room[];
}

export interface FloorPlan {
  floors: Floor[];
}


function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPlan(
  svg: string,
  plan: FloorPlan,
  startX: number,
  title: string
): { svg: string; bottom: number } {

  let offsetY = 70;

  const allRooms = plan.floors.flatMap(f => f.rooms);

const minX = Math.min(...allRooms.map(r => r.x));
const minY = Math.min(...allRooms.map(r => r.y));

const maxX = Math.max(...allRooms.map(r => r.x + r.width));
const maxY = Math.max(...allRooms.map(r => r.y + r.height));

const planWidth = Math.max(1, maxX - minX);
const planHeight = Math.max(1, maxY - minY);

const DRAW_WIDTH = 560;
const DRAW_HEIGHT = 700;
const PADDING = 20;

const scale = Math.min(
  (DRAW_WIDTH - PADDING * 2) / planWidth,
  (DRAW_HEIGHT - PADDING * 2) / planHeight
);
  
  svg += `
<text
x="${startX}"
y="35"
font-size="28"
font-family="Arial"
font-weight="bold">
${escapeXml(title)}
</text>
`;

  for (const floor of plan.floors) {

    svg += `
<text
x="${startX}"
y="${offsetY - 10}"
font-size="22"
font-family="Arial"
font-weight="bold">
${escapeXml(floor.name)}
</text>
`;

    let lowestY = offsetY;

    for (const [index, room] of floor.rooms.entries()) {

      const hasCoords =
        Number.isFinite(room.x) &&
        Number.isFinite(room.y) &&
        room.width > 0 &&
        room.height > 0;

      const neighbours = new Set(room.adjacentRooms ?? []);

const leftShared = floor.rooms.some(
  r =>
    neighbours.has(r.id) &&
    Math.abs(r.x + r.width - room.x) < 15
);

const rightShared = floor.rooms.some(
  r =>
    neighbours.has(r.id) &&
    Math.abs(room.x + room.width - r.x) < 15
);

const topShared = floor.rooms.some(
  r =>
    neighbours.has(r.id) &&
    Math.abs(r.y + r.height - room.y) < 15
);

const bottomShared = floor.rooms.some(
  r =>
    neighbours.has(r.id) &&
    Math.abs(room.y + room.height - r.y) < 15
);

      const w = hasCoords
  ? room.width * scale
  : 140;

const h = hasCoords
  ? room.height * scale
  : 100;

const x = hasCoords
  ? startX + PADDING + (room.x - minX) * scale
  : startX + (index % 3) * 180;

const y = hasCoords
  ? offsetY + PADDING + (room.y - minY) * scale
  : offsetY + Math.floor(index / 3) * 140;

      lowestY = Math.max(lowestY, y + h);

      
svg += `
<rect
x="${x}"
y="${y}"
width="${w}"
height="${h}"
fill="${
  room.type?.toLowerCase().includes("bed")
    ? "#e6f2ff"
    : room.type?.toLowerCase().includes("bath")
    ? "#e8ffe8"
    : room.type?.toLowerCase().includes("kitchen")
    ? "#fff3d6"
    : room.type?.toLowerCase().includes("communal")
    ? "#fff7c7"
    : "#f5f5f5"
}"
stroke="none"/>
`;

if (!topShared)
  svg += `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="black" stroke-width="6"/>`;

if (!bottomShared)
  svg += `<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="black" stroke-width="6"/>`;

if (!leftShared)
  svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="black" stroke-width="6"/>`;

if (!rightShared)
  svg += `<line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="black" stroke-width="6"/>`;

svg += `
<rect
x="${x + 3}"
y="${y + 3}"
width="${w - 6}"
height="${h - 6}"
fill="none"
stroke="#666"
stroke-width="1"/>
stroke-linecap="round"
stroke-linejoin="round"
`;

    const label = escapeXml(room.name);

const fontSize = Math.max(
  10,
  Math.min(18, Math.min(w, h) / 5)
);

svg += `
<text
x="${x + w / 2}"
y="${y + h / 2}"
font-size="${fontSize}"
font-weight="bold"
font-family="Arial"
text-anchor="middle"
dominant-baseline="middle">
${label}
</text>
`;
      if (room.type) {
  svg += `
<text
x="${x + w / 2}"
y="${y + h / 2 + fontSize}"
font-size="${Math.max(8, fontSize - 3)}"
fill="#555"
font-family="Arial"
text-anchor="middle">
${escapeXml(room.type)}
</text>
`;
      }
      if (room.doors) {
        for (const door of room.doors) {

          let dx = x;
          let dy = y;

          switch (door.wall.toLowerCase()) {
            case "top":
              dx = x + w / 2 - 10;
              dy = y - 2;
              break;

            case "bottom":
              dx = x + w / 2 - 10;
              dy = y + h - 2;
              break;

            case "left":
              dx = x - 2;
              dy = y + h / 2 - 10;
              break;

            case "right":
              dx = x + w - 2;
              dy = y + h / 2 - 10;
              break;
          }

          svg += `
<rect
x="${dx}"
y="${dy}"
width="20"
height="4"
fill="#8b4513"/>
`;
        }
      }

      if (room.windows) {
        for (const window of room.windows) {

          let wx = x;
          let wy = y;

          switch (window.wall.toLowerCase()) {
            case "top":
              wx = x + w / 2 - 12;
              wy = y - 2;
              break;

            case "bottom":
              wx = x + w / 2 - 12;
              wy = y + h - 2;
              break;

            case "left":
              wx = x - 2;
              wy = y + h / 2 - 12;
              break;

            case "right":
              wx = x + w - 2;
              wy = y + h / 2 - 12;
              break;
          }

          svg += `
<line
x1="${wx}"
y1="${wy}"
x2="${wx + 24}"
y2="${wy}"
stroke="#0077ff"
stroke-width="3"/>
stroke-linecap="round"
stroke-linejoin="round"
`;
        }
      }
    }

    offsetY = lowestY + 80;
  }

  return {
    svg,
    bottom: offsetY
  };
}

export function renderFloorPlan(
  original: FloorPlan,
  proposed: FloorPlan
): string {

  let svg = `
<svg
xmlns="http://www.w3.org/2000/svg"
width="1100"
height="2600"
viewBox="0 0 1100 2600"
style="background:white">
`;

  const result = renderPlan(
    svg,
    proposed,
    40,
    "AI Proposed HMO Layout"
  );

  svg = result.svg;

  svg += `
</svg>
`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
