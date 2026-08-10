// Centralised configuration for HMO Vision AI
// All configurable values should be read from here.

export const config = {
  upload: {
    dir: process.env.UPLOAD_DIR ?? "uploads",
    maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES ?? 20 * 1024 * 1024), // 20 MB
    allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
  },

  ai: {
    model: process.env.AI_MODEL ?? "gpt-4.1-mini",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
  },

  detection: {
    timeoutMs: Number(process.env.DETECTION_TIMEOUT_MS ?? 30_000),
    /** Minimum wall length in pixels */
    minWallLengthPx: Number(process.env.MIN_WALL_LENGTH_PX ?? 15),
    /** Minimum room area in pixels² */
    minRoomAreaPx2: Number(process.env.MIN_ROOM_AREA_PX2 ?? 2000),
    /** Dark pixel threshold (0–255); pixels below this are treated as walls */
    darkPixelThreshold: Number(process.env.DARK_PIXEL_THRESHOLD ?? 80),
    /** Adaptive threshold window size (must be odd) */
    adaptiveThresholdWindow: Number(process.env.ADAPTIVE_THRESHOLD_WINDOW ?? 15),
  },

  rateLimit: {
    maxRequests: Number(process.env.RATE_LIMIT_MAX ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  },

  logging: {
    level: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  },
} as const;
