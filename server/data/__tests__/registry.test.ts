import { describe, expect, it } from 'vitest';

import { DataProviderRegistry, DataResolutionError } from '../registry.js';
import {
  DataEnvelopeSchema,
  DataRequestSchema,
  ProviderPayloadSchema,
  type DataProvider,
  type ProviderPayload,
} from '../types.js';

const baseTime = Date.parse('2026-01-01T00:00:10.000Z');

function payload(
  data: unknown,
  marketTimestamp = '2026-01-01T00:00:09.000Z',
): ProviderPayload {
  return {
    data,
    retrievedAt: '2026-01-01T00:00:10.000Z',
    marketTimestamp,
    delayed: false,
    warnings: [],
  };
}

function provider(
  id: string,
  priority: number,
  fetch: DataProvider['fetch'],
  overrides: Partial<DataProvider> = {},
): DataProvider {
  return {
    id,
    version: '1',
    operations: ['quote'],
    markets: ['us_stock'],
    priority,
    policy: {
      timeoutMs: 50,
      cacheTtlMs: 1_000,
      maxAgeMs: 5_000,
      rateLimit: { limit: 10, windowMs: 60_000 },
      circuitBreaker: { failureThreshold: 2, cooldownMs: 30_000 },
    },
    fetch,
    ...overrides,
  };
}

describe('data provider contracts', () => {
  it('normalizes symbols and bounds time-series requests', () => {
    const parsed = DataRequestSchema.parse({
      operation: 'bars',
      symbol: ' 2330.tw ',
      market: 'tw_stock',
      params: { interval: '1d', limit: 500 },
    });

    expect(parsed.symbol).toBe('2330.TW');
    expect(parsed.params).toEqual({ interval: '1d', limit: 500 });
    expect(() => DataRequestSchema.parse({
      operation: 'bars',
      symbol: '2330.TW',
      market: 'tw_stock',
      params: { limit: 10_001 },
    })).toThrow();
  });

  it('requires retrieval and market timestamps on provider payloads', () => {
    expect(() => ProviderPayloadSchema.parse({
      data: { price: 100 },
      marketTimestamp: '2026-01-01T00:00:00.000Z',
      delayed: false,
    })).toThrow();

    expect(ProviderPayloadSchema.parse({
      data: { price: 100 },
      retrievedAt: '2026-01-01T00:00:01.000Z',
      marketTimestamp: '2026-01-01T00:00:00.000Z',
      delayed: false,
    }).delayed).toBe(false);
  });

  it('requires provenance and records provider attempts', () => {
    const parsed = DataEnvelopeSchema.parse({
      request: {
        operation: 'quote',
        symbol: 'AAPL',
        market: 'us_stock',
      },
      data: { price: 200 },
      provenance: {
        providerId: 'yahoo',
        providerVersion: '1',
        retrievedAt: '2026-01-01T00:00:01.000Z',
        marketTimestamp: '2026-01-01T00:00:00.000Z',
        delayed: true,
        cache: 'miss',
      },
      attempts: [{
        providerId: 'yahoo',
        outcome: 'success',
        startedAt: '2026-01-01T00:00:00.500Z',
        durationMs: 500,
      }],
      warnings: ['Delayed quote'],
    });

    expect(parsed.provenance.providerId).toBe('yahoo');
    expect(parsed.attempts[0]?.outcome).toBe('success');
  });
});

describe('DataProviderRegistry', () => {
  it('uses priority order, falls back, and records sanitized attempts', async () => {
    const calls: string[] = [];
    const registry = new DataProviderRegistry([
      provider('primary', 10, async () => {
        calls.push('primary');
        throw new Error('secret upstream response');
      }),
      provider('fallback', 20, async () => {
        calls.push('fallback');
        return payload({ price: 201 });
      }),
      provider('unsupported', 1, async () => {
        calls.push('unsupported');
        return payload({ price: 0 });
      }, { markets: ['tw_stock'] }),
    ], { now: () => baseTime });

    const result = await registry.resolve({
      operation: 'quote',
      symbol: 'aapl',
      market: 'us_stock',
    });

    expect(calls).toEqual(['primary', 'fallback']);
    expect(result.data).toEqual({ price: 201 });
    expect(result.provenance).toMatchObject({
      providerId: 'fallback',
      cache: 'miss',
    });
    expect(result.attempts.map((attempt) => ({
      providerId: attempt.providerId,
      outcome: attempt.outcome,
      reasonCode: attempt.reasonCode,
    }))).toEqual([
      { providerId: 'primary', outcome: 'error', reasonCode: 'PROVIDER_ERROR' },
      { providerId: 'fallback', outcome: 'success', reasonCode: undefined },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret upstream response');
  });

  it('returns cached data without spending another provider request', async () => {
    let calls = 0;
    const registry = new DataProviderRegistry([
      provider('cached', 10, async () => {
        calls += 1;
        return payload({ price: 202 });
      }),
    ], { now: () => baseTime });

    const request = {
      operation: 'quote' as const,
      symbol: 'AAPL',
      market: 'us_stock' as const,
    };
    const first = await registry.resolve(request);
    const second = await registry.resolve(request);

    expect(calls).toBe(1);
    expect(first.provenance.cache).toBe('miss');
    expect(second.provenance.cache).toBe('hit');
    expect(second.attempts).toEqual([]);
    expect(registry.health().cache.hits).toBe(1);
  });

  it('rejects stale payloads and falls back to a fresh provider', async () => {
    const registry = new DataProviderRegistry([
      provider('stale', 10, async () => payload(
        { price: 190 },
        '2026-01-01T00:00:00.000Z',
      )),
      provider('fresh', 20, async () => payload({ price: 203 })),
    ], { now: () => baseTime });

    const result = await registry.resolve({
      operation: 'quote',
      symbol: 'AAPL',
      market: 'us_stock',
    });

    expect(result.provenance.providerId).toBe('fresh');
    expect(result.attempts[0]).toMatchObject({
      providerId: 'stale',
      outcome: 'stale',
      reasonCode: 'STALE_DATA',
    });
  });

  it('skips rate-limited and open-circuit providers on later requests', async () => {
    let now = baseTime;
    let rateCalls = 0;
    let brokenCalls = 0;
    const registry = new DataProviderRegistry([
      provider('rate-limited', 10, async () => {
        rateCalls += 1;
        return payload({ price: 1 });
      }, {
        policy: {
          timeoutMs: 50,
          cacheTtlMs: 0,
          maxAgeMs: 5_000,
          rateLimit: { limit: 1, windowMs: 60_000 },
          circuitBreaker: { failureThreshold: 2, cooldownMs: 30_000 },
        },
      }),
      provider('broken', 20, async () => {
        brokenCalls += 1;
        throw new Error('down');
      }, {
        policy: {
          timeoutMs: 50,
          cacheTtlMs: 0,
          maxAgeMs: 5_000,
          rateLimit: { limit: 10, windowMs: 60_000 },
          circuitBreaker: { failureThreshold: 1, cooldownMs: 30_000 },
        },
      }),
      provider('fallback', 30, async () => payload({ price: 2 }), {
        policy: {
          timeoutMs: 50,
          cacheTtlMs: 0,
          maxAgeMs: 5_000,
          rateLimit: { limit: 10, windowMs: 60_000 },
          circuitBreaker: { failureThreshold: 2, cooldownMs: 30_000 },
        },
      }),
    ], { now: () => now });

    await registry.resolve({ operation: 'quote', symbol: 'AAPL', market: 'us_stock' });
    now += 1;
    const second = await registry.resolve({
      operation: 'quote',
      symbol: 'MSFT',
      market: 'us_stock',
    });
    now += 1;
    const third = await registry.resolve({
      operation: 'quote',
      symbol: 'NVDA',
      market: 'us_stock',
    });

    expect(rateCalls).toBe(1);
    expect(brokenCalls).toBe(1);
    expect(second.attempts[0]).toMatchObject({
      providerId: 'rate-limited',
      outcome: 'rate_limited',
    });
    expect(third.attempts[1]).toMatchObject({
      providerId: 'broken',
      outcome: 'circuit_open',
    });
  });

  it('times out a provider and exposes aggregate attempts when all fail', async () => {
    const registry = new DataProviderRegistry([
      provider('hanging', 10, async () => new Promise<ProviderPayload>(() => undefined), {
        policy: {
          timeoutMs: 5,
          cacheTtlMs: 0,
          maxAgeMs: 5_000,
          rateLimit: { limit: 10, windowMs: 60_000 },
          circuitBreaker: { failureThreshold: 1, cooldownMs: 30_000 },
        },
      }),
    ], { now: () => baseTime });

    const error = await registry.resolve({
      operation: 'quote',
      symbol: 'AAPL',
      market: 'us_stock',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DataResolutionError);
    if (!(error instanceof DataResolutionError)) {
      throw new Error('Expected DataResolutionError');
    }
    expect(error.message).not.toContain('secret');
    expect(error.attempts).toEqual([
      expect.objectContaining({
        providerId: 'hanging',
        outcome: 'timeout',
        reasonCode: 'PROVIDER_TIMEOUT',
      }),
    ]);
  });
});
