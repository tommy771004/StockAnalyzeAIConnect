import 'dotenv/config';
import express from 'express';
import expressWs from 'express-ws';
import * as path from 'path';
import * as https from 'https';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import * as TV from './server/services/TradingViewService.js';
import * as TWSE from './server/services/TWSeService.js';
import * as Sectors from './server/services/SectorService.js';
import * as WantGoo from './server/services/WantGooService.js';
import { initCalendar } from './server/services/twCalendar.js';
import { startDailySettlementSchedule } from './server/services/dailySettlement.js';
import { parseSymbol, toYahoo } from './src/utils/symbolParser.js';
import { authMiddleware, setTokenCookie, clearTokenCookie, type AuthRequest } from './server/middleware/auth.js';
import * as usersRepo from './server/repositories/usersRepo.js';
import * as watchlistRepo from './server/repositories/watchlistRepo.js';
import * as positionsRepo from './server/repositories/positionsRepo.js';
import * as tradesRepo from './server/repositories/tradesRepo.js';
import * as alertsRepo from './server/repositories/alertsRepo.js';
import * as settingsRepo from './server/repositories/settingsRepo.js';
import * as strategiesRepo from './server/repositories/strategiesRepo.js';
import * as historyRepo from './server/repositories/portfolioHistoryRepo.js';
import { ordersRepo } from './server/repositories/ordersRepo.js';
import {
  listNotificationSettingsByUser,
  upsertNotificationSettingByTarget,
  deleteNotificationSettingByUser,
  type NotifyEvent,
} from './server/repositories/notificationSettingsRepo.js';
import { calcIndicators } from './server/utils/technical.js';
import { analyzeSentiment } from './server/utils/sentiment.js';
import { agentRouter }    from './server/api/agent.js';
import { ecpayRouter }    from './server/api/ecpay.js';
import { researchRouter } from './server/api/research.js';
import {
  startAutonomousAgent, startAgent, stopAgent, emergencyKillSwitch,
  getAgentStatus, getAgentConfig, getAgentLogs, updateAgentConfig,
  setWsBroadcast, getLossStreakCount, resetCircuitBreaker, deactivateKillSwitch,
  setPrimaryBroker, getPrimaryBrokerId,
} from './server/services/autonomousAgent.js';
import { DEFAULT_AGENT_CONFIG, DEFAULT_RISK_CONFIG, DEFAULT_TRADING_HOURS } from './server/services/autotradingDefaults.js';
import { isTradingSession } from './server/services/tradingSession.js';
import { riskManager } from './server/services/RiskManager.js';
import { simulatedAdapter } from './server/services/brokers/SimulatedAdapter.js';
import { sinopacAdapter } from './server/services/brokers/SinopacAdapter.js';
import { kgiAdapter } from './server/services/brokers/KGIAdapter.js';
import { yuantaAdapter } from './server/services/brokers/YuantaAdapter.js';
import { screenerLimiter, alertsWriteLimiter } from './server/middleware/rateLimiter.js';
import type { ScreenerResultRow } from './src/terminal/types/market.js';
import { callAISimple } from './server/utils/llmPipeline.js';
import { runBacktestWithBestEngine } from './server/services/backtestEngine.js';
import { processCommanderCommand } from './server/services/commanderService.js';
import { runOptimizationScan } from './server/services/optimizerService.js';
import { generateWeeklyReport } from './server/services/reportService.js';
import { getPerformance, type Period as PerformancePeriod } from './server/services/performanceService.js';
import { copyTradingService } from './server/services/copyTradingService.js';
import { notifier } from './server/services/notifier/index.js';
import {
  isAblyEnabled,
  getAutotradingRealtimeMeta,
  createAutotradingToken,
  publishAutotradingEvent,
} from './server/services/ablyRealtime.js';
import { getAutotradingDiagnostics, resetAutotradingDiagnostics } from './server/services/autotradingDiagnostics.js';



// ─── Error helper (Fix #4) ────────────────────────────────────────────────────
// Centralises: (a) `e instanceof Error` narrowing, (b) no raw DB/stack leaks
// in production, (c) consistent { error } response shape.
import type { Response } from 'express';
function handleApiError(res: Response, e: unknown): void {
  const msg = e instanceof Error ? e.message : 'Internal server error';
  const safe = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : msg;
  res.status(500).json({ error: safe });
}

// ─── Constants ────────────────────────────────────────────────────────────────
/** Hard cap on screener input. Allows ETF (~250 codes) + 行業類股 in single scan
 *  while still preventing pathological 10k-symbol DoS attempts. */
const MAX_SCREENER_SYMBOLS = 300;
/** Process screener calls in chunks of N to avoid hammering Yahoo Finance and
 *  exhausting the Node event loop with hundreds of parallel fetches. */
const SCREENER_BATCH_SIZE = 15;

// Lazy-load Neon DB
let dbAvailable = false;
try {
  await import('./src/db/index.js');
  dbAvailable = true;
  // Only start these in non-vercel environments
  if (!process.env.VERCEL) {
    // 修正：異步啟動自動交易引擎並恢復配置 (P1)
    startAutonomousAgent().catch(e => console.error('[AutoAgent] 啟動失敗:', e));
  }
} catch (e) {
  console.warn('[DB] Neon not available. Please set DATABASE_URL in .env to enable persistence:', (e as Error).message);
}

import { getBestFreeModel, getTopFreeModels } from './server/utils/modelSelector.js';
export { getBestFreeModel };
import * as News from './server/services/NewsService.js';

/**
 * Converts various symbol formats to TradingView canonical format
 * Yahoo: 2330.TW -> TradingView: TWSE:2330
 * Yahoo: 8069.TWO -> TradingView: TPEX:8069
 */
function toTradingViewSymbol(input: string): string {
  const sym = input.toUpperCase();
  if (sym.endsWith('.TW')) {
    return `TWSE:${sym.replace('.TW', '')}`;
  }
  if (sym.endsWith('.TWO')) {
    return `TPEX:${sym.replace('.TWO', '')}`;
  }
  // If it's a pure numeric string (Taiwan stock without suffix), default to TWSE
  if (/^\d{4}$/.test(sym)) {
    return `TWSE:${sym}`;
  }
  return sym;
}

// REMOVED: local parseSymbol to fix conflict with import

/**
 * Calls OpenRouter with automatic fallback to other free models on failure
 */
// callAIWithFallback removed — replaced by callAISimple from server/utils/llmPipeline.ts
// (cost-aware-llm-pipeline: model routing, immutable cost tracking, retry, prompt caching)

const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface HistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartOptions {
  interval?: string;
  period1?: string | number;
  period2?: string | number;
}

class NativeYahooApi {
  private static crumb = "";
  private static cookie = "";
  private static crumbFetchedAt = 0;
  private static crumbTtl = 25 * 60 * 1000;
  private static isFetchingCrumb = false;
  private static lastFailedAt = 0;
  private static failureCooldown = 5 * 60 * 1000;

  private static cache = new Map<string, { data: unknown; ts: number }>();
  private static CACHE_TTL = 10 * 60 * 1000;
  private static STALE_TTL = 60 * 60 * 1000;

  private static getCached(key: string): { data: unknown; stale: boolean } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.ts;
    if (age < this.CACHE_TTL) return { data: entry.data, stale: false };
    if (age < this.STALE_TTL) return { data: entry.data, stale: true };
    return null;
  }

  private static setCache(key: string, data: unknown) {
    this.cache.set(key, { data, ts: Date.now() });
  }

  public static async ensureAuth() {
    if (this.crumb && Date.now() - this.crumbFetchedAt < this.crumbTtl) return;
    if (this.lastFailedAt && Date.now() - this.lastFailedAt < this.failureCooldown) {
      throw new Error('Yahoo Finance is currently unavailable (rate limited), please try again later.');
    }
    if (this.isFetchingCrumb) {
      while (this.isFetchingCrumb) await new Promise(r => setTimeout(r, 100));
      if (!this.crumb) throw new Error('Yahoo Finance Auth failed');
      return;
    }

    this.isFetchingCrumb = true;
    try {
      console.log('[NativeYF] Fetching Yahoo Cookie & Crumb...');
      this.cookie = await new Promise<string>((resolve, reject) => {
        const req = https.get('https://finance.yahoo.com/', {
          headers: {
            'User-Agent': UA_CHROME,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          maxHeaderSize: 65536
        }, (res) => {
          const setCookie = res.headers['set-cookie'] || [];
          let foundCookie = "";
          for (const c of setCookie) {
            if (c.includes('A3=') || c.includes('B=')) {
              foundCookie = c.split(';')[0];
              break;
            }
          }
          res.on('data', () => { });
          res.on('end', () => resolve(foundCookie));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Cookie Request Timeout')); });
      });

      const res2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': UA_CHROME,
          'Cookie': this.cookie
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res2.ok) {
        this.crumb = await res2.text();
        this.crumbFetchedAt = Date.now();
        console.log(`[NativeYF] Crumb Fetched Successfully! (${this.crumb})`);
      } else {
        throw new Error(`Crumb Fetch Failed: HTTP ${res2.status}`);
      }
    } catch (err) {
      this.lastFailedAt = Date.now();
      console.error('[NativeYF] Auth Data Fetch Error:', err);
      throw err;
    } finally {
      this.isFetchingCrumb = false;
    }
  }

  private static async fetchApi(url: string) {
    await this.ensureAuth();
    const finalUrl = url.includes('?') ? `${url}&crumb=${this.crumb}` : `${url}?crumb=${this.crumb}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(finalUrl, {
        headers: {
          'User-Agent': UA_CHROME,
          'Cookie': this.cookie,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      if (res.status === 401 || res.status === 403) {
        this.crumb = "";
        throw new Error(`Auth Expired: ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public static async quote(symbols: string | string[]) {
    const syms = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const cacheKey = `quote:${syms}`;
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}`;
    try {
      const data = await this.fetchApi(url);
      const results = data?.quoteResponse?.result || [];
      this.setCache(cacheKey, results);
      return Array.isArray(symbols) ? results : (results[0] || null);
    } catch (err) {
      const cached = this.getCached(cacheKey);
      if (cached) {
        if (cached.stale) console.warn(`[NativeYF] quote: serving stale cache for ${syms}`);
        const results = cached.data as unknown[];
        return Array.isArray(symbols) ? results : (results[0] || null);
      }
      throw err;
    }
  }

  public static async chart(symbol: string, opts: ChartOptions = {}): Promise<{ quotes: HistoricalData[] }> {
    const interval = opts.interval || '1d';
    const getUnixTs = (val: string | number) => {
      const num = Number(val);
      if (!isNaN(num)) return Math.floor(num / (num > 1e11 ? 1000 : 1));
      return Math.floor(new Date(val).getTime() / 1000);
    };
    const p1 = opts.period1 ? getUnixTs(opts.period1) : Math.floor(Date.now() / 1000) - 31536000;
    let url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${p1}`;
    if (opts.period2) {
      url += `&period2=${getUnixTs(opts.period2)}`;
    } else {
      url += `&period2=${Math.floor(Date.now() / 1000)}`;
    }
    const cacheKey = `chart:${symbol}:${interval}:${p1}`;
    try {
      const data = await this.fetchApi(url);
      const result = data?.chart?.result?.[0];
      if (!result || !result.timestamp) return { quotes: [] };
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      const quotes: HistoricalData[] = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i]
      })).filter((q: any): q is HistoricalData => q.close !== null && q.close !== undefined);
      this.setCache(cacheKey, quotes);
      return { quotes };
    } catch (err: any) {
      const msg = String(err.message || '').toUpperCase();
      if (msg.includes('HTTP 422') || msg.includes('HTTP 400')) {
        return { quotes: [] };
      }
      const cached = this.getCached(cacheKey);
      if (cached) {
        if (cached.stale) console.warn(`[NativeYF] chart: serving stale cache for ${symbol}`);
        return { quotes: cached.data as HistoricalData[] };
      }
      throw err;
    }
  }

  public static async search(query: string) {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=15`;
    return await this.fetchApi(url);
  }

  public static async quoteSummary(symbol: string, modules: string[]) {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`;
    const data = await this.fetchApi(url);
    return data?.quoteSummary?.result?.[0] || {};
  }
}

function SMA(data: number[], p: number) {
  const r: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < p - 1) r.push(null);
    else r.push(data.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p);
  }
  return r;
}
function EMA(data: number[], p: number) {
  const r: (number | null)[] = [];
  const k = 2 / (p + 1);
  let e: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (e === null) e = data[i];
    else e = data[i] * k + e * (1 - k);
    r.push(e);
  }
  return r;
}
function RSI(data: number[], p: number = 14) {
  const rsi: (number | null)[] = [null];
  for (let i = 1; i < data.length; i++) {
    let up = 0, dn = 0;
    const start = Math.max(0, i - p);
    for (let j = start + 1; j <= i; j++) {
      const d = data[j] - data[j - 1];
      if (d > 0) up += d; else dn -= d;
    }
    rsi.push(dn === 0 ? 100 : 100 - 100 / (1 + up / dn));
  }
  return rsi;
}

function runBacktestLogic(
  quotes: HistoricalData[],
  strategy: string,
  initialCapital: number,
  paramPack?: unknown,
) {
  const closes = quotes.map(q => q.close);
  const dates = quotes.map(q => q.date.toISOString().split('T')[0]);
  const signals: (1 | -1 | 0)[] = new Array(quotes.length).fill(0);
  const params = (() => {
    if (typeof paramPack === 'string' && paramPack.trim()) {
      try { return JSON.parse(paramPack); } catch { return {}; }
    }
    if (paramPack && typeof paramPack === 'object') return paramPack as Record<string, any>;
    return {};
  })();
  const clampNum = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  if (strategy === 'ma_crossover') {
    const base = clampNum(params?.BOLLINGER_BREAKOUT?.period, 30, 10, 200);
    const shortPeriod = clampNum(Math.round(base / 2), 10, 3, base - 1);
    const longPeriod = clampNum(base, 30, shortPeriod + 1, 240);
    const s10 = SMA(closes, shortPeriod);
    const s30 = SMA(closes, longPeriod);
    for (let i = 1; i < quotes.length; i++) {
      if (s10[i - 1]! <= s30[i - 1]! && s10[i]! > s30[i]!) signals[i] = 1;
      else if (s10[i - 1]! >= s30[i - 1]! && s10[i]! < s30[i]!) signals[i] = -1;
    }
  } else if (strategy === 'rsi') {
    const rsiPeriod = clampNum(params?.RSI_REVERSION?.period, 14, 2, 200);
    const oversold = clampNum(params?.RSI_REVERSION?.oversold, 35, 1, 60);
    const overbought = clampNum(params?.RSI_REVERSION?.overbought, 65, 40, 99);
    const rsi = RSI(closes, rsiPeriod);
    for (let i = 1; i < quotes.length; i++) {
      if (rsi[i - 1]! < oversold && rsi[i]! >= oversold) signals[i] = 1;
      else if (rsi[i - 1]! > overbought && rsi[i]! <= overbought) signals[i] = -1;
    }
  } else if (strategy === 'macd') {
    const fast = clampNum(params?.MACD_CROSS?.fast, 12, 2, 80);
    const slow = clampNum(params?.MACD_CROSS?.slow, 26, fast + 1, 240);
    const signalPeriod = clampNum(params?.MACD_CROSS?.signal, 9, 2, 60);
    const e12 = EMA(closes, fast);
    const e26 = EMA(closes, slow);
    const macd = e12.map((v, i) => (v !== null && e26[i] !== null) ? v! - e26[i]! : null);
    const signal = EMA(macd.filter(v => v !== null) as number[], signalPeriod);
    const hist = macd.map((v, i) => {
      const sIdx = i - (macd.length - signal.length);
      return (v !== null && sIdx >= 0) ? v! - signal[sIdx]! : null;
    });
    for (let i = 1; i < quotes.length; i++) {
      if (hist[i - 1]! <= 0 && hist[i]! > 0 && macd[i]! > 0) signals[i] = 1;
      else if (hist[i - 1]! >= 0 && hist[i]! < 0) signals[i] = -1;
    }
  } else {
    const e8 = EMA(closes, 8);
    const e21 = EMA(closes, 21);
    for (let i = 1; i < quotes.length; i++) {
      if (e8[i]! > e21[i]! * 1.01) signals[i] = 1;
      else if (e8[i]! < e21[i]!) signals[i] = -1;
    }
  }

  let balance = initialCapital;
  let shares = 0;
  const trades: any[] = [];
  const equityCurve: any[] = [];
  let entryPrice = 0;
  let entryCost = 0;
  let entryTime = '';
  const benchStart = closes[0];

  for (let i = 0; i < quotes.length; i++) {
    const price = closes[i];
    const date = dates[i];
    if (signals[i] === 1 && shares === 0) {
      const maxShares = Math.floor(balance / (price * 1.001425));
      if (maxShares > 0) {
        const tradeValue = maxShares * price;
        const commission = Math.max(20, tradeValue * 0.001425);
        shares = maxShares;
        balance -= tradeValue + commission;
        entryPrice = price;
        entryCost = tradeValue + commission;
        entryTime = date;
      }
    } else if (signals[i] === -1 && shares > 0) {
      const tradeValue = shares * price;
      const commission = Math.max(20, tradeValue * 0.001425);
      const tax = tradeValue * 0.003;
      const proceeds = tradeValue - commission - tax;
      const pnl = proceeds - entryCost;
      const pnlPct = ((price / entryPrice) - 1) * 100;
      trades.push({
        entryTime, exitTime: date,
        entryPrice, exitPrice: price,
        amount: shares,
        holdDays: Math.floor((new Date(date).getTime() - new Date(entryTime).getTime()) / 86400000),
        pnl: Number(pnl.toFixed(2)), pnlPct: Number(pnlPct.toFixed(2)),
        result: pnl > 0 ? 'WIN' : 'LOSS'
      });
      balance += proceeds;
      shares = 0;
      entryCost = 0;
    }
    const currentEquity = balance + (shares * price);
    equityCurve.push({
      date,
      portfolio: Number(((currentEquity / initialCapital - 1) * 100).toFixed(2)),
      benchmark: Number(((price / benchStart - 1) * 100).toFixed(2))
    });
  }

  const roi = Number((((balance + shares * closes[closes.length - 1]) / initialCapital - 1) * 100).toFixed(2));
  const winRate = trades.length > 0 ? Number(((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(2)) : 0;

  let maxEquity = -Infinity;
  let maxDD = 0;
  const drawdownCurve = equityCurve.map(e => {
    const val = e.portfolio + 100;
    if (val > maxEquity) maxEquity = val;
    const dd = ((maxEquity - val) / maxEquity) * 100;
    if (dd > maxDD) maxDD = dd;
    return { date: e.date, value: Number(dd.toFixed(2)) };
  });

  // Sharpe ratio from daily equity returns, annualised √252
  let sharpe = 0;
  if (equityCurve.length >= 2) {
    const dailyRets: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].portfolio + 100;
      const curr = equityCurve[i].portfolio + 100;
      if (prev > 0) dailyRets.push((curr - prev) / prev);
    }
    if (dailyRets.length >= 2) {
      const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
      const variance = dailyRets.reduce((a, r) => a + (r - mean) ** 2, 0) / (dailyRets.length - 1);
      const std = Math.sqrt(variance);
      sharpe = std > 0 ? Number(((mean / std) * Math.sqrt(252)).toFixed(2)) : 0;
    }
  }

  // Profit factor and avg win/loss
  const winPnls = trades.filter(t => t.pnl > 0).map(t => t.pnl);
  const lossPnls = trades.filter(t => t.pnl < 0).map(t => t.pnl);
  const grossWin = winPnls.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossPnls.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : Number((grossWin / grossLoss).toFixed(2));
  const avgWin = winPnls.length > 0 ? Number((grossWin / winPnls.length / initialCapital * 100).toFixed(2)) : 0;
  const avgLoss = lossPnls.length > 0 ? Number((grossLoss / lossPnls.length / initialCapital * 100).toFixed(2)) : 0;

  return {
    metrics: { roi, sharpe, maxDrawdown: Number(maxDD.toFixed(2)), winRate, totalTrades: trades.length, avgWin, avgLoss, profitFactor },
    equityCurve, drawdownCurve, trades
  };
}

export const app = express();
const wsInstance = expressWs(app);
const PORT = 3000;

app.use(cors());
app.use(express.json());

const rtMeta = getAutotradingRealtimeMeta();
console.log(
  `[AutoTrading Realtime] provider=${rtMeta.provider} ably.enabled=${rtMeta.ably.enabled} channel=${rtMeta.ably.channel}` +
  (rtMeta.ably.reason ? ` reason=${rtMeta.ably.reason}` : '')
);

const lastPrices = new Map<string, number>();

function isMarketOpen(symbol: string): boolean {
  const now = new Date();
  const tpeDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const tpeDay = tpeDate.getDay();
  const tpeHour = tpeDate.getHours();
  const tpeMin = tpeDate.getMinutes();
  const isTpeWeekend = (tpeDay === 0 || tpeDay === 6);
  if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) {
    if (isTpeWeekend) return false;
    const totalMinutes = tpeHour * 60 + tpeMin;
    return totalMinutes >= (9 * 60) && totalMinutes < (13 * 60 + 30);
  }
  const nyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nyDay = nyDate.getDay();
  const nyHour = nyDate.getHours();
  const nyMin = nyDate.getMinutes();
  const isNyWeekend = (nyDay === 0 || nyDay === 6);
  if (isNyWeekend) return false;
  const totalNyMinutes = nyHour * 60 + nyMin;
  return totalNyMinutes >= (9 * 60 + 30) && totalNyMinutes < (16 * 60);
}

(app as any).ws('/ws', (ws) => {
  const subs = new Set<string>();
  ws.on('message', (msg: string) => {
    try {
      const data = JSON.parse(msg);
      if (data.action === 'subscribe') {
        subs.add(data.symbol);
        if (!lastPrices.has(data.symbol)) lastPrices.set(data.symbol, 150 + Math.random() * 500);
      } else if (data.action === 'unsubscribe') {
        subs.delete(data.symbol);
      }
    } catch { }
  });
  const timer = setInterval(() => {
    if (ws.readyState !== 1) return clearInterval(timer);
    subs.forEach(sym => {
      if (!isMarketOpen(sym)) return;
      let price = lastPrices.get(sym) || 200;
      const change = (Math.random() - 0.5) * (price * 0.0005);
      price += change;
      lastPrices.set(sym, price);
      ws.send(JSON.stringify({ type: 'tick', symbol: sym, price: Number(price.toFixed(2)), vol: Math.floor(Math.random() * 100) + 1, t: Date.now() }));
    });
  }, 1000);
  ws.on('close', () => clearInterval(timer));
});

// ─── AutoTrading WebSocket ─────────────────────────────────────────────────
const autotradingWsClients = new Set<any>();

setWsBroadcast((data: unknown) => {
  const msg = JSON.stringify(data);
  autotradingWsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
  // Managed realtime bridge (Ably) for environments where raw WS upgrades are limited.
  void publishAutotradingEvent(data);
});

(app as any).ws('/ws/autotrading', (ws: any) => {
  autotradingWsClients.add(ws);

  // 連線後立即推送當前狀態
  ws.send(JSON.stringify({ type: 'status', data: { status: getAgentStatus(), config: getAgentConfig(), riskStats: riskManager.getStats() } }));
  const recentLogs = getAgentLogs(50);
  if (recentLogs.length > 0) ws.send(JSON.stringify({ type: 'log_history', data: recentLogs }));

  ws.on('close', () => autotradingWsClients.delete(ws));
  ws.on('error', () => autotradingWsClients.delete(ws));
});

// ─── AutoTrading REST API ─────────────────────────────────────────────────────

app.get('/api/autotrading/realtime/meta', authMiddleware, (_req, res) => {
  res.json(getAutotradingRealtimeMeta());
});

app.get('/api/autotrading/ably/token', authMiddleware, async (req: AuthRequest, res) => {
  if (!isAblyEnabled()) {
    const meta = getAutotradingRealtimeMeta();
    return res.status(501).json({
      error: meta.ably.reason || 'Ably is not configured on server',
    });
  }
  try {
    const clientId = req.userId ? `user:${req.userId}` : undefined;
    const token = await createAutotradingToken(clientId);
    res.json(token);
  } catch (e) {
    // Surface upstream Ably error (config/permissions). The detail is not
    // sensitive — it explains misconfiguration so the UI can guide the user.
    const msg = e instanceof Error ? e.message : 'Ably token request failed';
    console.warn('[AutoTrading Ably] token error:', msg);
    res.status(502).json({ error: msg, hint: 'Check ABLY_API_KEY value/format on the server.' });
  }
});

app.get('/api/autotrading/status', authMiddleware, (_req, res) => {
  res.json({
    status: getAgentStatus(),
    config: getAgentConfig(),
    riskStats: {
      ...riskManager.getStats(),
      lossStreakCount: getLossStreakCount()
    },
  });
});

app.post('/api/autotrading/status/reset', authMiddleware, (_req, res) => {
  const result = resetCircuitBreaker();
  res.json(result);
});

app.post('/api/autotrading/start', authMiddleware, (req: AuthRequest, res) => {
  const cfg = req.body ?? {};
  if (req.userId) cfg.userId = req.userId; // 注入使用者 ID 以利持久化 (P1)
  const result = startAgent(cfg);
  res.json(result);
});

app.post('/api/autotrading/stop', authMiddleware, (_req, res) => {
  const result = stopAgent();
  res.json(result);
});

app.post('/api/autotrading/kill-switch', authMiddleware, (_req, res) => {
  const result = emergencyKillSwitch();
  res.json(result);
});

// Telegram Webhook for quick liquidation
app.post('/api/webhook/telegram', async (req, res) => {
  try {
    const { callback_query } = req.body;
    if (callback_query && callback_query.data === 'action_kill_switch') {
      const result = emergencyKillSwitch();
      console.log('[TelegramWebhook] 收到強平指令:', result);
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('[TelegramWebhook] Error:', e);
    res.status(500).send('Error');
  }
});

app.post('/api/autotrading/kill-switch/release', authMiddleware, (_req, res) => {
  const result = deactivateKillSwitch();
  res.json(result);
});

app.get('/api/autotrading/defaults', authMiddleware, (_req, res) => {
  res.json({
    config: DEFAULT_AGENT_CONFIG,
    risk: DEFAULT_RISK_CONFIG,
    tradingHours: DEFAULT_TRADING_HOURS,
  });
});

app.get('/api/autotrading/diagnostics', authMiddleware, (req: AuthRequest, res) => {
  const requestedWindow = Number(req.query.windowMinutes ?? 60);
  const symbolFilter = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
  const diagnostics = getAutotradingDiagnostics(requestedWindow, symbolFilter);
  res.json({ ok: true, diagnostics });
});

app.post('/api/autotrading/diagnostics/reset', authMiddleware, (_req, res) => {
  const result = resetAutotradingDiagnostics();
  res.json({ ok: true, result });
});

app.get('/api/autotrading/session', authMiddleware, (req: AuthRequest, res) => {
  const symbols = String(req.query.symbols ?? '2330.TW').split(',').map(s => s.trim()).filter(Boolean);
  const cfg = getAgentConfig();
  const result = symbols.map(s => ({ symbol: s, ...isTradingSession(s, cfg.tradingHours) }));
  res.json({ ok: true, sessions: result });
});

app.get('/api/autotrading/config', authMiddleware, (_req, res) => {
  res.json(getAgentConfig());
});

app.put('/api/autotrading/config', authMiddleware, (req: AuthRequest, res) => {
  if (req.userId) req.body.userId = req.userId; // 注入使用者 ID (P1)
  updateAgentConfig(req.body);
  res.json({ ok: true, config: getAgentConfig() });
});

app.get('/api/autotrading/logs', authMiddleware, (req: AuthRequest, res) => {
  const limit = parseInt(String(req.query.limit ?? '100'));
  res.json(getAgentLogs(limit));
});

app.get('/api/autotrading/positions', authMiddleware, async (_req, res) => {
  try {
    const positions = await simulatedAdapter.getPositions();
    res.json(positions);
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/balance', authMiddleware, async (_req, res) => {
  try {
    const balance = await simulatedAdapter.getBalance();
    res.json(balance);
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/orders', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId ?? 'mock-user-id';
    const openOnly = req.query.open === '1';
    const list = openOnly 
      ? await ordersRepo.listOpenByUser(userId)
      : await ordersRepo.listByUser(userId, 50);
    res.json({ ok: true, orders: list });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/performance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId ?? 'mock-user-id';
    const period = (req.query.period as PerformancePeriod) || '1m';
    const result = await getPerformance(userId, period);
    res.json(result);
  } catch (e) {
    handleApiError(res, e);
  }
});

app.post('/api/autotrading/orders/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.userId ?? 'mock-user-id';
    const order = await ordersRepo.findByIdForUser(id, userId);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
    
    // In a real system, we would call broker.cancelOrder() here.
    await ordersRepo.cancel(id, 'User requested cancellation');
    res.json({ ok: true });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/broker/status', authMiddleware, (_req, res) => {
  const cfg = getAgentConfig();
  const brokerBridgeUrl =
    process.env.BROKER_BRIDGE_URL ??
    process.env.SINOPAC_BRIDGE_URL ??
    process.env.KGI_BRIDGE_URL ??
    'http://127.0.0.1:18080';
  res.json({
    ok: true,
    config: {
      brokerId: getPrimaryBrokerId(),
      accountId: '',
      mode: cfg.mode,
    },
    bridgeUrl: brokerBridgeUrl,
  });
});

app.post('/api/autotrading/broker/connect', authMiddleware, async (req: AuthRequest, res) => {
  const { brokerId, apiKey, apiSecret, certPath, certPassphrase, accountId, mode, bridgeUrl } = req.body ?? {};
  const adapters = {
    simulated: simulatedAdapter,
    sinopac: sinopacAdapter,
    kgi: kgiAdapter,
    yuanta: yuantaAdapter,
  } as const;

  const adapter = adapters[brokerId as keyof typeof adapters];
  if (!adapter) {
    return res.status(400).json({
      ok: false,
      message: `Unsupported brokerId: ${brokerId}`,
    });
  }

  try {
    const result = await adapter.connect({
      brokerId,
      apiKey,
      apiSecret,
      certPath,
      certPassphrase,
      accountId,
      bridgeUrl,
      mode: (mode === 'real' ? 'real' : 'simulated'),
    });
    if (result?.ok) {
      setPrimaryBroker(brokerId);
    }
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'broker connect failed';
    return res.status(500).json({
      ok: false,
      message: msg,
      requiresLocalSetup: brokerId !== 'simulated',
    });
  }
});

app.post('/api/autotrading/backtest', authMiddleware, async (req: AuthRequest, res) => {
  const { symbol, period, config } = req.body;
  try {
    // 修正: NativeYahooApi 返回的格式是 { quotes: [...] }
    const historyData = await NativeYahooApi.chart(symbol, { 
      period1: Math.floor(Date.now() / 1000) - (period || 180) * 86400,
      interval: '1d' 
    });
    
    // 直接使用 quotes 陣列，並確保格式正確
    const quotes = historyData.quotes.map((q: any) => ({
      date: q.date instanceof Date ? q.date.toISOString() : q.date,
      close: q.close
    })).filter((q: any) => q.close != null);

    const result = await runBacktestWithBestEngine(symbol, quotes, config);

    res.json({ ok: true, data: result });
  } catch (e) {
    handleApiError(res, e);
  }
});


app.post('/api/autotrading/command', authMiddleware, async (req: AuthRequest, res) => {
  const { command } = req.body;
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await processCommanderCommand(req.userId, command);
  res.json(result);
});

app.post('/api/autotrading/optimize', authMiddleware, async (req: AuthRequest, res) => {
  const { symbol, period } = req.body;
  try {
    const historyData = await NativeYahooApi.chart(symbol, { 
      period1: Math.floor(Date.now() / 1000) - (period || 60) * 86400,
      interval: '1d' 
    });
    const quotes = historyData.quotes.map((q: any) => ({
      date: q.date,
      close: q.close
    })).filter((q: any) => q.close != null);

    const proposal = await runOptimizationScan(symbol, quotes);
    res.json({ ok: true, proposal });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/report', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const report = await generateWeeklyReport(req.userId);
    res.json({ ok: true, report });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/followers', authMiddleware, (_req, res) => {
  res.json({ ok: true, followers: copyTradingService.getFollowers() });
});

app.get('/api/autotrading/performance', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  const allowedPeriods = new Set<PerformancePeriod>(['1d', '1w', '1m', '3m', 'ytd', 'all']);
  const periodRaw = String(req.query.period ?? '1m') as PerformancePeriod;
  const period = allowedPeriods.has(periodRaw) ? periodRaw : '1m';

  try {
    const result = await getPerformance(req.userId, period);
    res.json(result);
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/orders', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  const openOnly = String(req.query.open ?? '0') === '1';

  try {
    const rows = openOnly
      ? await ordersRepo.listOpenByUser(req.userId)
      : await ordersRepo.listByUser(req.userId, 200);

    const normalized = rows.map((row) => {
      const ext = row as unknown as {
        filledQty?: number | string;
        avgFillPrice?: number | string | null;
        retryCount?: number;
      };
      const qtyNum = Number(row.qty ?? 0);
      const status = String(row.status ?? 'PENDING').toUpperCase();
      const filledQty = Number(ext.filledQty ?? 0);
      const normalizedFilledQty = Number.isFinite(filledQty) && filledQty > 0
        ? filledQty
        : (status === 'FILLED' ? qtyNum : 0);
      const avgFillPrice = ext.avgFillPrice ?? (status === 'FILLED' ? row.price : null);

      return {
        id: row.id,
        brokerOrderId: row.brokerOrderId ?? null,
        symbol: row.symbol,
        side: row.side,
        qty: row.qty,
        price: row.price,
        status,
        filledQty: normalizedFilledQty,
        avgFillPrice,
        retryCount: Number(ext.retryCount ?? 0) || 0,
        lastError: row.lastError ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      };
    });

    res.json({ ok: true, orders: normalized });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.post('/api/autotrading/orders/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid order id' });

  try {
    const order = await ordersRepo.findByIdForUser(id, req.userId);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

    const status = String(order.status ?? '').toUpperCase();
    if (status !== 'PENDING' && status !== 'PARTIAL') {
      return res.status(400).json({ ok: false, error: `Order is not cancellable (${status})` });
    }

    if (order.brokerOrderId) {
      try {
        await simulatedAdapter.cancelOrder(order.brokerOrderId);
      } catch {
        // ignore adapter cancellation failure and still mark local lifecycle to cancelled
      }
    }

    await ordersRepo.cancel(id, 'User requested cancellation');
    res.json({ ok: true, message: 'Order cancelled' });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/autotrading/notifications', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const settings = await listNotificationSettingsByUser(req.userId);
    res.json({
      ok: true,
      settings: settings.map((s) => ({
        id: s.id,
        channel: s.channel,
        target: s.target,
        enabled: s.enabled,
        triggers: Array.isArray(s.triggers) ? s.triggers : [],
      })),
    });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.put('/api/autotrading/notifications', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  const channel = String(req.body?.channel ?? '').trim();
  const target = String(req.body?.target ?? '').trim();
  const rawTriggers = Array.isArray(req.body?.triggers) ? req.body.triggers : [];

  const allowedChannels = new Set(['telegram', 'discord', 'webhook', 'email']);
  const allowedTriggers = new Set<NotifyEvent>([
    'kill_switch',
    'risk_block',
    'fill',
    'daily_report',
    'stop_loss_intercept',
    'quantum_forced_liquidation',
  ]);
  const triggers = rawTriggers
    .map((x: unknown) => String(x))
    .filter((x: string): x is NotifyEvent => allowedTriggers.has(x as NotifyEvent));

  if (!allowedChannels.has(channel)) return res.status(400).json({ ok: false, error: 'Unsupported channel' });
  if (!target) return res.status(400).json({ ok: false, error: 'target is required' });
  if (triggers.length === 0) return res.status(400).json({ ok: false, error: 'At least one trigger is required' });

  try {
    const setting = await upsertNotificationSettingByTarget(req.userId, {
      channel,
      target,
      triggers,
      enabled: true,
    });
    res.json({
      ok: true,
      setting: {
        id: setting.id,
        channel: setting.channel,
        target: setting.target,
        enabled: setting.enabled,
        triggers: Array.isArray(setting.triggers) ? setting.triggers : [],
      },
    });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.delete('/api/autotrading/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!dbAvailable) return res.status(503).json({ error: 'Database unavailable' });

  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid id' });

  try {
    const deleted = await deleteNotificationSettingByUser(req.userId, id);
    if (!deleted) return res.status(404).json({ ok: false, error: 'Setting not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.post('/api/autotrading/notifications/test', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const channel = String(req.body?.channel ?? '').trim();
  const target = String(req.body?.target ?? '').trim();
  if (!channel || !target) return res.status(400).json({ ok: false, error: 'channel and target are required' });

  try {
    const result = await notifier.test(channel, target);
    res.json(result);
  } catch (e) {
    handleApiError(res, e);
  }
});



app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), vercel: !!(process.env.VERCEL || process.env.VERCEL_ENV), node: process.version, db: dbAvailable });
});

app.post('/api/ai/call', authMiddleware, async (req: AuthRequest, res) => {
  const { prompt, model, jsonMode } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    res.status(500).json({ error: 'AI service configuration error: Missing API Key.' });
    return;
  }

  try {
    const text = await callAISimple(prompt, jsonMode, req.userId, 'free', model);
    res.json({ text });
  } catch (e: any) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/ai/research', authMiddleware, async (req: AuthRequest, res) => {
  const { query } = req.body;
  if (!query) { res.status(400).json({ error: 'query required' }); return; }
  
  try {
    const { searchArxiv } = await import('./server/utils/scienceService.js');
    const arxivData = await searchArxiv(query, 3);
    
    let context = '';
    if (arxivData && arxivData.status === 'success' && arxivData.data) {
      context = arxivData.data.map((p: any) => `Title: ${p.title}\\nSummary: ${p.summary}`).join('\\n\\n');
    }

    const prompt = `你是一個專業的量化金融研究員。使用者詢問：「${query}」。
請嘗試協助他解答。
以下是從 arXiv 搜尋到的最新相關論文摘要作為參考：
${context || '無直接相關論文'}

請總結這些研究，並根據你的知識，嘗試提供可行的量化策略邏輯或參數設定建議。`;

    const text = await callAISimple(prompt, false, req.userId, 'free');
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


app.get('/api/ai/summarize/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const sym = req.params.symbol;
  const tvSym = toTradingViewSymbol(sym);
  console.log(`[AI] Generating summary for ${sym} (TV Symbol: ${tvSym})...`);

  try {
    const [quoteRes, newsRes, tvOverview, tvIndicators, wantGooRes] = await Promise.allSettled([
      NativeYahooApi.quote(toYahoo(sym)),
      NativeYahooApi.search(toYahoo(sym)),
      TV.getOverview(tvSym),
      TV.getIndicators(tvSym),
      WantGoo.getChipData(sym)
    ]);

    const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
    const newsData = newsRes.status === 'fulfilled' ? (newsRes.value as any) : null;
    const news = Array.isArray(newsData?.news) ? newsData.news : [];
    
    // Flatten nested TV responses
    const tvO = tvOverview.status === 'fulfilled' ? (tvOverview.value as any)?.data || tvOverview.value : null;
    const tvI = tvIndicators.status === 'fulfilled' ? (tvIndicators.value as any)?.data || tvIndicators.value : null;
    const chip = wantGooRes.status === 'fulfilled' ? (wantGooRes.value as any) : null;

    const newsText = news.length > 0 
      ? news.slice(0, 3).map((n: any) => `- ${n.title || n.headline || '無標題'}`).join('\n')
      : '無近期相關新聞';
    const techText = tvI ? JSON.stringify(tvI).slice(0, 500) : '無技術指標數據';
    
    let chipText = '無籌碼面數據';
    if (chip) {
      chipText = `主力買賣超: ${chip.mainPlayersNet}張, 外資: ${chip.foreignNet}張, 投信: ${chip.trustNet}張, 5日集中度: ${chip.concentration5d}%, 1000張大戶持股比: ${chip.holder1000Pct}%`;
    }

    const prompt = `你是一位專業的金融分析師。請針對 ${sym} 提供深入的 AI 摘要分析。
市場數據：現價 ${quote?.regularMarketPrice || tvO?.close || 'N/A'}，漲跌幅 ${quote?.regularMarketChangePercent || 'N/A'}%。
公司概況：${tvO?.description || '無描述'}。
技術指標摘要：${techText}。
籌碼面資料：${chipText}。
最近新聞：
${newsText}

請提供：
1. 營運狀況簡評
2. 技術面分析（根據指標）
3. 籌碼面分析（分析主力與法人動向）
4. 投資建議（看多/看空/中立）與理由。
請以繁體中文回答，維持專業、簡潔的風格。`;

    const resultText = await callAISimple(prompt, false, req.userId, 'free', req.query.model as string);
    console.log(`[AI] Summary generated successfully (${resultText.length} chars).`);
    res.json({ text: resultText });
  } catch (e: any) {
    console.error(`[AI] Summarize Error for ${sym}:`, e);
    const errMsg = e instanceof Error ? e.message : String(e);
    
    // Pass through 402 Payment Required status
    const status = errMsg.includes('402') ? 402 : 500;
    
    res.status(status).json({ 
      error: `AI 摘要生成失敗: ${errMsg}`,
      symbol: sym,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'password must be at least 8 characters' }); return; }
  try {
    const existing = await usersRepo.findUserByEmail(email);
    if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await usersRepo.createUser({ email, passwordHash, name: name ?? null });
    setTokenCookie(res, user.id);
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, tier: user.subscriptionTier } });
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return; }
  try {
    const user = await usersRepo.findUserByEmail(email);
    if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    setTokenCookie(res, user.id);
    res.json({ user: { id: user.id, email: user.email, name: user.name, tier: user.subscriptionTier } });
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await usersRepo.findUserById(req.userId!);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user.id, email: user.email, name: user.name, tier: user.subscriptionTier });
  } catch (e) { handleApiError(res, e); }
});

app.put('/api/auth/update', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    const user = await usersRepo.updateUser(req.userId!, { name });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user.id, email: user.email, name: user.name, tier: user.subscriptionTier });
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/auth/logout', (_req, res) => {
  clearTokenCookie(res);
  res.json({ ok: true });
});

app.get('/api/stock/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try { const q = await NativeYahooApi.quote(req.params.symbol as string); res.json(q); }
  catch (e) { handleApiError(res, e); }
});

app.get('/api/stock/:symbol/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const symbol = req.params.symbol as string;
    const opts = req.query as Record<string, string>;
    const interval = (opts.interval ?? '1d') as string;

    let q = await NativeYahooApi.chart(symbol, opts);

    // 對於台股 .TW / .TWO，Yahoo 的 1m 短線常 422，給定回退順序：1m → 5m → 1d
    if ((!q.quotes || q.quotes.length === 0) && /\.(TW|TWO)$/i.test(symbol)) {
      const fallbackChain: string[] = interval === '1m'
        ? ['5m', '1d']
        : interval === '5m' || interval === '15m'
          ? ['1d']
          : [];

      for (const fb of fallbackChain) {
        try {
          // Use a wider lookback so daily/intraday fallbacks have data
          const fallbackPeriod = fb === '1d'
            ? String(Date.now() - 90 * 24 * 3600 * 1000)
            : String(Date.now() - 5 * 24 * 3600 * 1000);
          q = await NativeYahooApi.chart(symbol, { ...opts, interval: fb, period1: fallbackPeriod });
          if (q.quotes && q.quotes.length > 0) {
            console.warn(`[history] ${symbol}: ${interval} empty → falling back to ${fb}`);
            break;
          }
        } catch (e) {
          console.warn(`[history] ${symbol} fallback ${fb} failed:`, (e as Error).message);
        }
      }
    }

    res.json(q.quotes);
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/quotes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const syms = (req.query.symbols as string)?.split(',') || [];
    const results = await NativeYahooApi.quote(syms);
    res.json(Array.isArray(results) ? results : [results]);
  } catch (e) { handleApiError(res, e); }
});

// IMPORTANT: /api/news/feed must be declared BEFORE /api/news/:symbol,
// otherwise Express routes "feed" as a `:symbol` and the feed endpoint is shadowed.
app.get('/api/news/feed', authMiddleware, async (req, res) => {
  const category = (req.query.category as string) || '焦點';
  try {
    const collected: News.NewsItem[] = [];

    // 1. 美股 / 國際 → 先試 TradingView 全球新聞 (英文素材豐富，但 scraper 可能下線)
    if (category === '美股' || category === '國際') {
      try {
        const tvNews = await TV.getGlobalNewsFeed(category);
        if (tvNews && tvNews.length > 0) {
          return res.json(tvNews.map(item => ({
            id: item.id || item.storyPath,
            title: item.title,
            source: item.source,
            published: item.published,
            link: item.storyPath ? `https://www.tradingview.com${item.storyPath}` : '',
            providerPublishTime: item.published
          })));
        }
      } catch (tvErr) {
        // TV scraper 可能 503 / 服務未啟動，靜默退到下一個來源
        console.warn('[NewsFeed] TV global feed failed, falling back to cnyes:', (tvErr as Error).message);
      }
    }

    // 2. 中文新聞優先序：cnyes (鉅亨網 公開 API) → WantGoo
    const cnyesNews = await News.getCnyesNews(category).catch(err => {
      console.warn('[NewsFeed] cnyes failed:', err?.message ?? err);
      return [] as News.NewsItem[];
    });
    if (cnyesNews?.length) collected.push(...cnyesNews);

    if (collected.length === 0) {
      const wgNews = await News.getWantGooNews(category).catch(err => {
        console.warn('[NewsFeed] WantGoo failed:', err?.message ?? err);
        return [] as News.NewsItem[];
      });
      if (wgNews?.length) collected.push(...wgNews);
    }

    // 3. 最後備援：Yahoo Finance 搜尋 (要求 crumb auth，不一定能用)
    if (collected.length === 0) {
      let yahooQuery = 'Market';
      if (category === '台股') yahooQuery = '台灣股市 新聞';
      else if (category === '美股') yahooQuery = 'US Stock News';
      else if (category === '理財') yahooQuery = '個人理財 投資';
      else if (category === '國際') yahooQuery = 'International Business';

      try {
        const data = await NativeYahooApi.search(yahooQuery);
        return res.json(data.news || []);
      } catch (yErr) {
        console.warn('[NewsFeed] Yahoo fallback failed:', (yErr as Error).message);
        return res.json([]);
      }
    }

    res.json(collected);
  } catch (e) {
    console.error('[NewsFeed] Unhandled error:', e);
    // 最壞情況：永遠不要回 500，否則前端的 News fetch 會直接拋錯。
    res.json([]);
  }
});

app.get('/api/news/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try { const data = await NativeYahooApi.search(req.params.symbol as string); res.json(data.news || []); }
  catch (e) { handleApiError(res, e); }
});

app.post('/api/ai/news-analyze', authMiddleware, async (req: AuthRequest, res) => {
  const { title, content, articleId } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    let fullContent = content || '';
    
    // If no content but we have an articleId, try to fetch it
    if (!fullContent && articleId && /^\d+$/.test(articleId)) {
      fullContent = await News.getNewsContent(articleId);
    }

    const prompt = `你是一位專業的金融分析師。請針對以下新聞提供深入的 AI 摘要與市場影響分析。
新聞標題：${title}
新聞內容：${fullContent || '（僅提供標題）'}

請提供：
1. 重點摘要（3點以內）
2. 市場影響分析（對相關產業或大盤的潛在影響）
3. 投資者觀察重點
請以繁體中文回答，維持專業、簡潔的風格。`;

    const resultText = await callAISimple(prompt, false, req.userId, 'free');
    res.json({ text: resultText });
  } catch (e) { handleApiError(res, e); }
});

// ─── TWSE / TPEx Company Name Cache ─────────────────────────────────────────
interface TWSEEntry {
  code: string;
  name: string;
  market: 'TWSE' | 'TPEX';
}

let _twseCache: TWSEEntry[] = [];
let _twseCacheTime = 0;
const TWSE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function fetchAndCacheTWSE(): Promise<TWSEEntry[]> {
  const now = Date.now();
  if (_twseCache.length > 0 && now - _twseCacheTime < TWSE_CACHE_TTL) {
    return _twseCache;
  }
  const results: TWSEEntry[] = [];
  try {
    const r = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const data = await r.json() as Array<{ Code: string; Name: string }>;
      data.forEach(item => {
        if (item.Code && item.Name) {
          results.push({ code: item.Code, name: item.Name, market: 'TWSE' });
        }
      });
    }
  } catch (e) {
    console.warn('[TWSE] Failed to fetch listed stocks:', (e as Error).message);
  }
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const data = await r.json() as Array<{ SecuritiesCompanyCode: string; CompanyName: string }>;
      data.forEach(item => {
        if (item.SecuritiesCompanyCode && item.CompanyName) {
          results.push({ code: item.SecuritiesCompanyCode, name: item.CompanyName, market: 'TPEX' });
        }
      });
    }
  } catch (e) {
    console.warn('[TWSE] Failed to fetch OTC stocks:', (e as Error).message);
  }
  if (results.length > 0) {
    _twseCache = results;
    _twseCacheTime = now;
    console.log(`[TWSE] Cache loaded: ${results.length} stocks`);
  }
  return _twseCache;
}

// ── Background Pre-warming ──
// Fetch cache immediately on startup and refresh every 6 hours
if (!process.env.VERCEL) {
  fetchAndCacheTWSE().catch(() => {});
  setInterval(() => fetchAndCacheTWSE().catch(() => {}), TWSE_CACHE_TTL);
}

function hasChinese(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

function twseFuzzySearch(list: TWSEEntry[], query: string, limit = 8): TWSEEntry[] {
  const q = query.toLowerCase();
  return list
    .filter(e =>
      e.code.toLowerCase().startsWith(q) ||
      e.code.toLowerCase().includes(q) ||
      e.name.includes(query) ||
      e.name.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

type SearchCachePayload = { quotes: Array<{
  symbol: string;
  shortname?: string;
  longname?: string;
  chineseName?: string;
  exchDisp?: string;
  typeDisp?: string;
}> };

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 300;
const searchResponseCache = new Map<string, { expiresAt: number; payload: SearchCachePayload }>();

function readSearchCache(key: string): SearchCachePayload | null {
  const hit = searchResponseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    searchResponseCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeSearchCache(key: string, payload: SearchCachePayload): void {
  if (searchResponseCache.size >= SEARCH_CACHE_LIMIT) {
    const oldest = searchResponseCache.keys().next().value;
    if (oldest) searchResponseCache.delete(oldest);
  }
  searchResponseCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
}

app.get('/api/search/:query', authMiddleware, async (req: AuthRequest, res) => {
  const query = decodeURIComponent(req.params.query as string).trim();
  if (!query) return res.json({ quotes: [] });
  const cacheKey = query.toLowerCase();
  const cached = readSearchCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const twseList = await fetchAndCacheTWSE();
    const nameMap = new Map(twseList.map(e => [e.code, e]));

    // Always do a local fuzzy search first
    const localResults = twseFuzzySearch(twseList, query, 10);
    let quotes: Array<{
      symbol: string; shortname?: string; longname?: string;
      chineseName?: string; exchDisp?: string; typeDisp?: string;
    }> = localResults.map(e => ({
      symbol: e.code + (e.market === 'TWSE' ? '.TW' : '.TWO'),
      shortname: e.name,
      longname: e.name,
      chineseName: e.name,
      exchDisp: e.market === 'TWSE' ? '台灣證交所' : '台灣櫃買中心',
      typeDisp: 'Equity',
    }));

    // Skip Yahoo for ultra-short Chinese queries to reduce noisy remote calls.
    const shouldQueryYahoo = query.length > 1 || !hasChinese(query);
    const yahooData = shouldQueryYahoo
      ? await Promise.race([
          NativeYahooApi.search(query).catch(() => ({ quotes: [] })),
          new Promise<any>((resolve) => setTimeout(() => resolve({ quotes: [] }), 600)),
        ])
      : { quotes: [] };
    const existing = new Set(quotes.map(q => q.symbol));
    
    (yahooData.quotes || []).forEach((q: any) => {
      const sym = (q.symbol as string) || '';
      if (!existing.has(sym)) {
        const code = sym.replace(/\.(TW|TWO)$/, '');
        const entry = nameMap.get(code);
        quotes.push({ ...q, chineseName: entry?.name });
        existing.add(sym);
      }
    });

    const payload = { quotes };
    writeSearchCache(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/calendar/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await NativeYahooApi.quoteSummary(req.params.symbol as string, ['calendarEvents']);
    res.json(data.calendarEvents || {});
  } catch (e: any) { res.json({}); }
});

app.get('/api/forex/:pair', authMiddleware, async (req: AuthRequest, res) => {
  try { const q = await NativeYahooApi.quote(req.params.pair as string); res.json({ rate: q?.regularMarketPrice ?? 32.5 }); }
  catch (e) { handleApiError(res, e); }
});

app.get('/api/portfolio/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const list = await historyRepo.getHistoryByUser(req.userId!);
    res.json(list.map(h => ({ id: h.id, totalEquity: Number(h.totalEquity), recordedAt: h.date })));
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/watchlist', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const items = await watchlistRepo.getWatchlistByUser(req.userId!);
    res.json(items.map(i => ({ symbol: i.symbol, name: i.name, addedAt: i.addedAt })));
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/watchlist', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { symbol, name } = req.body ?? {};
    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
    
    // Auto-resolve symbol for fuzzy queries (e.g. adding '台積電' becomes '2330.TW')
    const resolvedSymbol = await resolveQueryToYahooSymbol(symbol);
    
    const item = await watchlistRepo.addWatchlistItem({ userId: req.userId!, symbol: resolvedSymbol, name: name ?? null, addedAt: Date.now() });
    res.status(201).json(item);
  } catch (e) { handleApiError(res, e); }
});

app.delete('/api/watchlist/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await watchlistRepo.removeWatchlistItem(req.userId!, req.params.symbol);
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/alerts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const list = await alertsRepo.getAlertsByUser(req.userId!);
    res.json(list.map(a => ({ id: a.id, symbol: a.symbol, condition: a.condition, target: Number(a.target), triggered: a.triggered, triggeredAt: a.triggeredAt, triggeredPrice: a.triggeredPrice != null ? Number(a.triggeredPrice) : undefined })));
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/alerts', authMiddleware, alertsWriteLimiter, async (req: AuthRequest, res) => {
  try {
    const { symbol, condition, target } = req.body;
    // nodejs-backend-patterns: validate input before hitting the DB
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'symbol is required and must be a string' });
    }
    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({ error: 'condition must be "above" or "below"' });
    }
    const targetNum = Number(target);
    if (isNaN(targetNum)) {
      return res.status(400).json({ error: 'target must be a valid number' });
    }
    const alert = await alertsRepo.createAlert(req.userId!, { symbol, condition, target: String(targetNum) });
    res.json(alert);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/alerts/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await alertsRepo.deleteAlert(req.userId!, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/trade/execute', authMiddleware, async (req: AuthRequest, res) => {
  const order = req.body;
  const userId = req.userId!;
  try {
    const existing = await positionsRepo.getPositionsByUser(userId);
    let totalCost = 0, totalVal = 0, usdtwd = 32.5;
    const symbols = existing.map(p => p.symbol);
    let qMap = new Map();
    if (symbols.length > 0) {
      try {
        const results = await NativeYahooApi.quote(symbols);
        const quotes = Array.isArray(results) ? results : [results];
        qMap = new Map(quotes.filter(q => q && q.symbol).map(q => [q.symbol, q]));
      } catch { /* ignore */ }
    }
    existing.forEach(p => {
      const shares = Number(p.shares), avgCost = Number(p.avgCost);
      const currentPrice = qMap.get(p.symbol)?.regularMarketPrice || avgCost;
      totalCost += avgCost * shares; totalVal += currentPrice * shares;
    });
    const plPct = totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
    const targetAccountValue = totalVal > 0 ? totalVal : 1000000;
    const tradeValue = order.amount * order.price;
    if (order.side === 'buy') {
      if (totalCost > 0 && plPct <= -3) return res.status(403).json({ error: 'Circuit Breaker: Loss > 3%' });
      if (tradeValue > targetAccountValue * 0.05) return res.status(403).json({ error: 'Position Limit: > 5% of account' });
    }
    const trade = await tradesRepo.createTrade(userId, { ...order, time: new Date().toISOString() });
    const pos = existing.find(p => p.symbol === order.symbol);
    const isTWD = order.symbol.endsWith('.TW') || order.symbol.endsWith('.TWO'), currency = isTWD ? 'TWD' : 'USD';
    if (order.side === 'buy') {
      if (pos) {
        const newCost = Number(pos.shares) * Number(pos.avgCost) + order.total, newShares = Number(pos.shares) + order.amount;
        await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(newShares), avgCost: String(newCost / newShares), currency });
      } else {
        await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(order.amount), avgCost: String(order.price), currency });
      }
    } else {
      if (pos) {
        const newShares = Number(pos.shares) - order.amount;
        if (newShares <= 0) await positionsRepo.removePosition(userId, order.symbol);
        else await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(newShares), avgCost: pos.avgCost, currency });
      }
    }
    res.json({ ok: true, trade });
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/positions', authMiddleware, async (req: AuthRequest, res) => {
  let usdtwd = 32.5;
  try { const q = await NativeYahooApi.quote('USDTWD=X'); usdtwd = q?.regularMarketPrice ?? 32.5; } catch { /**/ }
  try {
    const list = await positionsRepo.getPositionsByUser(req.userId!);
    const symbols = list.map(p => p.symbol);
    let quotes: any[] = [];
    if (symbols.length > 0) {
      try { const results = await NativeYahooApi.quote(symbols); quotes = Array.isArray(results) ? results : [results]; } catch { /* ignore */ }
    }
    const qMap = new Map(quotes.filter(q => q && q.symbol).map(q => [q.symbol, q]));
    const enriched = list.map(p => {
      const q = qMap.get(p.symbol), shares = Number(p.shares), avgCost = Number(p.avgCost), cur = p.currency || 'USD';
      let currentPrice = q?.regularMarketPrice ?? null, pnl = null, pnlPercent = null, marketValue = null, marketValueTWD = null;
      if (currentPrice != null) {
        pnl = (currentPrice - avgCost) * shares;
        pnlPercent = avgCost > 0 ? ((currentPrice / avgCost) - 1) * 100 : 0;
        marketValue = currentPrice * shares;
        marketValueTWD = cur === 'TWD' ? marketValue : marketValue * usdtwd;
      }
      return { symbol: p.symbol, name: q?.shortName || p.name || p.symbol, shares, avgCost, currency: cur, currentPrice, pnl, pnlPercent, marketValue, marketValueTWD };
    });
    res.json({ positions: enriched, usdtwd });
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/trades', authMiddleware, async (req: AuthRequest, res) => {
  try { res.json(await tradesRepo.getTradesByUser(req.userId!)); } catch (e) { handleApiError(res, e); }
});

app.get('/api/settings/:key', authMiddleware, async (req: AuthRequest, res) => {
  try { const value = await settingsRepo.getSetting(req.userId!, req.params.key as string); res.json({ value: value ?? null }); }
  catch (e) { handleApiError(res, e); }
});

app.put('/api/settings/:key', authMiddleware, async (req: AuthRequest, res) => {
  try { await settingsRepo.setSetting(req.userId!, req.params.key as string, req.body.value); res.json({ ok: true }); }
  catch (e) { handleApiError(res, e); }
});

app.get('/api/strategies', authMiddleware, async (req: AuthRequest, res) => {
  try { res.json(await strategiesRepo.getStrategiesByUser(req.userId!)); } catch (e) { handleApiError(res, e); }
});

// NOTE: a duplicate, *unauthenticated* /api/tv/overview/:symbol used to be defined
// here, which shadowed the authenticated handler below and silently bypassed auth.
// The authenticated handler further down handles this route.

async function resolveQueryToYahooSymbol(query: string): Promise<string> {
  const q = query.trim().toUpperCase();
  if (!q) return q;

  // FAST PATH: If it's a standard Taiwan stock code (4-5 digits) or a common US symbol (1-5 letters)
  // we can avoid the expensive TWSE fuzzy search and just try to parse it.
  const isTaiwanCode = /^\d{4,5}$/.test(q);
  const isUsSymbol = /^[A-Z]{1,5}$/.test(q);
  const isAlreadyYahoo = /^[A-Z0-9.]+$/.test(q) && (q.includes('.') || isUsSymbol);

  if (isTaiwanCode) return `${q}.TW`;
  if (isAlreadyYahoo) return q;

  // SLOW PATH: Fuzzy search for Chinese names or ambiguous strings
  const twseList = await fetchAndCacheTWSE();
  const nameMap = new Map(twseList.map(e => [e.code, e]));

  // 1. Exact TWSE Code or Name
  const exactLocal = twseList.find(e => e.code === q || e.name === q);
  if (exactLocal) return exactLocal.code + (exactLocal.market === 'TWSE' ? '.TW' : '.TWO');

  // 2. Local Fuzzy Search
  const localResults = twseFuzzySearch(twseList, q, 1);
  if (localResults.length > 0 && (localResults[0].name === q || localResults[0].code === q)) {
    return localResults[0].code + (localResults[0].market === 'TWSE' ? '.TW' : '.TWO');
  }

  // 3. Fallback to Yahoo Search (to handle Chinese aliases like "蘋果" -> AAPL, or "TSMC" -> TSM)
  try {
    const data = await NativeYahooApi.search(q);
    if (data && data.quotes && data.quotes.length > 0) {
      // Prefer equity, fallback to first
      const equity = data.quotes.find((x: any) => x.quoteType === 'EQUITY' || x.quoteType === 'ETF');
      return equity ? equity.symbol : data.quotes[0].symbol;
    }
  } catch(e) {}

  // 4. Just return the parsed version if nothing worked
  return toYahoo(parseSymbol(q).raw);
}

app.get('/api/insights/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const rawInput = req.params.symbol as string;
  try {
    const start = Date.now();
    let yahooSymbol = await resolveQueryToYahooSymbol(rawInput);
    const resolveTime = Date.now() - start;
    
    // Re-parse to get canonical for TradingView, since Yahoo Symbol is resolved
    const tvSymbol = toTradingViewSymbol(yahooSymbol);

    console.log(`[Research] Fetching data for: Raw=${rawInput}, Yahoo=${yahooSymbol}, TV=${tvSymbol} (Resolve: ${resolveTime}ms)`);

    const requestedTimeframe = (req.query.timeframe as string) || '1M';

    let interval: '1m' | '5m' | '15m' | '1h' | '1d' = '1h';
    let periodDays = 30;
    // TV scraper accepts: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1W' | '1M'
    let tvIndicatorTf: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1W' | '1M' = '1d';
    switch (requestedTimeframe) {
      case '1D': interval = '1m'; periodDays = 1; tvIndicatorTf = '5m'; break;
      case '5D': interval = '5m'; periodDays = 5; tvIndicatorTf = '15m'; break;
      case '1W': interval = '15m'; periodDays = 7; tvIndicatorTf = '1h'; break;
      case '1M': interval = '1h'; periodDays = 30; tvIndicatorTf = '1d'; break;
      case '6M': interval = '1d'; periodDays = 180; tvIndicatorTf = '1d'; break;
      case '1Y': interval = '1d'; periodDays = 365; tvIndicatorTf = '1W'; break;
      case 'YTD': interval = '1d'; periodDays = Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)); tvIndicatorTf = '1d'; break;
      default: interval = '1d'; periodDays = 90; tvIndicatorTf = '1d';
    }
    const period1 = String(Date.now() - periodDays * 24 * 3600 * 1000);

    // 對於台股 .TW / .TWO，Yahoo 的 1m / 5m 短線資料常常 422，
    // 退而求其次改抓較粗的線型，避免回傳空陣列讓前端 chart 一片空白。
    const isTaiwanStock = /\.(TW|TWO)$/i.test(yahooSymbol);
    if (isTaiwanStock) {
      if (interval === '1m') interval = '5m';
    }

    const startTime = Date.now();
    const [quote, tvOverview, tvIndicators, tvNews, history, holdersSummary, wantGooChip] = await Promise.allSettled([
      NativeYahooApi.quote(yahooSymbol as string).then(res => { console.log(`[Research] Yahoo Quote: ${Date.now() - startTime}ms`); return res; }),
      TV.getOverview(tvSymbol).then(res => { console.log(`[Research] TV Overview: ${Date.now() - startTime}ms`); return res; }),
      TV.getIndicators(tvSymbol, tvIndicatorTf).then(res => { console.log(`[Research] TV Indicators: ${Date.now() - startTime}ms`); return res; }),
      TV.getNewsHeadlines(tvSymbol).then(res => { console.log(`[Research] TV News: ${Date.now() - startTime}ms`); return res; }),
      NativeYahooApi.chart(yahooSymbol as string, { interval, period1 }).then(res => { console.log(`[Research] Yahoo Chart: ${Date.now() - startTime}ms`); return res; }),
      NativeYahooApi.quoteSummary(yahooSymbol as string, ['majorHoldersBreakdown']).then(res => { console.log(`[Research] Yahoo Summary: ${Date.now() - startTime}ms`); return res; }),
      WantGoo.getChipData(yahooSymbol).then(res => { console.log(`[Research] WantGoo Chip: ${Date.now() - startTime}ms`); return res; }),
    ]);
    console.log(`[Research] All sub-requests finished in ${Date.now() - startTime}ms`);

    const quoteVal: any = quote.status === 'fulfilled' ? quote.value : null;
    const yahooQuote: any = Array.isArray(quoteVal) ? quoteVal[0] : quoteVal;
    const tvOverviewVal: any = tvOverview.status === 'fulfilled'
      ? (tvOverview.value as any)?.data || tvOverview.value
      : null;

    // Yahoo majorHoldersBreakdown.institutionsPercentHeld is a 0-1 fraction.
    // Convert to percent to match the frontend's toFixed(1) + '%' rendering.
    const holdersVal: any = holdersSummary.status === 'fulfilled' ? holdersSummary.value : null;
    const instRaw = holdersVal?.majorHoldersBreakdown?.institutionsPercentHeld;
    const instFraction = typeof instRaw === 'number'
      ? instRaw
      : typeof instRaw?.raw === 'number' ? instRaw.raw : undefined;
    const institutionalPct = typeof instFraction === 'number' ? instFraction * 100 : undefined;

    // Yahoo-derived baseline so the Valuation panel still populates when the TV
    // scraper has no coverage (common for TWSE/TPEX symbols). TV values take
    // precedence where present.
    const yahooBaseline: Record<string, any> = yahooQuote ? {
      market_cap_calc: yahooQuote.marketCap,
      pe_ratio: yahooQuote.trailingPE,
      eps_ttm: yahooQuote.epsTrailingTwelveMonths,
      prev_close: yahooQuote.regularMarketPreviousClose,
      close: yahooQuote.regularMarketPrice,
      description: yahooQuote.longName ?? yahooQuote.shortName,
      exchange: yahooQuote.fullExchangeName,
    } : {};
    if (institutionalPct !== undefined) yahooBaseline.institutional_holders_pct = institutionalPct;

    const mergedOverview = (() => {
      const out: Record<string, any> = { ...yahooBaseline };
      if (tvOverviewVal && typeof tvOverviewVal === 'object') {
        for (const [k, v] of Object.entries(tvOverviewVal)) {
          if (v !== null && v !== undefined && v !== '') out[k] = v;
        }
      }
      return Object.keys(out).length ? out : null;
    })();

    let historyData: any[] = history.status === 'fulfilled' ? ((history.value as any).quotes ?? []) : [];

    // Fallback: 短週期常因 Yahoo 422 / 流量限制回空陣列 → 退一階改抓日線，避免畫面空白。
    if (historyData.length === 0 && interval !== '1d') {
      try {
        const fallbackPeriod = String(Date.now() - 90 * 24 * 3600 * 1000);
        const retry = await NativeYahooApi.chart(yahooSymbol as string, { interval: '1d', period1: fallbackPeriod });
        historyData = retry.quotes ?? [];
        if (historyData.length > 0) {
          console.warn(`[Research] history fallback: ${interval} → 1d (Yahoo returned empty for short interval)`);
        }
      } catch (fbErr) {
        console.warn('[Research] history fallback failed:', (fbErr as Error).message);
      }
    }

    res.json({
      symbol: { input: rawInput, canonical: parseSymbol(tvSymbol), yahoo: yahooSymbol },
      quote: quoteVal,
      tvOverview: mergedOverview,
      tvIndicators: tvIndicators.status === 'fulfilled' ? (tvIndicators.value as any)?.data || tvIndicators.value : null,
      tvNews: tvNews.status === 'fulfilled' ? (tvNews.value as any)?.data || tvNews.value : null,
      history: historyData,
      wantGooChip: wantGooChip.status === 'fulfilled' ? wantGooChip.value : null,
    });
  } catch (e) {
    handleApiError(res, e);
  }
});

app.get('/api/tv/overview/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await TV.getOverview(req.params.symbol);
    res.json(data || {});
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/tv/indicators/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await TV.getIndicators(req.params.symbol, (req.query.timeframe as any) || '1d');
    res.json(data || {});
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/tv/news/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await TV.getNewsHeadlines(req.params.symbol);
    res.json(data || []);
  } catch (e: any) {
    console.warn(`[TV News] Fallback to empty list for ${req.params.symbol}:`, e?.message ?? e);
    res.json([]);
  }
});

app.get('/api/tv/ideas/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await TV.getIdeas(req.params.symbol, (req.query.sort as any) || 'popular');
    res.json(data || []);
  } catch (e) { handleApiError(res, e); }
});

// ── Sectors ──────────────────────────────────────────────────────────────────
app.get('/api/sectors', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const list = await Sectors.getSectors();
    res.json(list);
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/sectors/:id/symbols', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const codes = await Sectors.getSectorSymbols(req.params.id);
    const twseList = await fetchAndCacheTWSE();
    const marketMap = new Map(twseList.map(s => [s.code, s.market]));
    
    // Determine default market for this sector ID (e.g. ^05x, ^04x, ^06x are often OTC)
    const isOTCSector = req.params.id.startsWith('^05') || req.params.id.startsWith('^04') || req.params.id.startsWith('^06');
    const defaultSuffix = isOTCSector ? '.TWO' : '.TW';

    const symbols = codes.map(code => {
      const market = marketMap.get(code);
      if (market === 'TWSE') return `${code}.TW`;
      if (market === 'TPEX') return `${code}.TWO`;
      // Default based on sector context if unknown but is numeric code
      if (/^\d{4,5}$/.test(code)) return `${code}${defaultSuffix}`;
      return code;
    });
    
    res.json(symbols);
  } catch (e) { handleApiError(res, e); }
});

// ── Stock Screener ─────────────────────────────────────────────────────────────
// Batch-scans a list of symbols against technical criteria.
// Uses Yahoo Finance for quotes + 90-day price history for indicator computation.
app.post('/api/screener', authMiddleware, screenerLimiter, async (req: AuthRequest, res) => {
  const { symbols = [], filters = {} } = req.body ?? {};
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array required' });
  }
  // Hard cap to prevent obvious DoS — but allow ETF (~250 codes) + 行業類股 in single scan.
  // Anything between SCREENER_BATCH_SIZE and MAX_SCREENER_SYMBOLS is processed in batches.
  let workingSymbols: string[] = symbols;
  if (workingSymbols.length > MAX_SCREENER_SYMBOLS) {
    console.warn(`[Screener] Truncating ${workingSymbols.length} → ${MAX_SCREENER_SYMBOLS} symbols`);
    workingSymbols = workingSymbols.slice(0, MAX_SCREENER_SYMBOLS);
  }

  // Fix #5: typed accumulator — no more results: any[]
  const results: ScreenerResultRow[] = [];

  // Process in chunks: avoids `Promise.all` over 300 fetches (event-loop saturation,
  // Yahoo rate-limits) while still giving useful concurrency.
  const scanOne = async (sym: string) => {
      try {
        const [quoteRaw, histRaw] = await Promise.allSettled([
          NativeYahooApi.quote(sym),
          NativeYahooApi.chart(sym, { interval: '1d', period1: String(Date.now() - 120 * 24 * 3600 * 1000) }),
        ]);

        const quote: any = quoteRaw.status === 'fulfilled' ? quoteRaw.value : null;
        const hist = histRaw.status === 'fulfilled' ? (histRaw.value as any).quotes ?? [] : [];

        const price = quote?.regularMarketPrice ?? 0;
        const changePct = quote?.regularMarketChangePercent ?? 0;
        const name = quote?.shortName ?? quote?.longName ?? sym;

        // ── Technical indicators ──────────────────────────────────────────────
        const closes: number[] = hist.map((h: any) => Number(h.close)).filter((v: number) => !isNaN(v));
        const vols: number[] = hist.map((h: any) => Number(h.volume)).filter((v: number) => !isNaN(v));

        // RSI(14)
        let rsi = 50;
        if (closes.length >= 15) {
          let avgUp = 0, avgDn = 0;
          for (let i = closes.length - 14; i < closes.length; i++) {
            const d = closes[i] - closes[i - 1];
            if (d > 0) avgUp += d; else avgDn -= d;
          }
          avgUp /= 14; avgDn /= 14;
          rsi = avgDn === 0 ? 100 : 100 - 100 / (1 + avgUp / avgDn);
        }

        // SMA5, SMA20, SMA60
        const last = (arr: number[], n: number) => arr.slice(-n);
        const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const sma5  = closes.length >= 5  ? mean(last(closes, 5))  : price;
        const sma20 = closes.length >= 20 ? mean(last(closes, 20)) : null;
        const sma60 = closes.length >= 60 ? mean(last(closes, 60)) : null;

        // MACD(12,26,9)
        const ema = (arr: number[], p: number) => {
          const k = 2 / (p + 1); let e = arr[0];
          for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
          return e;
        };
        let macdHistogram = 0;
        if (closes.length >= 26) {
          const e12 = ema(closes, 12);
          const e26 = ema(closes, 26);
          const macdLine = e12 - e26;
          // For signal, use last 9 MACD values approximation
          const slice = closes.slice(-35);
          const macdSlice = slice.map((_, i, arr) => {
            if (i < 26) return 0;
            return ema(arr.slice(0, i + 1), 12) - ema(arr.slice(0, i + 1), 26);
          }).filter((v) => v !== 0);
          const signalLine = macdSlice.length >= 9 ? ema(macdSlice, 9) : macdLine;
          macdHistogram = macdLine - signalLine;
        }

        // Volume ratio (current / 20-day avg)
        const avgVol20 = vols.length >= 20 ? mean(last(vols, 20)) : (vols.length ? mean(vols) : 1);
        const currentVol = vols[vols.length - 1] ?? 0;
        const volumeRatio = avgVol20 > 0 ? currentVol / avgVol20 : 1;

        // ── Signal detection ──────────────────────────────────────────────────
        const signals: string[] = [];
        if (rsi < 30) signals.push('RSI 超賣');
        if (rsi > 70) signals.push('RSI 超買');
        if (sma20 && sma5 > sma20 && closes.length >= 6) {
          const prevSma5 = mean(last(closes.slice(0, -1), 5));
          const prevSma20 = mean(last(closes.slice(0, -1), 20));
          if (prevSma5 <= prevSma20) signals.push('均線金叉');
        }
        if (sma20 && sma5 < sma20 && closes.length >= 6) {
          const prevSma5 = mean(last(closes.slice(0, -1), 5));
          const prevSma20 = mean(last(closes.slice(0, -1), 20));
          if (prevSma5 >= prevSma20) signals.push('均線死叉');
        }
        if (macdHistogram > 0) signals.push('MACD 多頭');
        if (macdHistogram < 0) signals.push('MACD 空頭');
        if (volumeRatio >= 2) signals.push('異常爆量');
        if (sma20 && price > sma20) signals.push('強勢多頭');

        // ── Apply filters ─────────────────────────────────────────────────────
        if (filters.rsiBelow !== undefined && rsi >= filters.rsiBelow) return;
        if (filters.rsiAbove !== undefined && rsi <= filters.rsiAbove) return;
        if (filters.macdBullish && macdHistogram <= 0) return;
        if (filters.macdBearish && macdHistogram >= 0) return;
        if (filters.goldenCrossOnly && !signals.includes('均線金叉')) return;
        if (filters.deathCrossOnly && !signals.includes('均線死叉')) return;
        if (filters.volumeSpikeMin !== undefined && volumeRatio < filters.volumeSpikeMin) return;
        if (filters.aboveSMA20 && sma20 && price <= sma20) return;
        if (filters.belowSMA20 && sma20 && price >= sma20) return;

        results.push({
          symbol: sym,
          name,
          price,
          changePct,
          rsi: Number(rsi.toFixed(1)),
          macdHistogram: Number(macdHistogram.toFixed(4)),
          sma5: Number(sma5.toFixed(2)),
          sma20: sma20 !== null ? Number(sma20.toFixed(2)) : null,
          sma60: sma60 !== null ? Number(sma60.toFixed(2)) : null,
          volumeRatio: Number(volumeRatio.toFixed(2)),
          signals,
          marketCap: quote?.marketCap ?? null,
        });
      } catch (err) {
        console.warn(`[Screener] Skipping ${sym}:`, (err as Error).message);
      }
  };

  for (let i = 0; i < workingSymbols.length; i += SCREENER_BATCH_SIZE) {
    const batch = workingSymbols.slice(i, i + SCREENER_BATCH_SIZE);
    await Promise.allSettled(batch.map(scanOne));
  }

  res.json({ results, scanned: workingSymbols.length });
});

app.use('/api/agent', authMiddleware, agentRouter);

// ECPay payment routes — notify endpoint is called by ECPay server (no auth),
// checkout endpoint requires auth to associate order with user.
app.use('/api/payment/ecpay', ecpayRouter);

// Research Pro routes — SEC Edgar, Congressional trades
app.use('/api/research', authMiddleware, researchRouter);


app.get('/api/market/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const rawSymbol = req.params.symbol as string, isTWStock = /^\d{4,5}$/.test(rawSymbol), yahooSymbol = isTWStock ? `${rawSymbol}.TW` : rawSymbol;
  try {
    const [quoteData, histData, newsData] = await Promise.allSettled([
      NativeYahooApi.quote(yahooSymbol),
      NativeYahooApi.chart(yahooSymbol, { interval: '1d', period1: Date.now() - 90 * 24 * 60 * 60 * 1000 }),
      NativeYahooApi.search(yahooSymbol),
    ]);
    const quote = quoteData.status === 'fulfilled' ? quoteData.value : null, history = histData.status === 'fulfilled' ? histData.value.quotes : [];
    let techResult = null;
    if (history.length >= 20) { try { techResult = calcIndicators(history); } catch { /* ignore */ } }
    const rawNews = newsData.status === 'fulfilled' ? (newsData.value?.news ?? []) : [], sentiment = analyzeSentiment(rawNews, 3);
    const price = quote?.regularMarketPrice ?? 0;
    if (!quote) {
      const tvData = await TV.getOverview(parseSymbol(rawSymbol)).catch(() => null);
      if (tvData) return res.json({ symbol: rawSymbol, source: 'TV', price: (tvData as any).close ?? 0, history: [], technical: null, sentiment, raw: tvData });
      return res.status(404).json({ error: 'Symbol not found' });
    }
    return res.json({
      symbol: rawSymbol, source: 'Yahoo', price, change: quote?.regularMarketChange, changePct: quote?.regularMarketChangePercent,
      open: quote?.regularMarketOpen, high: quote?.regularMarketDayHigh, low: quote?.regularMarketDayLow, volume: quote?.regularMarketVolume, name: quote?.longName ?? quote?.shortName,
      history: history.map(h => ({ date: h.date instanceof Date ? h.date.toISOString().split('T')[0] : h.date, open: h.open, high: h.high, low: h.low, close: h.close, volume: h.volume })),
      technical: techResult ? { sma20: techResult.latest.sma20, sma50: techResult.latest.sma50, macdLine: techResult.latest.macdLine, rsi14: techResult.latest.rsi14, recommendation: techResult.recommendation, score: techResult.score } : null,
      sentiment
    });
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/backtest', authMiddleware, async (req: AuthRequest, res) => {
  const { symbol, period1, period2, initialCapital, strategy, paramPack } = req.body;
  try {
    const data = await NativeYahooApi.chart(symbol, { period1, period2 });
    if (data.quotes.length < 50) throw new Error('Insufficient data for backtest');

    const closes = data.quotes.map((q: any) => q.close);
    const lastPrice = closes[closes.length - 1] ?? 0;

    // Helper: parse paramPack string → object
    const parsedParams = (() => {
      if (typeof paramPack === 'string' && paramPack.trim()) {
        try { return JSON.parse(paramPack); } catch { return {}; }
      }
      return (paramPack && typeof paramPack === 'object') ? paramPack : {};
    })();

    let btResult: any;

    if (strategy === 'neural') {
      // Neural strategy → advanced multi-signal engine with SL/TP/trailing stop
      const { runBacktestWithBestEngine } = await import('./server/services/backtestEngine.js');
      const history = data.quotes.map((q: any) => ({
        close: q.close,
        date: q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date),
      }));
      const config = {
        strategies: ['RSI_REVERSION', 'MACD_CROSS', 'BOLLINGER_BREAKOUT'],
        params: parsedParams,
        _ablation_quantumEnabled: true,
        _ablation_aiEnabled: false, // no live LLM in backtest
      };
      const advanced = await runBacktestWithBestEngine(symbol, history, config);
      const initialCap = Number(initialCapital) || 1_000_000;

      // Compute drawdown inline and enrich equityCurve
      let maxVal = -Infinity;
      const enrichedCurve = (advanced.equityCurve || []).map((p: any) => {
        const val = (p.portfolio ?? 0) + 100;
        if (val > maxVal) maxVal = val;
        const dd = maxVal > 0 ? ((maxVal - val) / maxVal) * 100 : 0;
        return { ...p, drawdown: Number(dd.toFixed(2)) };
      });

      // Compute avgWin/avgLoss from trade PnLs
      const advTrades = advanced.trades || [];
      const winPnls: number[] = advTrades.filter((t: any) => t.pnl > 0).map((t: any) => t.pnl as number);
      const lossPnls: number[] = advTrades.filter((t: any) => t.pnl < 0).map((t: any) => Math.abs(t.pnl as number));
      const grossWin = winPnls.reduce((a, b) => a + b, 0);
      const grossLoss = lossPnls.reduce((a, b) => a + b, 0);
      const avgWin = winPnls.length > 0 ? Number((grossWin / winPnls.length / initialCap * 100).toFixed(2)) : 0;
      const avgLoss = lossPnls.length > 0 ? Number((grossLoss / lossPnls.length / initialCap * 100).toFixed(2)) : 0;

      const roi = advanced.metrics.roi ?? 0;
      btResult = {
        initialCapital: initialCap,
        finalEquity: initialCap * (1 + roi / 100),
        totalReturn: roi,
        maxDrawdown: advanced.metrics.maxDrawdown,
        trades: advTrades.map((t: any) => ({
          entryTime: t.entryDate ?? '',
          exitTime:  t.exitDate  ?? '',
          entryPrice: t.entryPrice ?? 0,
          exitPrice:  t.exitPrice  ?? 0,
          amount:   t.shares ?? 0,
          holdDays: (t.entryDate && t.exitDate)
            ? Math.floor((new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 86_400_000)
            : 0,
          pnl:    Number((t.pnl    ?? 0).toFixed(2)),
          pnlPct: Number((t.pnlPct ?? 0).toFixed(2)),
          result: t.type === 'WIN' ? 'WIN' : 'LOSS',
        })),
        totalTrades: advTrades.length,
        equityCurve: enrichedCurve,
        drawdownCurve: enrichedCurve.map((p: any) => ({ date: p.date, value: p.drawdown })),
        metrics: { ...advanced.metrics, avgWin, avgLoss },
      };
    } else {
      btResult = runBacktestLogic(data.quotes, strategy, Number(initialCapital) || 1_000_000, parsedParams);
    }

    // Market regime detection
    const { detectRegime } = await import('./server/services/backtestEngine.js');
    const regime = detectRegime(closes);

    // 30-trading-day (≈1 month) price forecast
    let forecast = null;
    try {
      const { timesFmPredict } = await import('./server/utils/scienceService.js');
      const historyWindow = closes.slice(-60);
      const predResult = await timesFmPredict(symbol, 22, historyWindow);
      if (predResult?.data?.prediction?.length) {
        const preds: number[] = predResult.data.prediction;
        const baseTarget = preds[preds.length - 1];
        const spread = preds.reduce((mx, v) => Math.max(mx, Math.abs(v - lastPrice)), 0);
        forecast = {
          predictions: preds.map((p: number) => Number(p.toFixed(2))),
          lastPrice: Number(lastPrice.toFixed(2)),
          targetPrice: Number(baseTarget.toFixed(2)),
          bearTarget: Number((baseTarget - spread * 0.5).toFixed(2)),
          bullTarget: Number((baseTarget + spread * 0.5).toFixed(2)),
          changesPct: Number(((baseTarget - lastPrice) / lastPrice * 100).toFixed(2)),
          model: predResult.data.model ?? 'fallback',
        };
      }
    } catch { /* science service unavailable — omit forecast */ }

    res.json({ ...btResult, forecast, regime });
  } catch (e) { handleApiError(res, e); }
});

app.post('/api/backtest/optimize', authMiddleware, async (req: AuthRequest, res) => {
  const { symbol, period1, period2, strategy, paramPack } = req.body;
  try {
    const data = await NativeYahooApi.chart(symbol, { period1, period2 });
    if (data.quotes.length < 50) throw new Error('Insufficient data for optimization');

    const history = data.quotes.map((q: any) => ({
      close: q.close,
      date: q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date),
    }));
    const parsedParams = (() => {
      if (typeof paramPack === 'string' && paramPack.trim()) {
        try { return JSON.parse(paramPack); } catch { return {}; }
      }
      return (paramPack && typeof paramPack === 'object') ? paramPack : {};
    })();

    const { runExplicitOptimizationScan } = await import('./server/services/optimizerService.js');
    const proposal = await runExplicitOptimizationScan(symbol, history, strategy || 'neural', parsedParams);
    res.json({ proposal });
  } catch (e) { handleApiError(res, e); }
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Global Error]:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
});

// Only run background tasks if not on Vercel
if (!process.env.VERCEL) {
  setInterval(async () => {
    try {
      const allUsers = await usersRepo.getAllUsers();
      const date = new Date().toISOString().split('T')[0];
      for (const user of allUsers) {
        try {
          const pos = await positionsRepo.getPositionsByUser(user.id), symbols = pos.map(p => p.symbol);
          let equity = Number(user.balance || 100000);
          if (symbols.length > 0) {
            const quotes = await NativeYahooApi.quote(symbols), qMap = new Map((Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => [q.symbol, q]));
            for (const p of pos) { const q = qMap.get(p.symbol); if (q) equity += Number(p.shares) * q.regularMarketPrice; }
          }
          await historyRepo.recordSnapshot(user.id, Math.round(equity));
          console.log("[Snapshot] " + date + " " + user.email + " -> " + equity);
        } catch (userErr) { console.error("[Snapshot] Error for " + user.email + ":", userErr); }
      }
    } catch (e) { console.error('[Snapshot Task] Global error:', e); }
  }, 3600 * 1000);
}

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  initCalendar().catch(e => console.error('[twCalendar] Init error:', e));
  startDailySettlementSchedule();

  if (process.env.NODE_ENV !== 'production') {
    import('vite').then(async ({ createServer: createViteServer }) => {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
      app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
  }
}

export default app;
