// In-memory rate limiter for HMO Vision AI
// Designed to be swappable for Redis in production.

import { config } from "./config";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** Returns true if the request should be allowed; false if rate-limited. */
export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now >= entry.resetAt) {
    store.set(identifier, {
      count: 1,
      resetAt: now + config.rateLimit.windowMs,
    });
    return true;
  }

  if (entry.count >= config.rateLimit.maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Returns the number of seconds until the rate limit window resets for an identifier. */
export function rateLimitRetryAfter(identifier: string): number {
  const now = Date.now();
  const entry = store.get(identifier);
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
}
