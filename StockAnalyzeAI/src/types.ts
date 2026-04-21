export interface Quote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  shortName: string;
  longName: string;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  currency?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  trailingPE?: number;
  marketCap?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  publisher: string;
  providerPublishTime: number;
  type: string;
  thumbnail?: { resolutions: { url: string; width: number; height: number }[] };
}

export interface CalendarData {
  earnings?: { earningsDate: number[] };
  exDividendDate?: number;
  dividendDate?: number;
  earningsDate?: number[];
}

export interface TWSEData {
  Name?: string;
  Symbol?: string;
  Price?: number;
  Change?: number;
  ChangePercent?: number;
  Volume?: number;
  z?: number; // Price
  tv?: number; // Total Volume
  v?: number; // Volume
  ch?: number; // Change
  n?: string; // Name
  s?: string; // Symbol
}

export interface Order {
  id: string | number;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  date: string;
}

export interface SearchResult {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
}

export interface WatchlistItem {
  symbol: string;
  addedAt?: number;
  price?: number;
  change?: number;
  changePct?: number;
  name?: string;
  shortName?: string;
}

/**
 * Raw backend DTO — mirrors whatever the server / Electron IPC sends.
 * Use `mapTradeDTO` to convert to the normalised `Trade` domain model.
 */
export interface TradeDTO {
  id: number;
  date: string;
  ticker?: string;
  symbol?: string;
  action?: string;
  side?: string;
  entry?: number;
  exit?: number;
  entryPrice?: number;
  exitPrice?: number;
  price?: number;
  qty: number;
  pnl: number;
  status: string;
  ai?: string;
  notes?: string;
  message?: string;
  mode?: string;
  broker?: string;
  orderType?: string;
  priceType?: string;
}

/** Normalised frontend domain model for a completed trade. */
export interface Trade {
  id: number;
  date: string;
  ticker: string;
  action: string;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  status: string;
  ai?: string;
  notes?: string;
  message?: string;
  // Backward-compat aliases kept for components that still reference them
  symbol?: string;
  side?: string;
  price?: number;
  mode?: string;
  broker?: string;
  orderType?: string;
  priceType?: string;
  entryPrice?: number;
  exitPrice?: number;
}

/** Maps a raw backend TradeDTO to the normalised frontend Trade model. */
export function mapTradeDTO(dto: TradeDTO): Trade {
  return {
    id: dto.id,
    date: dto.date,
    ticker: dto.ticker ?? dto.symbol ?? '',
    action: dto.action ?? dto.side ?? '',
    entry: dto.entry ?? dto.entryPrice ?? dto.price ?? 0,
    exit: dto.exit ?? dto.exitPrice ?? 0,
    qty: dto.qty,
    pnl: dto.pnl,
    status: dto.status,
    ai: dto.ai,
    notes: dto.notes,
    message: dto.message,
    symbol: dto.symbol ?? dto.ticker,
    side: dto.side ?? dto.action,
    price: dto.price,
    mode: dto.mode,
    broker: dto.broker,
    orderType: dto.orderType,
    priceType: dto.priceType,
    entryPrice: dto.entryPrice ?? dto.entry,
    exitPrice: dto.exitPrice ?? dto.exit,
  };
}

export interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: string;
  shortName?: string;
  currentPrice?: number;
  marketValue?: number;
  marketValueTWD?: number;
  pnl?: number;
  pnlPercent?: number;
  usdtwd?: number;
  // 相容性欄位
  qty?: number;
  avgPrice?: number;
}

export interface Alert {
  id: number;
  symbol: string;
  condition: 'above' | 'below';
  target: number;
  triggered?: boolean;
}

/** 歷史 K 線資料（回測引擎 / 圖表共用） */
export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 回測引擎產生的單筆成交紀錄（與交易日誌的 Trade 不同） */
export interface BacktestTrade {
  type: 'BUY' | 'SELL';
  date: string;
  price: number;
  shares: number;
  fee: number;
  // 以下為處理後的欄位，可選
  entryTime?: string;
  exitTime?: string;
  entryPrice?: number;
  exitPrice?: number;
  amount?: number;
  holdDays?: number;
  pnlPct?: number;
  pnl?: number;
  result?: 'WIN' | 'LOSS';
  // PDF export / display aliases
  time?: string;
  symbol?: string;
  ticker?: string;
  action?: string;
  entry?: number;
  exit?: number;
  qty?: number;
  // 👇 補上 UI 畫面裡會用到的擴充屬性
  entryDate?: string;
  exitDate?: string;
  dir?: string;
  side?: string;
}

/** 回測績效指標 */
export interface BacktestMetrics {
  roi: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

/** 回測引擎回傳的完整結果 */
export interface BacktestResult {
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
  totalTrades: number;
  equityCurve: { date: string; equity: number; benchmark?: number; drawdown?: number }[];
  metrics?: BacktestMetrics;
  strategy?: string;
}

/** 回測參數 */
export interface BacktestParams {
  symbol: string;
  strategy: string;
  initialCapital: number;
  startDate?: string;
  endDate?: string;
  period1?: string;
  period2?: string;
  [key: string]: string | number | boolean | undefined;
}

/** 即時股票報價（Zustand marketDataStore 用） */
export interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdated: number;
}

export interface AIAnalysisResult {
  action: 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
  reasoning: string;
  targetPrice: number;
  stopLoss: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  rsi?: number;
  macd?: number;
  sma20?: number;
}

export interface MTFResult {
  indicators: {
    name: string;
    values: string[];
    statuses: ('bullish' | 'bearish' | 'neutral')[];
  }[];
  synthesis: string;
  score: number;
  overallTrend: string;
}

export interface MTFTrendRecord {
  [timeframe: string]: 'bullish' | 'bearish' | 'neutral' | string;
}

export interface SentimentData {
  overall: string;
  score: number;
  vixLevel: string;
  putCallRatio: string;
  marketBreadth: string;
  keyDrivers: string[];
  aiAdvice: string;
}

export interface TradingStrategy {
  strategy: string;
  entry: string;
  exit: string;
  riskLevel: 'low' | 'medium' | 'high' | 'N/A';
  confidence: number;
}

export interface ScreenerResult {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  rsi: number;
  macdHistogram: number;
  sma5: number;
  sma20: number;
  sma60: number | null;
  volumeRatio: number;
  signals: string[];
  marketCap: number | null;
  [key: string]: unknown;
}
