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

export function renderFloorPlan(
  original: FloorPlan,
  proposed: FloorPlan
): string {

  const roomScale = 2;

  let svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="1200"
     height="1800"
     viewBox="0 0 1200 1800"
     style="background:white">
`;

  let offsetY = 40;

  for (const floor of proposed.floors) {

    svg += `
<text
x="40"
y="${offsetY - 10}"
font-size="26"
font-family="Arial"
font-weight="bold">
${floor.name}
</text>
`;

for (const [index, room] of floor.rooms.entries()) {    

      const fallbackWidth = 140;
const fallbackHeight = 100;

const hasCoords =
  room.width > 0 &&
  room.height > 0;

const x = hasCoords
  ? room.x * roomScale + 40
  : 40 + (index % 4) * 180;

const y = hasCoords
  ? room.y * roomScale + offsetY
  : offsetY + Math.floor(index / 4) * 140;
  
const w = hasCoords
  ? room.width * roomScale
  : fallbackWidth;

const h = hasCoords
  ? room.height * roomScale
  : fallbackHeight;

      svg += `
<rect
x="${x}"
y="${y}"
width="${w}"
height="${h}"
fill="white"
stroke="black"
stroke-width="3"/>
`;

      svg += `
<text
x="${x + w / 2}"
y="${y + h / 2}"
font-size="16"
font-family="Arial"
text-anchor="middle"
dominant-baseline="middle">
${room.name}
</text>
`;
    }

    offsetY += 500;
  }

  svg += "</svg>";

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
