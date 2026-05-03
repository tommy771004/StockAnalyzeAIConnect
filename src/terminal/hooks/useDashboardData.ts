/**
 * src/terminal/hooks/useDashboardData.ts
 *
 * Loads the Dashboard's live data:
 *   1. Watchlist items  → GET /api/watchlist
 *   2. Quote prices     → GET /api/quotes?symbols=...
 *   3. Chart history    → GET /api/stock/:sym/history
 *   4. Top movers       → derived from quotes (biggest ± moves)
 *
 * Falls back to mockData silently when the server returns 401 (not logged in)
 * or the network is unavailable, so the UI never crashes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../services/api';
import { isTaiwanTradingHours } from '../../services/cache';
import type { WatchlistRow, Mover, CandlePoint, DashboardNews } from '../types';
import { dashboardNews as mockDashboardNews, topGainers as mockTopGainers, topLosers as mockTopLosers, watchlistRows as mockWatchlistRows } from '../mockData';

// ─── Shape returned by the hook ────────────────────────────────────────────────
export interface DashboardData {
  loading: boolean;
  /** true = data is live from API, false = using mock data */
  isLive: boolean;
  /** Source fidelity: LIVE (real-time), DELAYED (stale/partial), MOCK (fallback) */
  dataMode: 'LIVE' | 'DELAYED' | 'MOCK';
  watchlist: WatchlistRow[];
  gainers: Mover[];
  losers: Mover[];
  /** Candle data for the currently-selected symbol */
  candles: CandlePoint[];
  news: DashboardNews[];
  /** ISO-8601 timestamp of last successful fetch */
  lastUpdated: string | null;
  /** Currently selected symbol */
  selected: string;
  setSelected: (sym: string) => void;
  selectedRow: WatchlistRow;
  /** Re-fetch everything immediately */
  refresh: () => void;
  /** Add symbol to watchlist */
  addToWatchlist: (sym: string) => Promise<void>;
  /** Remove symbol from watchlist */
  removeFromWatchlist: (sym: string) => Promise<void>;
}

// ─── Range → Yahoo interval/period1 map ────────────────────────────────────────
export type ChartRange = '1D' | '5D' | '1W' | '1M' | '6M' | 'YTD' | '1Y';

function rangeToParams(r: ChartRange): Record<string, string> {
  const now = Date.now();
  switch (r) {
    case '1D':  return { interval: '1m',   period1: String(now - 24 * 3600 * 1000) };
    case '5D':  return { interval: '5m',   period1: String(now - 5 * 24 * 3600 * 1000) };
    case '1W':  return { interval: '15m',  period1: String(now - 7 * 24 * 3600 * 1000) };
    case '1M':  return { interval: '1h',   period1: String(now - 30 * 24 * 3600 * 1000) };
    case '6M':  return { interval: '1d',   period1: String(now - 180 * 24 * 3600 * 1000) };
    case 'YTD': {
      const ytd = new Date(); ytd.setMonth(0); ytd.setDate(1); ytd.setHours(0, 0, 0, 0);
      return { interval: '1d', period1: String(ytd.getTime()) };
    }
    case '1Y':  return { interval: '1d',   period1: String(now - 365 * 24 * 3600 * 1000) };
    default:    return { interval: '1h',   period1: String(now - 30 * 24 * 3600 * 1000) };
  }
}

// Format raw Yahoo quote volume (e.g. 45123456 → "45M")
function fmtVolume(v: number | undefined | null): string {
  if (!v) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// Map a raw Yahoo quote object → WatchlistRow
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQuote(q: any, sym: string): WatchlistRow {
  return {
    symbol: sym,
    name: q?.shortName ?? q?.longName,
    last: q?.regularMarketPrice ?? 0,
    changePct: q?.regularMarketChangePercent ?? 0,
    volume: fmtVolume(q?.regularMarketVolume),
  };
}

// Map Yahoo history records → CandlePoint[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHistory(raw: any[]): CandlePoint[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((r, i) => ({
    t: Math.floor(new Date(r.date).getTime() / 1000),
    open:   Number(r.open)   || 0,
    high:   Number(r.high)   || 0,
    low:    Number(r.low)    || 0,
    close:  Number(r.close)  || 0,
    volume: Number(r.volume) || 0,
  }));
}

const DEFAULT_SYMBOLS = ['SPY', 'NVDA', 'AAPL', 'MSFT', 'TSLA'];

export function useDashboardData(range: ChartRange = '1W'): DashboardData {
  const [loading, setLoading]       = useState(true);
  const [isLive, setIsLive]         = useState(false);
  const [dataMode, setDataMode]     = useState<'LIVE' | 'DELAYED' | 'MOCK'>('MOCK');
  const [watchlist, setWatchlist]   = useState<WatchlistRow[]>([]);
  const [gainers, setGainers]       = useState<Mover[]>([]);
  const [losers, setLosers]         = useState<Mover[]>([]);
  const [candles, setCandles]       = useState<CandlePoint[]>([]);
  const [news, setNews]             = useState<DashboardNews[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selected, setSelectedRaw]  = useState<string>('NVDA');

  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async (sym: string, rng: ChartRange) => {
    // Cancel previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      let usedDefaultSymbols = false;
      let quotesOk = false;
      let historyOk = false;
      let newsOk = false;

      // ── 1. Watchlist symbols ─────────────────────────────────────────────────
      let symbols: string[] = [...DEFAULT_SYMBOLS];
      try {
        const wl = await api.getWatchlist();
        if (Array.isArray(wl) && wl.length > 0) {
          symbols = wl.map((item: { symbol: string }) => item.symbol);
        } else {
          usedDefaultSymbols = true;
        }
      } catch {
        usedDefaultSymbols = true;
      }

      // Ensure selected symbol is included
      if (!symbols.includes(sym)) symbols = [sym, ...symbols];

      // ── 2. Batch quotes ──────────────────────────────────────────────────────
      let quotes: any[] = [];
      try {
        quotes = await api.getBatchQuotes(symbols);
        quotesOk = Array.isArray(quotes) && quotes.length > 0;
      } catch {
        quotesOk = false;
      }

      const qMap = new Map<string, any>(quotes.filter(Boolean).map((q: any) => [q.symbol as string, q]));
      const liveRows: WatchlistRow[] = symbols.map((s) => {
        const q = qMap.get(s);
        return q ? mapQuote(q, s) : { symbol: s, last: 0, changePct: 0, volume: '—' };
      });
      const hasPricedRows = liveRows.some((row) => row.last > 0);
      const shouldUseMock = !hasPricedRows && !quotesOk;

      if (shouldUseMock) {
        setWatchlist(mockWatchlistRows);
        setGainers(mockTopGainers);
        setLosers(mockTopLosers);
      } else {
        setWatchlist(liveRows);
      }

      // Derive top movers from live data (top 3 gainers / losers)
      if (!shouldUseMock) {
        const sorted = [...liveRows].sort((a, b) => b.changePct - a.changePct);
        setGainers(sorted.slice(0, 3).map((r) => ({ symbol: r.symbol, name: r.name, changePct: r.changePct })));
        setLosers([...sorted].reverse().slice(0, 3).map((r) => ({ symbol: r.symbol, name: r.name, changePct: r.changePct })));
      }
      if (quotesOk && hasPricedRows) {
        setLastUpdated(new Date().toISOString());
      }

      // ── 3. Chart history for selected symbol ─────────────────────────────────
      try {
        const hist: any[] = await api.getHistory(sym, rangeToParams(rng));
        let mapped = mapHistory(hist);
        // During 1D view within Taiwan market hours, patch the last candle's close/high/low
        // with the live quote price so the chart reflects the real-time price immediately.
        if (rng === '1D' && isTaiwanTradingHours() && mapped.length > 0) {
          const liveQ = qMap.get(sym);
          const livePrice: number | undefined = liveQ?.regularMarketPrice;
          if (livePrice && livePrice > 0) {
            const last = mapped[mapped.length - 1]!;
            mapped = [
              ...mapped.slice(0, -1),
              { ...last, close: livePrice, high: Math.max(last.high, livePrice), low: last.low > 0 ? Math.min(last.low, livePrice) : livePrice },
            ];
          }
        }
        if (mapped.length > 0) {
          historyOk = true;
          setCandles(mapped);
        } else {
          setCandles([]);
        }
      } catch {
        setCandles([]);
      }

      // ── 4. Market News for selected symbol ───────────────────────────────────
      try {
        const rawNews = await api.getNews(sym);
        newsOk = Array.isArray(rawNews) && rawNews.length > 0;
        const mappedNews: DashboardNews[] = rawNews.slice(0, 5).map(n => {
          let catDesc = 'TECH';
          if (n.title?.toLowerCase().includes('earn')) catDesc = 'EARNINGS';
          else if (sym === 'BTC-USD' || n.title?.toLowerCase().includes('crypto') || n.title?.toLowerCase().includes('bitcoin')) catDesc = 'CRYPTO';
          else if (n.title?.toLowerCase().includes('fed') || n.title?.toLowerCase().includes('rate')) catDesc = 'MACRO';

          return {
            id: n.id || String(n.providerPublishTime || Date.now()),
            category: catDesc as DashboardNews['category'],
            time: n.providerPublishTime
               ? new Date(n.providerPublishTime * 1000).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
               : new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }),
            title: n.title,
            tickers: [sym, n.publisher].filter(Boolean) as string[],
          };
        });
        if (mappedNews.length > 0) {
          setNews(mappedNews);
        } else if (shouldUseMock) {
          setNews(mockDashboardNews);
        } else {
          setNews([]);
        }
      } catch {
        setNews(shouldUseMock ? mockDashboardNews : []);
      }

      const mode: 'LIVE' | 'DELAYED' | 'MOCK' = shouldUseMock
        ? 'MOCK'
        : (quotesOk && hasPricedRows)
          ? 'LIVE'
          : (historyOk || newsOk || !usedDefaultSymbols)
            ? 'DELAYED'
            : 'MOCK';
      setDataMode(mode);
      setIsLive(mode === 'LIVE');
    } catch {
      setDataMode('MOCK');
      setIsLive(false);
      setWatchlist(mockWatchlistRows);
      setGainers(mockTopGainers);
      setLosers(mockTopLosers);
      setNews(mockDashboardNews);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever selected/range changes.
  // Uses a fixed 2 s base tick; outside Taiwan 1D hours the actual fetch is throttled to 30 s.
  useEffect(() => {
    let busy = false;
    let msSinceLastFetch = 0;
    const BASE_MS = 2_000;

    fetchAll(selected, range);

    const timer = setInterval(() => {
      msSinceLastFetch += BASE_MS;
      const isTaiwanLive = range === '1D' && isTaiwanTradingHours();
      const threshold = isTaiwanLive ? BASE_MS : 30_000;
      if (msSinceLastFetch < threshold) return;
      if (busy) return;
      msSinceLastFetch = 0;
      busy = true;
      void fetchAll(selected, range).finally(() => { busy = false; });
    }, BASE_MS);

    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [selected, range, fetchAll]);

  const setSelected = useCallback((sym: string) => {
    setSelectedRaw(sym);
  }, []);

  const refresh = useCallback(() => {
    fetchAll(selected, range);
  }, [selected, range, fetchAll]);

  const selectedRow =
    watchlist.find((r) => r.symbol === selected) ??
    watchlist[0] ??
    { symbol: selected, last: 0, changePct: 0, volume: '—' };

  const addToWatchlist = useCallback(async (sym: string) => {
    try {
      await api.addWatchlistItem(sym.toUpperCase());
      await fetchAll(selected, range);
    } catch (e) {
      console.error('Failed to add to watchlist', e);
    }
  }, [selected, range, fetchAll]);

  const removeFromWatchlist = useCallback(async (sym: string) => {
    try {
      await api.removeWatchlistItem(sym.toUpperCase());
      await fetchAll(selected, range);
    } catch (e) {
      console.error('Failed to remove from watchlist', e);
    }
  }, [selected, range, fetchAll]);

  useEffect(() => {
    const handleSearch = (e: any) => {
      const sym = e.detail;
      if (sym) setSelected(sym);
    };
    window.addEventListener('symbol-search', handleSearch);
    return () => window.removeEventListener('symbol-search', handleSearch);
  }, [setSelected]);

  return {
    loading,
    isLive,
    dataMode,
    watchlist,
    gainers,
    losers,
    candles,
    news,
    lastUpdated,
    selected,
    setSelected,
    selectedRow,
    refresh,
    addToWatchlist,
    removeFromWatchlist,
  };
}
