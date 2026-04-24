export type TerminalView =
  | 'dashboard'
  | 'market'
  | 'crypto'
  | 'portfolio'
  | 'research'
  | 'news'
  | 'alerts'
  | 'settings';

export interface TickerSummary {
  label: string;
  value: string;
  changePct: number;
}

export interface WatchlistRow {
  symbol: string;
  last: number;
  changePct: number;
  volume: string;
}

export interface HeatmapCell {
  label: string;
  changePct: number;
  weight: number;
}

export interface NewsCategory {
  id: 'EARNINGS' | 'MACRO' | 'ALERT' | 'CRYPTO' | 'TECH' | 'ENERGY';
  tint: 'amber' | 'cyan' | 'rose' | 'violet' | 'slate';
}

export interface DashboardNews {
  id: string;
  category: NewsCategory['id'];
  time: string;
  title: string;
  tickers: string[];
}

export interface Mover {
  symbol: string;
  changePct: number;
}

export interface Holding {
  symbol: string;
  qty: number;
  cost: number;
  price: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  sectorTint: string;
}

export interface TradeLog {
  datetime: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  qty: number;
  price: number;
  total: number;
}

export interface NewsFeedItem {
  id: string;
  time: string;
  source: string;
  title: string;
  tags: Array<{ label: string; tone: 'neutral' | 'bullish' | 'bearish' | 'sector' }>;
  summary: string;
  body: string[];
  pullQuote?: { text: string; attribution: string };
  impact: {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    tickers: Array<{ symbol: string; changePct: number }>;
  };
  publishedUtc: string;
  referenceId: string;
}

export interface CandlePoint {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
