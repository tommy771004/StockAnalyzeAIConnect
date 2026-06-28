import { describe, expect, it, vi } from 'vitest';

import { createDefaultAgentTools } from '../defaultTools.js';

const provenance = {
  providerId: 'yahoo',
  providerVersion: '1',
  retrievedAt: '2026-01-02T00:00:01.000Z',
  marketTimestamp: '2026-01-02T00:00:00.000Z',
  delayed: false,
  cache: 'miss' as const,
};

function context(scopes: Array<'R' | 'W' | 'B'> = ['R', 'B']) {
  return {
    userId: 'user-1',
    scopes,
    paperOnly: true as const,
    allowedMarkets: ['us_stock' as const],
    allowedInstruments: ['AAPL'],
  };
}

describe('default agent tools', () => {
  it('propagates provider provenance into stock-chart evidence', async () => {
    const resolveData = vi.fn(async () => ({
      request: {},
      data: { regularMarketPrice: 200 },
      provenance,
      attempts: [],
      warnings: [],
    }));
    const tools = createDefaultAgentTools({
      resolveData: resolveData as never,
      getPortfolio: async () => [],
      getTrades: async () => [],
      queueBacktest: async () => ({ jobId: 'job-1', status: 'queued' }),
      now: () => Date.parse('2026-01-02T00:00:01.000Z'),
    });

    const result = await tools.execute(
      'show_stock_chart',
      { ticker: 'AAPL', timeframe: '1M', showMA: true },
      context(),
    );

    expect(resolveData).toHaveBeenCalledWith({
      operation: 'quote',
      symbol: 'AAPL',
      market: 'us_stock',
    });
    expect(result.evidence[0]?.source.providerId).toBe('yahoo');
    expect(result.data).toMatchObject({ rendered_on_client: true });
  });

  it('enforces instrument allowlists before data access', async () => {
    const resolveData = vi.fn();
    const tools = createDefaultAgentTools({
      resolveData: resolveData as never,
      getPortfolio: async () => [],
      getTrades: async () => [],
      queueBacktest: async () => ({ jobId: 'job-1', status: 'queued' }),
    });

    await expect(tools.execute(
      'show_news_sentiment',
      { ticker: 'MSFT' },
      context(['R']),
    )).rejects.toThrow('allowlist');
    expect(resolveData).not.toHaveBeenCalled();
  });

  it('queues the real async backtest and returns internal evidence', async () => {
    const queueBacktest = vi.fn(async () => ({ jobId: 'job-7', status: 'queued' }));
    const tools = createDefaultAgentTools({
      resolveData: vi.fn() as never,
      getPortfolio: async () => [],
      getTrades: async () => [],
      queueBacktest,
      now: () => Date.parse('2026-01-02T00:00:01.000Z'),
    });

    const result = await tools.execute('execute_backtest', {
      ticker: 'AAPL',
      strategyVersionId: 'version-1',
      initialCapital: 100_000,
    }, context());

    expect(queueBacktest).toHaveBeenCalledWith('user-1', {
      ticker: 'AAPL',
      strategyVersionId: 'version-1',
      initialCapital: 100_000,
    });
    expect(result.data).toEqual({ jobId: 'job-7', status: 'queued' });
    expect(result.evidence[0]?.source.providerId).toBe('hermes-strategy-runtime');
  });

  it('resolves fundamentals and preserves provider evidence', async () => {
    const resolveData = vi.fn(async () => ({
      request: {},
      data: { revenue: 100_000_000, period: '2025' },
      provenance: {
        ...provenance,
        providerId: 'sec-edgar',
        delayed: true,
      },
      attempts: [],
      warnings: [],
    }));
    const tools = createDefaultAgentTools({
      resolveData: resolveData as never,
      getPortfolio: async () => [],
      getTrades: async () => [],
      queueBacktest: async () => ({ jobId: 'job-1', status: 'queued' }),
    });

    const result = await tools.execute(
      'get_fundamentals',
      { ticker: 'AAPL' },
      context(['R']),
    );

    expect(resolveData).toHaveBeenCalledWith({
      operation: 'fundamentals',
      symbol: 'AAPL',
      market: 'us_stock',
    });
    expect(result.evidence[0]?.source.providerId).toBe('sec-edgar');
  });

  it('creates, validates, and inspects user-owned strategy resources', async () => {
    const createStrategyVersion = vi.fn(async () => ({
      id: 'version-2',
      validationStatus: 'pending',
    }));
    const validateStrategyVersion = vi.fn(async () => ({
      valid: true,
      diagnostics: [],
    }));
    const getBacktestJob = vi.fn(async () => ({
      id: 'job-2',
      status: 'completed',
    }));
    const tools = createDefaultAgentTools({
      resolveData: vi.fn() as never,
      getPortfolio: async () => [],
      getTrades: async () => [],
      queueBacktest: async () => ({ jobId: 'job-1', status: 'queued' }),
      createStrategyVersion,
      validateStrategyVersion,
      getBacktestJob,
      now: () => Date.parse('2026-01-02T00:00:01.000Z'),
    });

    await expect(tools.execute('create_strategy_draft', {
      strategyId: 7,
      runtime: 'indicator',
      source: 'def run(data, params): return {"buy": [], "sell": []}',
    }, context(['R']))).rejects.toThrow('requires scopes');

    const draft = await tools.execute('create_strategy_draft', {
      strategyId: 7,
      runtime: 'indicator',
      source: 'def run(data, params): return {"buy": [], "sell": []}',
    }, context(['W']));
    const validation = await tools.execute(
      'validate_strategy',
      { strategyVersionId: 'version-2' },
      context(['W']),
    );
    const job = await tools.execute(
      'inspect_backtest',
      { jobId: 'job-2' },
      context(['R']),
    );

    expect(createStrategyVersion).toHaveBeenCalledWith(
      'user-1',
      7,
      expect.objectContaining({ provenance: 'ai' }),
    );
    expect(validateStrategyVersion).toHaveBeenCalledWith('user-1', 'version-2');
    expect(getBacktestJob).toHaveBeenCalledWith('user-1', 'job-2');
    expect(draft.evidence[0]?.source.providerId).toBe('hermes-strategy-registry');
    expect(validation.data).toMatchObject({ valid: true });
    expect(job.data).toMatchObject({ id: 'job-2', status: 'completed' });
  });
});
