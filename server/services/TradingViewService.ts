/**
 * server/services/TradingViewService.ts
 *
 * 與 tradingview-scraper Python 微服務 (FastAPI) 的薄 HTTP client。
 * 參見 docs/tradingview-scraper.md 第 5 章「整合建議」。
 *
 * 所有對外 API 只接受 `CanonicalSymbol` 或 Yahoo 風格字串，內部統一透過
 * src/utils/symbolParser 轉成 TradingView 的 `EXCHANGE:CODE` 格式後再呼叫。
 *
 * 失敗設計：
 *   - 網路錯誤：拋出，讓上層決定是否 fallback 到 Yahoo。
 *   - 服務未啟動（ECONNREFUSED）：回傳 null，呼叫端可判斷 TV 資料「不可用」，
 *     避免把 Yahoo 正常流程一併拖垮。
 */

import {
  parseSymbol,
  toTradingView,
  toTVExchangeSymbol,
  type CanonicalSymbol,
} from '../../src/utils/symbolParser.js';

export interface TVResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
  total?: number;
}

export interface TVOverviewRaw {
  name?: string;
  close?: number;
  change?: number;
  change_abs?: number;
  volume?: number;
  market_cap_basic?: number;
  price_earnings_ttm?: number;
  currency?: string;
  // 其他欄位由 python 端決定，保留寬鬆型別
  [k: string]: unknown;
}

export interface TVIndicatorsRaw {
  [indicator: string]: number | string | null;
}

export interface TVNewsHeadline {
  id: string;
  title: string;
  published: number;
  source: string;
  storyPath: string;
  urgency?: number;
}

export interface TVIdeaItem {
  id: string;
  title: string;
  author: string;
  likes: number;
  comments: number;
  url: string;
  published: number;
}

type SymbolInput = string | CanonicalSymbol;

const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
const BASE = isVercel 
  ? `https://${process.env.VERCEL_URL || 'localhost'}/api/python`
  : (process.env.TV_SCRAPER_URL ?? 'http://127.0.0.1:8787');
const TIMEOUT_MS = Number(process.env.TV_SCRAPER_TIMEOUT_MS ?? 8000);

/** 內部 fetch：帶 timeout、統一解析 TVResponse<T>，服務未啟動時回 null。 */
async function call<T>(path: string, params: Record<string, string | number | undefined>): Promise<T | null> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();

  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`[TV] ${res.status} ${res.statusText} ← ${url}`);
    const body = (await res.json()) as TVResponse<T>;
    if (body.status !== 'success') throw new Error(`[TV] ${body.message ?? 'upstream error'}`);
    return body.data;
  } catch (e: unknown) {
    // 服務未啟動 / DNS 解析失敗：視為「TV 不可用」
    const msg = e instanceof Error ? e.message : String(e);
    if (/ECONNREFUSED|fetch failed|ENOTFOUND|aborted/i.test(msg)) {
      return null;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── 對外 API ────────────────────────────────────────────────────────────────

export async function getOverview(sym: SymbolInput): Promise<TVOverviewRaw | null> {
  const canonical = typeof sym === 'string' ? parseSymbol(sym) : sym;
  const tvSymbol = toTradingView(canonical);
  return call<TVOverviewRaw>('/overview', { symbol: tvSymbol });
}

export async function getIndicators(
  sym: SymbolInput,
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1W' | '1M' = '1d',
): Promise<TVIndicatorsRaw | null> {
  const canonical = typeof sym === 'string' ? parseSymbol(sym) : sym;
  const { exchange, symbol } = toTVExchangeSymbol(canonical);
  if (!exchange) return null; // 沒有交易所無法查 TV 指標
  return call<TVIndicatorsRaw>('/indicators', { exchange, symbol, timeframe });
}

export async function getNewsHeadlines(sym: SymbolInput): Promise<TVNewsHeadline[] | null> {
  const canonical = typeof sym === 'string' ? parseSymbol(sym) : sym;
  const { exchange, symbol } = toTVExchangeSymbol(canonical);
  if (!exchange) return null;
  return call<TVNewsHeadline[]>('/news', { exchange, symbol });
}

export async function getIdeas(sym: SymbolInput, sort: 'popular' | 'recent' = 'popular'): Promise<TVIdeaItem[] | null> {
  const canonical = typeof sym === 'string' ? parseSymbol(sym) : sym;
  return call<TVIdeaItem[]>('/ideas', { symbol: canonical.code, sort });
}

export async function getCalendarEarnings(
  countries: string[] = ['america'],
  days = 7,
): Promise<unknown | null> {
  return call('/calendar/earnings', { countries: countries.join(','), days });
}

/** TradingView 服務是否可用（供健康檢查 / UI 顯示） */
export async function isAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
