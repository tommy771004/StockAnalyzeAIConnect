/**
 * src/services/api.ts
 * Unified data access layer — auto-detects Electron IPC vs web fetch.
 */

import { Quote, NewsItem, CalendarData, WatchlistItem, Trade, Position, Alert, HistoricalData, BacktestResult, BacktestParams, ScreenerResult, TWSEData, MTFTrendRecord, TradeDTO, mapTradeDTO } from '../types';

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
    };
  }
}

import { getCachedData, setCachedData } from './cache';
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

// ── Stock ─────────────────────────────────────────────────────────────────────
export const getQuote = async (sym: string): Promise<Quote> => {
  const cached = getCachedData<Quote>(`quote:${sym}`);
  if (cached) return cached;
  const data = IS_ELECTRON ? await E().getQuote(sym) : await fetchJ<Quote>(`/api/stock/${sym}`);
  setCachedData(`quote:${sym}`, data);
  return data;
};

export const getHistory = (sym: string, opts?: Record<string, string | number>): Promise<HistoricalData[]> => {
  if (IS_ELECTRON) return E().getHistory(sym, opts);
  const p = new URLSearchParams(opts as Record<string, string> ?? {}); return fetchJ<HistoricalData[]>(`/api/stock/${sym}/history?${p}`);
};

export const getBatchQuotes = (syms: string[]): Promise<Quote[]> =>
  IS_ELECTRON ? E().getBatch(syms) : fetchJ<Quote[]>(`/api/quotes?symbols=${syms.join(',')}`);

export const getNews = async (sym: string): Promise<NewsItem[]> => {
  const cached = getCachedData<NewsItem[]>(`news:${sym}`);
  if (cached) return cached;
  try {
    const data = IS_ELECTRON ? await E().getNews(sym) : await fetchJ<NewsItem[]>(`/api/news/${sym}`);
    setCachedData(`news:${sym}`, data);
    return data;
  } catch (e) {
    apiWarn('getNews', e);
    throw e;
  }
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

export const executeTrade  = (order: Partial<Trade>): Promise<Trade> =>
  IS_ELECTRON ? E().addTrade(order) // Fallback for electron if needed
    : fetchJ<Trade>('/api/trade/execute', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(order) });

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

// ── Misc ──────────────────────────────────────────────────────────────────────
export const openExternal  = (url: string): void => {
  if (IS_ELECTRON) E().openExternal(url);
  else window.open(url, '_blank', 'noopener');
};

