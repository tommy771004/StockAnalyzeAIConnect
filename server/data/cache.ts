export interface CacheMetrics {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer');
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new Error('ttlMs must be a non-negative number');
    }

    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }

    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlMs,
    });
  }

  metrics(): CacheMetrics {
    this.removeExpired();
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
