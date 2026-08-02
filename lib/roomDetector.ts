export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFloor {
  name: string;
  rooms: DetectedRoom[];
}

export async function detectRooms(
  imagePath: string
): Promise<DetectedFloor[]> {

  console.log("Room detection started:", imagePath);

  // Placeholder for OpenCV detection.
  // We'll replace this with the real detector next.

  return [];
}
