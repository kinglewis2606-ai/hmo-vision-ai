// Application metrics for HMO Vision AI
// In-memory counters. Replace with Prometheus/StatsD in production.

interface Metrics {
  totalAnalyses: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  totalAnalysisTimeMs: number;
  totalDetectionTimeMs: number;
  totalAiTimeMs: number;
}

const metrics: Metrics = {
  totalAnalyses: 0,
  successfulAnalyses: 0,
  failedAnalyses: 0,
  totalAnalysisTimeMs: 0,
  totalDetectionTimeMs: 0,
  totalAiTimeMs: 0,
};

export function recordAnalysisStarted() {
  metrics.totalAnalyses += 1;
}

export function recordAnalysisSuccess(durationMs: number) {
  metrics.successfulAnalyses += 1;
  metrics.totalAnalysisTimeMs += durationMs;
}

export function recordAnalysisFailed() {
  metrics.failedAnalyses += 1;
}

export function recordDetectionTime(durationMs: number) {
  metrics.totalDetectionTimeMs += durationMs;
}

export function recordAiTime(durationMs: number) {
  metrics.totalAiTimeMs += durationMs;
}

export function getMetrics(): Readonly<Metrics> {
  return { ...metrics };
}
