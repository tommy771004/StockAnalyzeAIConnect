import type { BacktestMetrics, BacktestResult, BacktestTrade } from '../types';

export type BacktestStrategyId = 'ma_crossover' | 'neural' | 'rsi' | 'macd';

export interface BacktestStrategyMeta {
  id: BacktestStrategyId;
  label: string;
  en: string;
  color: string;
  bg: string;
  type: string;
  desc: string;
  buyDesc: string;
  sellDesc: string;
  beginner: string;
  suitable: string;
  avoid: string;
}

export const BACKTEST_STRATEGIES: readonly BacktestStrategyMeta[] = [
  {
    id: 'ma_crossover',
    label: '均線交叉策略',
    en: 'MA Crossover',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    type: '趨勢跟蹤',
    desc: '當短期均線（10日）向上穿越長期均線（30日）時買進，反之賣出。適合趨勢明顯的市場。',
    buyDesc: 'SMA10 由下往上穿越 SMA30（黃金交叉）→ 多方趨勢確立，買進',
    sellDesc: 'SMA10 由上往下穿越 SMA30（死亡交叉）→ 空方訊號，賣出',
    beginner: '新手說明：均線是一段時間內價格的平均值。短期均線穿越長期均線代表近期買盤增強，是趨勢轉多的訊號。',
    suitable: '適合行情：單邊趨勢（牛市或熊市）',
    avoid: '不適合：震盪整理盤，容易產生假訊號',
  },
  {
    id: 'neural',
    label: '多因子AI策略',
    en: 'Neural Transfer',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.12)',
    type: 'AI模型',
    desc: '模擬機器學習模型，同時分析動量、成交量、波動度三個因子，綜合評分後決策。',
    buyDesc: 'EMA8/EMA21 動量評分>0.3，且成交量放大，且 ATR 波動率>0.8%，三因子同時滿足才買進',
    sellDesc: 'EMA8/EMA21 動量評分轉負（-0.2以下），模型認為上漲動能消失，賣出',
    beginner: '新手說明：AI策略同時看多個指標（動量+量能+波動），需要多個條件同時成立才下單，訊號較少但精準度較高。',
    suitable: '適合行情：趨勢+量能配合的市場',
    avoid: '不適合：低波動、無趨勢的市場',
  },
  {
    id: 'rsi',
    label: 'RSI 超買超賣',
    en: 'RSI Mean Rev.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    type: '均值回歸',
    desc: 'RSI（相對強弱指標）低於35時認為超賣，等待回升後買進；高於65時認為超買，等待回落後賣出。',
    buyDesc: 'RSI(14) 從 35 以下回升到 35 → 超賣結束，開始反彈，買進',
    sellDesc: 'RSI(14) 從 65 以上回落到 65 → 超買結束，開始回落，賣出',
    beginner: '新手說明：RSI衡量最近漲跌幅的強弱，0~30代表超賣（可能反彈），70~100代表超買（可能下跌）。本策略等待反轉確認後才進場。',
    suitable: '適合行情：區間震盪行情',
    avoid: '不適合：單邊趨勢行情（容易抄底套牢）',
  },
  {
    id: 'macd',
    label: 'MACD 動能策略',
    en: 'MACD Momentum',
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.12)',
    type: '動量策略',
    desc: 'MACD柱狀圖（快慢線差值）由負轉正，且主線在零軸之上，確認多頭動能；柱狀圖轉負則賣出。',
    buyDesc: 'MACD 柱狀圖由負轉正（動能翻多），且 MACD 主線>0（在零軸上方），買進',
    sellDesc: 'MACD 柱狀圖由正轉負（動能翻空），賣出離場',
    beginner: '新手說明：MACD用兩條不同速度的均線相減，代表市場動能強弱。柱狀圖由負轉正代表多頭力量開始超越空頭。',
    suitable: '適合行情：趨勢轉折點、中期趨勢',
    avoid: '不適合：快速震盪行情（MACD反應較慢）',
  },
] as const;

export const DEFAULT_BACKTEST_SYMBOLS = [
  'AAPL',
  'TSLA',
  'NVDA',
  'MSFT',
  'BTC-USD',
  'ETH-USD',
  '2330.TW',
  'SPY',
  'QQQ',
] as const;

export const DEFAULT_BACKTEST_METRICS: BacktestMetrics = {
  roi: 0,
  sharpe: 0,
  maxDrawdown: 0,
  winRate: 0,
  totalTrades: 0,
  avgWin: 0,
  avgLoss: 0,
  profitFactor: 0,
};

const AUTO_TRADING_STRATEGY_MAP: Record<string, BacktestStrategyId> = {
  RSI_REVERSION: 'rsi',
  BOLLINGER_BREAKOUT: 'ma_crossover',
  MACD_CROSS: 'macd',
  AI_LLM: 'neural',
};

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isBacktestStrategyId = (strategy: string): strategy is BacktestStrategyId =>
  strategy === 'ma_crossover' || strategy === 'neural' || strategy === 'rsi' || strategy === 'macd';

export function mapToBacktestStrategy(strategy?: string): BacktestStrategyId {
  if (!strategy) return 'ma_crossover';
  if (AUTO_TRADING_STRATEGY_MAP[strategy]) return AUTO_TRADING_STRATEGY_MAP[strategy];
  if (isBacktestStrategyId(strategy)) return strategy;
  return 'ma_crossover';
}

export function getDateRangeByPeriod(periodDays: number): { period1: string; period2: string } {
  const end = new Date();
  const start = new Date(end);
  const days = Math.max(1, Math.floor(periodDays || 1));
  start.setDate(start.getDate() - days);
  return {
    period1: start.toISOString().slice(0, 10),
    period2: end.toISOString().slice(0, 10),
  };
}

function normalizeTrades(rawTrades: unknown): BacktestTrade[] {
  if (!Array.isArray(rawTrades)) return [];
  return rawTrades.map((item) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const entryTime = String(t.entryTime ?? t.entryDate ?? t.time ?? t.date ?? '');
    const exitTime = String(t.exitTime ?? t.exitDate ?? t.time ?? t.date ?? '');
    const entryPrice = toNumber(t.entryPrice ?? t.entry ?? t.price);
    const exitPrice = toNumber(t.exitPrice ?? t.exit ?? t.price);
    const amount = toNumber(t.amount ?? t.qty ?? t.shares);
    const pnl = toNumber(t.pnl);
    const pnlPct = toNumber(
      t.pnlPct,
      entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0,
    );
    const holdDays = toNumber(t.holdDays);
    const result = (t.result === 'WIN' || t.result === 'LOSS')
      ? t.result
      : pnl >= 0
        ? 'WIN'
        : 'LOSS';

    return {
      type: (t.type === 'BUY' || t.type === 'SELL') ? t.type : 'BUY',
      date: entryTime || exitTime,
      price: entryPrice || exitPrice,
      shares: amount,
      fee: toNumber(t.fee),
      entryTime,
      exitTime,
      entryPrice,
      exitPrice,
      amount,
      holdDays,
      pnlPct: Number(pnlPct.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      result,
      entryDate: entryTime,
      exitDate: exitTime,
      qty: amount,
      entry: entryPrice,
      exit: exitPrice,
    };
  });
}

function normalizeEquityCurve(rawCurve: unknown, rawDrawdownCurve?: unknown) {
  const drawdownByDate = new Map<string, number>();
  if (Array.isArray(rawDrawdownCurve)) {
    rawDrawdownCurve.forEach((point) => {
      const p = (point ?? {}) as Record<string, unknown>;
      drawdownByDate.set(String(p.date ?? ''), toNumber(p.value ?? p.drawdown));
    });
  }

  if (!Array.isArray(rawCurve)) return [];
  return rawCurve.map((point) => {
    const p = (point ?? {}) as Record<string, unknown>;
    const date = String(p.date ?? '');
    return {
      date,
      equity: toNumber(p.equity),
      portfolio: toNumber(p.portfolio),
      benchmark: toNumber(p.benchmark),
      drawdown: toNumber(p.drawdown, drawdownByDate.get(date) ?? 0),
    };
  });
}

export function normalizeBacktestResult(
  rawResult: unknown,
  strategy: string,
): BacktestResult & { strategy: string } {
  const raw = (rawResult ?? {}) as Record<string, unknown>;
  const trades = normalizeTrades(raw.trades);
  const equityCurve = normalizeEquityCurve(raw.equityCurve, raw.drawdownCurve);
  const rawMetrics = (raw.metrics ?? {}) as Partial<BacktestMetrics>;
  const initialCapital = toNumber(raw.initialCapital, 1_000_000);
  const finalEquity = toNumber(raw.finalEquity, initialCapital);
  const totalReturn = toNumber(raw.totalReturn, toNumber(rawMetrics.roi, 0));
  const maxDrawdown = toNumber(raw.maxDrawdown, toNumber(rawMetrics.maxDrawdown, 0));
  const safeMetrics: BacktestMetrics = {
    ...DEFAULT_BACKTEST_METRICS,
    ...rawMetrics,
    roi: toNumber(rawMetrics.roi, totalReturn),
    sharpe: toNumber(rawMetrics.sharpe),
    maxDrawdown: toNumber(rawMetrics.maxDrawdown, maxDrawdown),
    winRate: toNumber(rawMetrics.winRate),
    totalTrades: toNumber(rawMetrics.totalTrades, trades.length),
    avgWin: toNumber(rawMetrics.avgWin),
    avgLoss: toNumber(rawMetrics.avgLoss),
    profitFactor: toNumber(rawMetrics.profitFactor),
  };

  return {
    initialCapital,
    finalEquity,
    totalReturn,
    maxDrawdown,
    trades,
    totalTrades: toNumber(raw.totalTrades, safeMetrics.totalTrades),
    equityCurve,
    metrics: safeMetrics,
    strategy,
  };
}
