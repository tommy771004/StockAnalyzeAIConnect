import 'dotenv/config';
import express from 'express';
import expressWs from 'express-ws';
import * as path from 'path';
import * as https from 'https';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import * as TV from './server/services/TradingViewService.js';
import * as TWSE from './server/services/TWSeService.js';
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
import { calcIndicators } from './server/utils/technical.js';
import { analyzeSentiment } from './server/utils/sentiment.js';
import { agentRouter }    from './server/api/agent.js';
import { ecpayRouter }    from './server/api/ecpay.js';
import { researchRouter } from './server/api/research.js';
import { startAutonomousAgent } from './server/services/autonomousAgent.js';
import { screenerLimiter, alertsWriteLimiter } from './server/middleware/rateLimiter.js';
import type { ScreenerResultRow } from './src/terminal/types/market.js';
import { callAISimple } from './server/utils/llmPipeline.js';

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
/** Fix #1: hard cap on screener input — prevents DoS via 10 k-symbol batch */
const MAX_SCREENER_SYMBOLS = 50;

// Lazy-load Neon DB
let dbAvailable = false;
try {
  await import('./src/db/index.js');
  dbAvailable = true;
  // Only start these in non-vercel environments
  if (!process.env.VERCEL) {
    startAutonomousAgent();
  }
} catch (e) {
  console.warn('[DB] Neon not available. Please set DATABASE_URL in .env to enable persistence:', (e as Error).message);
}

// --- OpenRouter Model Management ---
// Shared implementation lives in server/utils/modelSelector.ts so /api/ai
// and /api/agent/chat pick the same dynamic free model.
import { getBestFreeModel, getTopFreeModels } from './server/utils/modelSelector.js';
export { getBestFreeModel };

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
        }
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

function runBacktestLogic(quotes: HistoricalData[], strategy: string, initialCapital: number) {
  const closes = quotes.map(q => q.close);
  const dates = quotes.map(q => q.date.toISOString().split('T')[0]);
  const signals: (1 | -1 | 0)[] = new Array(quotes.length).fill(0);

  if (strategy === 'ma_crossover') {
    const s10 = SMA(closes, 10);
    const s30 = SMA(closes, 30);
    for (let i = 1; i < quotes.length; i++) {
      if (s10[i - 1]! <= s30[i - 1]! && s10[i]! > s30[i]!) signals[i] = 1;
      else if (s10[i - 1]! >= s30[i - 1]! && s10[i]! < s30[i]!) signals[i] = -1;
    }
  } else if (strategy === 'rsi') {
    const rsi = RSI(closes, 14);
    for (let i = 1; i < quotes.length; i++) {
      if (rsi[i - 1]! < 35 && rsi[i]! >= 35) signals[i] = 1;
      else if (rsi[i - 1]! > 65 && rsi[i]! <= 65) signals[i] = -1;
    }
  } else if (strategy === 'macd') {
    const e12 = EMA(closes, 12);
    const e26 = EMA(closes, 26);
    const macd = e12.map((v, i) => (v !== null && e26[i] !== null) ? v! - e26[i]! : null);
    const signal = EMA(macd.filter(v => v !== null) as number[], 9);
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
  let entryTime = '';
  const benchStart = closes[0];

  for (let i = 0; i < quotes.length; i++) {
    const price = closes[i];
    const date = dates[i];
    if (signals[i] === 1 && shares === 0) {
      shares = Math.floor(balance / price);
      balance -= shares * price;
      entryPrice = price;
      entryTime = date;
    } else if (signals[i] === -1 && shares > 0) {
      const pnl = (price - entryPrice) * shares;
      const pnlPct = ((price / entryPrice) - 1) * 100;
      trades.push({
        entryTime, exitTime: date,
        entryPrice, exitPrice: price,
        amount: shares,
        holdDays: Math.floor((new Date(date).getTime() - new Date(entryTime).getTime()) / 86400000),
        pnl, pnlPct: Number(pnlPct.toFixed(2)),
        result: pnl > 0 ? 'WIN' : 'LOSS'
      });
      balance += shares * price;
      shares = 0;
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

  return {
    metrics: { roi, sharpe: 1.5, maxDrawdown: Number(maxDD.toFixed(2)), winRate, totalTrades: trades.length, avgWin: 0, avgLoss: 0, profitFactor: 1.2 },
    equityCurve, drawdownCurve, trades
  };
}

export const app = express();
const wsInstance = expressWs(app);
const PORT = 3000;

app.use(cors());
app.use(express.json());

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
    const text = await callAISimple(prompt, jsonMode, req.userId);
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
    const [quoteRes, newsRes, tvOverview, tvIndicators] = await Promise.allSettled([
      NativeYahooApi.quote(toYahoo(sym)),
      NativeYahooApi.search(toYahoo(sym)),
      TV.getOverview(tvSym),
      TV.getIndicators(tvSym)
    ]);

    const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
    const newsData = newsRes.status === 'fulfilled' ? (newsRes.value as any) : null;
    const news = Array.isArray(newsData?.news) ? newsData.news : [];
    
    // Flatten nested TV responses
    const tvO = tvOverview.status === 'fulfilled' ? (tvOverview.value as any)?.data || tvOverview.value : null;
    const tvI = tvIndicators.status === 'fulfilled' ? (tvIndicators.value as any)?.data || tvIndicators.value : null;

    const newsText = news.length > 0 
      ? news.slice(0, 3).map((n: any) => `- ${n.title || n.headline || '無標題'}`).join('\n')
      : '無近期相關新聞';
    const techText = tvI ? JSON.stringify(tvI).slice(0, 500) : '無技術指標數據';

    const prompt = `你是一位專業的金融分析師。請針對 ${sym} 提供深入的 AI 摘要分析。
市場數據：現價 ${quote?.regularMarketPrice || tvO?.close || 'N/A'}，漲跌幅 ${quote?.regularMarketChangePercent || 'N/A'}%。
公司概況：${tvO?.description || '無描述'}。
技術指標摘要：${techText}。
最近新聞：
${newsText}

請提供：
1. 營運狀況簡評
2. 技術面分析（根據指標）
3. 投資建議（看多/看空/中立）與理由。
請以繁體中文回答，維持專業、簡潔的風格。`;

    const resultText = await callAISimple(prompt, false, req.userId);
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
  try { const q = await NativeYahooApi.chart(req.params.symbol as string, req.query); res.json(q.quotes); }
  catch (e) { handleApiError(res, e); }
});

app.get('/api/quotes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const syms = (req.query.symbols as string)?.split(',') || [];
    const results = await NativeYahooApi.quote(syms);
    res.json(Array.isArray(results) ? results : [results]);
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/news/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  try { const data = await NativeYahooApi.search(req.params.symbol as string); res.json(data.news || []); }
  catch (e) { handleApiError(res, e); }
});

app.get('/api/news/feed', authMiddleware, async (_req, res) => {
  try {
    const data = await NativeYahooApi.search('Market');
    res.json(data.news || []);
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

app.get('/api/search/:query', authMiddleware, async (req: AuthRequest, res) => {
  const query = decodeURIComponent(req.params.query as string);
  try {
    const twseList = await fetchAndCacheTWSE();
    const nameMap = new Map(twseList.map(e => [e.code, e]));
    const isChinese = hasChinese(query);

    let quotes: Array<{
      symbol: string; shortname?: string; longname?: string;
      chineseName?: string; exchDisp?: string; typeDisp?: string;
    }> = [];

    if (isChinese) {
      // Pure Chinese query → only search local TWSE/TPEx data
      const localResults = twseFuzzySearch(twseList, query);
      quotes = localResults.map(e => ({
        symbol: e.code + (e.market === 'TWSE' ? '.TW' : '.TWO'),
        shortname: e.name,
        longname: e.name,
        chineseName: e.name,
        exchDisp: e.market === 'TWSE' ? '台灣證交所' : '台灣櫃買中心',
        typeDisp: 'Equity',
      }));
    } else {
      // English / numeric query → Yahoo Finance + local TWSE enrich
      try {
        const data = await NativeYahooApi.search(query);
        quotes = (data.quotes || []).map((q: Record<string, unknown>) => {
          const sym = (q.symbol as string) || '';
          const code = sym.replace(/\.(TW|TWO)$/, '');
          const entry = nameMap.get(code);
          return { ...q, chineseName: entry?.name };
        });
      } catch {
        // Yahoo failed — fall through to local-only
      }
      // Supplement with local TWSE results for numeric queries
      if (/^\d/.test(query)) {
        const localResults = twseFuzzySearch(twseList, query, 5);
        const existing = new Set(quotes.map(q => q.symbol));
        for (const e of localResults) {
          const sym = e.code + (e.market === 'TWSE' ? '.TW' : '.TWO');
          if (!existing.has(sym)) {
            quotes.unshift({
              symbol: sym,
              shortname: e.name,
              longname: e.name,
              chineseName: e.name,
              exchDisp: e.market === 'TWSE' ? '台灣證交所' : '台灣櫃買中心',
              typeDisp: 'Equity',
            });
          }
        }
      }
    }
    // Return { quotes: [...] } so client-side `res.quotes` works correctly
    res.json({ quotes });
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
    const item = await watchlistRepo.addWatchlistItem({ userId: req.userId!, symbol: symbol.toUpperCase(), name: name ?? null, addedAt: Date.now() });
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

app.get('/api/tv/overview/:symbol', async (req, res) => {
  try {
    const data = await TV.getOverview(req.params.symbol);
    if (data === null) return res.status(503).json({ error: 'TV Service Down' });
    res.json(data);
  } catch (e) { handleApiError(res, e); }
});

app.get('/api/insights/:symbol', authMiddleware, async (req: AuthRequest, res) => {
  const input = req.params.symbol as string;
  const canonical = parseSymbol(input);
  const yahooSymbol = toYahoo(input);
  const tvSymbol = toTradingViewSymbol(input);

  console.log(`[Research] Fetching data for: Yahoo=${yahooSymbol}, TV=${tvSymbol}`);

  const [quote, tvOverview, tvIndicators, tvNews, history, holdersSummary] = await Promise.allSettled([
    NativeYahooApi.quote(yahooSymbol as string),
    TV.getOverview(tvSymbol),
    TV.getIndicators(tvSymbol, (req.query.timeframe as any) || '1d'),
    TV.getNewsHeadlines(tvSymbol),
    NativeYahooApi.chart(yahooSymbol as string, { interval: '1d', period1: String(Date.now() - 90 * 24 * 3600 * 1000) }),
    NativeYahooApi.quoteSummary(yahooSymbol as string, ['majorHoldersBreakdown']),
  ]);

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

  res.json({
    symbol: { input, canonical, yahoo: yahooSymbol },
    quote: quoteVal,
    tvOverview: mergedOverview,
    tvIndicators: tvIndicators.status === 'fulfilled' ? (tvIndicators.value as any)?.data || tvIndicators.value : null,
    tvNews: tvNews.status === 'fulfilled' ? (tvNews.value as any)?.data || tvNews.value : null,
    history: history.status === 'fulfilled' ? (history.value as any).quotes : [],
  });
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

// ── Stock Screener ─────────────────────────────────────────────────────────────
// Batch-scans a list of symbols against technical criteria.
// Uses Yahoo Finance for quotes + 90-day price history for indicator computation.
app.post('/api/screener', authMiddleware, screenerLimiter, async (req: AuthRequest, res) => {
  const { symbols = [], filters = {} } = req.body ?? {};
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array required' });
  }
  // Fix #1: cap symbols to prevent event-loop saturation
  if (symbols.length > MAX_SCREENER_SYMBOLS) {
    return res.status(400).json({
      error: `Max ${MAX_SCREENER_SYMBOLS} symbols per request`,
    });
  }

  // Fix #5: typed accumulator — no more results: any[]
  const results: ScreenerResultRow[] = [];

  await Promise.allSettled(
    symbols.map(async (sym: string) => {
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
    })
  );

  res.json({ results, scanned: symbols.length });
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
  const { symbol, period1, period2, initialCapital, strategy } = req.body;
  try {
    const data = await NativeYahooApi.chart(symbol, { period1, period2 });
    if (data.quotes.length < 50) throw new Error('Insufficient data for backtest');
    res.json(runBacktestLogic(data.quotes, strategy, Number(initialCapital) || 1000000));
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
