// Vercel react-best-practices: js-index-maps & server-cache-lru
// True LRU: track lastAccessed per entry so we evict the least-recently-used item,
// not just the oldest-inserted one (Map insertion order ≠ access order).
interface CacheEntry { data: unknown; timestamp: number; lastAccessed: number }

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 1000; // 1 minute
const MAX_CACHE_SIZE = 200;

/**
 * Retrieve cached data. Optionally pass a type guard `validator` to verify the
 * cached data still matches the expected shape before returning it.
 * Returns null on miss, expiry, or validator failure.
 */
export function getCachedData<T>(key: string, validator?: (d: unknown) => d is T): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    // LRU: update access time so this entry survives the next eviction round
    cached.lastAccessed = Date.now();
    if (validator) {
      return validator(cached.data) ? cached.data as T : null;
    }
    // No validator: caller accepts responsibility for type correctness
    return cached.data as T;
  }
  if (cached) cache.delete(key); // clean expired
  return null;
}

export function setCachedData(key: string, data: unknown) {
  // Evict the least-recently-used entry when cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    let lruKey: string | undefined;
    let lruTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastAccessed < lruTime) { lruTime = v.lastAccessed; lruKey = k; }
    }
    if (lruKey !== undefined) cache.delete(lruKey);
  }
  const now = Date.now();
  cache.set(key, { data, timestamp: now, lastAccessed: now });
}
