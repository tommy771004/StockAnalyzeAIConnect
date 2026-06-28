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

function context(scopes: Array<'R' | 'B'> = ['R', 'B']) {
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
});
