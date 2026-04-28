/**
 * src/services/cache.ts
 * Lightweight in-memory TTL cache for API responses.
 * Prevents redundant network calls for the same data within a time window.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL = 60_000; // 1 minute
const cacheMap = new Map<string, CacheEntry<unknown>>();

/**
 * Returns cached data if it exists and hasn't expired.
 * @param key      - Cache key
 * @param _unused  - Ignored (kept for API compatibility)
 * @param ttl      - Time-to-live in milliseconds (default: 60s)
 */
export function getCachedData<T>(key: string, _unused?: unknown, ttl = DEFAULT_TTL): T | null {
  const entry = cacheMap.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cacheMap.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Stores data in the cache with the current timestamp.
 */
export function setCachedData<T>(key: string, data: T): void {
  cacheMap.set(key, { data, timestamp: Date.now() });
}

/**
 * Returns true if the current time is within Taiwan stock market hours
 * (Mon–Fri, 09:00–13:30 CST = UTC 01:00–05:30).
 */
export function isTaiwanTradingHours(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  if (utcDay === 0 || utcDay === 6) return false;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return utcMin >= 60 && utcMin < 330;
}

/**
 * Returns true if the current time is within US market hours (Mon–Fri, 9:30–16:00 ET).
 * Used to select shorter TTLs during live trading hours.
 */
export function isMarketHours(): boolean {
  const now = new Date();
  // Convert to Eastern Time (UTC-4 in DST, UTC-5 in standard)
  const etOffset = isDST(now) ? -4 : -5;
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;
  const etMinute = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat

  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const minutesFromMidnight = etHour * 60 + etMinute;
  return minutesFromMidnight >= 9 * 60 + 30 && minutesFromMidnight < 16 * 60;
}

/** Rough DST check for US Eastern Time */
function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.max(jan, jul) !== date.getTimezoneOffset();
}
