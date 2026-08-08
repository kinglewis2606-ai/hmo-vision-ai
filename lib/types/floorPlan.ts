/**
 * Canonical Geometry Model
 * 
 * This file defines the single source of truth for all geometric types
 * used throughout the HMO Vision AI pipeline.
 * 
 * - Detection layer reads images and produces DetectedRoom, DetectedFloor, WallLine
 * - These are assembled into originalFloorPlan (canonical model)
 * - originalFloorPlan is NEVER modified - it's the immutable source of truth
 * - AI analysis produces RoomChange[] decisions
 * - applyRoomChanges() transforms originalFloorPlan → proposedFloorPlan
 * - Renderers consume FloorPlan and derive RoomRenderingData for visualization
 */

// ============================================================================
// LAYER 1: IMAGE INPUT
// ============================================================================

export interface LoadedImage {
  /** Raw greyscale pixel data */
  data: Uint8Array;
  
  /** Image width in pixels */
  width: number;
  
  /** Image height in pixels */
  height: number;
  
  /** Image DPI (dots per inch) - used for DPI-aware thresholds */
  dpi?: number;
}

// ============================================================================
// LAYER 2: DETECTION OUTPUT (Raw Geometry)
// ============================================================================

export interface DetectedFloor {
  /** Floor name: "Ground Floor", "First Floor", etc. */
  name: string;
  
  /** Floor level (0-based index) */
  level: number;
  
  /** Top edge of floor in pixels (y-coordinate) */
  top: number;
  
  /** Bottom edge of floor in pixels (y-coordinate) */
  bottom: number;
}

export interface WallLine {
  /** Starting x-coordinate in pixels */
  x1: number;
  
  /** Starting y-coordinate in pixels */
  y1: number;
  
  /** Ending x-coordinate in pixels */
  x2: number;
  
  /** Ending y-coordinate in pixels */
  y2: number;
}

export interface DetectedRoom {
  /** Unique room identifier: "room-1", "room-2", etc. */
  id: string;
  
  /** Left edge in pixels */
  x: number;
  
  /** Top edge in pixels */
  y: number;
  
  /** Width in pixels */
  width: number;
  
  /** Height in pixels */
  height: number;
}

// ============================================================================
// LAYER 3: CANONICAL FLOOR PLAN MODEL (Single Source of Truth)
// ============================================================================

export interface Door {
  /** Which wall this door is on */
  wall: "top" | "bottom" | "left" | "right";
  
  /** ID of room this door connects to (optional) */
  connectsTo?: string;
}

export interface Window {
  /** Which wall this window is on */
  wall: "top" | "bottom" | "left" | "right";
}

export interface Room {
  // ========== IDENTIFICATION ==========
  
  /** Unique room identifier */
  id: string;
  
  /** User-friendly room name */
  name: string;
  
  /** Room type/classification */
  type: string;
  
  // ========== GEOMETRY (IMMUTABLE) ==========
  
  /** Left edge in pixels */
  x: number;
  
  /** Top edge in pixels */
  y: number;
  
  /** Width in pixels */
  width: number;
  
  /** Height in pixels */
  height: number;
  
  // ========== RELATIONSHIPS ==========
  
  /** IDs of adjacent rooms (sharing walls) */
  adjacentRooms: string[];
  
  // ========== FEATURES ==========
  
  /** Room shape (currently always "rectangle") */
  shape: string;
  
  /** Doors in this room */
  doors: Door[];
  
  /** Windows in this room */
  windows: Window[];
  
  // ========== METADATA ==========
  
  /** Approximate area in square meters */
  approxAreaSqm?: number;
  
  /** Approximate width in meters */
  approxWidthM?: number;
  
  /** Approximate depth in meters */
  approxDepthM?: number;
  
  /** User notes or annotations */
  notes?: string;
  
  /** Confidence in detection: "High", "Medium", "Low", or description */
  confidence?: string;
}

export interface Floor {
  /** Floor name: "Ground Floor", "First Floor", etc. */
  name: string;
  
  /** Floor level (0-based index) */
  level: number;
  
  /** Rooms on this floor */
  rooms: Room[];
}

export interface FloorPlan {
  /** All floors in building */
  floors: Floor[];
  
  /** Detected wall segments (reference geometry) */
  walls: WallLine[];
  
  /** Metadata about the floor plan */
  metadata?: {
    /** Pixels per meter (used for coordinate → real-world conversion) */
    pixelsPerMeter?: number;
    
    /** Original image width in pixels */
    imageWidth?: number;
    
    /** Original image height in pixels */
    imageHeight?: number;
    
    /** Image DPI if available */
    imageDpi?: number;
  };
}

// ============================================================================
// LAYER 4: TRANSFORMATION MODEL (AI Planning Decisions)
// ============================================================================

export interface RoomChange {
  /** ID of room being modified */
  roomId: string;
  
  /** New type for the room (e.g., "Bedroom", "Kitchen") */
  newType?: string;
  
  /** New name for the room */
  newName?: string;
  
  /** Reason for this change (used for audit trail)
   * If provided and room has no notes, this is stored in room.notes
   */
  reason?: string;
}
