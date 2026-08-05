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

const ROOM_SCALE = 3;

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

      const w = hasCoords
        ? room.width * ROOM_SCALE
        : 140;

      const h = hasCoords
        ? room.height * ROOM_SCALE
        : 100;

      const x = hasCoords
        ? startX + room.x * ROOM_SCALE
        : startX + (index % 3) * 180;

      const y = hasCoords
        ? offsetY + room.y * ROOM_SCALE
        : offsetY + Math.floor(index / 3) * 140;

      lowestY = Math.max(lowestY, y + h);

      svg += `
<rect
x="${x}"
y="${y}"
width="${w}"
height="${h}"
fill="#ffffff"
stroke="#111111"
stroke-width="6"
rx="2"/>
`;

svg += `
<rect
x="${x + 3}"
y="${y + 3}"
width="${w - 6}"
height="${h - 6}"
fill="none"
stroke="#666"
stroke-width="1"/>
`;

      const label = escapeXml(
        `${room.name}${room.type ? ` (${room.type})` : ""}`
      );

      svg += `
<text
x="${x + w / 2}"
y="${y + h / 2}"
font-size="19"
font-weight="bold"
font-family="Arial"
text-anchor="middle"
dominant-baseline="middle">
${label}
</text>
`;

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
width="2200"
height="2800"
viewBox="0 0 2200 2800"
style="background:white">
`;

  const left = renderPlan(
    svg,
    original,
    40,
    "Existing Floor Plan"
  );

  const right = renderPlan(
    left.svg,
    proposed,
    720,
    "AI Proposed HMO Layout"
  );

  svg = right.svg;

  svg += `
<line
x1="680"
y1="20"
x2="680"
y2="2180"
stroke="#cccccc"
stroke-width="2"/>
`;

  svg += `
</svg>
`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
