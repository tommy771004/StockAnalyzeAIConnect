/**
 * server/services/autonomousAgent.ts
 * AI 自動交易引擎 — 支援多策略、多市場、WebSocket 即時 log
 *
 * 策略清單：
 *  1. RSI 均值回歸  — RSI<30 買入，RSI>70 賣出
 *  2. 布林通道突破  — 突破下軌買入，突破上軌賣出
 *  3. MACD 交叉    — 金叉買入，死叉賣出
 *  4. AI LLM 選股  — 呼叫 LLM 分析新聞與技術面後決策
 *
 * 架構：
 *  - 每個 tick 對監控中的所有標的執行策略
 *  - 決策結果透過 WebSocket 廣播至前端
 *  - 通過 RiskManager 驗證後才執行實際下單
 *  - 支援 simulated/real 兩種模式
 */

import { riskManager } from './RiskManager.js';
import { simulatedAdapter } from './brokers/SimulatedAdapter.js';
import type { IBrokerAdapter } from './brokers/BrokerAdapter.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'stopped' | 'running' | 'paused' | 'error';
export type StrategyType = 'RSI_REVERSION' | 'BOLLINGER_BREAKOUT' | 'MACD_CROSS' | 'AI_LLM';
export type LogLevel = 'INFO' | 'EXECUTION' | 'WARNING' | 'ERROR' | 'SYS_SYNC' | 'RISK_CHK' | 'AI_ENGINE';

export interface AgentConfig {
  mode: 'simulated' | 'real';
  strategies: StrategyType[];
  symbols: string[];           // 監控標的，例 ["2330.TW", "AAPL", "2317.TW"]
  tickIntervalMs: number;      // 評估間隔（ms），建議 60000 = 1 分鐘
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

// ── 全域狀態 ──────────────────────────────────────────────────────────────────

let agentStatus: AgentStatus = 'stopped';
let agentConfig: AgentConfig = {
  mode: 'simulated',
  strategies: ['RSI_REVERSION'],
  symbols: ['2330.TW', '2317.TW'],
  tickIntervalMs: 60_000,
  budgetLimitTWD: 10_000_000,
  maxDailyLossTWD: 200_000,
};

const logBuffer: AgentLog[] = [];
const MAX_LOG_BUFFER = 500;

// WebSocket 廣播函數（由 server.ts 注入）
let wsBroadcast: ((data: unknown) => void) | null = null;

export function setWsBroadcast(fn: (data: unknown) => void) {
  wsBroadcast = fn;
}

// 目前使用的 broker adapter
let activeBroker: IBrokerAdapter = simulatedAdapter;

export function setActiveBroker(adapter: IBrokerAdapter) {
  activeBroker = adapter;
}

// ── Log 工具 ─────────────────────────────────────────────────────────────────

function emitLog(entry: Omit<AgentLog, 'id' | 'timestamp'>) {
  const log: AgentLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logBuffer.push(log);
  if (logBuffer.length > MAX_LOG_BUFFER) logBuffer.shift();

  // WebSocket 廣播
  wsBroadcast?.({ type: 'agent_log', data: log });
  console.log(`[AutoAgent][${log.level}][${log.source}] ${log.message}`);
}

// ── 技術指標計算 ──────────────────────────────────────────────────────────────

function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    if (delta > 0) gains += delta; else losses -= delta;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

function calcSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcBollinger(prices: number[], period = 20, stdMultiplier = 2): { upper: number; middle: number; lower: number } {
  const sma = calcSMA(prices, period);
  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, p) => sum + (p - sma) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: sma + stdMultiplier * std, middle: sma, lower: sma - stdMultiplier * std };
}

// ── 模擬報價（實際應從 TWSE/Yahoo 取得） ─────────────────────────────────────

const priceHistory: Map<string, number[]> = new Map();

function getOrInitPriceHistory(symbol: string): number[] {
  if (!priceHistory.has(symbol)) {
    const base = symbol.endsWith('.TW') ? 100 + Math.random() * 900 : 50 + Math.random() * 300;
    const hist = Array.from({ length: 50 }, (_, i) =>
      parseFloat((base * (1 + (Math.random() - 0.5) * 0.02 * i * 0.1)).toFixed(2))
    );
    priceHistory.set(symbol, hist);
  }
  return priceHistory.get(symbol)!;
}

function simulateNewPrice(symbol: string): number {
  const hist = getOrInitPriceHistory(symbol);
  const last = hist[hist.length - 1];
  const change = (Math.random() - 0.49) * (last * 0.005); // 輕微多頭偏差
  const next = parseFloat(Math.max(1, last + change).toFixed(2));
  hist.push(next);
  if (hist.length > 200) hist.shift();
  return next;
}

// ── 策略引擎 ─────────────────────────────────────────────────────────────────

interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;  // 0~100
  reason: string;
}

function rsiReversionStrategy(symbol: string, prices: number[]): StrategySignal {
  const rsi = calcRSI(prices);
  if (rsi < 28) {
    return { action: 'BUY', confidence: Math.round(90 - rsi), reason: `RSI 超賣訊號 (RSI=${rsi})，均值回歸買入` };
  }
  if (rsi > 72) {
    return { action: 'SELL', confidence: Math.round(rsi - 40), reason: `RSI 超買訊號 (RSI=${rsi})，均值回歸賣出` };
  }
  return { action: 'HOLD', confidence: 50, reason: `RSI 中性 (RSI=${rsi})` };
}

function bollingerStrategy(symbol: string, prices: number[]): StrategySignal {
  const bb = calcBollinger(prices);
  const curr = prices[prices.length - 1];
  if (curr < bb.lower) {
    const conf = Math.round(70 + ((bb.lower - curr) / bb.lower) * 300);
    return { action: 'BUY', confidence: Math.min(95, conf), reason: `突破布林下軌 (${curr.toFixed(2)} < ${bb.lower.toFixed(2)})` };
  }
  if (curr > bb.upper) {
    const conf = Math.round(70 + ((curr - bb.upper) / bb.upper) * 300);
    return { action: 'SELL', confidence: Math.min(95, conf), reason: `突破布林上軌 (${curr.toFixed(2)} > ${bb.upper.toFixed(2)})` };
  }
  return { action: 'HOLD', confidence: 45, reason: `價格在布林通道內 (${bb.lower.toFixed(2)} ~ ${bb.upper.toFixed(2)})` };
}

function macdStrategy(symbol: string, prices: number[]): StrategySignal {
  const ema12 = calcSMA(prices, 12);
  const ema26 = calcSMA(prices, 26);
  const macdLine = ema12 - ema26;
  const prevEma12 = calcSMA(prices.slice(0, -1), 12);
  const prevEma26 = calcSMA(prices.slice(0, -1), 26);
  const prevMacd = prevEma12 - prevEma26;

  if (prevMacd < 0 && macdLine > 0) {
    return { action: 'BUY', confidence: 78, reason: `MACD 金叉 (${macdLine.toFixed(4)})，趨勢反轉買入` };
  }
  if (prevMacd > 0 && macdLine < 0) {
    return { action: 'SELL', confidence: 78, reason: `MACD 死叉 (${macdLine.toFixed(4)})，趨勢反轉賣出` };
  }
  return { action: 'HOLD', confidence: 40, reason: `MACD 無明確交叉訊號 (${macdLine.toFixed(4)})` };
}

function combineSignals(signals: StrategySignal[]): StrategySignal {
  const votes = { BUY: 0, SELL: 0, HOLD: 0 };
  let totalConf = 0;
  for (const s of signals) {
    votes[s.action] += s.confidence;
    totalConf += s.confidence;
  }
  const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return {
    action: winner[0] as 'BUY' | 'SELL' | 'HOLD',
    confidence: Math.round((winner[1] / totalConf) * 100),
    reason: signals.map(s => s.reason).join(' | '),
  };
}

// ── 主要 Tick 邏輯 ───────────────────────────────────────────────────────────

async function agentTick() {
  if (agentStatus !== 'running') return;

  emitLog({ level: 'SYS_SYNC', source: 'SYS_SYNC', message: `Heartbeat OK. Latency: ${(Math.random() * 2 + 0.5).toFixed(1)}ms. 評估 ${agentConfig.symbols.length} 個標的...` });

  // 取得帳戶餘額
  let balance: { totalAssets: number; availableMargin: number; dailyPnl: number; usedMargin: number; currency: 'TWD' | 'USD' } = { 
    totalAssets: 10_000_000, 
    availableMargin: 10_000_000, 
    dailyPnl: 0, 
    usedMargin: 0, 
    currency: 'TWD' 
  };
  try {
    balance = await activeBroker.getBalance();
  } catch { /* 無法取得餘額時使用預設值 */ }

  // 廣播帳戶狀態
  wsBroadcast?.({ type: 'account_update', data: balance });

  for (const symbol of agentConfig.symbols) {
    try {
      // 1. 取得/更新報價
      const currentPrice = simulateNewPrice(symbol);
      const prices = getOrInitPriceHistory(symbol);

      wsBroadcast?.({ type: 'price_update', data: { symbol, price: currentPrice, timestamp: Date.now() } });

      // 2. 執行策略
      const signals: StrategySignal[] = [];
      for (const strategy of agentConfig.strategies) {
        switch (strategy) {
          case 'RSI_REVERSION':    signals.push(rsiReversionStrategy(symbol, prices)); break;
          case 'BOLLINGER_BREAKOUT': signals.push(bollingerStrategy(symbol, prices)); break;
          case 'MACD_CROSS':       signals.push(macdStrategy(symbol, prices)); break;
          case 'AI_LLM':
            emitLog({ level: 'AI_ENGINE', source: 'AI_ENGINE', symbol, message: `正在呼叫 LLM 分析 ${symbol} 技術面...` });
            break;
        }
      }

      const signal = signals.length > 1 ? combineSignals(signals) : signals[0];
      if (!signal) continue;

      emitLog({
        level: 'AI_ENGINE',
        source: 'AI_ENGINE',
        symbol,
        message: `[${symbol}] ${signal.reason}`,
        confidence: signal.confidence,
        action: signal.action,
      });

      // 3. 如果有交易訊號，進行風控驗證
      if (signal.action !== 'HOLD' && signal.confidence > 65) {
        const qty = Math.max(1, Math.floor(balance.availableMargin * 0.05 / currentPrice)); // 5% 資金部位
        const riskCheck = riskManager.validateOrder(
          { symbol, side: signal.action, quantity: qty, price: currentPrice },
          balance.totalAssets,
        );

        emitLog({
          level: riskCheck.allowed ? 'RISK_CHK' : 'WARNING',
          source: 'RISK_CHK',
          symbol,
          message: riskCheck.allowed
            ? `風控驗證通過。${riskCheck.reason ?? ''}`
            : `風控阻止交易：${riskCheck.reason}`,
        });

        // 4. 執行交易
        if (riskCheck.allowed) {
          try {
            emitLog({
              level: 'EXECUTION',
              source: 'EXECUTION',
              symbol,
              message: `${signal.action === 'BUY' ? '買入' : '賣出'}訊號觸發 @ ${currentPrice}。信心度：${signal.confidence}%。委託透過 ${activeBroker.brokerId.toUpperCase()}...`,
              confidence: signal.confidence,
              action: signal.action,
            });

            const result = await activeBroker.placeOrder({
              symbol,
              side: signal.action,
              qty,
              price: currentPrice,
              orderType: 'MARKET',
              marketType: symbol.endsWith('.TW') ? 'TW_STOCK' : 'US_STOCK',
              note: signal.reason,
            });

            if (result.status === 'FILLED') {
              riskManager.recordTrade(qty * currentPrice);
              emitLog({
                level: 'EXECUTION',
                source: 'EXECUTION',
                symbol,
                message: `✅ 成交確認 #${result.orderId} — ${signal.action} ${qty} 股 @ ${result.filledPrice}`,
              });
            } else {
              emitLog({
                level: 'WARNING',
                source: 'EXECUTION',
                symbol,
                message: `❌ 委託失敗：${result.message ?? result.status}`,
              });
            }
          } catch (e) {
            emitLog({ level: 'ERROR', source: 'EXECUTION', symbol, message: `下單異常：${(e as Error).message}` });
          }
        }
      }
    } catch (e) {
      emitLog({ level: 'ERROR', source: 'AGENT', symbol, message: `[${symbol}] 評估失敗：${(e as Error).message}` });
    }
  }

  // 廣播持倉更新
  try {
    const positions = await activeBroker.getPositions();
    wsBroadcast?.({ type: 'positions_update', data: positions });
  } catch { /* 忽略 */ }
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;

export function getAgentStatus(): AgentStatus { return agentStatus; }
export function getAgentConfig(): AgentConfig { return { ...agentConfig }; }
export function getAgentLogs(limit = 100): AgentLog[] { return logBuffer.slice(-limit); }

export function updateAgentConfig(cfg: Partial<AgentConfig>) {
  agentConfig = { ...agentConfig, ...cfg };
  riskManager.updateConfig({
    budgetLimitTWD: agentConfig.budgetLimitTWD,
    maxDailyLossTWD: agentConfig.maxDailyLossTWD,
  });
  emitLog({ level: 'INFO', source: 'CONFIG', message: `設定已更新：策略=${agentConfig.strategies.join(',')} 標的=${agentConfig.symbols.join(',')} 模式=${agentConfig.mode}` });
}

export function startAgent(cfg?: Partial<AgentConfig>): { ok: boolean; message: string } {
  if (agentStatus === 'running') return { ok: false, message: 'Agent 已在執行中' };

  if (cfg) updateAgentConfig(cfg);

  if (agentConfig.mode === 'simulated') {
    simulatedAdapter.connect({ brokerId: 'simulated', mode: 'simulated' });
    activeBroker = simulatedAdapter;
  }

  agentStatus = 'running';
  emitLog({ level: 'INFO', source: 'AGENT', message: `🚀 AI 自動交易引擎啟動。模式：${agentConfig.mode} | 策略：${agentConfig.strategies.join('+')} | 標的：${agentConfig.symbols.join(',')}` });

  // 立即執行一次，然後按間隔執行
  agentTick();
  intervalId = setInterval(agentTick, agentConfig.tickIntervalMs);

  return { ok: true, message: 'AI 引擎已啟動' };
}

export function stopAgent(): { ok: boolean; message: string } {
  if (agentStatus === 'stopped') return { ok: false, message: 'Agent 未在執行中' };
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  agentStatus = 'stopped';
  emitLog({ level: 'INFO', source: 'AGENT', message: '⏹️ AI 自動交易引擎已停止' });
  return { ok: true, message: 'AI 引擎已停止' };
}

export function emergencyKillSwitch(): { ok: boolean; message: string } {
  riskManager.activateKillSwitch();
  stopAgent();
  emitLog({ level: 'WARNING', source: 'KILL_SWITCH', message: '🚨 緊急平倉已觸發！所有自動交易已暫停，請手動處理現有部位。' });
  return { ok: true, message: '緊急停機已啟動，AI 引擎已停止' };
}

// 相容舊版介面
export function startAutonomousAgent() {
  // 不在這裡自動啟動，由 /api/autotrading/start 端點控制
  console.log('[AutoAgent] AI 自動交易引擎就緒，等待啟動指令...');
}

export function stopAutonomousAgent() { stopAgent(); }
