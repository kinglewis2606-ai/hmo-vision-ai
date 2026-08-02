export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedRoom {
  id: string;

  name?: string;

  bounds: BoundingBox;

  floor: number;

  confidence: number;
}

export interface DetectedFloor {
  level: number;

  rooms: DetectedRoom[];
}

export interface DetectionResult {
  width: number;

  height: number;

  floors: DetectedFloor[];
}
