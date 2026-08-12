// ============================================================================
// LAYER 1: IMAGE INPUT
// ============================================================================
export interface LoadedImage { data: Uint8Array; width: number; height: number; dpi?: number; }

// ============================================================================
// LAYER 2: DETECTION OUTPUT
// ============================================================================
export interface DetectedFloor { name: string; level: number; top: number; bottom: number; left?: number; right?: number; }
export interface WallLine { x1: number; y1: number; x2: number; y2: number; }
export interface Point { x: number; y: number; }
export type WallSide = "top" | "bottom" | "left" | "right";
export interface DetectedRoom { id: string; x: number; y: number; width: number; height: number; polygon?: Point[]; openingWalls?: WallSide[]; }

// ============================================================================
// LAYER 3: CANONICAL FLOOR PLAN MODEL
// ============================================================================
export interface Door { wall: WallSide; connectsTo?: string; }
export interface Window { wall: WallSide; }
export interface Room {
  id: string; name: string; type: string; x: number; y: number; width: number; height: number;
  adjacentRooms: string[]; shape: string; doors?: Door[]; windows?: Window[]; polygon?: Point[];
  approxAreaSqm?: number; approxWidthM?: number; approxDepthM?: number; notes?: string; confidence?: string;
}
export interface Floor { name: string; level: number; rooms: Room[]; }
export interface FloorPlan {
  floors: Floor[];
  walls?: WallLine[];
  metadata?: { pixelsPerMeter?: number; imageWidth?: number; imageHeight?: number; imageDpi?: number; };
}

// AI labels real detected geometry; it does not create geometry.
export interface RoomLabel {
  roomId: string; name: string; type: string; floor?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number;
  windows?: WallSide[]; doors?: WallSide[];
}

// ============================================================================
// LAYER 4: TRANSFORMATION MODEL
// ============================================================================
export interface RoomChange {
  roomId: string; action?: string; newType?: string; newName?: string; reason?: string;
  split?: { firstName?: string; firstType?: string; secondName?: string; secondType?: string; direction?: "horizontal" | "vertical"; firstRatio?: number; };
}
