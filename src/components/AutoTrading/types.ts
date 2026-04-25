/**
 * src/components/AutoTrading/types.ts
 * 自動交易系統共享型別定義
 */

export type AgentStatus = 'running' | 'stopped' | 'cooldown' | 'error' | 'paused';
export type TradingMode = 'simulated' | 'real';
export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'EXECUTION' | 'CRITICAL' | 'SYSTEM' | 'MONITOR' | 'SHADOW' | 'HEDGE' | 'RISK_CHK';

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: 'text-cyan-400',
  WARNING: 'text-amber-400',
  ERROR: 'text-rose-400',
  EXECUTION: 'text-emerald-400',
  CRITICAL: 'text-rose-500 bg-rose-500/10 px-1',
  SYSTEM: 'text-violet-400',
  MONITOR: 'text-indigo-400',
  SHADOW: 'text-slate-400',
  HEDGE: 'text-fuchsia-400',
  RISK_CHK: 'text-orange-400'
};

export interface StrategyParams {
  RSI_REVERSION?: { period: number; overbought: number; oversold: number; weight: number };
  BOLLINGER_BREAKOUT?: { period: number; stdDev: number; weight: number };
  MACD_CROSS?: { fast: number; slow: number; signal: number; weight: number };
  AI_LLM?: { confidenceThreshold: number; weight: number };
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  maxAllocationPerTrade?: number;
  enableMTF?: boolean;
  sizingMethod?: 'fixed' | 'risk_base';
  riskPerTradePct?: number;
  maxPositionPct?: number;
  mtfTimeframe?: '5m' | '15m' | '1h' | '4h' | '1d';
  mtfTrendIndicator?: 'EMA200' | 'EMA50' | 'MACD' | 'PRICE_ACTION';
  enableReasoning?: boolean;
}

export interface RiskStats {
  dailyLoss: number;
  dailyTrade: number;
  totalUsed: number;
  lossStreakCount: number;
  killSwitchActive: boolean;
  config: {
    budgetLimitTWD: number;
    maxDailyLossTWD: number;
    maxSinglePositionTWD: number;
    maxPositionPct: number;
    stopLossPct: number;
  };
}

export interface AgentConfig {
  userId?: string;
  mode: 'simulated' | 'real';
  strategies: StrategyType[];
  params: StrategyParams;
  symbolConfigs?: Record<string, Partial<StrategyParams>>;
  shadowConfigs?: Record<string, Partial<AgentConfig>>;
  hedgeConfig?: {
    enabled: boolean;
    hedgeRatio: number;
    hedgeSymbol?: string;
    hedgeBrokerId?: string;
  };
  circuitBreaker?: {
    enabled: boolean;
    maxLossStreak: number;
    maxDailyLossPct: number;
    cooldownMinutes: number;
  };
  symbols: string[];
  tickIntervalMs: number;
  budgetLimitTWD: number;
  maxDailyLossTWD: number;
  tradingHours?: { start: string; end: string };
  decisionHeat?: DecisionHeat;
}


export type StrategyType = 'RSI_REVERSION' | 'BOLLINGER_BREAKOUT' | 'MACD_CROSS' | 'AI_LLM';

export const STRATEGY_LABELS: Record<StrategyType, { name: string; desc: string }> = {
  RSI_REVERSION: { 
    name: 'RSI Reversion', 
    desc: '基於相對強弱指標的均值回歸策略，捕捉超買超賣反轉。' 
  },
  BOLLINGER_BREAKOUT: { 
    name: 'Bollinger Breakout', 
    desc: '布林通道波動率突破策略，在趨勢啟動時進場。' 
  },
  MACD_CROSS: { 
    name: 'MACD Momentum', 
    desc: '平滑異同移動平均線黃金/死亡交叉，跟隨中長期趨勢。' 
  },
  AI_LLM: { 
    name: 'Neural AI Signal', 
    desc: '整合多方情緒與新聞解析的 AI 智慧決策引擎。' 
  }
};

export const BROKER_OPTIONS = [
  { id: 'simulated', name: 'Simulated Broker (AI 模擬交易)', available: true, note: '內建的高頻模擬引擎，支持台股交易稅與規費模擬。' },
  { id: 'sinopac', name: 'SinoPac (永豐金證券 Shioaji)', available: false, note: '透過 Python Bridge 串接永豐金 API，需安裝相關憑證。' },
  { id: 'fugle', name: 'Fugle (富果玉山證券)', available: false, note: '使用 Fugle HTTP API 進行下單，支持即時庫存同步。' },
  { id: 'ib', name: 'Interactive Brokers (盈透證券)', available: false, note: '全球化交易接口，支持美股與台股複委託。' }
];

export interface AgentLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  symbol: string;
  message: string;
  confidence?: number;
  action?: 'BUY' | 'SELL' | 'HOLD' | 'SYSTEM';
  reasoning?: string[];
}

export interface DecisionHeat {
  symbol: string;
  score: number;
  techScore?: number;
  sentimentScore?: number;
  reason: string;
  reasoning?: string[];
  timestamp: string;
}

export interface CommanderLog {
  id: string;
  command: string;
  actionTaken: string;
  status: 'SUCCESS' | 'FAILED';
  timestamp: string;
}

export interface EquitySnapshot {
  timestamp: string;
  equity: number;
}

export interface AccountBalance {
  totalAssets: number;
  availableMargin: number;
  usedMargin: number;
  dailyPnl: number;
  unrealizedPnL: number;
  currency: string;
}

export interface Position {
  symbol: string;
  avgCost: number;
  qty: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}
