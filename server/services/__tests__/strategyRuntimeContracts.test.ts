import { describe, expect, it } from 'vitest';
import {
  StrategyBacktestRequestSchema,
  StrategyValidationRequestSchema,
} from '../../types/strategyRuntime.js';

describe('strategy runtime contracts', () => {
  it('requires immutable strategy identity', () => {
    const parsed = StrategyValidationRequestSchema.safeParse({
      strategyVersionId: 'version-1',
      runtime: 'indicator',
      source: 'def run(data, params):\n    return {"buy": [], "sell": []}',
      sourceHash: 'a'.repeat(64),
      parameters: {},
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects backtests without OHLCV bars', () => {
    const parsed = StrategyBacktestRequestSchema.safeParse({
      runId: 'run-1',
      strategyVersionId: 'version-1',
      runtime: 'script',
      source: 'def on_init(ctx): pass\ndef on_bar(ctx, bar): pass',
      sourceHash: 'b'.repeat(64),
      parameters: {},
      symbol: '2330.TW',
      bars: [],
      execution: { initialCapital: 1_000_000 },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects non-SHA-256 source hashes', () => {
    const parsed = StrategyValidationRequestSchema.safeParse({
      strategyVersionId: 'version-1',
      runtime: 'indicator',
      source: 'def run(data, params): return {}',
      sourceHash: 'not-a-hash',
      parameters: {},
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects bars with impossible OHLC relationships', () => {
    const parsed = StrategyBacktestRequestSchema.safeParse({
      runId: 'run-1',
      strategyVersionId: 'version-1',
      runtime: 'indicator',
      source: 'def run(data, params): return {}',
      sourceHash: 'c'.repeat(64),
      parameters: {},
      symbol: '2330.TW',
      bars: [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          open: 100,
          high: 90,
          low: 80,
          close: 95,
          volume: 100,
        },
        {
          timestamp: '2026-01-02T00:00:00.000Z',
          open: 95,
          high: 100,
          low: 90,
          close: 98,
          volume: 100,
        },
      ],
      execution: { initialCapital: 1_000_000 },
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts an explicit cross-sectional universe for indicator backtests', () => {
    const bars = [
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 100,
      },
      {
        timestamp: '2026-01-02T00:00:00.000Z',
        open: 101,
        high: 102,
        low: 100,
        close: 101,
        volume: 100,
      },
    ];
    const parsed = StrategyBacktestRequestSchema.safeParse({
      runId: 'run-cross-1',
      strategyVersionId: 'version-cross-1',
      runtime: 'indicator',
      source: 'def run(data, params): return {"scores": {}}',
      sourceHash: 'd'.repeat(64),
      parameters: {},
      symbol: 'AAPL,MSFT',
      bars,
      universeBars: { AAPL: bars, MSFT: bars },
      crossSectional: {
        symbols: ['AAPL', 'MSFT'],
        portfolioSize: 2,
        longRatio: 0.5,
        rebalanceFrequency: 'daily',
      },
      execution: {},
    });

    expect(parsed.success).toBe(true);
  });
});
