/**
 * src/services/api.ts
 * Unified data access layer — auto-detects Electron IPC vs web fetch.
 */

import { Quote, NewsItem, CalendarData, WatchlistItem, Trade, Position, Alert, HistoricalData, BacktestResult, BacktestParams, ScreenerResult, TWSEData, MTFTrendRecord, TradeDTO, mapTradeDTO, SearchResult } from '../types';

declare global {
  interface Window {
    api?: {
      isElectron: true;
      getQuote:    (sym: string) => Promise<Quote>;
      getHistory:  (sym: string, opts?: Record<string, string | number>) => Promise<HistoricalData[]>;
      getBatch:    (syms: string[]) => Promise<Quote[]>;
      getNews:     (sym: string) => Promise<NewsItem[]>;
      getCalendar: (sym: string) => Promise<CalendarData>;
      getForex:    (pair?: string) => Promise<number>;
      getTWSE:     (stockNo: string) => Promise<TWSEData>;
      getMTF:      (sym: string, opts?: Record<string, string | number>) => Promise<MTFTrendRecord>;
      runBacktest: (p: BacktestParams) => Promise<BacktestResult>;
      getWatchlist:  () => Promise<WatchlistItem[]>;
      setWatchlist:  (l: WatchlistItem[]) => Promise<boolean>;
      getPositions:  () => Promise<{ positions: Position[]; usdtwd: number }>;
      setPositions:  (l: Position[]) => Promise<boolean>;
      getTrades:     () => Promise<Trade[]>;
      addTrade:      (t: Partial<Trade>) => Promise<Trade>;
      updateTrade:   (t: Partial<Trade>) => Promise<boolean>;
      deleteTrade:   (id: number) => Promise<boolean>;
      getAlerts:     () => Promise<Alert[]>;
      addAlert:      (a: Omit<Alert, 'id'>) => Promise<Alert>;
      deleteAlert:   (id: number) => Promise<boolean>;
      triggerAlert:  (id: number) => Promise<boolean>;
      getSetting:    <T>(key: string) => Promise<T>;
      setSetting:    <T>(key: string, val: T) => Promise<boolean>;
      getDbStats:    () => Promise<unknown>;
      getSystemStats:() => Promise<unknown>;
      runScreener:   (symbols: string[], filters?: ScreenerFilters) => Promise<{ results: ScreenerResult[] }>;
      openExternal:  (url: string) => Promise<void>;
      getVersion:    () => Promise<string>;
      getDataPath:   () => Promise<string>;
      showNotification?: (title: string, body: string) => void;
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
    };
  }
}

import { getCachedData, setCachedData, isMarketHours } from './cache';
import { fetchJ } from '../utils/api';

/** Log API fallbacks so failures are visible during development. */
const apiWarn = (ctx: string, e: unknown) => {
  console.warn(`[API] ${ctx} fallback:`, e instanceof Error ? e.message : e);
};

const IS_ELECTRON = typeof window !== 'undefined' && !!window.api?.isElectron;
const E = () => {
  if (!window.api) throw new Error('Electron API not available');
  return window.api;
};

// ── Electron Specific ──────────────────────────────────────────────────────────
export const showNotification = (title: string, body: string) => {
  if (IS_ELECTRON && window.api?.showNotification) {
    window.api.showNotification(title, body);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
};

// ── Stock ─────────────────────────────────────────────────────────────────────
export const getQuote = async (sym: string): Promise<Quote> => {
  const dynamicTTL = isMarketHours() ? 5000 : 60000; // 5s during market, 1m outside
  const cached = getCachedData<Quote>(`quote:${sym}`, undefined, dynamicTTL);
  if (cached) return cached;
  const data = IS_ELECTRON ? await E().getQuote(sym) : await fetchJ<Quote>(`/api/stock/${sym}`);
  setCachedData(`quote:${sym}`, data);
  return data;
};

export const getHistory = (sym: string, opts?: Record<string, string | number>): Promise<HistoricalData[]> => {
  const dynamicTTL = isMarketHours() ? 30000 : 300000; // 30s during market, 5m outside
  const cached = getCachedData<HistoricalData[]>(`history:${sym}:${JSON.stringify(opts)}`, undefined, dynamicTTL);
  if (cached) return Promise.resolve(cached);
  
  const fetcher = async () => {
    const data = IS_ELECTRON 
      ? await E().getHistory(sym, opts) 
      : await fetchJ<HistoricalData[]>(`/api/stock/${sym}/history?${new URLSearchParams(opts as Record<string, string> ?? {})}`);
    setCachedData(`history:${sym}:${JSON.stringify(opts)}`, data);
    return data;
  };

  return fetcher();
};

export const getBatchQuotes = (syms: string[]): Promise<Quote[]> =>
  IS_ELECTRON ? E().getBatch(syms) : fetchJ<Quote[]>(`/api/quotes?symbols=${syms.join(',')}`);

export const getNews = async (sym: string): Promise<NewsItem[]> => {
  const cached = getCachedData<NewsItem[]>(`news:${sym}`);
  if (cached) return cached;
  
  // 為 getNews 整體設置一個 10 秒超時，防止無限轉圈
  const timeoutPromise = new Promise<NewsItem[]>((_, reject) => 
    setTimeout(() => reject(new Error('News fetch timeout')), 10000)
  );

  const fetchPromise = (async () => {
    try {
      let data: NewsItem[] = [];
      if (IS_ELECTRON) {
        data = await E().getNews(sym);
      } else {
        try {
          // 先嘗試 TV 新聞
          const tvNews = await fetchJ<Array<{ id: string; title: string; published: number; source: string; storyPath: string }>>(`/api/tv/news/${encodeURIComponent(sym)}`);
          if (tvNews && tvNews.length > 0) {
            data = tvNews.map(item => ({
              id: item.id || Math.random().toString(),
              title: item.title,
              link: item.storyPath ? `https://www.tradingview.com${item.storyPath}` : '',
              publisher: item.source,
              providerPublishTime: item.published,
              type: 'NEWS'
            }));
          } else {
            throw new Error('Empty TV news');
          }
        } catch (tvError) {
          // 靜默備援，避免 Console 頻繁報警
          console.debug('[API] TV News fallback to Yahoo:', (tvError as Error)?.message);
          try {
            // 回退到 Yahoo 新聞
            data = await fetchJ<NewsItem[]>(`/api/news/${sym}`);
          } catch (yError) {
            console.error('Yahoo news fallback failed:', yError);
            data = [];
          }
        }
      }
      setCachedData(`news:${sym}`, data);
      return data;
    } catch (e) {
      apiWarn('getNews', e);
      return []; // 失敗時回傳空陣列而非拋端，解除前端 loading 狀態
    }
  })();

  return Promise.race([fetchPromise, timeoutPromise]).catch(err => {
    console.warn('[api.getNews] Timed out or failed, returning empty:', err);
    return [];
  });
};

export const getCalendar = async (sym: string): Promise<CalendarData> => {
  const cached = getCachedData<CalendarData>(`cal:${sym}`);
  if (cached) return cached;
  try {
    const data = IS_ELECTRON ? await E().getCalendar(sym) : await fetchJ<CalendarData>(`/api/calendar/${sym}`);
    setCachedData(`cal:${sym}`, data);
    return data;
  } catch (e) {
    apiWarn('getCalendar', e);
    throw e;
  }
};

export const getForexRate  = (pair = 'USDTWD=X'): Promise<number> =>
  IS_ELECTRON ? E().getForex(pair) : fetchJ<{ rate?: number }>(`/api/forex/${pair}`).then(r => {
    if (r.rate == null) throw new Error('Forex rate not found');
    return r.rate;
  }).catch(e => {
    apiWarn('getForexRate', e);
    throw e;
  });

export const getTWSEStock  = (stockNo: string): Promise<TWSEData> =>
  IS_ELECTRON ? E().getTWSE(stockNo) : fetchJ<TWSEData>(`/api/twse/stock/${stockNo}`);

export const getMTF = (sym: string, opts?: Record<string, string | number>): Promise<MTFTrendRecord> => {
  if (IS_ELECTRON) return E().getMTF(sym, opts);
  const p = new URLSearchParams(opts as Record<string, string> ?? {}); return fetchJ<MTFTrendRecord>(`/api/stock/${sym}/mtf?${p}`);
};

export const runBacktest   = (p: BacktestParams): Promise<BacktestResult> =>
  IS_ELECTRON ? E().runBacktest(p)
    : fetchJ<BacktestResult>('/api/backtest', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });

// ── Watchlist ─────────────────────────────────────────────────────────────────
export const getWatchlist  = (): Promise<WatchlistItem[]> =>
  IS_ELECTRON ? E().getWatchlist() : fetchJ<WatchlistItem[]>('/api/watchlist');

export const setWatchlist  = (list: WatchlistItem[]): Promise<boolean> =>
  IS_ELECTRON ? E().setWatchlist(list)
    : fetchJ<boolean>('/api/watchlist', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(list) });

/** Add a single item via upsert — avoids full-replace race conditions. */
export const addWatchlistItem = (symbol: string, name?: string): Promise<WatchlistItem> =>
  fetchJ<WatchlistItem>('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, name }),
  });

/** Remove a single item from the watchlist. */
export const removeWatchlistItem = (symbol: string): Promise<boolean> =>
  fetchJ(`/api/watchlist/${symbol}`, { method: 'DELETE' })
    .then(() => true)
    .catch(e => { apiWarn('removeWatchlistItem', e); throw e; });

// ── Positions ─────────────────────────────────────────────────────────────────
export const getPositions  = (): Promise<{ positions: Position[]; usdtwd: number }> =>
  IS_ELECTRON ? E().getPositions() : fetchJ<{ positions: Position[]; usdtwd: number }>('/api/positions');

export const setPositions  = (list: Position[]): Promise<boolean> =>
  IS_ELECTRON ? E().setPositions(list)
    : fetchJ<boolean>('/api/positions', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(list) });

// ── Trades ────────────────────────────────────────────────────────────────────
export const getTrades = async (): Promise<Trade[]> => {
  try {
    const raw = IS_ELECTRON ? await E().getTrades() : await fetchJ<TradeDTO[]>('/api/trades');
    const data = Array.isArray(raw) ? (raw as TradeDTO[]) : [];
    return (Array.isArray(data) ? data : []).map(mapTradeDTO);
  } catch (e) {
    apiWarn('getTrades', e);
    throw e;
  }
};

export const addTrade      = (t: Partial<Trade>): Promise<Trade> =>
  IS_ELECTRON ? E().addTrade(t)
    : fetchJ<Trade>('/api/trades', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(t) });

export const updateTrade   = (t: Partial<Trade>): Promise<boolean> =>
  IS_ELECTRON ? E().updateTrade(t)
    : fetchJ<boolean>(`/api/trades/${t.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(t) });

export const deleteTrade   = (id: number): Promise<boolean> =>
  IS_ELECTRON ? E().deleteTrade(id) : fetchJ(`/api/trades/${id}`, { method:'DELETE' }).then(() => true).catch(e => { apiWarn('deleteTrade', e); throw e; });

export const executeTrade  = (order: Partial<Trade>): Promise<{ ok: boolean; trade: Trade }> =>
  IS_ELECTRON ? E().addTrade(order).then(t => ({ ok: true, trade: t }))
    : fetchJ<{ ok: boolean; trade: Trade }>('/api/trade/execute', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(order) });

// ── Price Alerts ──────────────────────────────────────────────────────────────
export const getAlerts     = (): Promise<Alert[]> =>
  IS_ELECTRON ? E().getAlerts() : fetchJ<Alert[]>('/api/alerts').catch(e => { apiWarn('getAlerts', e); throw e; });

export const addAlert      = (a: Omit<Alert, 'id'>): Promise<Alert> =>
  IS_ELECTRON ? E().addAlert(a)
    : fetchJ<Alert>('/api/alerts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(a) });

export const deleteAlert   = (id: number): Promise<boolean> =>
  IS_ELECTRON ? E().deleteAlert(id) : fetchJ(`/api/alerts/${id}`, { method:'DELETE' }).then(() => true).catch(e => { apiWarn('deleteAlert', e); throw e; });

// ── App Settings ──────────────────────────────────────────────────────────────
export const getSetting    = async <T>(key: string): Promise<T> => {
  if (IS_ELECTRON) return E().getSetting<T>(key);
  const r = await fetchJ<{ value: T }>(`/api/settings/${key}`);
  return r.value;
};

export const setSetting    = async <T>(key: string, val: T): Promise<boolean> => {
  if (IS_ELECTRON) return E().setSetting<T>(key, val);
  const r = await fetchJ<{ ok: boolean }>(`/api/settings/${key}`, { 
    method:'PUT', 
    headers:{'Content-Type':'application/json'}, 
    body:JSON.stringify({ value: val }) 
  });
  return !!r.ok;
};

export const searchStocks = (query: string): Promise<{ quotes: SearchResult[] }> =>
  IS_ELECTRON ? Promise.resolve({ quotes: [] }) : fetchJ<{ quotes: SearchResult[] }>(`/api/search/${encodeURIComponent(query)}`);

export const getQuotes = (symbols: string[]): Promise<any[]> =>
  IS_ELECTRON ? Promise.resolve([]) : fetchJ<any[]>('/api/quotes?symbols=' + symbols.join(','));

// ── DB Stats ──────────────────────────────────────────────────────────────────
export const getDbStats    = (): Promise<unknown> =>
  IS_ELECTRON ? E().getDbStats() : Promise.resolve(null);

export const getSystemStats = (): Promise<unknown> =>
  IS_ELECTRON ? E().getSystemStats() : fetchJ('/api/stats').catch(() => null);

// ── Screener (XQ-style batch scan) ───────────────────────────────────────────
export interface ScreenerFilters {
  rsiBelow?: number;
  rsiAbove?: number;
  macdBullish?: boolean;
  macdBearish?: boolean;
  goldenCrossOnly?: boolean;
  deathCrossOnly?: boolean;
  volumeSpikeMin?: number;
  aboveSMA20?: boolean;
  belowSMA20?: boolean;
}

export const getSectors = (): Promise<any[]> => fetchJ<any[]>('/api/sectors');

export const getSectorSymbols = (id: string): Promise<string[]> =>
  fetchJ<string[]>(`/api/sectors/${encodeURIComponent(id)}/symbols`);

export const runScreener = (symbols: string[], filters?: ScreenerFilters): Promise<{ results: ScreenerResult[] }> =>
  fetchJ<{ results: ScreenerResult[] }>('/api/screener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, filters }),
  });

// ── TradingView / Multi-source insights ───────────────────────────────────────
export interface InsightsPayload {
  symbol: { input: string; canonical: { code: string; market: string }; yahoo: string };
  quote: Quote | null;
  tvOverview: Record<string, unknown> | null;
  tvIndicators: Record<string, number | string | null> | null;
  tvNews: Array<{ id: string; title: string; published: number; source: string; storyPath: string }> | null;
  wantGooChip: {
    mainPlayersNet: number;
    brokerDiff: number;
    concentration5d: number;
    concentration20d: number;
    foreignNet: number;
    trustNet: number;
    dealerNet: number;
    holder400Pct: number;
    holder1000Pct: number;
    foreignPct: number;
    trustPct: number;
  } | null;
  errors?: Array<{ source: string; message: string }>;
}

/**
 * 取得標的的跨來源整合資料（Yahoo + TradingView）。
 * 後端 /api/insights 會自動呼叫 symbolParser 做格式轉換，
 * 前端只要丟 Yahoo 格式（`2330.TW`）或 TV 格式（`TPE:2330`）皆可。
 */
export const getInsights = (sym: string, timeframe = '1d'): Promise<InsightsPayload> =>
  fetchJ<InsightsPayload>(`/api/insights/${encodeURIComponent(sym)}?timeframe=${timeframe}`);

export const getTVOverview = (sym: string) =>
  fetchJ<Record<string, unknown>>(`/api/tv/overview/${encodeURIComponent(sym)}`);

export const getTVIndicators = (sym: string, timeframe = '1d') =>
  fetchJ<Record<string, number | string | null>>(`/api/tv/indicators/${encodeURIComponent(sym)}?timeframe=${timeframe}`);

export const getTVNews = (sym: string) =>
  fetchJ<Array<{ id: string; title: string; published: number; source: string; storyPath: string }>>(
    `/api/tv/news/${encodeURIComponent(sym)}`,
  );

export const getTVIdeas = (sym: string, sort: 'popular' | 'recent' = 'popular') =>
  fetchJ<Array<{ id: string; title: string; author: string; likes: number; url: string }>>(
    `/api/tv/ideas/${encodeURIComponent(sym)}?sort=${sort}`,
  );

// ── Strategies ────────────────────────────────────────────────────────────────
export interface Strategy {
  id: number;
  name: string;
  script: string | null;
  isActive: boolean;
  config: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const getStrategies = (): Promise<Strategy[]> =>
  fetchJ<Strategy[]>('/api/strategies');

export const createStrategy = (data: { name: string; script?: string; config?: unknown }): Promise<Strategy> =>
  fetchJ<Strategy>('/api/strategies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateStrategy = (id: number, data: Partial<{ name: string; script: string; config: unknown }>): Promise<Strategy> =>
  fetchJ<Strategy>(`/api/strategies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteStrategy = (id: number): Promise<void> =>
  fetchJ<void>(`/api/strategies/${id}`, { method: 'DELETE' });

export const activateStrategy = (id: number): Promise<void> =>
  fetchJ<void>(`/api/strategies/${id}/activate`, { method: 'POST' });

// ── Performance ─────────────────────────────────────────────────────────────
export const getPerformance = (period: string = '1m'): Promise<any> =>
  fetchJ<any>(`/api/autotrading/performance?period=${period}`);

// ── Misc ──────────────────────────────────────────────────────────────────────
export const openExternal  = (url: string): void => {
  if (IS_ELECTRON) E().openExternal(url);
  else window.open(url, '_blank', 'noopener');
};

/** 獲取歷史資產淨值快照 (NAV) */
export const getPortfolioHistory = (): Promise<any[]> => fetchJ<any[]>('/api/portfolio/history');

/** 獲取全域市場新聞情報流 */
export const getNewsFeed = (category?: string): Promise<any[]> => 
  fetchJ<any[]>(`/api/news/feed${category ? `?category=${encodeURIComponent(category)}` : ''}`);

/** AI 新聞分析 */
export const analyzeNews = (data: { title: string; content?: string; articleId?: string }): Promise<{ text: string }> =>
  fetchJ<{ text: string }>('/api/ai/news-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

// ── AutoTrading ──────────────────────────────────────────────────────────────
export const getAutotradingStatus = () => fetchJ<any>('/api/autotrading/status');
export const resetCircuitBreaker = () => fetchJ<any>('/api/autotrading/status/reset', { method: 'POST' });
export const startAutotrading = (config: any) => fetchJ<any>('/api/autotrading/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(config)
});
export const stopAutotrading = () => fetchJ<any>('/api/autotrading/stop', { method: 'POST' });
export const releaseKillSwitch = () => fetchJ<any>('/api/autotrading/kill-switch/release', { method: 'POST' });
export const getAutotradingDefaults = () => fetchJ<any>('/api/autotrading/defaults');
export const getMarketSession = (symbols: string[]) =>
  fetchJ<any>(`/api/autotrading/session?symbols=${encodeURIComponent(symbols.join(','))}`);
export const updateAutotradingConfig = (cfg: Record<string, unknown>) => fetchJ<any>('/api/autotrading/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cfg),
});
