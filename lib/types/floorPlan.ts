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

export interface Point {
  x: number;
  y: number;
}

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon?: Point[];
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
  polygon?: Point[];
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

// AI labels the real detected geometry. It does not create geometry.
export interface RoomLabel {
  roomId: string;
  name: string;
  type: string;
  floor?: string;
  confidence?: string;
}

// ============================================================================
// LAYER 4: TRANSFORMATION MODEL
// ============================================================================

export interface RoomChange {
  roomId: string;
  action?: string;
  newType?: string;
  newName?: string;
  reason?: string;
  split?: {
    firstName?: string;
    firstType?: string;
    secondName?: string;
    secondType?: string;
    direction?: "horizontal" | "vertical";
    /** Fraction of the original room allocated to the first room (0.1-0.9). */
    firstRatio?: number;
  };
}
