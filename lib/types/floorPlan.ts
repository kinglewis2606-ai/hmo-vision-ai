// ============================================================================
// LAYER 1: IMAGE INPUT
// ============================================================================

export interface LoadedImage {
  data: Uint8Array;
  width: number;
  height: number;
  dpi?: number;
}

// ============================================================================
// LAYER 2: DETECTION OUTPUT (Raw Geometry)
// ============================================================================

export interface DetectedFloor {
  name: string;
  level: number;
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// LAYER 3: CANONICAL FLOOR PLAN MODEL
// ============================================================================

export interface Door {
  wall: "top" | "bottom" | "left" | "right";
  connectsTo?: string;
}

export interface Window {
  wall: "top" | "bottom" | "left" | "right";
}

export interface Room {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  adjacentRooms: string[];
  shape: string;
  doors: Door[];
  windows: Window[];
  approxAreaSqm?: number;
  approxWidthM?: number;
  approxDepthM?: number;
  notes?: string;
  confidence?: string;
}

export interface Floor {
  name: string;
  level: number;
  rooms: Room[];
}

export interface FloorPlan {
  floors: Floor[];
  walls?: WallLine[];
  metadata?: {
    pixelsPerMeter?: number;
    imageWidth?: number;
    imageHeight?: number;
    imageDpi?: number;
  };
}

// ============================================================================
// LAYER 4: TRANSFORMATION MODEL
// ============================================================================

export interface RoomChange {
  roomId: string;
  newType?: string;
  newName?: string;
  reason?: string;
}
