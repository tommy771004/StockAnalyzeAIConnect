/**
 * src/terminal/types/market.ts
 *
 * Shared domain types for market data.
 * Applied: typescript-advanced-types skill
 * - Pattern 6: Discriminated Unions for AsyncState
 * - Utility types: Pick, Readonly
 * - No more `any[]` in useMarketData, usePortfolioData, useDashboardData
 */

// ─── Yahoo Finance Quote (minimal surface) ────────────────────────────────────

export interface YahooQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  epsTrailingTwelveMonths?: number;
  fullExchangeName?: string;
}

// ─── OHLCV Candle ─────────────────────────────────────────────────────────────

export interface Candle {
  date: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Sector ETF quote ─────────────────────────────────────────────────────────

export type SectorQuote = Pick<YahooQuote,
  'symbol' | 'shortName' | 'regularMarketPrice' | 'regularMarketChangePercent'
>;

// ─── Screener result ──────────────────────────────────────────────────────────

export interface ScreenerResultRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  rsi: number;
  macdHistogram: number;
  sma5: number;
  sma20: number | null;
  sma60: number | null;
  volumeRatio: number;
  signals: string[];
  marketCap: number | null;
}

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

// ─── Alert ────────────────────────────────────────────────────────────────────

export type AlertCondition = 'above' | 'below';

export interface AlertRecord {
  id: number;
  symbol: string;
  condition: AlertCondition;
  target: number;
  triggered: boolean;
  triggeredAt?: string;
  triggeredPrice?: number;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: 'USD' | 'TWD';
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  marketValue: number | null;
  marketValueTWD: number | null;
}

export interface Trade {
  id: number;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  total: number;
  time: string;
}

export interface EquityPoint {
  date: string;
  value: number;
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  link?: string;
  url?: string;
  publisher?: string;
  providerPublishTime?: number;
  thumbnail?: { resolutions?: Array<{ url: string; width: number }> };
  summary?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// ─── Research / Insights ──────────────────────────────────────────────────────

export interface InsightsOverview {
  market_cap_calc?: number;
  pe_ratio?: number;
  eps_ttm?: number;
  prev_close?: number;
  close?: number;
  description?: string;
  exchange?: string;
  institutional_holders_pct?: number;
  [key: string]: unknown;  // TV scraped fields vary
}

export interface InsightsIndicators {
  rsi?: number;
  macd?: number;
  signal?: number;
  histogram?: number;
  stoch_k?: number;
  stoch_d?: number;
  adx?: number;
  cci?: number;
  [key: string]: number | undefined;
}

// ─── AsyncState discriminated union ───────────────────────────────────────────

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

// ─── useMarketData return type ────────────────────────────────────────────────

export type PriceFlash = 'up' | 'down';

export interface MarketDataState {
  sectors: YahooQuote[];
  indices: YahooQuote[];
  tickerQuotes: YahooQuote[];
  changedSymbols: Map<string, PriceFlash>;
  lastUpdated: string;
  loading: boolean;
}

// ─── Dashboard / Watchlist ────────────────────────────────────────────────────

export interface WatchlistRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
  volume?: number;
  marketCap?: number;
  pe?: number;
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
