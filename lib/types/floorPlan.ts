// Canonical FloorPlan data model for HMO Vision AI
// All detection, transformation, rendering and AI logic must use these types.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number; // pixels in image space
}

export interface Door {
  id: string;
  wallId: string;
  position: Point;
  width: number;
  angle: number; // degrees, 0 = facing right
}

export interface Window {
  id: string;
  wallId: string;
  position: Point;
  width: number;
}

export type RoomType =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living_room"
  | "dining_room"
  | "hallway"
  | "staircase"
  | "storage"
  | "utility"
  | "unknown";

export interface Room {
  id: string;
  label: string;
  type: RoomType;
  bounds: Rect; // bounding box in image pixels
  polygon?: Point[]; // optional polygon outline
  areaM2?: number; // estimated area in square metres
  floorIndex: number; // which floor (0-based)
  adjacentRoomIds: string[];
  doors: Door[];
  windows: Window[];
  /** True if this room was modified by the proposed transformation */
  modified?: boolean;
}

export interface Floor {
  index: number; // 0-based
  label: string; // "Ground Floor", "First Floor", etc.
  rooms: Room[];
  walls: Wall[];
  /** Vertical pixel range in the source image for this floor */
  yRange?: { top: number; bottom: number };
}

export interface FloorPlanMetadata {
  sourceFilename: string;
  imageDpi?: number;
  imageWidthPx: number;
  imageHeightPx: number;
  /** metres per pixel, derived from DPI or estimated */
  scale?: number;
  detectedAt: string; // ISO timestamp
}

export interface FloorPlan {
  id: string;
  floors: Floor[];
  metadata: FloorPlanMetadata;
}

// Transformation types
export type RoomChangeType =
  | "ConvertToBedroom"
  | "SplitRoom"
  | "ExtendBathroom"
  | "AddBathroom"
  | "RemoveWall"
  | "ConvertToKitchen";

export interface RoomChange {
  type: RoomChangeType;
  roomId: string;
  /** For SplitRoom: axis of split */
  splitAxis?: "horizontal" | "vertical";
  /** Optional label override for new/changed room */
  newLabel?: string;
  /** Optional new room type */
  newType?: RoomType;
  /** Description shown in UI */
  description: string;
  /** Step number for display */
  step: number;
}

// AI analysis result (returned by analyse route)
export interface HMOAnalysisResult {
  summary: {
    bedrooms: number;
    bathrooms: number;
    kitchen: boolean;
    livingRoom: boolean;
    possibleHMOBedrooms: number;
    confidence: string;
  };
  hmoScore: number;
  verdict: string;
  highestPossibleHMO?: {
    bedrooms: number;
    score: number;
    reason: string;
  };
  recommendedLayout: RoomChange[];
  conversionSteps?: string[];
  recommendations: string[];
  compliance?: string[];
  fireSafety: string[];
  planningRisk: string;
  estimatedConversionCost: {
    low: number;
    high: number;
  };
  estimatedMonthlyRent: number;
  estimatedAnnualRent: number;
  estimatedYield?: string;
  estimatedROI?: string;
  investorSummary?: string;
}

/** Per-floor rendered pair (original image + proposed overlay data-URI) */
export interface FloorRenderPair {
  floorIndex: number;
  /** data-URI of the original uploaded image (cropped to this floor's yRange if multi-floor) */
  originalImage: string;
  /** data-URI of the proposed layout overlay composited onto the original image */
  proposedImage: string;
}

// Full analysis pipeline result
export interface AnalysisPipelineResult {
  originalFloorPlan: FloorPlan;
  proposedFloorPlan: FloorPlan;
  hmoAnalysis: HMOAnalysisResult;
  /**
   * @deprecated Use renderedFloors[0].originalImage instead.
   * Kept for backward-compat; equals renderedFloors[0]?.originalImage.
   */
  originalLayoutImage?: string;
  /**
   * @deprecated Use renderedFloors[0].proposedImage instead.
   * Kept for backward-compat; equals renderedFloors[0]?.proposedImage.
   */
  proposedLayoutImage?: string;
  /** Per-floor rendered pairs: original uploaded image + proposed overlay */
  renderedFloors: FloorRenderPair[];
  /** The original uploaded image filename */
  sourceFilename: string;
}
