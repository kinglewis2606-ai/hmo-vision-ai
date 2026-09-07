/**
 * Shared timing + stage-error helpers used across the analyse pipeline.
 *
 * The previous implementation could sit on "Analysing floor geometry..." for
 * ~4m50s because failures deep in the pipeline (a hung OpenAI call, malformed
 * JSON, an empty vision response) were not attributed to any stage and were
 * only ever surfaced once the platform's hard request ceiling was hit.
 *
 * Every stage in the pipeline should be wrapped with `timedStage` so:
 *   - server logs always show which stage ran and how long it took, and
 *   - a failure becomes a controlled, stage-specific error immediately
 *     instead of an opaque hang.
 */

export type StageError = Error & { stage: string; statusCode?: number };

export function stageError(stage: string, message: string, statusCode = 500, cause?: unknown): StageError {
  const error = new Error(message) as StageError;
  error.stage = stage;
  error.statusCode = statusCode;
  if (cause !== undefined) (error as unknown as { cause?: unknown }).cause = cause;
  return error;
}

export function isStageError(value: unknown): value is StageError {
  return value instanceof Error && typeof (value as StageError).stage === "string";
}

/** True for AbortController/fetch timeout errors raised by the OpenAI SDK. */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: unknown }).name || "");
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  return name === "AbortError" || name === "TimeoutError" || name === "APIConnectionTimeoutError" || message.includes("timed out") || message.includes("timeout") || message.includes("aborted");
}

/**
 * Runs `fn`, logging elapsed time on completion or failure. On failure, if
 * `fn` did not already throw a StageError, wraps it into one tagged with
 * `stage` so the caller always receives an attributable, stage-specific
 * error rather than a bare/opaque exception.
 */
export async function timedStage<T>(stage: string, fn: () => Promise<T>, fallbackMessage?: string): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`[timing] ${stage}: ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`[timing] ${stage} FAILED after ${elapsed}ms:`, error instanceof Error ? error.message : error);
    if (isStageError(error)) throw error;
    if (isTimeoutError(error)) throw stageError(stage, `${fallbackMessage || stage} timed out.`, 504, error);
    throw stageError(stage, fallbackMessage || `${stage} failed.`, 500, error);
  }
}
