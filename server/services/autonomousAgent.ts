/**
 * server/services/autonomousAgent.ts
 * AI 自動交易引擎 (完整實戰版)
 */
import crypto from 'crypto';
import { simulatedAdapter } from './brokers/SimulatedAdapter.js';
import { OrderExecutor } from './orderExecutor.js';
import * as TWSeService from './TWSeService.js';
import * as TVService from './TradingViewService.js';
import { AgentConfigPatchSchema } from '../utils/configSchema.js';
import { callLLM, getFreeModelByTier } from '../utils/llmPipeline.js';
import { getRecentNews, getInstitutionalFlow, getDailyContext } from './marketData.js';
import { ORCHESTRATOR_PROMPT, buildOrchestratorPrompt } from '../utils/tradingPrompts.js';
import type { IBrokerAdapter } from './brokers/BrokerAdapter.js';
import type { AgentConfig, AgentStatus, AgentLog } from '../../src/components/AutoTrading/types.js';
import { riskManager } from './RiskManager.js';
import { anyMarketOpen, isTradingSession } from './tradingSession.js';
import { DEFAULT_AGENT_CONFIG } from './autotradingDefaults.js';
import { fuseSignals, isQuantumSignalEnabled } from './signalFusionService.js';
import type { SignalObservation } from '../types/signal.js';
import { getQuantumSignal } from '../utils/scienceService.js';

import { autotradingConfigRepo } from '../repositories/autotradingConfigRepo.js';

// ── 狀態與配置 ──────────────────────────────────────────────────
let agentStatus: AgentStatus = 'stopped';
let agentConfig: AgentConfig = { ...DEFAULT_AGENT_CONFIG };
let lastSentimentScore = 50;
let lastEquityBroadcast = 0;

const activeBroker: IBrokerAdapter = simulatedAdapter;
const hedgeBroker: IBrokerAdapter = simulatedAdapter;
const logBuffer: AgentLog[] = [];
let posTrack = new Map<string, { avgCost: number; qty: number }>(); // 追蹤各標的平均成本 (P1)
let wsBroadcast: ((msg: any) => void) | null = null;
let tickTimeout: NodeJS.Timeout | null = null;
let lossStreakCount = 0;
let isTickRunning = false;

const executor = new OrderExecutor(activeBroker, hedgeBroker, (log) => emitLog(log));

export function setWsBroadcast(fn: (msg: any) => void) { wsBroadcast = fn; }

function emitLog(log: Omit<AgentLog, 'id' | 'timestamp'>) {
  const newLog: AgentLog = { 
    ...log, 
    id: crypto.randomUUID(), 
    timestamp: new Date().toISOString() 
  };
  logBuffer.push(newLog);
  if (logBuffer.length > 500) logBuffer.shift();
  wsBroadcast?.({ type: 'agent_log', data: newLog });
}

async function broadcastAccountUpdate() {
  try {
    const balance = await activeBroker.getBalance();
    const positions = await activeBroker.getPositions();

    // 同步內部的 posTrack 以確保與券商庫存一致 (P1)
    // 注意：這裡優先信任券商庫存數量，平均成本若券商沒給則保留舊有的
    const currentSymbols = positions.map(p => p.symbol);

    positions.forEach(p => {
      const existing = posTrack.get(p.symbol);
      posTrack.set(p.symbol, {
        qty: p.qty,
        avgCost: p.avgCost || existing?.avgCost || 0
      });
    });

    // 移除已不在券商持倉中的標的 (P1)
    for (const sym of posTrack.keys()) {
      if (!currentSymbols.includes(sym)) posTrack.delete(sym);
    }

    wsBroadcast?.({ type: 'account_update', data: balance });
    wsBroadcast?.({ type: 'positions_update', data: positions });

    // 權益曲線：每次 tick 推一筆，前端 useAutotradingWS 會留 100 筆 ring buffer
    const nowTs = Date.now();
    if (nowTs - lastEquityBroadcast > 5000) {
      wsBroadcast?.({ type: 'equity_update', data: { timestamp: new Date(nowTs).toISOString(), equity: balance.totalAssets } });
      lastEquityBroadcast = nowTs;
    }

    return { balance, positions }; // 回傳以便後續邏輯使用
  } catch (e) {
    console.error('[Agent] broadcastAccountUpdate failed:', e);
    throw e;
  }
}

function broadcastSentiment(score: number) {
  // 0..100，>50 偏多、<50 偏空。autonomousAgent 會在每次決策後加權更新。
  const clamped = Math.max(0, Math.min(100, score));
  lastSentimentScore = Math.round(lastSentimentScore * 0.7 + clamped * 0.3);
  wsBroadcast?.({ type: 'global_sentiment', data: { score: lastSentimentScore } });
}

/** 
 * 將目前運行狀態同步到資料庫 (P1)
 */
async function syncStateToDb() {
  if (!agentConfig.userId) return;
  try {
    await autotradingConfigRepo.saveState(agentConfig.userId, {
      status: agentStatus,
      lossStreakCount,
      posTrack: Object.fromEntries(posTrack) // Map 轉 JSON
    });
  } catch (e) {
    console.error('[Agent] 狀態同步失敗:', e);
  }
}

function parseInstitutionalFlowBias(flowText: string): number {
  const values = Array.from(flowText.matchAll(/([+-]?\d+)\s*張/g))
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  if (values.length === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  // 粗略歸一化，避免單位差導致爆量分數
  const normalized = Math.tanh(total / 15_000);
  return Math.max(-1, Math.min(1, normalized));
}

// ── 分析邏輯 ──────────────────────────────────────────────────
async function runAnalysis(config: AgentConfig, symbol: string) {
  const sParams = { ...config.params, ...(config.symbolConfigs?.[symbol] || {}) };
  try {
    const [news, flow, mtf, indicators, quote, models] = await Promise.all([
      getRecentNews(symbol, 3),
      getInstitutionalFlow(symbol),
      sParams.enableMTF ? getDailyContext(symbol) : Promise.resolve(null),
      TVService.getIndicators(symbol, '15m'), // 使用 15 分鐘線作為決策依據
      TWSeService.realtimeQuote(symbol),
      Promise.all([getFreeModelByTier(1), getFreeModelByTier(2)])
    ]);

    const rsiValue = Number(indicators?.['RSI'] || 50);
    const macdValue = Number(indicators?.['MACD.macd'] || 0);
    const macdSignal = Number(indicators?.['MACD.signal'] || 0);
    const macdDiff = macdValue - macdSignal;
    const techSignal = `RSI: ${rsiValue}, MACD: ${macdValue > macdSignal ? 'Bullish' : 'Bearish'}`;
    
    // 情感分析 -> 升級為快速 LLM 評判 (P3)
    let sentiment = 'Neutral';
    if (news && news.length > 20) {
      try {
        const { text: sentimentText } = await callLLM({
          systemPrompt: '你是一個專業的金融分析師。請根據以下新聞摘要，回傳該股票的短線情緒：Bullish, Bearish 或 Neutral。僅回傳單字。',
          prompt: `新聞摘要：\n${news}`,
          forceModel: models[1] || models[0], 
          userId: config.userId || 'default'
        });
        sentiment = sentimentText.trim().replace(/[^a-zA-Z]/g, '');
      } catch (e) {
        console.warn('[Agent] Sentiment analysis failed:', e);
      }
    }

    const orchestratorPrompt = buildOrchestratorPrompt({ 
      symbol, 
      tech: `Technical Indicators: ${techSignal}`, 
      sentiment: `Market Sentiment: ${sentiment} (analyzed by AI)`, 
      mtf, 
      mode: config.mode 
    });
    
    const { text } = await callLLM({ 
      systemPrompt: ORCHESTRATOR_PROMPT, 
      prompt: orchestratorPrompt, 
      forceModel: models[0], 
      jsonMode: true, 
      userId: config.userId || 'default' 
    });

    let dec = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const currentPrice = quote?.price || 0;
    
    // 信心度過低時，觸發「深度研究任務」(Parallel-Web)
    if (dec.action !== 'HOLD' && (dec.confidence || 0) < 65) {
      emitLog({ level: 'INFO', source: 'AGENT', symbol, message: `信心度 (${dec.confidence}) 過低，觸發 parallel-web 深度研究反向觀點...` });
      try {
        const { scrapeUrls } = await import('../utils/scienceService.js');
        // 假設我們有預設的幾個新聞網址來針對這檔股票，或者用 LLM 生出網址
        // 這裡作為展示，直接輸入相關的查詢或知名外部網址
        const researchUrls = [
          `https://news.google.com/search?q=${symbol}+stock&hl=zh-TW`,
          `https://finance.yahoo.com/quote/${symbol}/news`
        ];
        const webData = await scrapeUrls(researchUrls);
        let deepContext = '';
        if (webData && webData.data) {
           deepContext = Object.values(webData.data).join('\\n').substring(0, 1000);
        }
        
        if (deepContext) {
           const { text: newText } = await callLLM({
             systemPrompt: ORCHESTRATOR_PROMPT,
             prompt: orchestratorPrompt + `\\n\\n[Deep Research Context]:\\n${deepContext}\\n\\n請重新評估並產出 JSON 決策。`,
             forceModel: models[0],
             jsonMode: true,
             userId: config.userId || 'default'
           });
           const newDec = JSON.parse(newText.match(/\{[\s\S]*\}/)?.[0] || '{}');
           if (newDec.confidence) {
              emitLog({ level: 'INFO', source: 'AGENT', symbol, message: `深度研究完成。新信心度: ${newDec.confidence}, 新動作: ${newDec.action}` });
              dec = newDec;
           }
        }
      } catch (e) {
        console.warn('[Agent] Deep research failed:', e);
      }
    }
    
    const aiAction = (['BUY', 'SELL', 'HOLD'].includes(dec.action) ? dec.action : 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
    const aiConfidence = Math.max(0, Math.min(100, Number(dec.confidence || 0)));

    const overbought = Number(sParams.RSI_REVERSION?.overbought ?? 70);
    const oversold = Number(sParams.RSI_REVERSION?.oversold ?? 30);
    let technicalAction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let technicalConfidence = 45;
    if (rsiValue <= oversold) {
      technicalAction = 'BUY';
      technicalConfidence = Math.min(95, 60 + (oversold - rsiValue) * 1.5 + (macdDiff > 0 ? 10 : 0));
    } else if (rsiValue >= overbought) {
      technicalAction = 'SELL';
      technicalConfidence = Math.min(95, 60 + (rsiValue - overbought) * 1.5 + (macdDiff < 0 ? 10 : 0));
    } else if (Math.abs(macdDiff) > 0.8) {
      technicalAction = macdDiff > 0 ? 'BUY' : 'SELL';
      technicalConfidence = Math.min(85, 50 + Math.abs(macdDiff) * 10);
    }

    const macroBias = parseInstitutionalFlowBias(flow);
    const macroAction: 'BUY' | 'SELL' | 'HOLD' = macroBias > 0.2 ? 'BUY' : macroBias < -0.2 ? 'SELL' : 'HOLD';
    const macroConfidence = Math.round(Math.abs(macroBias) * 100);

    const observations: SignalObservation[] = [
      {
        source: 'ai',
        action: aiAction,
        confidence: aiConfidence,
        weight: Number(sParams.AI_LLM?.weight ?? 1),
        reason: typeof dec.reasoning === 'string' ? dec.reasoning : 'LLM decision',
      },
      {
        source: 'technical',
        action: technicalAction,
        confidence: technicalConfidence,
        weight: Number(sParams.RSI_REVERSION?.weight ?? 0.8),
        reason: `RSI=${rsiValue.toFixed(1)}, MACDΔ=${macdDiff.toFixed(3)}`,
      },
      {
        source: 'macro',
        action: macroAction,
        confidence: macroConfidence,
        weight: 0.5,
        reason: 'Institutional flow bias',
      },
    ];

    if (isQuantumSignalEnabled()) {
      const quantumRes = await getQuantumSignal({
        symbol,
        features: {
          rsi: rsiValue,
          macd_diff: macdDiff,
          flow_bias: macroBias,
          ai_confidence: aiConfidence / 100,
        },
        shots: 256,
      });
      if (quantumRes.status === 'success' && quantumRes.data) {
        const qa = String(quantumRes.data.action || 'HOLD').toUpperCase();
        const quantumAction = (qa === 'BUY' || qa === 'SELL' || qa === 'HOLD' ? qa : 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
        observations.push({
          source: 'quantum',
          action: quantumAction,
          confidence: Number(quantumRes.data.confidence ?? 45),
          weight: 0.6,
          score: Number(quantumRes.data.momentum_phase ?? 0),
          reason: 'Quantum meta-signal',
          sourceVersion: String(quantumRes.meta?.model || quantumRes.data.model || 'quantum-fallback'),
        });
      } else if (quantumRes.errors?.length) {
        emitLog({ level: 'WARNING', source: 'QUANTUM', symbol, message: `Quantum signal fallback: ${quantumRes.errors[0]}` });
      }
    }

    const fused = fuseSignals({
      symbol,
      observations,
      minConfidence: Number(sParams.AI_LLM?.confidenceThreshold ?? 65),
      preferSource: 'ai',
      quantumEnabled: isQuantumSignalEnabled(),
    });

    wsBroadcast?.({
      type: 'decision_fusion',
      data: {
        symbol,
        action: fused.action,
        confidence: fused.confidence,
        score: fused.score,
        reason: fused.reason,
        components: fused.components.map((c) => ({
          source: c.source,
          action: c.action,
          confidence: c.confidence,
          weightedScore: c.weightedScore,
        })),
        timestamp: new Date().toISOString(),
      },
    });

    // 發送決策熱圖數據到前端（改用融合決策）
    const heatScore = fused.confidence * (fused.action === 'SELL' ? -1 : fused.action === 'BUY' ? 1 : 0);
    wsBroadcast?.({
      type: 'decision_heat',
      data: {
        symbol,
        score: heatScore,
        reason: fused.reason,
        timestamp: new Date().toISOString(),
      }
    });

    // 把單一決策心情正規化到 0-100 推進整體情緒分數
    const sentimentDelta = fused.action === 'BUY' ? 50 + heatScore / 2
      : fused.action === 'SELL' ? 50 - Math.abs(heatScore) / 2
      : 50;
    broadcastSentiment(sentimentDelta);

    return { 
      action: fused.action || 'HOLD', 
      confidence: fused.confidence || 0, 
      price: currentPrice 
    };
  } catch (e) { 
    console.error(`[Agent] Analysis failed for ${symbol}:`, e);
    return { action: 'HOLD' }; 
  }
}

// ── 核心 Tick ──────────────────────────────────────────────────
async function agentTick() {
  if (agentStatus === 'stopped' || agentStatus === 'paused' || isTickRunning) return;

  isTickRunning = true;
  try {
    // 定期推送帳戶與持倉狀態並同步內部狀態 (P1)
    const { balance, positions } = await broadcastAccountUpdate();

    // 盤前盤後守門：若所有監控標的皆收盤，僅同步狀態，不發出 LLM 分析請求
    if (!anyMarketOpen(agentConfig.symbols, agentConfig.tradingHours)) {
      const sample = isTradingSession(agentConfig.symbols[0] ?? '2330.TW', agentConfig.tradingHours);
      emitLog({ level: 'MONITOR', source: 'SESSION', symbol: 'ALL', message: `🕒 ${sample.reason}，跳過本次決策迴圈。` });
      return;
    }
    void positions; // 避免未使用警告

    // 實戰化斷路器 1: 檢查當日損益 (P1)
    const dailyLossPct = Math.abs(balance.dailyPnl) / (balance.totalAssets || 1) * 100;
    
    if (agentConfig.circuitBreaker?.enabled) {
      if (balance.dailyPnl < 0 && Math.abs(balance.dailyPnl) >= agentConfig.maxDailyLossTWD) {
        activateCooldown(`當日損益 (${balance.dailyPnl.toFixed(0)}) 已達風控上限`);
        return;
      }
      if (dailyLossPct >= (agentConfig.circuitBreaker.maxDailyLossPct || 2.0)) {
        activateCooldown(`當日損益百分比 (${dailyLossPct.toFixed(2)}%) 已達風控上限`);
        return;
      }
      if (lossStreakCount >= (agentConfig.circuitBreaker.maxLossStreak || 3)) {
        activateCooldown(`連損次數已達上限 (${lossStreakCount})`);
        return;
      }
    }

    for (const symbol of agentConfig.symbols) {
      const signal = await runAnalysis(agentConfig, symbol);
      
      if (agentStatus === 'running' && signal.action !== 'HOLD') {
        const threshold = agentConfig.params.AI_LLM?.confidenceThreshold || 65;
        if (signal.confidence > threshold) {
          // 動態計算委託數量：預設每次投入可用資金的 10% 或配置的 maxAllocationPerTrade
          const allocation = agentConfig.params.maxAllocationPerTrade || 0.1;
          const tradeAmount = balance.availableMargin * allocation;
          
          // 台股以「張」為單位 (1000股)
          const targetQty = signal.price > 0 ? Math.floor(tradeAmount / (signal.price * 1000)) * 1000 : 0; 
          
          let finalQty = 0;
          if (signal.action === 'BUY') {
            if (targetQty < 1000) {
              emitLog({ level: 'WARNING', source: 'AGENT', symbol, message: `資金不足以購買一張股票 (需約 ${(signal.price * 1000).toFixed(0)} TWD)` });
              continue;
            }
            finalQty = targetQty;
          } else if (signal.action === 'SELL') {
            // 賣出時直接參考同步後的庫存數量 (P1)
            const currentPos = posTrack.get(symbol);
            if (!currentPos || currentPos.qty <= 0) {
              emitLog({ level: 'INFO', source: 'AGENT', symbol, message: `無持倉可賣出` });
              continue;
            }
            finalQty = currentPos.qty;
          }

          // 訂單前置風控檢查
          const riskCheck = riskManager.validateOrder(
            { symbol, side: signal.action as 'BUY' | 'SELL', quantity: finalQty, price: signal.price || 0 },
            balance.totalAssets,
          );
          if (!riskCheck.allowed) {
            emitLog({ level: 'RISK_CHK', source: 'RISK', symbol, message: `🛑 風控攔截：${riskCheck.reason}` });
            continue;
          }
          if (riskCheck.level === 'WARNING' && riskCheck.reason) {
            emitLog({ level: 'WARNING', source: 'RISK', symbol, message: riskCheck.reason });
          }

          const result = await executor.executeTrade(agentConfig, {
            symbol,
            side: signal.action as 'BUY' | 'SELL',
            qty: finalQty,
            price: signal.price || 0,
          });
          if (result && result.status === 'FILLED') {
            riskManager.recordTrade(result.filledQty * result.filledPrice);
          }
          
          // 實戰化斷路器 2: 進階連損判定 (P1 - 深化)
          if (result && result.status === 'FILLED') {
            const track = posTrack.get(symbol) || { avgCost: 0, qty: 0 };
            
            if (signal.action === 'BUY') {
              // 更新平均成本 (此處 posTrack 可能已被 broadcastAccountUpdate 更新，但交易後的精確成本仍建議以此計算)
              const totalQty = track.qty + result.filledQty;
              const newAvg = (track.qty * track.avgCost + result.filledQty * result.filledPrice) / totalQty;
              posTrack.set(symbol, { avgCost: newAvg, qty: totalQty });
              emitLog({ level: 'INFO', source: 'AGENT', symbol, message: `持倉更新：均價 ${newAvg.toFixed(2)} | 數量 ${totalQty}` });
            } else if (signal.action === 'SELL') {
              // 計算平倉損益
              const realizedPnL = (result.filledPrice - track.avgCost) * result.filledQty;
              riskManager.recordPnl(realizedPnL);
              if (realizedPnL < 0) {
                lossStreakCount++;
                emitLog({ level: 'WARNING', source: 'BREAKER', symbol, message: `🔻 平倉損失：${realizedPnL.toFixed(0)} | 當前連損：${lossStreakCount}` });
              } else {
                lossStreakCount = 0;
                emitLog({ level: 'RISK_CHK', source: 'BREAKER', symbol, message: `✅ 平倉獲利：${realizedPnL.toFixed(0)} | 連損計數已歸零` });
              }
              
              // 更新剩餘持倉
              const remainQty = Math.max(0, track.qty - result.filledQty);
              if (remainQty === 0) posTrack.delete(symbol);
              else posTrack.set(symbol, { ...track, qty: remainQty });
            }
            syncStateToDb();
            // 成交後立即更新 UI (P1)
            await broadcastAccountUpdate();
          } else {
            emitLog({ level: 'WARNING', source: 'AGENT', symbol, message: `委託未完全成交，跳過損益計數。` });
          }
        }
      } else if (agentStatus === 'cooldown' && signal.action !== 'HOLD') {
        emitLog({ level: 'INFO', source: 'MONITOR', symbol, message: `👁️ [冷卻監控] AI 建議 ${signal.action}，訂單已攔截。` });
      }
    }
  } catch (e) {
    console.error('[Tick Error]', e);
    emitLog({ level: 'ERROR', source: 'SYSTEM', symbol: 'ENGINE', message: `Tick 異常: ${(e as Error).message}` });
  } finally {
    isTickRunning = false;
    if (agentStatus === 'running' || agentStatus === 'cooldown') {
      if (tickTimeout) clearTimeout(tickTimeout);
      tickTimeout = setTimeout(agentTick, agentConfig.tickIntervalMs);
    }
  }
}

function activateCooldown(reason: string) {
  agentStatus = 'cooldown';
  emitLog({ level: 'CRITICAL', source: 'BREAKER', symbol: 'ALL', message: `🚨 斷路器觸發：${reason}。實盤交易已暫停。` });
  syncStateToDb();
  if (tickTimeout) clearTimeout(tickTimeout);
  tickTimeout = setTimeout(() => {
    if (agentStatus === 'cooldown') {
      agentStatus = 'running';
      lossStreakCount = 0;
      agentTick();
      syncStateToDb();
    }
  }, (agentConfig.circuitBreaker?.cooldownMinutes || 60) * 60000);
}

/** 
 * 重置斷路器 (P1 - Refactor) 
 */
export function resetCircuitBreaker() {
  lossStreakCount = 0;
  if (agentStatus === 'cooldown') {
    agentStatus = 'running';
    agentTick();
  }
  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'BREAKER', message: '斷路器已手動重置，計數歸零。' });
  syncStateToDb();
  return { ok: true };
}

export function startAgent(c?: any) { 
  if (tickTimeout) clearTimeout(tickTimeout);
  
  if (c) {
    const v = updateAgentConfig(c);
    if (!v.ok) return v;
  }
  
  agentStatus = 'running'; 
  lossStreakCount = 0;
  isTickRunning = false; // 重置鎖
  agentTick(); 
  syncStateToDb();
  return { ok: true }; 
}

export function stopAgent() {
  agentStatus = 'stopped';
  if (tickTimeout) clearTimeout(tickTimeout);
  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'ENGINE', message: 'AI 引擎已手動停止' });
  syncStateToDb();
  return { ok: true };
}

export function updateAgentConfig(patch: any) {
  const result = AgentConfigPatchSchema.safeParse(patch);
  if (!result.success) {
    return { ok: false, error: `Invalid configuration: ${result.error.message}` };
  }
  
  agentConfig = { ...agentConfig, ...result.data };

  // 將風控相關欄位同步到 RiskManager 單例
  riskManager.updateConfig({
    budgetLimitTWD: agentConfig.budgetLimitTWD,
    maxDailyLossTWD: agentConfig.maxDailyLossTWD,
    stopLossPct: (agentConfig.params?.stopLossPct ?? 5) / 100,
    maxPositionPct: agentConfig.params?.maxPositionPct ?? 0.3,
  });

  // 持久化儲存 (P1)
  if (agentConfig.userId) {
    autotradingConfigRepo.saveConfig(agentConfig.userId, agentConfig, agentStatus)
      .catch(e => console.error('[Config Save Error]', e));
  }

  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'CONFIG', message: '系統配置已更新' });
  return { ok: true };
}

export function getAgentStatus() { return agentStatus; }
export function getAgentConfig() { return agentConfig; }
export function getAgentLogs(n = 100) { return logBuffer.slice(-n); }
export function getLossStreakCount() { return lossStreakCount; }

export function emergencyKillSwitch() {
  stopAgent();
  riskManager.activateKillSwitch();
  emitLog({ level: 'CRITICAL', source: 'SYSTEM', symbol: 'ALL', message: '🚨 緊急停止已觸發！所有自動交易已停止。' });
  return { ok: true };
}

export function deactivateKillSwitch() {
  riskManager.deactivateKillSwitch();
  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'ALL', message: '🟢 緊急停止已解除，可重新啟動引擎。' });
  return { ok: true };
}

/** 
 * 從 DB 恢復配置與狀態並啟動 (P1/P2)
 */
export async function startAutonomousAgent() {
  console.log('[AutoAgent] 初始化自動交易引擎...');
  try {
    const activeConfigs = await autotradingConfigRepo.getAllActiveConfigs();
    if (activeConfigs.length > 0) {
      // 目前實作僅支持單一引擎運行，故加載第一個活躍配置 (P2)
      const row = activeConfigs[0];
      const savedConfig = await autotradingConfigRepo.getConfig(row.userId); 
      if (savedConfig) {
        console.log(`[AutoAgent] 成功為使用者 ${row.userId} 恢復運行狀態`);
        agentConfig = { ...agentConfig, ...savedConfig };
        agentStatus = savedConfig.status || 'stopped';
        lossStreakCount = savedConfig.lossStreakCount || 0;
        posTrack = new Map(Object.entries(savedConfig.posTrack || {}));
        
        if (agentStatus === 'running' || agentStatus === 'cooldown') {
          agentTick();
        }
      }
    } else {
      console.log('[AutoAgent] 無活躍交易引擎需恢復');
    }
  } catch (e) {
    console.error('[AutoAgent] 配置恢復失敗:', e);
  }
}

export function startAutonomousAgentPlaceholder() {
  console.log('[AutoAgent] AI 自動交易引擎就緒');
}


