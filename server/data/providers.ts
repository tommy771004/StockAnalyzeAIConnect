import type {
  DataOperation,
  DataProvider,
  DataRequest,
  DataMarket,
  ProviderPayload,
  ProviderPolicy,
} from './types.js';

type Now = () => number;

interface YahooClient {
  quote(symbol: string | string[]): Promise<unknown>;
  chart(symbol: string, options?: {
    interval?: string;
    period1?: string | number;
    period2?: string | number;
  }): Promise<{ quotes?: unknown[] }>;
  search(query: string): Promise<unknown>;
}

interface TwseClient {
  realtimeQuote(symbol: string): Promise<unknown>;
}

interface TradingViewClient {
  getIndicators(symbol: string, timeframe?: never): Promise<unknown>;
  getNewsHeadlines(symbol: string): Promise<unknown>;
  getCalendarEarnings?(countries?: string[], days?: number): Promise<unknown>;
}

interface SecClient {
  getFinancialSummary(ticker: string): Promise<unknown>;
  getCompanyFilings(ticker: string): Promise<unknown>;
}

interface SmartMoneyClient {
  getRecentInsiderActivity(ticker: string): Promise<unknown>;
  getLatest13FOverview(managerId: string): Promise<unknown>;
}

interface CongressClient {
  getRecentCongressTrades(ticker?: string, limit?: number): Promise<unknown>;
}

interface CnyesClient {
  getCnyesNews(category?: string, limit?: number): Promise<unknown>;
}

interface WantGooClient {
  getWantGooNews(category?: string): Promise<unknown>;
}

interface FredClient {
  getFredSeries(series: string, limit?: number): Promise<unknown>;
}

const minute = 60_000;
const day = 24 * 60 * minute;

function policy(overrides: Partial<ProviderPolicy> = {}): ProviderPolicy {
  return {
    timeoutMs: 10_000,
    cacheTtlMs: minute,
    maxAgeMs: day,
    rateLimit: { limit: 60, windowMs: minute },
    circuitBreaker: { failureThreshold: 3, cooldownMs: minute },
    ...overrides,
  };
}

function descriptor(
  id: string,
  operations: DataOperation[],
  markets: DataMarket[],
  priority: number,
  providerPolicy: ProviderPolicy,
  fetch: DataProvider['fetch'],
): DataProvider {
  return {
    id,
    version: '1',
    operations,
    markets,
    priority,
    policy: providerPolicy,
    fetch,
  };
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function dateIso(value: unknown, fallback: number): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return iso(value < 10_000_000_000 ? value * 1_000 : value);
  }
  if (typeof value === 'string' && value.trim()) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value;
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) return iso(parsed);
  }
  return iso(fallback);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function latestDate(values: unknown[], fields: string[], fallback: number): string {
  const timestamps = values.flatMap((value) => {
    const record = object(value);
    if (!record) return [];
    return fields.map((field) => Date.parse(dateIso(record[field], fallback)));
  }).filter(Number.isFinite);
  return iso(timestamps.length ? Math.max(...timestamps) : fallback);
}

function result(
  data: unknown,
  marketTimestamp: string,
  delayed: boolean,
  now: Now,
  warnings: string[] = [],
): ProviderPayload {
  return {
    data,
    retrievedAt: iso(now()),
    marketTimestamp,
    delayed,
    warnings,
  };
}

function requireOperation(
  request: DataRequest,
  supported: DataOperation[],
  providerName: string,
): void {
  if (!supported.includes(request.operation)) {
    throw new Error(`${providerName} does not support ${request.operation}`);
  }
}

function ensureActive(signal: AbortSignal): void {
  signal.throwIfAborted();
}

export function createYahooProvider(client: YahooClient, now: Now = Date.now): DataProvider {
  const operations: DataOperation[] = ['quote', 'bars', 'news', 'search'];
  return descriptor(
    'yahoo',
    operations,
    ['tw_stock', 'us_stock', 'crypto', 'forex', 'global'],
    20,
    policy({
      timeoutMs: 12_000,
      cacheTtlMs: 30_000,
      maxAgeMs: 60 * minute,
      rateLimit: { limit: 90, windowMs: minute },
      circuitBreaker: { failureThreshold: 2, cooldownMs: 5 * minute },
    }),
    async (request, signal) => {
      requireOperation(request, operations, 'Yahoo');
      ensureActive(signal);

      if (request.operation === 'quote') {
        const data = await client.quote(request.symbol);
        ensureActive(signal);
        const quote = object(Array.isArray(data) ? data[0] : data);
        if (!quote || !Number.isFinite(Number(quote.regularMarketPrice))) {
          throw new Error('Yahoo quote unavailable');
        }
        return result(
          quote,
          dateIso(quote.regularMarketTime, now()),
          false,
          now,
        );
      }

      if (request.operation === 'bars') {
        const response = await client.chart(request.symbol, {
          interval: typeof request.params.interval === 'string'
            ? request.params.interval
            : '1d',
          period1: typeof request.params.start === 'string'
            ? request.params.start
            : undefined,
          period2: typeof request.params.end === 'string'
            ? request.params.end
            : undefined,
        });
        ensureActive(signal);
        const rawBars = array(response?.quotes);
        const limited = typeof request.params.limit === 'number'
          ? rawBars.slice(-request.params.limit)
          : rawBars;
        const bars = limited.flatMap((raw) => {
          const bar = object(raw);
          if (!bar) return [];
          const timestamp = dateIso(bar.date ?? bar.timestamp, Number.NaN);
          const open = Number(bar.open);
          const high = Number(bar.high);
          const low = Number(bar.low);
          const close = Number(bar.close);
          const volume = Number(bar.volume);
          if (
            !Number.isFinite(Date.parse(timestamp))
            || ![open, high, low, close, volume].every(Number.isFinite)
          ) return [];
          return [{ timestamp, open, high, low, close, volume }];
        });
        if (!bars.length) throw new Error('Yahoo bars unavailable');
        return result(bars, bars[bars.length - 1]!.timestamp, true, now);
      }

      const search = object(await client.search(
        request.operation === 'search'
          ? String(request.params.query ?? request.symbol)
          : request.symbol,
      ));
      ensureActive(signal);
      if (!search) throw new Error(`Yahoo ${request.operation} unavailable`);

      if (request.operation === 'news') {
        const news = array(search.news);
        if (!news.length) throw new Error('Yahoo news unavailable');
        return result(
          news,
          latestDate(news, ['providerPublishTime', 'published', 'pubDate'], now()),
          true,
          now,
        );
      }

      const quotes = array(search.quotes);
      if (!quotes.length) throw new Error('Yahoo search unavailable');
      return result(search, iso(now()), false, now);
    },
  );
}

export function createTwseProvider(client: TwseClient, now: Now = Date.now): DataProvider {
  return descriptor(
    'twse',
    ['quote'],
    ['tw_stock'],
    10,
    policy({
      timeoutMs: 8_000,
      cacheTtlMs: 10_000,
      maxAgeMs: day,
      rateLimit: { limit: 120, windowMs: minute },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const quote = object(await client.realtimeQuote(request.symbol));
      ensureActive(signal);
      if (!quote || !Number.isFinite(Number(quote.price))) {
        throw new Error('TWSE quote unavailable');
      }
      return result(quote, dateIso(quote.timestamp, now()), false, now);
    },
  );
}

export function createTradingViewProvider(
  client: TradingViewClient,
  now: Now = Date.now,
): DataProvider {
  const operations: DataOperation[] = ['technical', 'news', 'economicCalendar'];
  return descriptor(
    'tradingview',
    operations,
    ['tw_stock', 'us_stock', 'crypto', 'forex', 'global'],
    30,
    policy({
      timeoutMs: 5_000,
      cacheTtlMs: minute,
      maxAgeMs: 7 * day,
      rateLimit: { limit: 60, windowMs: minute },
    }),
    async (request, signal) => {
      ensureActive(signal);
      if (request.operation === 'technical') {
        const data = object(await client.getIndicators(request.symbol));
        ensureActive(signal);
        if (!data || !Object.keys(data).length) {
          throw new Error('TradingView technical unavailable');
        }
        return result(data, iso(now()), false, now);
      }
      if (request.operation === 'news') {
        const data = array(await client.getNewsHeadlines(request.symbol));
        ensureActive(signal);
        if (!data.length) throw new Error('TradingView news unavailable');
        return result(
          data,
          latestDate(data, ['published'], now()),
          true,
          now,
        );
      }
      if (!client.getCalendarEarnings) {
        throw new Error('TradingView economic calendar unavailable');
      }
      const calendar = await client.getCalendarEarnings(
        Array.isArray(request.params.countries)
          ? request.params.countries.map(String)
          : undefined,
        typeof request.params.days === 'number' ? request.params.days : undefined,
      );
      ensureActive(signal);
      if (calendar == null) throw new Error('TradingView economic calendar unavailable');
      return result(calendar, iso(now()), true, now);
    },
  );
}

export function createSecProvider(client: SecClient, now: Now = Date.now): DataProvider {
  return descriptor(
    'sec-edgar',
    ['fundamentals'],
    ['us_stock'],
    10,
    policy({
      timeoutMs: 15_000,
      cacheTtlMs: 6 * 60 * minute,
      maxAgeMs: 550 * day,
      rateLimit: { limit: 8, windowMs: 1_000 },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const [financialsRaw, companyRaw] = await Promise.all([
        client.getFinancialSummary(request.symbol),
        client.getCompanyFilings(request.symbol),
      ]);
      ensureActive(signal);
      const financials = object(financialsRaw);
      const company = object(companyRaw);
      if (!financials && !company) throw new Error('SEC fundamentals unavailable');
      const filings = array(company?.filings);
      const period = financials?.period;
      const timestamp = filings.length
        ? latestDate(filings, ['filingDate'], now())
        : dateIso(typeof period === 'string' ? `${period}-12-31` : undefined, now());
      return result({ financials, company }, timestamp, true, now);
    },
  );
}

export function createSmartMoneyProvider(
  client: SmartMoneyClient,
  now: Now = Date.now,
): DataProvider {
  return descriptor(
    'sec-smart-money',
    ['institutional'],
    ['us_stock'],
    20,
    policy({
      timeoutMs: 20_000,
      cacheTtlMs: 6 * 60 * minute,
      maxAgeMs: 180 * day,
      rateLimit: { limit: 8, windowMs: 1_000 },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const managerId = request.params.managerId;
      const data = object(
        typeof managerId === 'string'
          ? await client.getLatest13FOverview(managerId)
          : await client.getRecentInsiderActivity(request.symbol),
      );
      ensureActive(signal);
      if (!data) throw new Error('Smart-money data unavailable');
      const summary = object(data.summary);
      const currentFiling = object(data.currentFiling);
      const timestamp = dateIso(
        summary?.latestTradeDate ?? currentFiling?.filingDate,
        now(),
      );
      return result(data, timestamp, true, now);
    },
  );
}

export function createCongressProvider(
  client: CongressClient,
  now: Now = Date.now,
): DataProvider {
  return descriptor(
    'congress',
    ['congress'],
    ['us_stock'],
    10,
    policy({
      timeoutMs: 25_000,
      cacheTtlMs: 6 * 60 * minute,
      maxAgeMs: 180 * day,
      rateLimit: { limit: 20, windowMs: minute },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const trades = array(await client.getRecentCongressTrades(
        request.symbol === 'ALL' ? undefined : request.symbol,
        typeof request.params.limit === 'number' ? request.params.limit : 50,
      ));
      ensureActive(signal);
      if (!trades.length) throw new Error('Congress trades unavailable');
      return result(
        trades,
        latestDate(trades, ['reportedDate', 'tradeDate'], now()),
        true,
        now,
        ['Congressional disclosures may be reported up to 45 days after a trade.'],
      );
    },
  );
}

function createNewsProvider(
  id: string,
  priority: number,
  load: (category: string, limit: number) => Promise<unknown>,
  now: Now,
): DataProvider {
  return descriptor(
    id,
    ['news'],
    ['tw_stock', 'global'],
    priority,
    policy({
      timeoutMs: 10_000,
      cacheTtlMs: 5 * minute,
      maxAgeMs: 7 * day,
      rateLimit: { limit: 30, windowMs: minute },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const news = array(await load(
        String(request.params.category ?? request.symbol),
        typeof request.params.limit === 'number' ? request.params.limit : 30,
      ));
      ensureActive(signal);
      if (!news.length) throw new Error(`${id} news unavailable`);
      return result(news, latestDate(news, ['published'], now()), true, now);
    },
  );
}

export function createCnyesProvider(client: CnyesClient, now: Now = Date.now): DataProvider {
  return createNewsProvider(
    'cnyes',
    10,
    (category, limit) => client.getCnyesNews(category, limit),
    now,
  );
}

export function createWantGooProvider(
  client: WantGooClient,
  now: Now = Date.now,
): DataProvider {
  return createNewsProvider(
    'wantgoo',
    20,
    (category) => client.getWantGooNews(category),
    now,
  );
}

export function createFredProvider(client: FredClient, now: Now = Date.now): DataProvider {
  return descriptor(
    'fred',
    ['macroSeries'],
    ['macro'],
    10,
    policy({
      timeoutMs: 12_000,
      cacheTtlMs: 6 * 60 * minute,
      maxAgeMs: 120 * day,
      rateLimit: { limit: 30, windowMs: minute },
    }),
    async (request, signal) => {
      ensureActive(signal);
      const data = object(await client.getFredSeries(
        request.symbol,
        typeof request.params.limit === 'number' ? request.params.limit : 12,
      ));
      ensureActive(signal);
      const latest = object(data?.latest);
      const observations = array(data?.observations);
      if (!data || !observations.length || !latest?.date) {
        throw new Error('FRED series unavailable');
      }
      return result(data, dateIso(latest.date, now()), true, now);
    },
  );
}
