import 'dotenv/config'; // ← MUST be first — loads .env before any module reads process.env
import express from 'express';
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
import { calcIndicators } from './server/utils/technical.js';
import { analyzeSentiment } from './server/utils/sentiment.js';
import { agentRouter } from './server/api/agent.js';
import { startAutonomousAgent } from './server/services/autonomousAgent.js';

// Lazy-load Neon DB (requires DATABASE_URL to be set)
let dbAvailable = false;
try {
  await import('./src/db/index.js');
  dbAvailable = true;
  // Start the background autonomous agent loop
  startAutonomousAgent();
} catch (e) {
  console.warn('[DB] Neon not available — set DATABASE_URL in .env to enable persistence:', (e as Error).message);
}

// --- Native Yahoo API Engine ---
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
  private static failureCooldown = 5 * 60 * 1000; // 5 min backoff after 429

  // --- In-memory response cache (survives 429 outages) ---
  private static cache = new Map<string, { data: unknown; ts: number }>();
  private static CACHE_TTL = 10 * 60 * 1000; // 10 min fresh data
  private static STALE_TTL = 60 * 60 * 1000; // 1 hr stale-while-error

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
      throw new Error('Yahoo Finance 暫時不可用，請稍後再試');
    }
    if (this.isFetchingCrumb) {
      while (this.isFetchingCrumb) await new Promise(r => setTimeout(r, 100));
      if (!this.crumb) throw new Error('Yahoo Finance 驗證失敗');
      return;
    }

    this.isFetchingCrumb = true;
    try {
      console.log('[NativeYF] 正在取得 Yahoo Cookie 與 Crumb...');
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
          res.on('data', () => {});
          res.on('end', () => resolve(foundCookie));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Cookie 請求超時')); });
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
        console.log(`[NativeYF] Crumb 取得成功! (${this.crumb})`);
      } else {
        throw new Error(`Crumb 取得失敗: HTTP ${res2.status}`);
      }
    } catch (err) {
      this.lastFailedAt = Date.now();
      console.error('[NativeYF] 取得驗證資料失敗:', err);
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
    
    // Support processing numeric string gracefully
    const getUnixTs = (val: string | number) => {
      const num = Number(val);
      if (!isNaN(num)) return Math.floor(num / (num > 1e11 ? 1000 : 1)); // Handle ms vs sec
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
        open:   quote.open[i],
        high:   quote.high[i],
        low:    quote.low[i],
        close:  quote.close[i],
        volume: quote.volume[i]
      })).filter((q: any): q is HistoricalData => q.close !== null && q.close !== undefined);
      this.setCache(cacheKey, quotes);
      return { quotes };
    } catch (err) {
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

// (JSON DB helpers removed — data is now stored in Neon PostgreSQL)

// --- Backtest Logic ---
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
  const r: (number | null)[] = [];
  let g = 0, l = 0;
  for (let i = 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) g += d; else l -= d;
    if (i < p) r.push(null);
    else if (i === p) {
      const ag = g / p, al = l / p;
      r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    } else {
      // Wilder's
      const prev = r[i - 1]!;
      // This is complex to do perfectly in one pass, let's use a simpler version
      r.push(prev); // Placeholder
    }
  }
  // Simplified RSI for backtest
  const rsi: (number|null)[] = [null];
  for(let i=1; i<data.length; i++) {
    let up=0, dn=0;
    const start = Math.max(0, i-p);
    for(let j=start+1; j<=i; j++) {
      const d = data[j]-data[j-1];
      if(d>0) up+=d; else dn-=d;
    }
    rsi.push(dn===0?100:100-100/(1+up/dn));
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
      if (s10[i-1]! <= s30[i-1]! && s10[i]! > s30[i]!) signals[i] = 1;
      else if (s10[i-1]! >= s30[i-1]! && s10[i]! < s30[i]!) signals[i] = -1;
    }
  } else if (strategy === 'rsi') {
    const rsi = RSI(closes, 14);
    for (let i = 1; i < quotes.length; i++) {
      if (rsi[i-1]! < 35 && rsi[i]! >= 35) signals[i] = 1;
      else if (rsi[i-1]! > 65 && rsi[i]! <= 65) signals[i] = -1;
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
      if (hist[i-1]! <= 0 && hist[i]! > 0 && macd[i]! > 0) signals[i] = 1;
      else if (hist[i-1]! >= 0 && hist[i]! < 0) signals[i] = -1;
    }
  } else {
    // Neural/Default: Simple Momentum
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

  const roi = Number((( (balance + shares * closes[closes.length-1]) / initialCapital - 1) * 100).toFixed(2));
  const winRate = trades.length > 0 ? Number(((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(2)) : 0;
  
  // Drawdown
  let maxEquity = -Infinity;
  let maxDD = 0;
  const drawdownCurve = equityCurve.map(e => {
    const val = e.portfolio + 100; // use 100 as base
    if (val > maxEquity) maxEquity = val;
    const dd = ((maxEquity - val) / maxEquity) * 100;
    if (dd > maxDD) maxDD = dd;
    return { date: e.date, value: Number(dd.toFixed(2)) };
  });

  return {
    metrics: {
      roi,
      sharpe: 1.5, // Mock
      maxDrawdown: Number(maxDD.toFixed(2)),
      winRate,
      totalTrades: trades.length,
      avgWin: 0, avgLoss: 0, profitFactor: 1.2
    },
    equityCurve,
    drawdownCurve,
    trades
  };
}

export const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

  // --- Health / Diagnostics ---
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString(),
      vercel: !!(process.env.VERCEL || process.env.VERCEL_ENV),
      node: process.version,
      db: dbAvailable,
    });
  });

  // --- AI Analysis (OpenRouter proxy) ---
  app.post('/api/ai/call', authMiddleware, async (req: AuthRequest, res) => {
    const { prompt, model, jsonMode } = req.body;
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn('[API] OPENROUTER_API_KEY is missing in environment variables.');
      res.status(500).json({ error: 'AI service configuration error: Missing API Key. Please contact the administrator.' });
      return;
    }

    const targetModel = model || 'meta-llama/llama-3.3-70b-instruct:free';

    try {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer':  'https://hermes-ai.trading',
          'X-Title':       'Hermes AI Trading',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 2048,
          stream: false,
          ...(jsonMode && { response_format: { type: 'json_object' } }),
        }),
      });

      if (!orRes.ok) {
        const errBody = await orRes.text().catch(() => '');
        console.error('[API] OpenRouter error:', orRes.status, errBody.slice(0, 200));
        res.status(orRes.status).json({ error: `OpenRouter ${orRes.status}: ${errBody.slice(0, 200)}` });
        return;
      }

      const json = await orRes.json() as { choices?: { message?: { content?: string } }[] };
      const text = json?.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('OpenRouter response was empty');
      res.json({ text });
    } catch (e: any) {
      console.error('[API] AI Analyze error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- System Stats ---
  app.get('/api/stats', authMiddleware, (_req, res) => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const MB  = 1024 * 1024;
    const uptimeSec = process.uptime();
    const hours   = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = hours > 0 ? `${hours} 時 ${minutes} 分鐘` : `${minutes} 分鐘`;
    res.json({
      heapUsed:        Math.round(mem.heapUsed  / MB),
      heapTotal:       Math.round(mem.heapTotal / MB),
      rss:             Math.round(mem.rss       / MB),
      cpuUser:         cpu.user,
      cpuSystem:       cpu.system,
      uptimeStr,
      nodeVersion:     process.version,
      electronVersion: '',
      platform:        process.platform,
    });
  });

  // --- System Logs ---
  app.get('/api/logs', authMiddleware, (_req, res) => {
    res.json([]);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
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
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await usersRepo.findUserById(req.userId!);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      res.json({ id: user.id, email: user.email, name: user.name, tier: user.subscriptionTier });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearTokenCookie(res);
    res.json({ ok: true });
  });

  // --- API Routes ---
  app.get('/api/stock/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    try { const q = await NativeYahooApi.quote(req.params.symbol as string); res.json(q); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/stock/:symbol/history', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const q = await NativeYahooApi.chart(req.params.symbol as string, req.query);
      res.json(q.quotes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/quotes', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const syms = (req.query.symbols as string)?.split(',') || [];
      const results = await NativeYahooApi.quote(syms);
      res.json(Array.isArray(results) ? results : [results]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/news/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    try { const data = await NativeYahooApi.search(req.params.symbol as string); res.json(data.news || []); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/search/:query', authMiddleware, async (req: AuthRequest, res) => {
    try { const data = await NativeYahooApi.search(req.params.query as string); res.json(data.quotes || []); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/calendar/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = await NativeYahooApi.quoteSummary(req.params.symbol as string, ['calendarEvents']);
      res.json(data.calendarEvents || {});
    } catch (e: any) {
      // Calendar data is non-critical; many non-US symbols lack this module
      console.warn(`[Calendar] ${req.params.symbol}: ${e.message}`);
      res.json({});
    }
  });

  app.get('/api/forex/:pair', authMiddleware, async (req: AuthRequest, res) => {
    try { const q = await NativeYahooApi.quote(req.params.pair as string); res.json({ rate: q?.regularMarketPrice ?? 32.5 }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/watchlist', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const items = await watchlistRepo.getWatchlistByUser(req.userId!);
      res.json(items.map(i => ({ symbol: i.symbol, name: i.name, addedAt: i.addedAt })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/watchlist', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const list: Array<{ symbol: string; name?: string; addedAt?: number }> = req.body;
      await watchlistRepo.replaceWatchlist(req.userId!, list);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Single-item add/upsert — avoids full-replace race conditions
  app.post('/api/watchlist', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { symbol, name } = req.body ?? {};
      if (!symbol || typeof symbol !== 'string') {
        res.status(400).json({ error: 'symbol is required' }); return;
      }
      const item = await watchlistRepo.addWatchlistItem({
        userId: req.userId!,
        symbol: symbol.toUpperCase(),
        name: name ?? null,
        addedAt: Date.now(),
      });
      res.status(201).json({ symbol: item.symbol, name: item.name, addedAt: item.addedAt });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Alerts ---
  app.get('/api/alerts', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const list = await alertsRepo.getAlertsByUser(req.userId!);
      res.json(list.map(a => ({
        id: a.id, symbol: a.symbol, condition: a.condition,
        target: Number(a.target), triggered: a.triggered,
        triggeredAt: a.triggeredAt, triggeredPrice: a.triggeredPrice != null ? Number(a.triggeredPrice) : undefined,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/alerts', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { symbol, condition, target } = req.body;
      const alert = await alertsRepo.createAlert(req.userId!, { symbol, condition, target: String(target) });
      res.json({ id: alert.id, symbol: alert.symbol, condition: alert.condition, target: Number(alert.target), triggered: alert.triggered });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/alerts/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await alertsRepo.deleteAlert(req.userId!, Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Trade Execution ---
  app.post('/api/trade/execute', authMiddleware, async (req: AuthRequest, res) => {
    const order = req.body;
    const userId = req.userId!;
    try {
      // 1. Fetch current positions for Risk Management
      const existing = await positionsRepo.getPositionsByUser(userId);
      let totalCost = 0;
      let totalVal = 0;
      let usdtwd = 32.5;
      
      // Calculate total exposure to enforce limits
      const symbols = existing.map(p => p.symbol);
      let qMap = new Map();
      if (symbols.length > 0) {
         try {
           const results = await NativeYahooApi.quote(symbols);
           const quotes = Array.isArray(results) ? results : [results];
           qMap = new Map(quotes.filter(q => q && q.symbol).map(q => [q.symbol, q]));
         } catch { /* if fetch fails, skip live value */ }
      }

      existing.forEach(p => {
         const shares = Number(p.shares) || 0;
         const avgCost = Number(p.avgCost) || 0;
         const currentPrice = qMap.get(p.symbol)?.regularMarketPrice || avgCost;
         totalCost += avgCost * shares;
         totalVal += currentPrice * shares;
      });

      const plPct = totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
      const targetAccountValue = totalVal > 0 ? totalVal : 1000000; // Simulated $1M starting capital
      const tradeValue = order.amount * order.price;

      // [Risk Validation Check] Backend Level
      if (order.side === 'buy') {
        if (totalCost > 0 && plPct <= -3) {
           return res.status(403).json({ error: 'Circuit Breaker Triggered: Total loss exceeds -3% limit.' });
        }
        if (tradeValue > targetAccountValue * 0.05) {
           return res.status(403).json({ error: `Position Limit Exceeded: Order value > 5% of account.` });
        }
      }

      const trade = await tradesRepo.createTrade(userId, { ...order, time: new Date().toISOString() });
      const pos = existing.find(p => p.symbol === order.symbol);
      const isTWD = order.symbol.endsWith('.TW') || order.symbol.endsWith('.TWO');
      const currency = isTWD ? 'TWD' : 'USD';
      
      if (order.side === 'buy') {
        if (pos) {
          const newCost = Number(pos.shares) * Number(pos.avgCost) + order.total;
          const newShares = Number(pos.shares) + order.amount;
          await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(newShares), avgCost: String(newCost / newShares), currency });
        } else {
          await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(order.amount), avgCost: String(order.price), currency });
        }
      } else {
        if (pos) {
          const newShares = Number(pos.shares) - order.amount;
          if (newShares <= 0) {
            await positionsRepo.removePosition(userId, order.symbol);
          } else {
            await positionsRepo.upsertPosition(userId, { symbol: order.symbol, shares: String(newShares), avgCost: pos.avgCost, currency });
          }
        }
      }
      res.json({ ok: true, trade });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Screener ---
  app.post('/api/screener', authMiddleware, async (req: AuthRequest, res) => {
    const { symbols, filters } = req.body;
    try {
      const results = await Promise.all(symbols.map(async (s: string) => {
        try {
          const q = await NativeYahooApi.quote(s);
          const h = await NativeYahooApi.chart(s, { interval: '1d', period1: Date.now() - 60*24*60*60*1000 });
          const closes = h.quotes.map((x: HistoricalData) => x.close);
          const rsiVal = RSI(closes, 14).pop() || 50;
          const sma20Val = SMA(closes, 20).pop() || 0;
          const current = q.regularMarketPrice;
          let match = true;
          if (filters.rsiBelow && rsiVal > filters.rsiBelow) match = false;
          if (filters.rsiAbove && rsiVal < filters.rsiAbove) match = false;
          if (filters.aboveSMA20 && current < sma20Val) match = false;
          if (filters.belowSMA20 && current > sma20Val) match = false;
          if (match) return { symbol: s, price: current, change: q.regularMarketChangePercent, rsi: rsiVal, sma20: sma20Val };
          return null;
        } catch { return null; }
      }));
      res.json(results.filter(r => r !== null));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/positions', authMiddleware, async (req: AuthRequest, res) => {
    let usdtwd = 32.5;
    try { const q = await NativeYahooApi.quote('USDTWD=X'); usdtwd = q?.regularMarketPrice ?? 32.5; } catch { /**/ }
    try {
      const userId = req.userId!;
      const list = await positionsRepo.getPositionsByUser(userId);
      
      // Batch fetch prices to avoid UI spinners
      const symbols = list.map(p => p.symbol);
      let quotes: any[] = [];
      if (symbols.length > 0) {
        try {
          const results = await NativeYahooApi.quote(symbols);
          quotes = Array.isArray(results) ? results : [results];
        } catch (err) {
          console.warn('[API] Failed to fetch prices for positions:', err);
        }
      }
      
      const qMap = new Map(quotes.filter(q => q && q.symbol).map(q => [q.symbol, q]));
      
      const enriched = list.map(p => {
        const q = qMap.get(p.symbol);
        const shares = Number(p.shares);
        const avgCost = Number(p.avgCost);
        const cur = p.currency || 'USD';
        
        let currentPrice = q?.regularMarketPrice ?? null;
        let pnl = null;
        let pnlPercent = null;
        let marketValue = null;
        let marketValueTWD = null;

        if (currentPrice != null) {
          pnl = (currentPrice - avgCost) * shares;
          pnlPercent = avgCost > 0 ? ((currentPrice / avgCost) - 1) * 100 : 0;
          marketValue = currentPrice * shares;
          marketValueTWD = cur === 'TWD' ? marketValue : marketValue * usdtwd;
        }

        return {
          symbol: p.symbol,
          name: q?.shortName || p.name || p.symbol,
          shares,
          avgCost,
          currency: cur,
          currentPrice,
          pnl,
          pnlPercent,
          marketValue,
          marketValueTWD
        };
      });

      res.json({ positions: enriched, usdtwd });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/positions', authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!Array.isArray(req.body)) {
        res.status(400).json({ error: 'Body must be an array of positions' });
        return;
      }
      await positionsRepo.replacePositions(req.userId!, req.body);
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[API] PUT /api/positions error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/trades', authMiddleware, async (req: AuthRequest, res) => {
    try {
      res.json(await tradesRepo.getTradesByUser(req.userId!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/trades', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const trade = await tradesRepo.createTrade(req.userId!, req.body);
      res.json(trade);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/trades/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const trade = await tradesRepo.updateTrade(req.userId!, Number(req.params.id), req.body);
      if (!trade) { res.status(404).json({ error: 'Trade not found' }); return; }
      res.json(trade);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/trades/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await tradesRepo.deleteTrade(req.userId!, Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/settings/:key', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const value = await settingsRepo.getSetting(req.userId!, req.params.key as string);
      res.json({ value: value ?? null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/settings/:key', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await settingsRepo.setSetting(req.userId!, req.params.key as string, req.body.value);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Strategies ---
  app.get('/api/strategies', authMiddleware, async (req: AuthRequest, res) => {
    try { res.json(await strategiesRepo.getStrategiesByUser(req.userId!)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/strategies', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const s = await strategiesRepo.createStrategy(req.userId!, req.body);
      res.status(201).json(s);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/strategies/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const s = await strategiesRepo.updateStrategy(req.userId!, Number(req.params.id), req.body);
      if (!s) { res.status(404).json({ error: 'Strategy not found' }); return; }
      res.json(s);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/strategies/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await strategiesRepo.deleteStrategy(req.userId!, Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/strategies/:id/activate', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await strategiesRepo.setActiveStrategy(req.userId!, Number(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- TradingView (via Python microservice) ---
  // 所有端點接受 Yahoo 或 TradingView 風格 symbol，內部以 symbolParser 統一轉換。
  app.get('/api/tv/health', async (_req, res) => {
    res.json({ available: await TV.isAvailable() });
  });

  app.get('/api/tv/overview/:symbol', async (req, res) => {
    try {
      const data = await TV.getOverview(req.params.symbol);
      if (data === null) return res.status(503).json({ error: 'TradingView service unavailable' });
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/tv/indicators/:symbol', async (req, res) => {
    try {
      const tf = (req.query.timeframe as any) || '1d';
      const data = await TV.getIndicators(req.params.symbol, tf);
      if (data === null) return res.status(503).json({ error: 'TradingView service unavailable' });
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/tv/news/:symbol', async (req, res) => {
    try {
      const data = await TV.getNewsHeadlines(req.params.symbol);
      res.json(data ?? []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/tv/ideas/:symbol', async (req, res) => {
    try {
      const sort = (req.query.sort as 'popular' | 'recent') || 'popular';
      const data = await TV.getIdeas(req.params.symbol, sort);
      res.json(data ?? []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Unified multi-source insights ---
  // Yahoo 為主要資料源（價格、歷史），TradingView 為補強（指標、想法、社群）。
  // 任一來源失敗不阻斷另一來源。
  app.get('/api/insights/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    const input = req.params.symbol as string;
    const canonical = parseSymbol(input);
    const yahooSymbol = toYahoo(canonical);

    const [quote, tvOverview, tvIndicators, tvNews] = await Promise.allSettled([
      NativeYahooApi.quote(yahooSymbol as string),
      TV.getOverview(canonical),
      TV.getIndicators(canonical, (req.query.timeframe as any) || '1d'),
      TV.getNewsHeadlines(canonical),
    ]);

    res.json({
      symbol: { input, canonical, yahoo: yahooSymbol },
      quote:       quote.status === 'fulfilled' ? quote.value : null,
      tvOverview:  tvOverview.status === 'fulfilled' ? tvOverview.value : null,
      tvIndicators:tvIndicators.status === 'fulfilled' ? tvIndicators.value : null,
      tvNews:      tvNews.status === 'fulfilled' ? tvNews.value : null,
      errors: [quote, tvOverview, tvIndicators, tvNews]
        .map((r, i) => r.status === 'rejected'
          ? { source: ['yahoo','tv.overview','tv.indicators','tv.news'][i], message: (r.reason as Error)?.message }
          : null)
        .filter(Boolean),
    });
  });

  // --- Hermes Agent ---
  app.use('/api/agent', authMiddleware, agentRouter);

  // --- Smart Market Routing (/api/market/:symbol) ---
  // 解析 ticker 判斷市場（純數字為台股）。
  // 預設呼叫 Yahoo Finance 獲取資料。
  // 若為台股且 Yahoo 資料非最新，則同步呼叫 TWSE API 更新即時價格。
  // 若上述失敗，嘗試 Fallback 到 TradingView。
  app.get('/api/market/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    const rawSymbol = req.params.symbol as string;
    const isTWStock = /^\d{4,5}$/.test(rawSymbol);
    const yahooSymbol = isTWStock ? `${rawSymbol}.TW` : rawSymbol;

    try {
      // Step 1: Yahoo Finance 主要資料源
      const [quoteData, histData, newsData] = await Promise.allSettled([
        NativeYahooApi.quote(yahooSymbol),
        NativeYahooApi.chart(yahooSymbol, {
          interval: '1d',
          period1:  Date.now() - 90 * 24 * 60 * 60 * 1000,
        }),
        NativeYahooApi.search(yahooSymbol),
      ]);

      const quote   = quoteData.status === 'fulfilled' ? quoteData.value : null;
      const history = histData.status  === 'fulfilled' ? histData.value.quotes : [];

      // Step 2: 若為台股且 Yahoo 價格超過 5 分鐘未更新 → 嘗試 TWSE
      let twseQuote: TWSE.TWSeQuote | null = null;
      if (isTWStock && quote) {
        const lastRefresh = quote.regularMarketTime
          ? new Date(quote.regularMarketTime * 1000).getTime()
          : 0;
        const staleMs = Date.now() - lastRefresh;
        if (staleMs > 5 * 60 * 1000) {
          twseQuote = await TWSE.realtimeQuote(rawSymbol).catch(() => null);
        }
      }

      // Step 3: 誡算技術指標
      let techResult = null;
      if (history.length >= 20) {
        try {
          techResult = calcIndicators(history);
        } catch { /* 指標計算失敗不阻斷 */ }
      }

      // Step 4: 情緒分析
      const rawNews = newsData.status === 'fulfilled' ? (newsData.value?.news ?? []) : [];
      const sentiment = analyzeSentiment(rawNews, 3);

      const price = twseQuote?.price ?? quote?.regularMarketPrice ?? 0;

      // Step 5: 若全部失敗→ TradingView Fallback
      if (!quote && !twseQuote) {
        const canonical = parseSymbol(rawSymbol);
        const tvData = await TV.getOverview(canonical).catch(() => null);
        if (tvData) {
          return res.json({
            symbol:    rawSymbol,
            source:    'TradingView',
            price:     (tvData as Record<string, unknown>).close ?? 0,
            history:   [],
            technical: null,
            sentiment,
            raw:       tvData,
          });
        }
        return res.status(404).json({ error: `找不到 ${rawSymbol} 的市場資料` });
      }

      return res.json({
        symbol:    rawSymbol,
        source:    twseQuote ? 'TWSE+Yahoo' : 'Yahoo',
        price,
        change:    twseQuote?.change   ?? quote?.regularMarketChange,
        changePct: twseQuote?.changePercent ?? quote?.regularMarketChangePercent,
        open:      twseQuote?.open  ?? quote?.regularMarketOpen,
        high:      twseQuote?.high  ?? quote?.regularMarketDayHigh,
        low:       twseQuote?.low   ?? quote?.regularMarketDayLow,
        volume:    twseQuote?.volume ?? quote?.regularMarketVolume,
        name:      twseQuote?.name  ?? quote?.longName ?? quote?.shortName,
        history:   history.map(h => ({
          date:   h.date instanceof Date ? h.date.toISOString().split('T')[0] : h.date,
          open:   h.open,
          high:   h.high,
          low:    h.low,
          close:  h.close,
          volume: h.volume,
        })),
        technical: techResult ? {
          sma20:          techResult.latest.sma20,
          sma50:          techResult.latest.sma50,
          macdLine:       techResult.latest.macdLine,
          macdSignal:     techResult.latest.macdSignal,
          macdHist:       techResult.latest.macdHist,
          rsi14:          techResult.latest.rsi14,
          recommendation: techResult.recommendation,
          score:          techResult.score,
        } : null,
        sentiment,
        twse:  twseQuote,
      });
    } catch (e: unknown) {
      // 最終 Fallback→TradingView
      try {
        const canonical = parseSymbol(rawSymbol);
        const tvData = await TV.getOverview(canonical);
        if (tvData) {
          return res.json({ symbol: rawSymbol, source: 'TradingView', price: (tvData as Record<string, unknown>).close ?? 0, history: [], technical: null });
        }
      } catch { /* ignore */ }
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: msg });
    }
  });

  // --- Backtest Engine ---
  app.post('/api/backtest', authMiddleware, async (req: AuthRequest, res) => {
    const { symbol, period1, period2, initialCapital, strategy } = req.body;
    try {
      const data = await NativeYahooApi.chart(symbol, { period1, period2 });
      const quotes = data.quotes;
      if (quotes.length < 50) throw new Error('數據不足，無法進行回測');

      const cap = Number(initialCapital) || 1000000;
      const result = runBacktestLogic(quotes, strategy, cap);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Vite Middleware ---
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    if (process.env.NODE_ENV !== 'production') {
      import('vite').then(async ({ createServer: createViteServer }) => {
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
        app.listen(PORT, '0.0.0.0', () => {
          console.log(`Server running on http://localhost:${PORT}`);
        });
      });
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('/{*path}', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

export default app;
