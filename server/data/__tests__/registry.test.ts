import { describe, expect, it } from 'vitest';

import {
  DataEnvelopeSchema,
  DataRequestSchema,
  ProviderPayloadSchema,
} from '../types.js';

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
