import { describe, expect, it, vi } from 'vitest';

import { createRegistryBarLoader } from '../registryBarLoader.js';

describe('registry strategy bar loader', () => {
  it('loads provenance-rich normalized bars through the data registry', async () => {
    const resolve = vi.fn(async () => ({
      data: [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: 1_000,
        },
        {
          timestamp: '2026-01-02T00:00:00.000Z',
          open: 101,
          high: 103,
          low: 100,
          close: 102,
          volume: 1_100,
        },
      ],
      provenance: {
        providerId: 'yahoo',
        marketTimestamp: '2026-01-02T00:00:00.000Z',
      },
    }));
    const loader = createRegistryBarLoader(
      { resolve } as never,
      () => Date.parse('2026-01-03T00:00:00.000Z'),
    );

    const bars = await loader({
      symbol: 'AAPL',
      period1: Date.parse('2026-01-01T00:00:00.000Z'),
      period2: Date.parse('2026-01-03T00:00:00.000Z'),
    });

    expect(resolve).toHaveBeenCalledWith({
      operation: 'bars',
      symbol: 'AAPL',
      market: 'us_stock',
      params: {
        interval: '1d',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-03T00:00:00.000Z',
        limit: 10_000,
      },
    });
    expect(bars).toHaveLength(2);
    expect(bars[1]?.close).toBe(102);
  });
});
