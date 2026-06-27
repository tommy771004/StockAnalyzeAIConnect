import { describe, expect, it } from 'vitest';

import { TtlCache } from '../cache.js';
import { CircuitBreaker } from '../circuitBreaker.js';
import { FixedWindowRateLimiter } from '../rateLimiter.js';

describe('TtlCache', () => {
  it('expires entries and reports hit/miss metrics', () => {
    let now = 1_000;
    const cache = new TtlCache<string>(2, () => now);

    cache.set('quote:AAPL', 'fresh', 100);
    expect(cache.get('quote:AAPL')).toBe('fresh');
    now = 1_101;
    expect(cache.get('quote:AAPL')).toBeUndefined();
    expect(cache.metrics()).toEqual({
      entries: 0,
      hits: 1,
      misses: 1,
      evictions: 0,
    });
  });

  it('evicts the least recently used entry at its bound', () => {
    const cache = new TtlCache<number>(2, () => 1_000);
    cache.set('a', 1, 1_000);
    cache.set('b', 2, 1_000);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3, 1_000);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.metrics().evictions).toBe(1);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('blocks after the budget and resets at the next window', () => {
    let now = 10_000;
    const limiter = new FixedWindowRateLimiter(
      { limit: 2, windowMs: 1_000 },
      () => now,
    );

    expect(limiter.consume()).toBe(true);
    expect(limiter.consume()).toBe(true);
    expect(limiter.consume()).toBe(false);
    expect(limiter.remaining()).toBe(0);

    now = 11_000;
    expect(limiter.remaining()).toBe(2);
    expect(limiter.consume()).toBe(true);
  });
});

describe('CircuitBreaker', () => {
  it('opens after repeated failures and recovers through one half-open probe', () => {
    let now = 20_000;
    const breaker = new CircuitBreaker(
      { failureThreshold: 2, cooldownMs: 5_000 },
      () => now,
    );

    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state()).toBe('open');
    expect(breaker.canRequest()).toBe(false);

    now = 25_000;
    expect(breaker.state()).toBe('half_open');
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.canRequest()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.state()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('reopens immediately when the half-open probe fails', () => {
    let now = 1_000;
    const breaker = new CircuitBreaker(
      { failureThreshold: 1, cooldownMs: 100 },
      () => now,
    );
    breaker.recordFailure();
    now = 1_100;
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure();

    expect(breaker.state()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });
});
