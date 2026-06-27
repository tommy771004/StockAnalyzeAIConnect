import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runStrategyBacktest,
  validateStrategy,
} from '../quantRuntimeClient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quant runtime client', () => {
  it('rejects a mismatched source hash before network I/O', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateStrategy({
      strategyVersionId: 'v1',
      runtime: 'indicator',
      source: 'def run(data, params): return {}',
      sourceHash: '0'.repeat(64),
      parameters: {},
    })).rejects.toThrow('source hash');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses validation results from the Python runtime', async () => {
    const source = 'def run(data, params): return {"buy": [], "sell": []}';
    const hash = '476faed19bd4f9dede0b22722172169e56f5c017cae29df1ac0bb1204687e193';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'success',
      data: {
        valid: true,
        diagnostics: [],
        sourceHash: hash,
        engineVersion: 'hermes-quant-1',
      },
      meta: {},
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateStrategy({
      strategyVersionId: 'v1',
      runtime: 'indicator',
      source,
      sourceHash: hash,
      parameters: {},
    });

    expect(result.valid).toBe(true);
    expect(result.sourceHash).toBe(hash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/strategy/validate');
  });

  it('does not retry a submitted backtest', async () => {
    const source = 'def run(data, params): return {"buy": [False, False], "sell": [False, False]}';
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection reset'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runStrategyBacktest({
      runId: 'run-1',
      strategyVersionId: 'v1',
      runtime: 'indicator',
      source,
      sourceHash: 'b9605850acf6af184c4278fdd450e834f0102596d3b37357eae529d8337223b0',
      parameters: {},
      symbol: '2330.TW',
      bars: [
        {
          timestamp: '2026-01-01',
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1_000,
        },
        {
          timestamp: '2026-01-02',
          open: 101,
          high: 102,
          low: 100,
          close: 101,
          volume: 1_000,
        },
      ],
      execution: { initialCapital: 1_000_000 },
    })).rejects.toThrow('connection reset');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
