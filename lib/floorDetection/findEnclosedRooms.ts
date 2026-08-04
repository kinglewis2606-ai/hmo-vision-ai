export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function findEnclosedRooms(
  walls: any[],
  imageWidth: number,
  imageHeight: number
): Promise<DetectedRoom[]> {

  console.log("Finding enclosed rooms...");

  // Temporary implementation
  // We'll replace this with a flood-fill detector.

  return [];
}
