/**
 * server/services/autonomousAgent.ts
 * AI 自動交易引擎 (完整實戰版)
 */
import crypto from 'crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulatedAdapter } from './brokers/SimulatedAdapter.js';
import { sinopacAdapter } from './brokers/SinopacAdapter.js';
import { kgiAdapter } from './brokers/KGIAdapter.js';
import { yuantaAdapter } from './brokers/YuantaAdapter.js';
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
import type { RawQuantumOutput } from './quantum/quantumPolicy.js';
import { applyQuantumPolicy } from './quantum/quantumPolicy.js';
import { getQuantumSignal, timesFmPredict } from '../utils/scienceService.js';
import { notifier } from './notifier/index.js';

import { autotradingConfigRepo } from '../repositories/autotradingConfigRepo.js';

interface TaiwanSkillRules {
  settlementCycle: 'T+2';
  priceLimitPct: number;
  regularLotSize: number;
  intradayOddLot: { start: string; end: string; minQty: number; maxQty: number };
}

interface AnalysisSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  price?: number;
  prevClose?: number;
  quantumForcedLiquidation?: boolean;
  defensiveMode?: boolean;
  timesFmMeta?: {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    horizonTicks: number;
    predictedEndPrice: number;
    edgePct: number;
    model: string;
  };
  quantumMeta?: {
    confidence: number;
    regimeFlipProb: number;
    uncertaintyPenalty: number;
    gated?: boolean;
    leverageMultiplier?: number;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAIWAN_SKILL_PATH = path.resolve(__dirname, '../../skills/Taiwan_Stock_Skill.md');

const DEFAULT_TAIWAN_SKILL_RULES: TaiwanSkillRules = {
  settlementCycle: 'T+2',
  priceLimitPct: 0.1,
  regularLotSize: 1000,
  intradayOddLot: { start: '09:00', end: '13:30', minQty: 1, maxQty: 999 },
};

// ── 狀態與配置 ──────────────────────────────────────────────────
let agentStatus: AgentStatus = 'stopped';
let agentConfig: AgentConfig = { ...DEFAULT_AGENT_CONFIG };
let lastSentimentScore = 50;
let lastEquityBroadcast = 0;

let activeBroker: IBrokerAdapter = simulatedAdapter;
let hedgeBroker: IBrokerAdapter = simulatedAdapter;
let activeBrokerId: 'simulated' | 'sinopac' | 'kgi' | 'yuanta' = 'simulated';
const logBuffer: AgentLog[] = [];
const recentPriceSeries = new Map<string, number[]>();
let posTrack = new Map<string, { avgCost: number; qty: number }>(); // 追蹤各標的平均成本 (P1)
let wsBroadcast: ((msg: any) => void) | null = null;
let tickTimeout: NodeJS.Timeout | null = null;
let lossStreakCount = 0;
let isTickRunning = false;
let syncInProgress = false;

const WARN_LOG_COOLDOWN_MS = 60_000;
const warnLogTimestamps = new Map<string, number>();
let taiwanSkillRulesCache: TaiwanSkillRules = { ...DEFAULT_TAIWAN_SKILL_RULES };
let taiwanSkillLoadedAt = 0;

function warnWithCooldown(key: string, message: string) {
  const now = Date.now();
  const lastTs = warnLogTimestamps.get(key) ?? 0;
  if (now - lastTs < WARN_LOG_COOLDOWN_MS) return;
  warnLogTimestamps.set(key, now);
  console.warn(message);
}

function parseRuleNumber(content: string, key: string, fallback: number): number {
  const re = new RegExp(`${key}\\s*:\\s*([0-9.]+)`, 'i');
  const m = content.match(re);
  if (!m) return fallback;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : fallback;
}

function parseRuleTime(content: string, key: string, fallback: string): string {
  const re = new RegExp(`${key}\\s*:\\s*([0-2]?\\d:[0-5]\\d)`, 'i');
  const m = content.match(re);
  return m?.[1] || fallback;
}

async function loadTaiwanSkillRules(force = false): Promise<TaiwanSkillRules> {
  const cacheFresh = Date.now() - taiwanSkillLoadedAt < 60_000;
  if (!force && cacheFresh) return taiwanSkillRulesCache;

  try {
    const raw = await readFile(TAIWAN_SKILL_PATH, 'utf-8');
    const parsed: TaiwanSkillRules = {
      settlementCycle: 'T+2',
      priceLimitPct: parseRuleNumber(raw, 'price_limit_pct', DEFAULT_TAIWAN_SKILL_RULES.priceLimitPct),
      regularLotSize: Math.max(1, Math.floor(parseRuleNumber(raw, 'regular_lot_size', DEFAULT_TAIWAN_SKILL_RULES.regularLotSize))),
      intradayOddLot: {
        start: parseRuleTime(raw, 'intraday_odd_lot_start', DEFAULT_TAIWAN_SKILL_RULES.intradayOddLot.start),
        end: parseRuleTime(raw, 'intraday_odd_lot_end', DEFAULT_TAIWAN_SKILL_RULES.intradayOddLot.end),
        minQty: Math.max(1, Math.floor(parseRuleNumber(raw, 'intraday_odd_lot_min_qty', DEFAULT_TAIWAN_SKILL_RULES.intradayOddLot.minQty))),
        maxQty: Math.max(1, Math.floor(parseRuleNumber(raw, 'intraday_odd_lot_max_qty', DEFAULT_TAIWAN_SKILL_RULES.intradayOddLot.maxQty))),
      },
    };
    taiwanSkillRulesCache = parsed;
    taiwanSkillLoadedAt = Date.now();
  } catch (e) {
    warnWithCooldown('tw_skill_load', `[Agent] Taiwan skill load fallback: ${(e as Error).message}`);
  }

  return taiwanSkillRulesCache;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isWithinTaiwanOddLotSession(now = new Date(), rules = taiwanSkillRulesCache): boolean {
  const tpeDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const current = tpeDate.getHours() * 60 + tpeDate.getMinutes();
  const start = parseHHMM(rules.intradayOddLot.start);
  const end = parseHHMM(rules.intradayOddLot.end);
  return current >= start && current <= end;
}

function isTaiwanSymbol(symbol: string): boolean {
  return /\.(TW|TWO)$/i.test(symbol);
}

function validateTaiwanOrderBySkill(input: {
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  prevClose?: number;
  availableMargin: number;
  rules: TaiwanSkillRules;
}): { allowed: boolean; reason?: string } {
  const { symbol, side, qty, price, prevClose, availableMargin, rules } = input;
  if (!isTaiwanSymbol(symbol)) return { allowed: true };

  if (side === 'BUY') {
    const required = qty * price;
    if (required > availableMargin) {
      return {
        allowed: false,
        reason: `T+2 資金約束：可用資金不足（需 ${required.toFixed(0)}，可用 ${availableMargin.toFixed(0)}）`,
      };
    }
  }

  if (prevClose && prevClose > 0 && price > 0) {
    const upper = prevClose * (1 + rules.priceLimitPct);
    const lower = prevClose * (1 - rules.priceLimitPct);
    if (price > upper || price < lower) {
      return {
        allowed: false,
        reason: `台股漲跌幅 ${rules.priceLimitPct * 100}% 限制：委託價 ${price.toFixed(2)} 超出區間 [${lower.toFixed(2)}, ${upper.toFixed(2)}]`,
      };
    }
  }

  const isRegularLot = qty % rules.regularLotSize === 0;
  if (!isRegularLot) {
    const inOddLotSession = isWithinTaiwanOddLotSession(new Date(), rules);
    if (!inOddLotSession) {
      return {
        allowed: false,
        reason: `台股零股下單僅限 ${rules.intradayOddLot.start}-${rules.intradayOddLot.end}，目前非盤中零股時段`,
      };
    }
    if (qty < rules.intradayOddLot.minQty || qty > rules.intradayOddLot.maxQty) {
      return {
        allowed: false,
        reason: `台股盤中零股數量限制 ${rules.intradayOddLot.minQty}-${rules.intradayOddLot.maxQty} 股，目前 ${qty} 股`,
      };
    }
  }

  return { allowed: true };
}

function pushRecentPrice(symbol: string, price: number, maxLen = 240): number[] {
  if (!Number.isFinite(price) || price <= 0) return recentPriceSeries.get(symbol) ?? [];
  const arr = recentPriceSeries.get(symbol) ?? [];
  arr.push(Number(price));
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
  recentPriceSeries.set(symbol, arr);
  return arr;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

let executor = new OrderExecutor(activeBroker, hedgeBroker, (log) => emitLog(log));

function refreshExecutor() {
  executor = new OrderExecutor(activeBroker, hedgeBroker, (log) => emitLog(log));
}

function resolveBrokerById(brokerId: string): IBrokerAdapter {
  switch (brokerId) {
    case 'sinopac':
      return sinopacAdapter;
    case 'kgi':
      return kgiAdapter;
    case 'yuanta':
      return yuantaAdapter;
    default:
      return simulatedAdapter;
  }
}

export function setPrimaryBroker(brokerId: string) {
  activeBrokerId = (['sinopac', 'kgi', 'yuanta'].includes(brokerId) ? brokerId : 'simulated') as
    | 'simulated'
    | 'sinopac'
    | 'kgi'
    | 'yuanta';
  activeBroker = resolveBrokerById(activeBrokerId);
  refreshExecutor();
  emitLog({
    level: 'SYSTEM',
    source: 'BROKER',
    symbol: 'ALL',
    message: `主券商已切換為 ${activeBrokerId}`,
  });
}

export function getPrimaryBrokerId() {
  return activeBrokerId;
}

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
 * syncInProgress 旗標防止前次 DB 寫入未完成時重複觸發，避免 Neon 連線堆積。
 */
async function syncStateToDb() {
  if (!agentConfig.userId || syncInProgress) return;
  syncInProgress = true;
  try {
    await autotradingConfigRepo.saveState(agentConfig.userId, {
      status: agentStatus,
      lossStreakCount,
      posTrack: Object.fromEntries(posTrack) // Map 轉 JSON
    });
  } catch (e) {
    console.error('[Agent] 狀態同步失敗:', e);
  } finally {
    syncInProgress = false;
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
async function runAnalysis(config: AgentConfig, symbol: string): Promise<AnalysisSignal> {
  const sParams = { ...config.params, ...(config.symbolConfigs?.[symbol] || {}) };
  try {
    const [news, flow, mtf, indicators, overview, quote, modelCandidates] = await Promise.all([
      getRecentNews(symbol, 3),
      getInstitutionalFlow(symbol),
      sParams.enableMTF ? getDailyContext(symbol) : Promise.resolve(null),
      TVService.getIndicators(symbol, '15m').catch(() => null), // TV rejects non-US symbols (e.g. .TW); null = skip
      TVService.getOverview(symbol).catch(() => null),
      TWSeService.realtimeQuote(symbol),
      Promise.allSettled([getFreeModelByTier(1), getFreeModelByTier(2)]),
    ]);

    const primaryModel = modelCandidates[0]?.status === 'fulfilled' ? modelCandidates[0].value : undefined;
    const secondaryModel = modelCandidates[1]?.status === 'fulfilled' ? modelCandidates[1].value : primaryModel;
    if (modelCandidates.some((m) => m.status === 'rejected')) {
      warnWithCooldown(`model-selector:${symbol}`, `[Agent] Model selector degraded for ${symbol}; using callLLM auto routing.`);
    }

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
          forceModel: secondaryModel,
          symbol,
          userId: config.userId || 'default'
        });
        sentiment = sentimentText.trim().replace(/[^a-zA-Z]/g, '');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnWithCooldown(`sentiment:${symbol}`, `[Agent] Sentiment analysis fallback for ${symbol}: ${msg}`);
      }
    }

    const orchestratorPrompt = buildOrchestratorPrompt({ 
      symbol, 
      tech: `Technical Indicators: ${techSignal}`, 
      sentiment: `Market Sentiment: ${sentiment} (analyzed by AI)`, 
      mtf, 
      mode: config.mode 
    });
    
    let dec: { action?: string; confidence?: number; reasoning?: string } = {
      action: 'HOLD',
      confidence: 0,
      reasoning: 'LLM unavailable',
    };

    try {
      const { text } = await callLLM({
        systemPrompt: ORCHESTRATOR_PROMPT,
        prompt: orchestratorPrompt,
        forceModel: primaryModel,
        jsonMode: true,
        symbol,
        userId: config.userId || 'default',
      });
      dec = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnWithCooldown(`orchestrator:${symbol}`, `[Agent] Orchestrator decision fallback for ${symbol}: ${msg}`);
    }

    const currentPrice = quote?.price || Number(overview?.close ?? 0) || 0;
    const prevClose = quote?.prevClose || 0;
    const recentPrices = pushRecentPrice(symbol, currentPrice);
    const timesFmCfg = {
      horizonTicks: Math.max(3, Math.min(32, Math.floor(Number(sParams.TIMESFM_FORECAST?.horizonTicks ?? 8)))),
      minEdgePct: Math.max(0.01, Number(sParams.TIMESFM_FORECAST?.minEdgePct ?? 0.2)),
      weight: Math.max(0, Math.min(1, Number(sParams.TIMESFM_FORECAST?.weight ?? 0.35))),
    };
    let timesFmMeta: AnalysisSignal['timesFmMeta'];
    let quantumForcedLiquidation = false;
    let defensiveMode = false;
    let quantumMeta: AnalysisSignal['quantumMeta'];
    let quantumRaw: RawQuantumOutput | null = null;
    
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
             forceModel: primaryModel,
             jsonMode: true,
             symbol,
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
    
    const decAction = typeof dec.action === 'string' ? dec.action : 'HOLD';
    const aiAction = (['BUY', 'SELL', 'HOLD'].includes(decAction) ? decAction : 'HOLD') as 'BUY' | 'SELL' | 'HOLD';
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

    let forecastAction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let forecastConfidence = 45;
    let forecastScore = 0;
    if (recentPrices.length >= 8) {
      try {
        const tf = await timesFmPredict(symbol, timesFmCfg.horizonTicks, recentPrices);
        if (tf.status === 'success' && tf.data) {
          const prediction = Array.isArray(tf.data.prediction) ? tf.data.prediction.map(Number).filter(Number.isFinite) : [];
          const predictedEndPrice = prediction.length > 0 ? Number(prediction[prediction.length - 1]) : currentPrice;
          const edgePct = currentPrice > 0 ? ((predictedEndPrice - currentPrice) / currentPrice) * 100 : 0;
          const impliedAction: 'BUY' | 'SELL' | 'HOLD' =
            edgePct >= timesFmCfg.minEdgePct
              ? 'BUY'
              : edgePct <= -timesFmCfg.minEdgePct
                ? 'SELL'
                : 'HOLD';
          const baseConfidence = clamp(Number(tf.data.confidence ?? 50), 0, 100);
          const edgeBoost = clamp(Math.abs(edgePct) * 12, 0, 30);
          forecastConfidence = clamp(baseConfidence * 0.7 + edgeBoost, 30, 95);
          forecastAction = impliedAction;
          forecastScore = clamp(Math.tanh(edgePct / 1.5), -1, 1);
          timesFmMeta = {
            action: forecastAction,
            confidence: Number(forecastConfidence.toFixed(2)),
            horizonTicks: timesFmCfg.horizonTicks,
            predictedEndPrice: Number(predictedEndPrice.toFixed(4)),
            edgePct: Number(edgePct.toFixed(4)),
            model: String(tf.data.model ?? 'timesfm'),
          };
        } else if (tf.errors?.length) {
          warnWithCooldown(`timesfm:${symbol}`, `[Agent] TimesFM fallback for ${symbol}: ${tf.errors[0]}`);
        }
      } catch (e) {
        warnWithCooldown(`timesfm:${symbol}`, `[Agent] TimesFM call failed for ${symbol}: ${(e as Error).message}`);
      }
    }

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

    if (timesFmCfg.weight > 0 && timesFmMeta) {
      observations.push({
        source: 'forecast',
        action: forecastAction,
        confidence: forecastConfidence,
        weight: timesFmCfg.weight,
        score: forecastScore,
        reason: `TimesFM ${timesFmMeta.model} edge=${timesFmMeta.edgePct.toFixed(3)}% horizon=${timesFmMeta.horizonTicks}`,
        sourceVersion: timesFmMeta.model,
      });
    }

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
        const quantumConfidence = Number(quantumRes.data.confidence ?? 45);
        const regimeFlipProb = Number(quantumRes.data.regime_flip_prob ?? 0);
        const uncertaintyPenalty = Number(quantumRes.data.uncertainty_penalty ?? 0);
        quantumRaw = {
          action: quantumAction,
          confidence: quantumConfidence,
          momentum_phase: Number(quantumRes.data.momentum_phase ?? 0),
          regime_flip_prob: regimeFlipProb,
          uncertainty_penalty: uncertaintyPenalty,
          model: String(quantumRes.data.model ?? 'quantum-fallback'),
          errors: Array.isArray(quantumRes.data.errors) ? quantumRes.data.errors.map(String) : [],
        };
        observations.push({
          source: 'quantum',
          action: quantumAction,
          confidence: quantumConfidence,
          weight: 0.6,
          score: Number(quantumRes.data.momentum_phase ?? 0),
          reason: 'Quantum meta-signal',
          sourceVersion: String(quantumRes.meta?.model || quantumRes.data.model || 'quantum-fallback'),
        });
        quantumMeta = {
          confidence: quantumConfidence,
          regimeFlipProb,
          uncertaintyPenalty,
        };
        quantumForcedLiquidation = quantumAction === 'SELL' && quantumConfidence >= 70 && regimeFlipProb >= 0.65;
        defensiveMode = regimeFlipProb >= 0.7 || uncertaintyPenalty >= 0.65;
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
    const quantumPolicy = quantumRaw ? applyQuantumPolicy(fused, quantumRaw) : null;
    const effectiveAction = quantumPolicy?.action ?? fused.action;
    const effectiveConfidence = quantumPolicy?.confidence ?? fused.confidence;
    if (quantumMeta && quantumPolicy) {
      quantumMeta.gated = quantumPolicy.gated;
      quantumMeta.leverageMultiplier = quantumPolicy.leverageMultiplier;
    }

    wsBroadcast?.({
      type: 'decision_fusion',
      data: {
        symbol,
        action: effectiveAction,
        confidence: effectiveConfidence,
        score: fused.score,
        reason: quantumPolicy ? `${quantumPolicy.reason}; ${fused.reason}` : fused.reason,
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
    const heatScore = effectiveConfidence * (effectiveAction === 'SELL' ? -1 : effectiveAction === 'BUY' ? 1 : 0);
    wsBroadcast?.({
      type: 'decision_heat',
      data: {
        symbol,
        score: heatScore,
        reason: quantumPolicy ? quantumPolicy.reason : fused.reason,
        timestamp: new Date().toISOString(),
      }
    });

    // 把單一決策心情正規化到 0-100 推進整體情緒分數
    const sentimentDelta = effectiveAction === 'BUY' ? 50 + heatScore / 2
      : effectiveAction === 'SELL' ? 50 - Math.abs(heatScore) / 2
      : 50;
    broadcastSentiment(sentimentDelta);

    return { 
      action: effectiveAction || 'HOLD', 
      confidence: effectiveConfidence || 0, 
      price: currentPrice,
      prevClose,
      quantumForcedLiquidation,
      defensiveMode,
      timesFmMeta,
      quantumMeta,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Agent] Analysis failed for ${symbol}: ${msg}`);
    return { action: 'HOLD', confidence: 0 }; 
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

    const taiwanSkillRules = await loadTaiwanSkillRules();
    const driftFromSentiment = ((lastSentimentScore - 50) / 50) * 0.0015;
    const pnlPressure = Math.max(-0.001, Math.min(0.001, (balance.dailyPnl / Math.max(balance.totalAssets, 1)) * 0.35));
    const monteCarlo = riskManager.runMonteCarloRuinAssessment({
      capitalTWD: balance.totalAssets,
      paths: 1000,
      horizonSteps: 30,
      driftPerStep: driftFromSentiment + pnlPressure,
      volatilityPerStep: 0.012 + Math.min(0.02, lossStreakCount * 0.0025),
      ruinThresholdTWD: Math.max(balance.totalAssets * 0.65, balance.totalAssets - agentConfig.maxDailyLossTWD * 5),
    });
    wsBroadcast?.({
      type: 'status',
      data: {
        status: agentStatus,
        config: agentConfig,
        riskStats: {
          ...riskManager.getStats(),
          lossStreakCount,
          monteCarlo,
        },
      },
    });

    // Phase 1: 所有標的並行分析（純讀取，互不干擾）
    const analysisResults = await Promise.allSettled(
      agentConfig.symbols.map(symbol =>
        runAnalysis(agentConfig, symbol).then(signal => ({ symbol, signal }))
      )
    );

    // 主動停損：Phase 2 前先掃描所有持倉，達停損門檻則強制注入 SELL（繞過 LLM 信心度）
    const stopLossPct = agentConfig.params.stopLossPct ?? 0.05;
    for (const settled of analysisResults) {
      if (settled.status !== 'fulfilled') continue;
      const { symbol, signal } = settled.value;
      const track = posTrack.get(symbol);
      if (!track || track.qty <= 0 || !signal.price || signal.price <= 0 || track.avgCost <= 0) continue;
      if (signal.action !== 'SELL') {
        const lossFraction = (signal.price - track.avgCost) / track.avgCost;
        if (lossFraction <= -stopLossPct) {
          signal.action = 'SELL';
          signal.confidence = 100;
          emitLog({ level: 'RISK_CHK', source: 'STOP_LOSS', symbol, message: `🛑 主動停損觸發：現價 ${signal.price.toFixed(2)} / 均成本 ${track.avgCost.toFixed(2)} / 虧損 ${(lossFraction * 100).toFixed(2)}%，強制出場` });
          if (agentConfig.userId) {
            void notifier.dispatch(agentConfig.userId, 'stop_loss_intercept', {
              symbol,
              price: signal.price.toFixed(2),
              reason: `loss ${(lossFraction * 100).toFixed(2)}% <= stopLoss ${((stopLossPct || 0) * 100).toFixed(2)}%`,
            });
          }
        }
      }

      if (
        signal.quantumForcedLiquidation &&
        signal.quantumMeta &&
        track.qty > 0
      ) {
        signal.action = 'SELL';
        signal.confidence = 100;
        emitLog({
          level: 'CRITICAL',
          source: 'QUANTUM',
          symbol,
          message: `⚛️ 量子強制平倉：regime_flip_prob=${signal.quantumMeta.regimeFlipProb.toFixed(3)} / confidence=${signal.quantumMeta.confidence.toFixed(0)}`,
        });
        if (agentConfig.userId) {
          void notifier.dispatch(agentConfig.userId, 'quantum_forced_liquidation', {
            symbol,
            confidence: signal.quantumMeta.confidence,
            regimeFlipProb: signal.quantumMeta.regimeFlipProb.toFixed(3),
            reason: 'high regime flip risk',
          });
        }
      }
    }

    // Phase 2: 循序執行下單（保護 posTrack / lossStreakCount / availableMargin）
    let availableMargin = balance.availableMargin;

    for (const settled of analysisResults) {
      if (
        agentConfig.circuitBreaker?.enabled &&
        lossStreakCount >= (agentConfig.circuitBreaker.maxLossStreak || 3)
      ) {
        activateCooldown(`連損次數已達上限 (${lossStreakCount})`);
        break;
      }

      if (settled.status === 'rejected') {
        emitLog({ level: 'ERROR', source: 'AGENT', symbol: 'UNKNOWN', message: `分析失敗: ${settled.reason}` });
        continue;
      }

      const { symbol, signal } = settled.value;

      if (agentStatus === 'running' && signal.action !== 'HOLD') {
        const threshold = agentConfig.params.AI_LLM?.confidenceThreshold || 65;
        const signalConfidence = Number(signal.confidence ?? 0);
        const signalPrice = Number(signal.price ?? 0);
        const defensiveThreshold = signal.defensiveMode ? threshold + 12 : threshold;
        if (signalConfidence > defensiveThreshold) {
          if (signal.defensiveMode && signal.action === 'BUY') {
            emitLog({
              level: 'MONITOR',
              source: 'QUANTUM',
              symbol,
              message: `🛡️ Regime 防禦模式啟用：跳過 BUY（confidence ${signalConfidence.toFixed(1)}，threshold ${defensiveThreshold}）`,
            });
            continue;
          }
          // 動態計算委託數量：預設每次投入可用資金的 10% 或配置的 maxAllocationPerTrade
          const allocation = agentConfig.params.maxAllocationPerTrade || 0.1;
          const defensiveScale = signal.defensiveMode ? 0.4 : 1;
          const tradeAmount = availableMargin * allocation * defensiveScale;
          const isTaiwanSymbol = /\.(TW|TWO)$/i.test(symbol);

          // 台股使用整張(1000股)；美股允許零股(小數股)
          const targetQty = signalPrice > 0
            ? (isTaiwanSymbol
              ? Math.floor(tradeAmount / (signalPrice * 1000)) * 1000
              : Math.floor((tradeAmount / signalPrice) * 1000) / 1000)
            : 0;

          let finalQty = 0;
          if (signal.action === 'BUY') {
            if (targetQty <= 0) {
              emitLog({ level: 'WARNING', source: 'AGENT', symbol, message: '資金不足或報價異常，無法建立有效下單數量' });
              continue;
            }

            if (isTaiwanSymbol && targetQty < 1000) {
              emitLog({ level: 'WARNING', source: 'AGENT', symbol, message: `資金不足以購買一張股票 (需約 ${(signalPrice * 1000).toFixed(0)} TWD)` });
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

          const twValidation = validateTaiwanOrderBySkill({
            symbol,
            side: signal.action as 'BUY' | 'SELL',
            qty: finalQty,
            price: signalPrice,
            prevClose: signal.prevClose,
            availableMargin,
            rules: taiwanSkillRules,
          });
          if (!twValidation.allowed) {
            emitLog({ level: 'RISK_CHK', source: 'TW_RULE', symbol, message: `🧭 台股規則攔截：${twValidation.reason}` });
            continue;
          }

          // 訂單前置風控檢查
          const riskCheck = riskManager.validateOrder(
            { symbol, side: signal.action as 'BUY' | 'SELL', quantity: finalQty, price: signalPrice },
            balance.totalAssets,
          );
          if (!riskCheck.allowed) {
            emitLog({ level: 'RISK_CHK', source: 'RISK', symbol, message: `🛑 風控攔截：${riskCheck.reason}` });
            if (agentConfig.userId) {
              void notifier.dispatch(agentConfig.userId, 'risk_block', {
                symbol,
                side: signal.action,
                qty: finalQty,
                reason: riskCheck.reason || 'risk block',
              });
            }
            continue;
          }
          if (riskCheck.level === 'WARNING' && riskCheck.reason) {
            emitLog({ level: 'WARNING', source: 'RISK', symbol, message: riskCheck.reason });
          }

          const tradeResult = await executor.executeTrade(agentConfig, {
            symbol,
            side: signal.action as 'BUY' | 'SELL',
            qty: finalQty,
            price: signalPrice,
          });
          if (tradeResult && tradeResult.status === 'FILLED') {
            wsBroadcast?.({
              type: 'trade_executed',
              data: {
                symbol,
                side: signal.action,
                qty: tradeResult.filledQty,
                price: tradeResult.filledPrice,
                timestamp: new Date().toISOString(),
              },
            });
            riskManager.recordTrade(tradeResult.filledQty * tradeResult.filledPrice);
            if (agentConfig.userId) {
              void notifier.dispatch(agentConfig.userId, 'fill', {
                symbol,
                side: signal.action,
                qty: tradeResult.filledQty,
                price: tradeResult.filledPrice,
              });
            }
          }

          // 實戰化斷路器 2: 進階連損判定 (P1 - 深化)
          if (tradeResult && tradeResult.status === 'FILLED') {
            const track = posTrack.get(symbol) || { avgCost: 0, qty: 0 };

            if (signal.action === 'BUY') {
              // 更新平均成本 (此處 posTrack 可能已被 broadcastAccountUpdate 更新，但交易後的精確成本仍建議以此計算)
              const totalQty = track.qty + tradeResult.filledQty;
              const newAvg = (track.qty * track.avgCost + tradeResult.filledQty * tradeResult.filledPrice) / totalQty;
              posTrack.set(symbol, { avgCost: newAvg, qty: totalQty });
              // 扣除已投入資金，供後續標的計算用
              availableMargin -= tradeResult.filledQty * tradeResult.filledPrice;
              emitLog({ level: 'INFO', source: 'AGENT', symbol, message: `持倉更新：均價 ${newAvg.toFixed(2)} | 數量 ${totalQty}` });
            } else if (signal.action === 'SELL') {
              // 計算平倉損益
              const realizedPnL = (tradeResult.filledPrice - track.avgCost) * tradeResult.filledQty;
              riskManager.recordPnl(realizedPnL);
              if (realizedPnL < 0) {
                lossStreakCount++;
                emitLog({ level: 'WARNING', source: 'BREAKER', symbol, message: `🔻 平倉損失：${realizedPnL.toFixed(0)} | 當前連損：${lossStreakCount}` });
              } else {
                lossStreakCount = 0;
                emitLog({ level: 'RISK_CHK', source: 'BREAKER', symbol, message: `✅ 平倉獲利：${realizedPnL.toFixed(0)} | 連損計數已歸零` });
              }

              // 更新剩餘持倉
              const remainQty = Math.max(0, track.qty - tradeResult.filledQty);
              if (remainQty === 0) posTrack.delete(symbol);
              else posTrack.set(symbol, { ...track, qty: remainQty });
            }
            void syncStateToDb();
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
  void syncStateToDb();
  if (tickTimeout) clearTimeout(tickTimeout);
  tickTimeout = setTimeout(() => {
    if (agentStatus === 'cooldown') {
      agentStatus = 'running';
      lossStreakCount = 0;
      agentTick();
      void syncStateToDb();
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
  void syncStateToDb();
  return { ok: true };
}

export function startAgent(c?: any) { 
  if (tickTimeout) clearTimeout(tickTimeout);
  
  if (c) {
    // 若切換到不同的 userId，清空前一個用戶的記憶體狀態，防止跨用戶污染
    const incomingUserId = c.userId as string | undefined;
    if (incomingUserId && incomingUserId !== agentConfig.userId) {
      posTrack = new Map<string, { avgCost: number; qty: number }>();
      lossStreakCount = 0;
      console.log(`[Agent] userId 切換 ${agentConfig.userId ?? 'none'} → ${incomingUserId}，清空 posTrack 與 lossStreakCount`);
    }
    const v = updateAgentConfig(c, true); // silent=true: status broadcast happens after agentStatus = 'running'
    if (!v.ok) return v;
  }
  
  agentStatus = 'running';
  isTickRunning = false; // 重置鎖
  agentTick();
  void syncStateToDb();
  return { ok: true };
}

export function stopAgent() {
  agentStatus = 'stopped';
  if (tickTimeout) clearTimeout(tickTimeout);
  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'ENGINE', message: 'AI 引擎已手動停止' });
  void syncStateToDb();
  return { ok: true };
}

export function updateAgentConfig(patch: any, silent = false) {
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
  // Push updated config to all realtime clients so the UI stays in sync without waiting for the next poll.
  if (!silent) {
    wsBroadcast?.({ type: 'status', data: { status: agentStatus, config: agentConfig } });
  }
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
  if (agentConfig.userId) {
    void notifier.dispatch(agentConfig.userId, 'kill_switch', {
      reason: 'manual emergency kill switch',
    });
  }
  return { ok: true };
}

export function deactivateKillSwitch() {
  riskManager.deactivateKillSwitch();
  emitLog({ level: 'INFO', source: 'SYSTEM', symbol: 'ALL', message: '🟢 緊急停止已解除，可重新啟動引擎。' });
  wsBroadcast?.({ type: 'status', data: { status: agentStatus, config: agentConfig } });
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
        posTrack = new Map<string, { avgCost: number; qty: number }>(
          Object.entries(savedConfig.posTrack || {}) as [string, { avgCost: number; qty: number }][]
        );
        
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


