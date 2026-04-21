const cache = new Map<string, { data: unknown; timestamp: number }>();
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
    if (validator) {
      return validator(cached.data) ? cached.data : null;
    }
    // No validator: caller accepts responsibility for type correctness
    return cached.data as T;
  }
  if (cached) cache.delete(key); // clean expired
  return null;
}

export function setCachedData(key: string, data: unknown) {
  // Evict oldest entries if cache exceeds limit
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}
