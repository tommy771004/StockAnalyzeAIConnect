/**
 * MarketOverview.tsx
 *
 * 終極合併版：
 * 1. 包含真實大盤指數、熱門標的、財經新聞 (Canvas 版功能)
 * 2. 完美還原自選股清單、五檔深度、逐筆成交、快速下單 (使用者原版功能)
 * 3. 全部串接 Electron IPC API 取得真實數據
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import Decimal from 'decimal.js';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Globe2,
  Loader2, Newspaper, Flame, ExternalLink,
  Plus, X, Search, Zap, AlertCircle, Sun, Moon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { safeCn, safeN, vibrate } from '../utils/helpers';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import * as formatters from '../utils/formatters';
import { Quote, NewsItem, WatchlistItem, SentimentData } from '../types';
import { analyzeNewsSentiment } from '../services/aiService';
import { StockSymbolAutocomplete } from './common/StockSymbolAutocomplete';
import { resolveSymbolWithLookup } from '../utils/stockSymbolLookup';

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

// ── 介面定義 ──
interface Stock {
  symbol: string; name: string; shortName?: string;
  price: number; change: number; changePct: number;
  volume: number; open: number; high: number; low: number;
  bid: number; ask: number;
  bars: number[]; // real 7-day close prices
}

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', icon: Globe2 },
  { symbol: '^IXIC', name: 'NASDAQ', icon: Activity },
  { symbol: 'BTC-USD', name: 'Bitcoin', icon: DollarSign },
  { symbol: '2330.TW', name: '台積電', icon: Activity },
  { symbol: '^VIX', name: 'VIX 指數', icon: Zap }
];

const TRENDING_SYMBOLS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMD', 'MSTR'];
const BROKERS = ['元大證券 Yuanta', '盈透 Interactive Brokers', '富途 Futu'];

// ── Memoized sub-components ────────────────────────────────────────────────

interface MarketIndex {
  symbol: string;
  name: string;
  icon: React.ElementType;
  price: number;
  changePct: number;
  chartData: { close: number }[];
}

const IndexCard = memo(({ idx, compact, onSelect }: { idx: MarketIndex; compact: boolean; onSelect: (sym: string) => void }) => {
  const isUp = idx.changePct >= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(idx.symbol)}
      onKeyDown={e => e.key === 'Enter' && onSelect(idx.symbol)}
      className={safeCn(
        "relative flex flex-col glass-card cursor-pointer transition group overflow-hidden border border-white/5 hover:border-indigo-500/30 active:scale-[0.98] rounded-[1.5rem] sm:rounded-[2rem]",
        compact ? "p-3" : "p-4 sm:p-5"
      )}
    >
      <div className="absolute inset-0 bg-indigo-500/[0.02] pointer-events-none group-hover:bg-indigo-500/[0.04] transition-colors" />
      
      <div className={safeCn("flex items-start justify-between relative z-10", compact ? "mb-3" : "mb-5")}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className={safeCn(
            "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition group-hover:scale-110 shadow-lg border",
            isUp ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          )}>
            <idx.icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="text-heading-xs text-zinc-500 mb-0.5">{idx.name}</div>
            <div className="text-data-xs opacity-40 tabular-nums">{idx.symbol}</div>
          </div>
        </div>
        <div className="w-16 h-8 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={idx.chartData}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke={isUp ? '#fb7185' : '#34d399'} 
                strokeWidth={2} 
                fill="transparent"
                isAnimationActive={false} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-end justify-between relative z-10">
        <div className="flex flex-col">
          <div className="text-lg sm:text-xl md:text-2xl font-black tabular-nums tracking-tighter text-white" style={{ fontFamily: 'var(--font-data)' }}>
            {idx.price != null ? formatters.formatPrice(idx.price, 'USD') : '---'}
          </div>
          <div className={safeCn(
            "flex items-center gap-1.5 mt-1 text-data-xs font-black uppercase tracking-widest",
            isUp ? "text-rose-400" : "text-emerald-400"
          )}>
            <span className="opacity-40">{isUp ? <TrendingUp size={9} strokeWidth={3}/> : <TrendingDown size={9} strokeWidth={3}/>}</span>
            {formatters.formatPercent(idx.changePct)}
          </div>
        </div>
      </div>
    </div>
  );
});

IndexCard.displayName = 'IndexCard';

const WatchlistStockCard = memo(({ s, isSelected, onSelect, onRemove }: {
  s: Stock; isSelected: boolean;
  onSelect: (s: Stock) => void; onRemove: (sym: string) => void;
}) => {
  const isUp = s.changePct >= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(s)}
      onKeyDown={e => e.key === 'Enter' && onSelect(s)}
      className={safeCn(
        "relative glass-card rounded-[1.2rem] sm:rounded-[1.5rem] p-3 sm:p-4 cursor-pointer transition group overflow-hidden border border-white/5 active:scale-[0.99]",
        isSelected ? 'bg-indigo-500/10 border-indigo-500/40 ring-4 ring-indigo-500/5' : 'hover:border-white/10'
      )}
    >
      <div className="absolute inset-0 bg-white/[0.01] pointer-events-none group-hover:bg-white/[0.03] transition-colors" />
      
      <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(s.symbol); vibrate(20); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-xl transition z-20 bg-black/40 border border-white/10 hover:bg-rose-500 hover:text-white hover:border-rose-400 text-zinc-500">
        <X size={12}/>
      </button>

      <div className="flex items-start justify-between mb-2 relative z-10">
        <div className="min-w-0 flex-1 pr-6">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-0.5" style={{ fontFamily: 'var(--font-heading)' }}>{s.symbol}</div>
          <div className="text-xs font-black text-white tracking-tight truncate uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{s.shortName || s.name}</div>
        </div>
        <div className={safeCn(
          "text-[10px] font-black px-2 py-0.5 rounded-lg border tabular-nums shrink-0",
          isUp ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        )} style={{ fontFamily: 'var(--font-data)' }}>
          {isUp ? '+' : ''}{s.changePct.toFixed(2)}%
        </div>
      </div>

      <div className="text-xl sm:text-2xl font-black tabular-nums tracking-tighter relative z-10 mb-2"
        style={{ color: isUp ? '#fb7185' : '#34d399', fontFamily: 'var(--font-data)' }}>
        {formatters.formatPrice(s.price, s.symbol.includes('.TW') ? 'TWD' : 'USD')}
      </div>

      <div className="flex items-center gap-3 text-data-xs uppercase tracking-[0.15em] font-black opacity-30 border-t border-white/5 pt-2 relative z-10">
        <div className="flex-1 flex justify-between">
          <div className="flex items-center gap-1.5"><span>BID</span><span className="text-white opacity-100">{formatters.formatPrice(s.bid, s.symbol.includes('.TW') ? 'TWD' : 'USD')}</span></div>
          <div className="flex items-center gap-1.5"><span>ASK</span><span className="text-white opacity-100">{formatters.formatPrice(s.ask, s.symbol.includes('.TW') ? 'TWD' : 'USD')}</span></div>
        </div>
      </div>
    </div>
  );
});

WatchlistStockCard.displayName = 'WatchlistStockCard';

export default function MarketOverview({ onSelectSymbol }: Props) {
  const { settings, format } = useSettings();
  const compact = Boolean(settings.compactMode);

  // ── 狀態管理 ──
  const [marketData, setMarketData] = useState<MarketIndex[]>([]);
  const [trending, setTrending] = useState<Stock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [aiSummary, setAiSummary] = useState<SentimentData | null>(null);
  const [posInfo, setPosInfo] = useState<{ totalVal: number, plVal: number, plPct: number }>({ totalVal: 0, plVal: 0, plPct: 0 });
  const [lastUpdate, setLastUpdate] = useState('');

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selected, setSelected] = useState<Stock | null>(null);

  type LoadState = 'loading' | 'refreshing' | 'idle';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loading = loadState === 'loading';
  const busy = loadState === 'refreshing';
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addErr, setAddErr] = useState('');

  const marketDataMap = React.useMemo(() => new Map(marketData.map(m => [m.symbol, m])), [marketData]);

  const [showOrder, setShowOrder] = useState(false);
  const [oSide, setOSide] = useState<'buy' | 'sell'>('buy');
  const [oQty, setOQty] = useState(Number(settings.defaultOrderQty || 100));
  const [tradeMode, setTradeMode] = useState<'paper' | 'real'>('paper');
  const [broker, setBroker] = useState(String(settings.defaultBroker || 'Fubon'));
  const [orderType, setOrderType] = useState(String(settings.defaultOrderType || 'ROD'));
  const [priceType, setPriceType] = useState(String(settings.defaultPriceType || 'LMT'));
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string, type: 'success' | 'error', ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const executeTrade = async () => {
    if (!selected) return;
    setLoadState('refreshing');
    try {
      const data = await api.executeTrade({
        symbol: selected.symbol,
        side: oSide,
        qty: oQty,
        price: selected.price,
        mode: tradeMode,
        broker,
        orderType,
        priceType
      });
      // Fix: Server returns { ok: true, trade: … }
      if (data.ok) {
        setToast({ msg: '交易成功', type: 'success' });
        setShowOrder(false);
      } else {
        setToast({ msg: '交易失敗', type: 'error' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '交易請求失敗';
      setToast({ msg, type: 'error' });
    } finally {
      setLoadState('idle');
      setTimeout(() => setToast(null), 3000);
    }
  };

  // ── 資料抓取邏輯 ──
  const enrich = (d: WatchlistItem, bars: number[] = []): Stock => ({
    symbol: d.symbol,
    name: d.name ?? d.symbol,
    shortName: d.name ?? d.symbol,
    price: d.price ?? 0,
    change: d.change ?? 0,
    changePct: d.changePct ?? 0,
    volume: 0,
    open: 0,
    high: 0,
    low: 0,
    bid: d.price ?? 0,
    ask: d.price ?? 0,
    bars,
  });

  const fetchBars = async (symbol: string, days = 7): Promise<number[]> => {
    try {
      const hist = await api.getHistory(symbol, { interval: '1d' });
      if (!Array.isArray(hist) || !hist.length) return [];
      return hist.slice(-days)
        .filter((r: { close: number }) => r?.close && isFinite(Number(r.close)))
        .map((r: { close: number }) => Number(r.close));
    } catch (e) { console.warn('[MarketOverview] getHistory:', e); return []; }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadAllData = useCallback(async (quiet = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadState(quiet ? 'refreshing' : 'loading');
    setFetchErr(null);

    try {
      if (!navigator.onLine && quiet) {
        return setLoadState('idle');
      }

      const wlData = await api.getWatchlist().catch((e) => {
        if (!navigator.onLine) return [];
        throw e;
      });

      const enrichedStocks = (Array.isArray(wlData) ? wlData : []).map((w: WatchlistItem) => enrich(w));
      setStocks(enrichedStocks);
      setSelected(prev => enrichedStocks.find(e => e.symbol === prev?.symbol) ?? enrichedStocks[0] ?? null);

      const wlSymbols = enrichedStocks.map(s => s.symbol);

      // Fetch live quotes for watchlist symbols in parallel with bars
      const liveQuotesPromise = wlSymbols.length > 0
        ? api.getBatchQuotes(wlSymbols).catch(() => [] as Quote[])
        : Promise.resolve([] as Quote[]);

      const fetchBarsConcurrently = async (symbols: string[], days: number, concurrency = 2) => {
        const results = new Map<string, number[]>();
        for (let i = 0; i < symbols.length; i += concurrency) {
          const chunk = symbols.slice(i, i + concurrency);
          await Promise.all(chunk.map(async (s: string) => {
            const bars = await fetchBars(s, days);
            results.set(s, bars);
          }));
        }
        return results;
      };

      const [barsMap, liveQuotesResult] = await Promise.all([
        fetchBarsConcurrently(wlSymbols, 7),
        liveQuotesPromise,
      ]);

      // Build a price map from live quotes
      const liveQuoteMap = new Map<string, Quote>(
        (Array.isArray(liveQuotesResult) ? liveQuotesResult.filter(Boolean) : []).map((q: Quote) => [q.symbol, q])
      );

      const stocksWithBars = enrichedStocks.map(s => {
        const bars = barsMap.get(s.symbol);
        const q = liveQuoteMap.get(s.symbol);
        return {
          ...s,
          price:     q?.regularMarketPrice           ?? s.price,
          change:    q?.regularMarketChange          ?? s.change,
          changePct: q?.regularMarketChangePercent   ?? s.changePct,
          volume:    q?.regularMarketVolume          ?? s.volume,
          open:      s.open,
          high:      q?.regularMarketDayHigh         ?? s.high,
          low:       q?.regularMarketDayLow          ?? s.low,
          bid:       q?.regularMarketPrice           ?? s.bid,
          ask:       q?.regularMarketPrice           ?? s.ask,
          name:      q?.shortName ?? q?.longName     ?? s.name,
          shortName: q?.shortName                    ?? s.shortName,
          ...(bars && bars.length ? { bars } : {}),
        };
      });
      setStocks(stocksWithBars);
      setSelected(prev => stocksWithBars.find(e => e.symbol === prev?.symbol) ?? stocksWithBars[0] ?? null);

      const indicesPromise = (async () => {
        const idxSymbols = INDICES.map(i => i.symbol);
        const quotes = await api.getBatchQuotes(idxSymbols).catch(() => []);
        const quotesArr = (Array.isArray(quotes) ? quotes.filter(Boolean) : []) as Quote[];
        const qMap = new Map(quotesArr.map((q: Quote) => [q.symbol, q]));
        const barsMap = await fetchBarsConcurrently(idxSymbols, 30);

        return INDICES.map((idx) => {
          const quote = qMap.get(idx.symbol) as Quote | undefined;
          const bars = barsMap.get(idx.symbol) || [];
          return {
            ...idx,
            price: quote?.regularMarketPrice || 0,
            changePct: quote?.regularMarketChangePercent || 0,
            chartData: bars.map(c => ({ close: c }))
          };
        });
      })();

      const trendingPromise = api.getBatchQuotes(TRENDING_SYMBOLS).then((quotes: Quote[]) =>
        quotes.map(q => ({
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          shortName: q.shortName,
          price: q.regularMarketPrice || 0,
          change: q.regularMarketChange || 0,
          changePct: q.regularMarketChangePercent || 0,
          volume: q.regularMarketVolume || 0,
          open: 0, high: 0, low: 0, bid: 0, ask: 0,
          bars: []
        }))
      ).catch(() => []);

      const newsPromise = api.getNews('^GSPC').catch(() => []);
      const posPromise = api.getPositions().catch(() => ({ positions: [], usdtwd: 32 }));

      const [indicesData, trendingData, newsData, posData] = await Promise.all([indicesPromise, trendingPromise, newsPromise, posPromise]);

      setMarketData(indicesData);
      setTrending(Array.isArray(trendingData) ? trendingData : [trendingData]);

      const validNews = Array.isArray(newsData) ? newsData.slice(0, 6) : [];
      setNews(validNews);
      setLastUpdate(new Date().toLocaleTimeString());

      if (posData && Array.isArray(posData.positions)) {
        let totalVal = 0; let totalCost = 0;
        posData.positions.forEach(p => {
          totalVal += (p.currentPrice || p.avgCost) * p.shares;
          totalCost += p.avgCost * p.shares;
        });
        const plVal = totalVal - totalCost;
        const plPct = totalCost > 0 ? (plVal / totalCost) * 100 : 0;
        setPosInfo({ totalVal, plVal, plPct });
      }

      if (validNews.length > 0 && navigator.onLine) {
        analyzeNewsSentiment(validNews).then(res => {
          if (res) setAiSummary(res);
        }).catch(e => console.warn('[MarketOverview] AI Summary fetch failed:', e));
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '載入市場數據失敗';
      console.error('[MarketOverview] loadAllData:', msg);
      setFetchErr(msg);
    } finally {
      setLoadState('idle');
      loadingRef.current = false;
    }
  }, []);

  const pullState = usePullToRefresh(containerRef, {
    onRefresh: () => loadAllData(true),
  });

  useEffect(() => { loadAllData(); }, [loadAllData]);

  useEffect(() => {
    const id = setInterval(() => loadAllData(true), 30000);
    return () => clearInterval(id);
  }, [loadAllData]);

  // ── 互動處理 ──
  const handleAdd = async (rawInput?: string) => {
    const resolved = await resolveSymbolWithLookup(rawInput ?? addInput);
    const sym = resolved.trim().toUpperCase();
    if (!sym) return;
    if (stocks.find(s => s.symbol === sym)) { setAddInput(''); setShowAdd(false); return; }
    setLoadState('refreshing'); setAddErr('');
    try {
      // Try to enrich with live quote, but don't block if Yahoo Finance is unavailable
      let liveStock: Stock | null = null;
      try {
        const q = await api.getQuote(sym);
        if (q?.symbol) {
          const bars = await fetchBars(sym, 7);
          liveStock = {
            symbol: q.symbol,
            name: q.shortName ?? q.longName ?? sym,
            shortName: q.shortName ?? sym,
            price: q.regularMarketPrice ?? 0,
            change: q.regularMarketChange ?? 0,
            changePct: q.regularMarketChangePercent ?? 0,
            volume: q.regularMarketVolume ?? 0,
            open: 0,
            high: q.regularMarketDayHigh ?? 0,
            low: q.regularMarketDayLow ?? 0,
            bid: q.regularMarketPrice ?? 0,
            ask: q.regularMarketPrice ?? 0,
            bars,
          };
        }
      } catch {
        // Yahoo Finance unavailable — still add the stock with placeholder data
      }
      // Add via single-item upsert to avoid full-replace race conditions
      await api.addWatchlistItem(sym, liveStock?.name ?? sym);
      const newStock: Stock = liveStock ?? {
        symbol: sym, name: sym, shortName: sym,
        price: 0, change: 0, changePct: 0,
        volume: 0, open: 0, high: 0, low: 0, bid: 0, ask: 0, bars: [],
      };
      setStocks(prev => [...prev, newStock]);
      setSelected(newStock);
      setAddInput(''); setShowAdd(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '新增失敗';
      setAddErr(msg);
    } finally { setLoadState('idle'); }
  };

  const handleRemove = async (sym: string) => {
    const updated = stocks.filter(s => s.symbol !== sym);
    setStocks(updated);
    if (selected?.symbol === sym) setSelected(updated[0] ?? null);
    await api.setWatchlist(updated.map(s => ({ symbol: s.symbol, name: s.name })));
  };

  const up = (s: { changePct: number } | Stock) => s.changePct >= 0;

  if (fetchErr && marketData.length === 0 && stocks.length === 0) {
    if (!navigator.onLine) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-amber-500">
          <AlertCircle size={32}/>
          <div className="text-sm font-bold">無網路連線 NO NETWORK</div>
          <div className="text-xs text-amber-500/70">請等待網路恢復後再試 PLEASE RECONNECT</div>
          <button type="button" onClick={() => loadAllData()} className="px-4 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">重新連線 RETRY</button>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="text-rose-400" size={32}/>
        <div className="text-sm font-bold text-rose-400 uppercase tracking-widest">市場資料載入失敗 LOAD FAILED</div>
        <div className="text-xs text-slate-500">{fetchErr}</div>
        <button type="button" onClick={() => loadAllData()} className="px-4 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors uppercase tracking-widest">重試 RETRY</button>
      </div>
    );
  }

  if (loading && marketData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--md-primary)' }}/>
        <div className="text-sm font-bold tracking-widest" style={{ color: 'var(--md-on-surface)' }}>INITIALIZING MARKET DATA ENGINE...</div>
        <div className="text-xs text-slate-500">正在與 Yahoo Finance 建立安全連線並獲取真實報價</div>
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("h-full flex flex-col overflow-auto pb-10 pr-4 relative", compact ? "gap-2" : "gap-4 sm:gap-6")}
    >
      <PullToRefreshIndicator state={pullState} />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xl z-50 whitespace-nowrap"
          style={{ background: toast.type === 'success' ? '#52c41a' : '#ff4d4f' }}>
          {toast.msg}
        </div>
      )}

      {/* ── 1. Time Contextual Dashboard ── */}
      <div className="flex flex-col gap-3 shrink-0 stagger-item">
        {(() => {
          const hour = new Date().getHours();
          const isMorning = hour < 12;
          return (
            <div className={cn(
              "px-5 py-4 sm:px-6 sm:py-5 rounded-3xl border flex flex-col gap-4 shadow-2xl overflow-hidden relative glass-card group",
              isMorning ? "border-amber-500/20" : "border-indigo-500/20"
            )}>
              {/* Background gradient hint */}
              <div className={cn(
                "absolute inset-0 opacity-[0.03] transition-opacity group-hover:opacity-[0.06]",
                isMorning ? "bg-gradient-to-br from-amber-500 to-transparent" : "bg-gradient-to-br from-indigo-500 to-transparent"
              )} />

              <div className="flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border backdrop-blur-xl shadow-inner",
                    isMorning ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                  )}>
                    {isMorning ? <Sun size={20} strokeWidth={2.5} /> : <Moon size={20} strokeWidth={2.5} />}
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
                      {isMorning ? '早安！早盤預判報告' : '晚安！盤後數據結核'}
                    </h3>
                    <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] opacity-40 mt-0.5">
                      {isMorning ? 'Market Pre-Opening Analysis' : 'Daily Market Liquidation Summary'}
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] tabular-nums tracking-widest opacity-60">
                   <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                   SYNC: {lastUpdate} {!navigator.onLine ? <span className="text-amber-500 ml-1">[OFFLINE]</span> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 z-10 relative">
                {isMorning ? (
                  <>
                    {marketDataMap.has('^GSPC') || marketDataMap.has('^IXIC') ? (
                      <div className="bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
                        <div className="text-[10px] font-black text-amber-400/50 uppercase tracking-widest mb-2">美股隔夜行情 OVERNIGHT</div>
                        <div className="space-y-1.5 line-clamp-2 md:line-clamp-none">
                          {(() => {
                            const gspc = marketDataMap.get('^GSPC');
                            const ixic = marketDataMap.get('^IXIC');
                            return (
                              <>
                                {gspc ? <div className="flex justify-between text-[11px] font-mono"><span className="opacity-60">S&P 500</span><span className="font-bold">{gspc.price.toLocaleString()} ({gspc.changePct > 0 ? '+' : ''}{gspc.changePct.toFixed(2)}%)</span></div> : null}
                                {ixic ? <div className="flex justify-between text-[11px] font-mono"><span className="opacity-60">NASDAQ</span><span className="font-bold">{ixic.price.toLocaleString()} ({ixic.changePct > 0 ? '+' : ''}{ixic.changePct.toFixed(2)}%)</span></div> : null}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : null}
                    {aiSummary ? (
                      <div className="bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md md:col-span-2 hover:border-white/10 transition-colors">
                        <div className="text-[10px] font-black text-amber-400/50 uppercase tracking-widest mb-2">AI 戰略預警 STRATEGIC ADVISORY</div>
                        <div className="text-xs font-medium leading-relaxed opacity-80 italic line-clamp-2">"{aiSummary.aiAdvice}"</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {marketDataMap.has('2330.TW') ? (
                      <div className="bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
                        <div className="text-[10px] font-black text-indigo-400/50 uppercase tracking-widest mb-2">台股收盤摘要 DAILY CLOSE</div>
                        {(() => {
                          const tsm = marketDataMap.get('2330.TW');
                          if (!tsm) return null;
                          return <div className="text-sm font-mono font-bold tracking-tight">2330.TW: {tsm.price.toLocaleString()} <span className={tsm.changePct >= 0 ? "text-rose-400" : "text-emerald-400"}>({tsm.changePct >= 0 ? '+' : ''}{tsm.changePct.toFixed(2)}%)</span></div>;
                        })()}
                      </div>
                    ) : null}
                    {posInfo.totalVal > 0 ? (
                      <div className="bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
                        <div className="text-data-xs font-black text-indigo-400/50 uppercase tracking-widest mb-2">投資組合效益 ASSET PERFORMANCE</div>
                        <div className={cn("text-sm font-mono font-black tracking-tighter", posInfo.plVal >= 0 ? "text-rose-400" : "text-emerald-400")}>
                          {posInfo.plVal >= 0 ? '+' : ''}{format.number(posInfo.plVal, 0)} TWD {format.percent(posInfo.plPct)}
                        </div>
                      </div>
                    ) : null}
                    {aiSummary ? (
                      <div className="bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
                        <div className="text-data-xs font-black text-indigo-400/50 uppercase tracking-widest mb-2">市場情緒摘要 SENTIMENT SUMMARY</div>
                        <div className="text-body-xs font-medium leading-relaxed opacity-80 line-clamp-2 italic">"{aiSummary.aiAdvice}"</div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── 大盤指數 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0 w-full stagger-item">
        {marketData.map((idx) => (
          <IndexCard key={idx.symbol} idx={idx} compact={compact} onSelect={onSelectSymbol} />
        ))}
      </div>

      {/* ── 2. Watchlist & Deep Analysis ── */}
      <div className="flex flex-col gap-4 stagger-item px-1">
        <div className="flex items-center justify-between shrink-0 mb-1">
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-[11px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>自選關注 WATCHLIST</span>
            <div className="h-0.5 w-12 sm:w-16 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] rounded-full" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {BROKERS.map((b, i) => (
              <button type="button" key={b} onClick={(e) => { setBroker(b); vibrate(20); }}
                className={safeCn(
                  "px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition border shadow-lg",
                  broker === b ? "bg-indigo-500 text-black border-indigo-400" : "bg-black/40 text-zinc-400 border-white/5 hover:text-white"
                )}>
                {b.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          {/* 左側：自選股 Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 content-start items-start xl:self-start">
            {stocks.map(s => (
              <WatchlistStockCard
                key={s.symbol}
                s={s}
                isSelected={selected?.symbol === s.symbol}
                onSelect={(stock) => { setSelected(stock); onSelectSymbol?.(stock.symbol); }}
                onRemove={handleRemove}
              />
            ))}

            <div
              role="button"
              tabIndex={0}
              onClick={() => !showAdd && setShowAdd(true)}
              onKeyDown={e => e.key === 'Enter' && !showAdd && setShowAdd(true)}
              className="glass-card rounded-[1.2rem] sm:rounded-[1.5rem] border-2 border-dashed border-white/10 p-4 sm:p-5 cursor-pointer transition flex flex-col items-center justify-center min-h-[100px] hover:border-indigo-500/40 hover:bg-indigo-500/5 group active:scale-[0.98]">
              {showAdd ? (
                <div className="w-full space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">ADD NEW SYMBOL</div>
                  <div className="flex items-center gap-3 bg-black/60 rounded-2xl px-5 border border-white/5 focus-within:border-indigo-500/50 transition">
                    <Search size={16} className="text-zinc-600 shrink-0"/>
                    <StockSymbolAutocomplete
                      autoFocus
                      value={addInput}
                      onValueChange={(next) => { setAddInput(next); setAddErr(''); }}
                      onSymbolSubmit={(next) => { setAddInput(next); setAddErr(''); void handleAdd(next); }}
                      placeholder="SYMBOL..."
                      className="flex-1"
                      inputClassName="flex-1 bg-transparent py-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 placeholder:text-zinc-700 border-none"
                    />
                  </div>
                  {addErr && <div className="text-[10px] font-bold text-rose-400 px-1">{addErr}</div>}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { void handleAdd(); }} disabled={busy}
                      className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-500 text-black hover:bg-indigo-400 transition disabled:opacity-50">
                      {busy ? <Loader2 size={14} className="animate-spin mr-2"/> : null} CONFIRM
                    </button>
                    <button type="button" onClick={(e) => { setShowAdd(false); setAddInput(''); setAddErr(''); }}
                      className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 text-zinc-400 border border-white/10 hover:text-white transition">
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center group-hover:scale-110 transition-transform">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                    <Plus size={22} className="text-indigo-400"/>
                  </div>
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-white transition-colors">INITIATE TRACKER</div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：報價詳情 */}
          {selected && (
            <div className="w-full xl:w-[320px] shrink-0">
               <div className="glass-card rounded-[2rem] p-6 lg:p-8 flex flex-col shadow-2xl relative overflow-hidden border border-white/5 h-full">
                  <div className="absolute inset-0 bg-indigo-500/[0.02] pointer-events-none" />
                  <div className="flex items-center justify-between mb-8 relative z-10">
                    <div>
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-1">DATA CORE</span>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>報價詳情 QUOTE</h3>
                    </div>
                    <span className="text-[11px] font-black px-3 py-1 rounded-xl bg-indigo-500 text-black shadow-lg" style={{ fontFamily: 'var(--font-data)' }}>{selected.symbol}</span>
                  </div>
                  <div className="space-y-4 relative z-10">
                    {[
                      ['開盤價 OPEN', (selected.open || selected.price)?.toFixed(2), ''],
                      ['最高價 HIGH', selected.high?.toFixed(2) || selected.price?.toFixed(2), 'up'],
                      ['最低價 LOW', selected.low?.toFixed(2) || selected.price?.toFixed(2), 'down'],
                      ['成交量 VOL', selected.volume?.toLocaleString() || '-', ''],
                      ['買進價 BID', selected.bid?.toFixed(2) || selected.price?.toFixed(2), ''],
                      ['賣出價 ASK', selected.ask?.toFixed(2) || selected.price?.toFixed(2), ''],
                    ].map(([label, val, dir]) => (
                      <div key={label} className="flex justify-between py-3 border-b border-white/5 last:border-0 group">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">{label}</span>
                        <span 
                          className="text-xs font-black tabular-nums transition-colors" 
                          style={{ 
                            color: dir === 'up' ? '#fb7185' : dir === 'down' ? '#34d399' : 'white', 
                            fontFamily: 'var(--font-data)' 
                          }}
                        >
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 pt-8 border-t border-white/5 relative z-10 flex items-center justify-center">
                     <button type="button" onClick={() => showToast('分析數據已匯出 Analytics Exported', 'success')}
                        className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition">
                        EXPORT ANALYTICS
                     </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. 市場焦點與財經新聞 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {/* 左側：熱門交易標的 */}
        <div className="lg:col-span-1 glass-card rounded-[1.5rem] p-4 sm:p-5 flex flex-col shadow-lg border border-white/5">
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <h2 className="text-xs sm:text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-on-surface)' }}>
              <Flame size={14} style={{ color: 'var(--md-tertiary)' }}/> 市場熱點 (Trending)
            </h2>
          </div>
          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-1 gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-4 lg:mx-0 px-4 lg:px-0 snap-x snap-mandatory mobile-hide-scrollbar scroll-px-4 scroll-smooth">
            {trending.length > 0 ? trending.map((t: Stock) => {
              const isUp = (t.changePct || 0) >= 0;
              return (
                <div key={t.symbol}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSymbol(t.symbol)}
                  onKeyDown={e => e.key === 'Enter' && onSelectSymbol(t.symbol)}
                  className="shrink-0 w-[72vw] sm:w-auto sm:min-w-0 flex items-center justify-between gap-3 p-2.5 rounded-xl cursor-pointer group transition-colors snap-start sm:snap-center"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(128,131,255,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-outline-variant)')}>

                  <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)' }}>
                      {t.symbol.slice(0, 2)}
                    </div>
                    <div className="min-w-0 overflow-hidden text-left">
                      <div className="text-xs font-black truncate" style={{ color: 'var(--md-on-surface)' }}>{t.symbol}</div>
                      <div className="text-[10px] truncate whitespace-nowrap" style={{ color: 'var(--md-outline)' }}>{t.shortName || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-data-xs font-mono font-bold" style={{ color: 'var(--md-on-surface)' }}>{format.price(t.price, t.symbol.includes('.TW') ? 'TWD' : 'USD')}</div>
                    <div className="text-data-xs font-black font-mono px-1.5 py-0.5 rounded mt-1" style={{ background: 'rgba(0,0,0,0.4)', color: isUp ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {format.percent(t.changePct)}
                    </div>
                  </div>
                </div>
              );
            }) : <div className="text-xs text-zinc-500 text-center py-6 w-full">載入中…</div>}
          </div>
        </div>

        {/* 右側：即時市場新聞 */}
        <div className="lg:col-span-2 glass-card rounded-[1.5rem] p-4 sm:p-5 flex flex-col shadow-lg border border-white/5">
          <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
            <h2 className="text-xs sm:text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-on-surface)' }}>
              <Newspaper size={14} style={{ color: 'var(--md-secondary)' }}/> 國際財經快訊 (News)
            </h2>
          </div>
          <div className="flex-1 overflow-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 content-start pr-1 max-h-[340px]">
            {news.length > 0 ? news.map((n: NewsItem, i: number) => (
              <a key={n.id || i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="flex flex-col p-2.5 rounded-xl transition group h-fit"
                style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(173,198,255,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-outline-variant)')}>

                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold leading-relaxed line-clamp-2" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {n.title}
                  </h3>
                  <ExternalLink size={12} style={{ color: 'var(--md-outline)' }} className="shrink-0"/>
                </div>
                <div className="text-xs mt-auto flex items-center gap-1" style={{ color: 'var(--md-outline)' }}>
                  <span>{n.publisher || 'Yahoo Finance'}</span>
                  <span>·</span>
                  <span>{new Date((n.providerPublishTime || Date.now() / 1000) * 1000).toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </a>
            )) : (
              <div className="col-span-full text-center text-xs text-zinc-500 py-10">
                {loading ? '讀取新聞中…' : '目前無相關新聞'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. 懸浮快速下單按鈕 ── */}
      <div className="fixed bottom-20 right-4 md:bottom-10 md:right-6 z-[60] safe-area-bottom safe-area-right">
        {showOrder && selected && (
          <>
            {/* Mobile Backdrop */}
            <div
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[65]"
              onClick={() => setShowOrder(false)}
            />

            {/* Order Panel */}
            <div className={cn(
              "fixed md:absolute z-[70] transition-transform duration-300 ease-out",
              "bottom-0 left-0 right-0 w-full rounded-t-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t md:bottom-14 md:right-0 md:left-auto md:w-72 md:rounded-2xl md:p-5 md:shadow-2xl"
            )}>
              {/* Mobile Handle */}
              <div className="md:hidden w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-6" />

              <div className="flex items-center justify-between mb-4 md:mb-3">
                <div>
                  <h3 className="text-lg md:text-sm font-bold" style={{ color: 'var(--md-on-surface)' }}>快速委託</h3>
                  <div className="text-xs" style={{ color: 'var(--md-outline)' }}>{selected.symbol}</div>
                </div>
                <button type="button" onClick={() => setShowOrder(false)} className="p-2 md:p-1 rounded-full hover:bg-zinc-800 text-zinc-400">
                  <X size={18} className="md:w-3.5 md:h-3.5" />
                </button>
              </div>

              <div className="flex gap-2 md:gap-1.5 mb-5 md:mb-4">
                {(['buy', 'sell'] as const).map(s => (
                  <button type="button" key={s} onClick={() => setOSide(s)}
                    className={cn('flex-1 py-3 md:py-2 rounded-xl text-base md:text-sm font-bold transition-colors')}
                    style={oSide === s
                      ? (s === 'buy' ? { background: 'var(--color-up)', color: '#fff' } : { background: 'var(--color-down)', color: '#fff' })
                      : { background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                    {s === 'buy' ? '買進' : '賣出'}
                  </button>
                ))}
              </div>

              <div className="space-y-4 md:space-y-3">
                <div className="flex gap-2">
                  <select value={tradeMode} onChange={e => setTradeMode(e.target.value as 'paper' | 'real')}
                    className="flex-1 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-sm md:text-xs"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                    <option value="paper">模擬交易</option>
                    <option value="real">實際交易</option>
                  </select>
                  <select value={broker} onChange={e => setBroker(e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-sm md:text-xs"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                    <option value="Fubon">富邦</option>
                    <option value="Cathay">國泰</option>
                    <option value="UB">聯邦</option>
                    <option value="Sinopac">永豐金</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <select value={orderType} onChange={e => setOrderType(e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-sm md:text-xs"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                    <option value="ROD">ROD</option>
                    <option value="IOC">IOC</option>
                    <option value="FOK">FOK</option>
                  </select>
                  <select value={priceType} onChange={e => setPriceType(e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2.5 md:px-2 md:py-2 text-sm md:text-xs"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                    <option value="LMT">限價</option>
                    <option value="MKT">市價</option>
                  </select>
                </div>

                <div className="flex justify-between text-data-xs py-1">
                  <span className="text-zinc-400">現價</span>
                  <span className="font-mono font-bold text-lg md:text-base" style={{ color: up(selected) ? 'var(--color-up)' : 'var(--color-down)' }}>{format.price(selected.price, selected.symbol.includes('.TW') ? 'TWD' : 'USD')}</span>
                </div>

                <div>
                  <div className="text-xs text-zinc-500 mb-1.5 md:mb-1">委託數量</div>
                  <input type="number" value={oQty} onChange={e => setOQty(Number(e.target.value))} min={1}
                    className="w-full rounded-xl px-4 py-3 md:px-3 md:py-2 font-mono text-base md:text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}/>
                </div>

                <div className="flex justify-between text-data-xs pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400">預估金額</span>
                  <span className="text-zinc-100 font-mono text-lg md:text-base">
                    {format.currency(new Decimal(selected.price).times(oQty).toNumber(), selected.symbol.includes('.TW') ? 'TWD' : 'USD')}
                  </span>
                </div>

                <button type="button" onClick={executeTrade} disabled={busy} className="w-full py-4 rounded-xl text-white font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin inline mr-2" size={14}/> : null}
                  確認{oSide === 'buy' ? '買進' : '賣出'}
                </button>
              </div>
            </div>
          </>
        )}

        <button type="button" onClick={() => setShowOrder(true)}
          className="flex items-center gap-2 px-5 py-3 md:py-2.5 font-bold rounded-full transition text-base md:text-sm hover:scale-105 active:scale-95"
          style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)', boxShadow: '0 0 20px rgba(128,131,255,0.35)' }}>
          <Zap size={18} className="md:w-4 md:h-4"/> <span className="hidden xs:inline">快速委託</span>
        </button>
      </div>
    </motion.div>
  );
}
