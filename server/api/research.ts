/**
 * server/api/research.ts
 *
 * Research Pro Router — SEC Edgar + Smart Money + 國會交易追蹤
 *
 * 路由：
 *   GET /api/research/edgar/:symbol              — SEC 申報列表 + 財務摘要
 *   GET /api/research/smart-money/13f            — 13F 機構持倉追蹤
 *   GET /api/research/smart-money/insider/:symbol — 內部人 Form 4 交易追蹤
 *   GET /api/research/congress                   — 最近國會議員交易（全部）
 *   GET /api/research/congress/:ticker           — 特定股票的國會議員交易
 *
 * 掛載至 server.ts：
 *   import { researchRouter } from './server/api/research.js';
 *   app.use('/api/research', authMiddleware, researchRouter);
 */

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getCompanyFilings,
  getFinancialSummary,
  formatUSD,
} from '../utils/edgarApi.js';
import {
  getRecentCongressTrades,
  analyzeCongressTrades,
  formatAmountRange,
} from '../utils/capitolTrades.js';
import {
  getLatest13FOverview,
  getRecentInsiderActivity,
  getTrackedManagers,
  searchTrackedManagers,
} from '../utils/smartMoneyApi.js';
import { getSmartMoneySettingsForUser } from '../services/smartMoneyConfig.js';

export const researchRouter = Router();

type RoutedAuthRequest<
  Params extends Record<string, string> = Record<string, string>,
  Query extends Record<string, string | undefined> = Record<string, string | undefined>,
> = AuthRequest & {
  params: Params;
  query: Query;
};

type ResearchResponse = Response;

// ── Simple in-memory cache to avoid hammering SEC / House Disclosure ──────────
interface CacheEntry<T> { data: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.data as T;
}

function toCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── GET /api/research/edgar/:symbol ──────────────────────────────────────────

researchRouter.get('/edgar/:symbol', async (
  req: RoutedAuthRequest<{ symbol: string }>,
  res: ResearchResponse,
) => {
  const symbol = (req.params.symbol as string).toUpperCase().replace('.TW', '').replace('.TWO', '');

  const cacheKey = `edgar:${symbol}`;
  const cached = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [companyInfo, financials] = await Promise.allSettled([
      getCompanyFilings(symbol, ['10-K', '10-Q', '8-K'], 15),
      getFinancialSummary(symbol),
    ]);

    const info = companyInfo.status === 'fulfilled' ? companyInfo.value : null;
    const fin  = financials.status  === 'fulfilled' ? financials.value  : null;

    if (!info) {
      res.status(404).json({ error: `找不到 ${symbol} 的 SEC 申報資料。請確認為美股代號。` });
      return;
    }

    const result = {
      company: {
        name:     info.name,
        cik:      info.cik,
        ticker:   info.ticker,
        sic:      info.sic,
        sicDesc:  info.sicDesc,
        stateInc: info.stateInc,
        secUrl:   `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${info.cik}&type=10-K&dateb=&owner=include&count=10`,
      },
      financials: fin ? {
        period:    fin.period,
        revenue:   formatUSD(fin.revenue),
        netIncome: formatUSD(fin.netIncome),
        eps:       fin.eps != null ? `$${fin.eps.toFixed(2)}` : '---',
        assets:    formatUSD(fin.assets),
        equity:    formatUSD(fin.equity),
        rawRevenue:   fin.revenue,
        rawNetIncome: fin.netIncome,
      } : null,
      filings: info.filings.map(f => ({
        form:        f.form,
        filingDate:  f.filingDate,
        description: f.description,
        url:         f.url,
      })),
    };

    toCache(cacheKey, result, 30 * 60_000); // 30-min cache
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research/Edgar] ${symbol}:`, msg);
    res.status(500).json({ error: `SEC 數據載入失敗: ${msg}` });
  }
});

// ── GET /api/research/smart-money/13f?manager=berkshire-hathaway ───────────

researchRouter.get('/smart-money/managers/search', async (
  req: RoutedAuthRequest<Record<string, string>, { q?: string }>,
  res: ResearchResponse,
) => {
  const query = String(req.query.q ?? '').trim();
  if (query.length < 2) {
    res.json({ query, results: [] });
    return;
  }

  const cacheKey = `smart-money:manager-search:${query.toLowerCase()}`;
  const cached = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const results = await searchTrackedManagers(query, 8);
    const payload = { query, results };
    toCache(cacheKey, payload, 30 * 60_000);
    res.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research/ManagerSearch] ${query}:`, msg);
    res.status(500).json({ error: `CIK 搜尋失敗: ${msg}` });
  }
});

researchRouter.get('/smart-money/13f', async (
  req: RoutedAuthRequest<Record<string, string>, { manager?: string }>,
  res: ResearchResponse,
) => {
  const customManagers = req.userId
    ? await getSmartMoneySettingsForUser(req.userId).then((settings) => settings.customManagers).catch(() => [])
    : [];
  const availableManagers = getTrackedManagers(customManagers);
  const requestedManager = typeof req.query.manager === 'string'
    ? req.query.manager
    : availableManagers[0]?.id;

  if (!requestedManager) {
    res.status(500).json({ error: '尚未配置可追蹤的 13F 機構。' });
    return;
  }

  const isSupportedManager = availableManagers.some((manager) => manager.id === requestedManager);
  if (!isSupportedManager) {
    res.status(400).json({ error: `不支援的 13F 機構代號: ${requestedManager}` });
    return;
  }

  const managerFingerprint = availableManagers.map((manager) => `${manager.id}:${manager.cik}`).join('|');
  const cacheKey = `smart-money:13f:${requestedManager}:${managerFingerprint}`;
  const cached = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const result = await getLatest13FOverview(requestedManager, customManagers);
    toCache(cacheKey, result, 6 * 60 * 60_000); // 13F 季資料，快取 6 小時
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research/13F] ${requestedManager}:`, msg);
    res.status(500).json({ error: `13F 數據載入失敗: ${msg}` });
  }
});

// ── GET /api/research/smart-money/insider/:symbol ──────────────────────────

researchRouter.get('/smart-money/insider/:symbol', async (
  req: RoutedAuthRequest<{ symbol: string }>,
  res: ResearchResponse,
) => {
  const symbol = (req.params.symbol as string).toUpperCase().replace('.TW', '').replace('.TWO', '');
  const cacheKey = `smart-money:insider:${symbol}`;
  const cached = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const result = await getRecentInsiderActivity(symbol);
    if (!result) {
      res.status(404).json({ error: `找不到 ${symbol} 的內部人申報資料。請確認為美股代號。` });
      return;
    }

    toCache(cacheKey, result, 30 * 60_000);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research/Insider] ${symbol}:`, msg);
    res.status(500).json({ error: `內部人交易數據載入失敗: ${msg}` });
  }
});

// ── GET /api/research/congress  (recent all tickers) ─────────────────────────

researchRouter.get('/congress', async (_req: AuthRequest, res: ResearchResponse) => {
  const cacheKey = 'congress:all';
  const cached = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const trades  = await getRecentCongressTrades(undefined, 100);
    const summary = analyzeCongressTrades(trades);

    const result = {
      summary: {
        totalTrades: summary.totalTrades,
        buyCount:    summary.buyCount,
        sellCount:   summary.sellCount,
        buyBias:     summary.buyBias,
        topTraders:  summary.topTraders,
      },
      trades: trades.slice(0, 100).map(t => ({
        ...t,
        amountFormatted: formatAmountRange(t.amount),
      })),
    };

    toCache(cacheKey, result, 60 * 60_000); // 1-hr cache
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Research/Congress]', msg);
    res.status(500).json({ error: `國會交易數據載入失敗: ${msg}` });
  }
});

// ── GET /api/research/congress/:ticker ───────────────────────────────────────

researchRouter.get('/congress/:ticker', async (
  req: RoutedAuthRequest<{ ticker: string }>,
  res: ResearchResponse,
) => {
  const ticker   = (req.params.ticker as string).toUpperCase();
  const cacheKey = `congress:${ticker}`;
  const cached   = fromCache<object>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const trades  = await getRecentCongressTrades(ticker, 50);
    const summary = analyzeCongressTrades(trades);

    const result = {
      ticker,
      summary: {
        totalTrades: summary.totalTrades,
        buyCount:    summary.buyCount,
        sellCount:   summary.sellCount,
        buyBias:     summary.buyBias,
        topTraders:  summary.topTraders,
      },
      trades: trades.map(t => ({
        ...t,
        amountFormatted: formatAmountRange(t.amount),
      })),
    };

    toCache(cacheKey, result, 60 * 60_000);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Research/Congress] ${ticker}:`, msg);
    res.status(500).json({ error: `國會交易數據載入失敗: ${msg}` });
  }
});
