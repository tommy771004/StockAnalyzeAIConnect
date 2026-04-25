/**
 * server/middleware/rateLimiter.ts
 *
 * nodejs-backend-patterns: Rate Limiting Middleware
 *
 * Strategy: In-process token bucket (no Redis dependency for Vercel serverless).
 * Each IP gets a fixed request budget per window; exceeded requests get 429.
 *
 * For Vercel serverless, this is per-function-instance. A Redis-backed store
 * (rate-limit-redis) is recommended when running on persistent servers.
 */

import type { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

/**
 * Fix #2: Vercel serverless incompatibility warning
 *
 * On Vercel each function invocation may be a fresh cold-start, so the
 * in-process `buckets` Map resets between requests. This means rate limiting
 * is silently ineffective in production.
 *
 * Recommended alternatives:
 *   - Vercel KV (Redis-compatible): https://vercel.com/docs/storage/vercel-kv
 *   - Upstash rate-limit: `@upstash/ratelimit` + `@upstash/redis`
 *
 * In dev / persistent server environments this in-process limiter works fine.
 */
const IS_VERCEL_SERVERLESS = Boolean(process.env.VERCEL);

if (IS_VERCEL_SERVERLESS) {
  console.warn(
    '[RateLimit] WARNING: In-process rate limiter is NOT effective on Vercel '
    + 'serverless (per-invocation cold-starts reset bucket state). '
    + 'Migrate to Vercel KV or @upstash/ratelimit for production rate limiting.',
  );
}

// Purge expired buckets every 5 minutes to prevent memory growth
// (only meaningful on persistent server; no-op on serverless cold-starts)
if (!IS_VERCEL_SERVERLESS) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt < now) buckets.delete(key);
    }
  }, 5 * 60 * 1000);
}

function getClientIp(req: Request): string {
  // Trust Vercel's forwarded IP header, fall back to socket address
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60 000 = 1 min) */
  windowMs?: number;
  /** Max requests per IP per window (default: 60) */
  max?: number;
  /** Human-readable error message */
  message?: string;
}

/**
 * Creates a rate-limit middleware.
 *
 * Usage:
 *   app.post('/api/screener', authMiddleware, rateLimit({ max: 20, windowMs: 60_000 }), handler)
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max      = opts.max      ?? 60;
  const message  = opts.message  ?? 'Too many requests, please try again later.';

  return (req: Request, res: Response, next: NextFunction): void => {
    // Fix #2: bypass on Vercel serverless — limiter has no cross-invocation state
    if (IS_VERCEL_SERVERLESS) {
      next();
      return;
    }

    const ip  = getClientIp(req);
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    const entry = buckets.get(key);

    if (!entry || entry.resetAt < now) {
      // First request in this window
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      setRateLimitHeaders(res, max, max - 1, now + windowMs);
      next();
      return;
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      setRateLimitHeaders(res, max, 0, entry.resetAt);
      res.status(429).json({ error: message });
      return;
    }

    entry.count++;
    setRateLimitHeaders(res, max, max - entry.count, entry.resetAt);
    next();
  };
}

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000)); // Unix timestamp
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

/** General API — 60 req/min per IP */
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 60 });

/**
 * Screener endpoint — compute-heavy (Yahoo Finance + indicator math).
 * 20 req/min prevents abuse without blocking legitimate use.
 */
export const screenerLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Screener rate limit exceeded. Please wait before scanning again.',
});

/**
 * Alerts write operations — prevent spam alert creation.
 */
export const alertsWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Too many alert operations. Please slow down.',
});
