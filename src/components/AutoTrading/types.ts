/**
 * src/components/AutoTrading/types.ts
 * AutoTrading 前端共用型別
 */

export type AgentStatus = 'stopped' | 'running' | 'paused' | 'error';
export type TradingMode = 'simulated' | 'real';
export type StrategyType = 'RSI_REVERSION' | 'BOLLINGER_BREAKOUT' | 'MACD_CROSS' | 'AI_LLM';
export type LogLevel = 'INFO' | 'EXECUTION' | 'WARNING' | 'ERROR' | 'SYS_SYNC' | 'RISK_CHK' | 'AI_ENGINE';
export type MarketType = 'TW_STOCK' | 'TW_OPTIONS' | 'TW_FUTURES' | 'US_STOCK' | 'CRYPTO';

export interface AgentConfig {
  mode: TradingMode;
  strategies: StrategyType[];
  symbols: string[];
  tickIntervalMs: number;
  budgetLimitTWD: number;
  maxDailyLossTWD: number;
}

export interface AgentLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  symbol?: string;
  confidence?: number;
  action?: 'BUY' | 'SELL' | 'HOLD';
}

export interface AccountBalance {
  totalAssets: number;
  availableMargin: number;
  usedMargin: number;
  dailyPnl: number;
  currency: 'TWD' | 'USD';
}

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPnl: number;
  marketType: MarketType;
}

export interface RiskStats {
  dailyLoss: number;
  dailyTrade: number;
  totalUsed: number;
  killSwitchActive: boolean;
  config: {
    budgetLimitTWD: number;
    maxDailyLossTWD: number;
    maxSinglePositionTWD: number;
    maxPositionPct: number;
    stopLossPct: number;
  };
}

export const STRATEGY_LABELS: Record<StrategyType, { name: string; desc: string }> = {
  RSI_REVERSION:     { name: 'RSI 均值回歸',   desc: 'RSI < 30 買入，RSI > 70 賣出' },
  BOLLINGER_BREAKOUT: { name: '布林通道突破',   desc: '突破下軌買入，突破上軌賣出' },
  MACD_CROSS:        { name: 'MACD 交叉',       desc: '金叉買入，死叉賣出' },
  AI_LLM:            { name: 'AI LLM 綜合分析', desc: '結合新聞與技術面的 LLM 決策' },
};

export const BROKER_OPTIONS = [
  { id: 'simulated', name: '模擬交易（立即可用）', available: true, note: '無需申請，完整模擬所有交易功能' },
  { id: 'sinopac',   name: '永豐金證券 (Shioaji)', available: false, note: '需申請 API Key + 電子憑證 + Python bridge' },
  { id: 'kgi',       name: '群益證券 (SKCOM)',      available: false, note: '需 Windows COM 元件，洽群益申請' },
  { id: 'yuanta',    name: '元大證券',              available: false, note: '需 Windows COM 元件，書面申請' },
  { id: 'fubon',     name: '富邦證券',              available: false, note: '需申請 API 使用權限' },
] as const;

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  INFO:       'text-(--color-term-text)',
  EXECUTION:  'text-cyan-400',
  WARNING:    'text-amber-400',
  ERROR:      'text-rose-400',
  SYS_SYNC:   'text-(--color-term-muted)',
  RISK_CHK:   'text-emerald-400',
  AI_ENGINE:  'text-violet-400',
};
