import { describe, expect, it } from 'vitest';

import {
  createCongressProvider,
  createFredProvider,
  createSecProvider,
  createSmartMoneyProvider,
  createTradingViewProvider,
  createTwseProvider,
  createYahooProvider,
  createCnyesProvider,
  createWantGooProvider,
  createWantGooChipProvider,
} from '../providers.js';
import {
  configureDataRegistry,
  getDataRegistry,
} from '../configure.js';
import { DataRequestSchema } from '../types.js';

const now = () => Date.parse('2026-01-02T12:00:00.000Z');
const signal = new AbortController().signal;

function request(
  operation: 'quote' | 'bars' | 'technical' | 'news' | 'fundamentals'
    | 'institutional' | 'congress' | 'macroSeries' | 'search',
  symbol = 'AAPL',
  market: 'tw_stock' | 'us_stock' | 'crypto' | 'forex' | 'macro' | 'global' = 'us_stock',
  params: Record<string, unknown> = {},
) {
  return DataRequestSchema.parse({ operation, symbol, market, params });
}

describe('Yahoo provider', () => {
  it('normalizes quote and bar timestamps', async () => {
    const provider = createYahooProvider({
      quote: async () => ({
        symbol: 'AAPL',
        regularMarketPrice: 201,
        regularMarketTime: 1_767_355_199,
      }),
      chart: async () => ({
        quotes: [{
          date: new Date('2026-01-02T00:00:00.000Z'),
          open: 198,
          high: 202,
          low: 197,
          close: 201,
          volume: 1_000,
        }],
      }),
      search: async () => ({ quotes: [{ symbol: 'AAPL' }], news: [] }),
    }, now);

    const quote = await provider.fetch(request('quote'), signal);
    const bars = await provider.fetch(
      request('bars', 'AAPL', 'us_stock', { interval: '1d', limit: 30 }),
      signal,
    );

    expect(quote).toMatchObject({
      data: { regularMarketPrice: 201 },
      marketTimestamp: '2026-01-02T11:59:59.000Z',
      delayed: false,
    });
    expect(bars.marketTimestamp).toBe('2026-01-02T00:00:00.000Z');
  });

  it('rejects empty bars instead of inventing history', async () => {
    const provider = createYahooProvider({
      quote: async () => null,
      chart: async () => ({ quotes: [] }),
      search: async () => ({ quotes: [], news: [] }),
    }, now);

    await expect(provider.fetch(request('bars'), signal))
      .rejects.toThrow('Yahoo bars unavailable');
  });
});

describe('exchange and scraper providers', () => {
  it('uses the exchange timestamp for TWSE quotes', async () => {
    const provider = createTwseProvider({
      realtimeQuote: async () => ({
        symbol: '2330',
        name: '台積電',
        price: 1_000,
        open: 990,
        high: 1_010,
        low: 985,
        prevClose: 995,
        change: 5,
        changePercent: 0.5,
        volume: 10_000,
        timestamp: Date.parse('2026-01-02T05:30:00.000Z'),
        source: 'TWSE' as const,
      }),
    }, now);

    const result = await provider.fetch(
      request('quote', '2330.TW', 'tw_stock'),
      signal,
    );
    expect(result.marketTimestamp).toBe('2026-01-02T05:30:00.000Z');
    expect(result.data).toMatchObject({ source: 'TWSE', price: 1_000 });
  });

  it('rejects empty TradingView technical results', async () => {
    const provider = createTradingViewProvider({
      getIndicators: async () => null,
      getNewsHeadlines: async () => null,
    }, now);

    await expect(provider.fetch(request('technical'), signal))
      .rejects.toThrow('TradingView technical unavailable');
  });
});

describe('filing, flow, news, and macro providers', () => {
  it('marks SEC, smart-money, and Congress data as delayed', async () => {
    const sec = createSecProvider({
      getFinancialSummary: async () => ({ ticker: 'AAPL', period: '2025' }),
      getCompanyFilings: async () => ({
        filings: [{ filingDate: '2026-01-01' }],
      }),
    }, now);
    const smartMoney = createSmartMoneyProvider({
      getRecentInsiderActivity: async () => ({
        summary: { latestTradeDate: '2025-12-30' },
      }),
      getLatest13FOverview: async () => ({
        currentFiling: { filingDate: '2025-11-14' },
      }),
    }, now);
    const congress = createCongressProvider({
      getRecentCongressTrades: async () => [{
        ticker: 'AAPL',
        reportedDate: '2025-12-31',
        tradeDate: '2025-12-20',
      }],
    }, now);

    const results = await Promise.all([
      sec.fetch(request('fundamentals'), signal),
      smartMoney.fetch(request('institutional'), signal),
      congress.fetch(request('congress'), signal),
    ]);

    expect(results.every((result) => result.delayed)).toBe(true);
    expect(results.map((result) => result.marketTimestamp)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2025-12-30T00:00:00.000Z',
      '2025-12-31T00:00:00.000Z',
    ]);
  });

  it('normalizes Cnyes, WantGoo, and FRED timestamps', async () => {
    const cnyes = createCnyesProvider({
      getCnyesNews: async () => [{
        id: '1',
        title: 'Cnyes',
        source: 'Cnyes',
        published: 1_767_312_000,
        link: 'https://example.com/1',
      }],
    }, now);
    const wantGoo = createWantGooProvider({
      getWantGooNews: async () => [{
        id: '2',
        title: 'WantGoo',
        source: 'WantGoo',
        published: 1_767_312_100,
        link: 'https://example.com/2',
      }],
    }, now);
    const fred = createFredProvider({
      getFredSeries: async () => ({
        seriesId: 'DGS10',
        latest: { date: '2025-12-31', value: 4.2 },
        observations: [{ date: '2025-12-31', value: 4.2 }],
      }),
    }, now);

    const [cnyesResult, wantGooResult, fredResult] = await Promise.all([
      cnyes.fetch(request('news', '台股', 'tw_stock'), signal),
      wantGoo.fetch(request('news', '台股', 'tw_stock'), signal),
      fred.fetch(request('macroSeries', 'DGS10', 'macro'), signal),
    ]);

    expect(cnyesResult.marketTimestamp).toBe('2026-01-02T00:00:00.000Z');
    expect(wantGooResult.marketTimestamp).toBe('2026-01-02T00:01:40.000Z');
    expect(fredResult.marketTimestamp).toBe('2025-12-31T00:00:00.000Z');
  });

  it('returns real Taiwan institutional fields without random synthesis', async () => {
    const provider = createWantGooChipProvider({
      getChipData: async () => ({
        foreignNet: 1_200,
        trustNet: -300,
        dealerNet: 100,
        mainPlayersNet: 900,
      }),
    }, now);

    const value = await provider.fetch(
      request('institutional', '2330.TW', 'tw_stock'),
      signal,
    );

    expect(value.data).toMatchObject({
      foreignNet: 1_200,
      trustNet: -300,
      dealerNet: 100,
    });
    expect(value.warnings).toEqual([
      'Some unavailable chip fields may be represented as zero by the upstream adapter.',
    ]);
  });
});

describe('data registry configuration', () => {
  it('rejects access before configuration and remains idempotent', () => {
    expect(() => getDataRegistry()).toThrow('Data registry is not configured');
    const provider = createYahooProvider({
      quote: async () => ({ regularMarketPrice: 1 }),
      chart: async () => ({ quotes: [] }),
      search: async () => ({ quotes: [{ symbol: 'AAPL' }] }),
    }, now);

    const configured = configureDataRegistry([provider]);
    expect(getDataRegistry()).toBe(configured);
    expect(configureDataRegistry([])).toBe(configured);
  });
});
