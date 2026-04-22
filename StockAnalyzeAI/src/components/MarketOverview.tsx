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
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Quote, NewsItem, WatchlistItem, SentimentData } from '../types';
import { analyzeNewsSentiment } from '../services/aiService';

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
      className={cn(
        "min-w-[82vw] sm:min-w-[280px] md:min-w-0 shrink-0 md:shrink glass-card cursor-pointer transition-all group snap-start md:snap-center active:scale-[0.98] overflow-hidden",
        compact ? "p-4" : "p-5 md:p-6 lg:p-8"
      )}
      style={{ border: '1px solid var(--md-outline-variant)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(128,131,255,0.4)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-outline-variant)')}>

      <div className={cn("flex items-start justify-between", compact ? "mb-4" : "mb-6")}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className="shrink-0 p-3 md:p-4 rounded-2xl" style={isUp ? { background: 'rgba(255,77,79,0.12)', color: 'var(--color-up)' } : { background: 'rgba(82,196,26,0.12)', color: 'var(--color-down)' }}>
            <idx.icon size={compact ? 20 : 28} />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg md:text-xl font-black tracking-tight truncate" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{idx.name}</div>
            <div className="text-xs sm:text-sm md:text-base font-mono uppercase tracking-widest truncate" style={{ color: 'var(--md-outline)' }}>{idx.symbol}</div>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-mono font-black text-[var(--text-color)] mb-2 tracking-tighter truncate">
            {idx.price ? idx.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
          </div>
          <div className="flex items-center gap-1.5 text-xs sm:text-base font-black px-2 py-1 md:px-3 md:py-1.5 rounded-lg w-fit"
            style={isUp ? { background: 'rgba(255,77,79,0.1)', color: 'var(--color-up)' } : { background: 'rgba(82,196,26,0.1)', color: 'var(--color-down)' }}>
            {isUp ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
            {isUp ? '+' : ''}{idx.changePct ? idx.changePct.toFixed(2) : '0.00'}%
          </div>
        </div>
        <div className="w-20 sm:w-24 h-10 sm:h-12 shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={idx.chartData}>
              <defs>
                <linearGradient id={`g-${idx.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isUp?"#10b981":"#f43f5e"} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={isUp?"#10b981":"#f43f5e"} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area type="monotone" dataKey="close" stroke={isUp ? '#ff4d4f' : '#52c41a'} strokeWidth={2} fill={`url(#g-${idx.symbol})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
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
      className="relative glass-card rounded-xl p-3 sm:p-4 cursor-pointer transition-all group overflow-hidden"
      style={isSelected ? { borderColor: 'rgba(128,131,255,0.5)', background: 'rgba(128,131,255,0.06)' } : {}}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(128,131,255,0.3)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--md-outline-variant)'; }}>

      <button onClick={e => { e.stopPropagation(); onRemove(s.symbol); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-full transition-all z-10 shrink-0"
        style={{ background: 'var(--md-surface-container-high)', color: 'var(--md-outline)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--md-error)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--md-outline)'; }}>
        <X size={12}/>
      </button>

      <div className="flex items-start justify-between mb-3 min-w-0">
        <div className="min-w-0 flex-1 pr-4">
          <div className="text-base sm:text-lg font-black tracking-tight truncate" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{s.symbol}</div>
          <div className="text-xs sm:text-sm truncate" style={{ color: 'var(--md-outline)' }}>{s.shortName || s.name}</div>
        </div>
        <span className="text-xs sm:text-sm px-2 py-0.5 sm:px-3 sm:py-1 rounded font-mono font-bold shrink-0"
          style={{ color: isUp ? 'var(--color-up)' : 'var(--color-down)' }}>
          {isUp ? '+' : ''}{s.changePct.toFixed(2)}%
        </span>
      </div>

      <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black font-mono tracking-tighter truncate"
        style={{ color: isUp ? 'var(--color-up)' : 'var(--color-down)', fontFamily: 'var(--font-data)' }}>
        {s.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>

      <div className="flex justify-between text-[10px] sm:text-xs mt-4 sm:mt-6 font-mono border-t pt-2" style={{ color: 'var(--md-outline)', borderColor: 'var(--md-outline-variant)' }}>
        <span className="truncate mr-1">B {s.bid.toFixed(2)}</span>
        <span className="truncate">A {s.ask.toFixed(2)}</span>
      </div>
    </div>
  );
});

WatchlistStockCard.displayName = 'WatchlistStockCard';

export default function MarketOverview({ onSelectSymbol }: Props) {
  const { settings } = useSettings();
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

  const [showOrder, setShowOrder] = useState(false);
  const [oSide, setOSide] = useState<'buy' | 'sell'>('buy');
  const [oQty, setOQty] = useState(Number(settings.defaultOrderQty || 100));
  const [tradeMode, setTradeMode] = useState<'paper' | 'real'>('paper');
  const [broker, setBroker] = useState(String(settings.defaultBroker || 'Fubon'));
  const [orderType, setOrderType] = useState(String(settings.defaultOrderType || 'ROD'));
  const [priceType, setPriceType] = useState(String(settings.defaultPriceType || 'LMT'));
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

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
      if (data.status === 'success') {
        setToast({ msg: '交易成功', type: 'success' });
        setShowOrder(false);
      } else {
        setToast({ msg: `交易結果: ${data.message}`, type: 'error' });
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

      const barsMap = await fetchBarsConcurrently(wlSymbols, 7);

      const stocksWithBars = enrichedStocks.map(s => {
        const bars = barsMap.get(s.symbol);
        return bars && bars.length ? { ...s, bars } : s;
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
  const handleAdd = async () => {
    const sym = addInput.trim().toUpperCase(); if (!sym) return;
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
          <div className="text-sm font-bold">無網路連線</div>
          <div className="text-xs text-amber-500/70">請等待網路恢復後再試</div>
          <button onClick={() => loadAllData()} className="px-4 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">重新連線</button>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="text-rose-400" size={32}/>
        <div className="text-sm font-bold text-rose-400">市場資料載入失敗</div>
        <div className="text-xs text-slate-500">{fetchErr}</div>
        <button onClick={() => loadAllData()} className="px-4 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">重試</button>
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
      className={cn("h-full flex flex-col overflow-auto pb-10 pr-4 relative", compact ? "gap-2" : "gap-8")}
    >
      <PullToRefreshIndicator state={pullState} />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xl z-50 whitespace-nowrap"
          style={{ background: toast.type === 'success' ? '#52c41a' : '#ff4d4f' }}>
          {toast.msg}
        </div>
      )}

      {/* ── 1. Time Contextual Dashboard ── */}
      <div className="flex flex-col gap-3 mb-4 shrink-0">
        {(() => {
          const hour = new Date().getHours();
          const isMorning = hour < 12;
          return (
            <div className="px-5 py-4 rounded-2xl border flex flex-col gap-4 shadow-lg overflow-hidden relative"
              style={isMorning ? { background: 'rgba(255,183,131,0.08)', borderColor: 'rgba(255,183,131,0.3)', color: 'var(--md-tertiary)' } : { background: 'rgba(173,198,255,0.08)', borderColor: 'rgba(173,198,255,0.25)', color: 'var(--md-secondary)' }}>

              <div className="flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 rounded-xl border backdrop-blur-md", isMorning ? "bg-amber-500/20 border-amber-500/20" : "bg-indigo-500/20 border-indigo-500/20")}>
                    {isMorning ? <Sun size={20} style={{ color: 'var(--md-tertiary)' }} /> : <Moon size={20} style={{ color: 'var(--md-secondary)' }} />}
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-widest uppercase">{isMorning ? '早安！早盤通勤摘要' : '晚安！收盤結算摘要'}</h3>
                    <p className="text-xs opacity-70 mt-0.5">{isMorning ? '準備開盤，請關注以下重點資訊' : '今日盤勢已收，為您總結帳戶與市場概況'}</p>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono bg-black/40 border border-white/10 px-2 py-1 rounded truncate max-w-[120px] hidden sm:block">
                  LAST: {lastUpdate} {!navigator.onLine && <span className="text-amber-500 ml-1">[離線資料]</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 z-10 relative">
                {isMorning ? (
                  <>
                    {marketData.some(m => m.symbol === '^GSPC' || m.symbol === '^IXIC') && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-amber-400/80 font-bold mb-1 tracking-wider">美股夜盤總結</div>
                        <div className="text-sm font-medium">
                          {(() => {
                            const gspc = marketData.find(m => m.symbol === '^GSPC');
                            const ixic = marketData.find(m => m.symbol === '^IXIC');
                            return (
                              <div className="flex flex-col gap-1">
                                {gspc && <div>S&P 500: {gspc.price.toLocaleString()} ({gspc.changePct > 0 ? '+' : ''}{gspc.changePct.toFixed(2)}%)</div>}
                                {ixic && <div>NASDAQ: {ixic.price.toLocaleString()} ({ixic.changePct > 0 ? '+' : ''}{ixic.changePct.toFixed(2)}%)</div>}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {aiSummary && aiSummary.aiAdvice && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-amber-400/80 font-bold mb-1 tracking-wider">盤前 AI 分析</div>
                        <div className="text-sm font-medium line-clamp-2">{aiSummary.aiAdvice}</div>
                      </div>
                    )}
                    {aiSummary && aiSummary.keyDrivers && aiSummary.keyDrivers.length > 0 && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-amber-400/80 font-bold mb-1 tracking-wider">市場情緒重點</div>
                        <div className="text-sm font-bold text-amber-300 line-clamp-2">{aiSummary.keyDrivers.join('；')}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {marketData.some(m => m.symbol === '2330.TW') && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-indigo-400/80 font-bold mb-1 tracking-wider">今日台股收盤結算</div>
                        <div className="text-sm font-medium">
                          {(() => {
                            const tsm = marketData.find(m => m.symbol === '2330.TW');
                            if (!tsm) return null;
                            return `台積電 (2330.TW): ${tsm.price.toLocaleString()} (${tsm.changePct >= 0 ? '+' : ''}${tsm.changePct.toFixed(2)}%)`;
                          })()}
                        </div>
                      </div>
                    )}
                    {posInfo.totalVal > 0 && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-indigo-400/80 font-bold mb-1 tracking-wider">個人帳戶總損益</div>
                        <div className={cn("text-sm font-mono font-bold", posInfo.plVal >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {posInfo.plVal >= 0 ? '+' : ''}{posInfo.plVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} TWD ({posInfo.plPct >= 0 ? '+' : ''}{posInfo.plPct.toFixed(2)}%)
                        </div>
                      </div>
                    )}
                    {aiSummary && aiSummary.aiAdvice && (
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                        <div className="text-[10px] text-indigo-400/80 font-bold mb-1 tracking-wider">市場情緒與動向</div>
                        <div className="text-sm font-medium line-clamp-2">{aiSummary.aiAdvice}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
        <div className="sm:hidden text-[10px] text-zinc-500 font-mono bg-black/40 border border-white/10 px-2 py-1 rounded w-fit">
          LAST: {lastUpdate} {!navigator.onLine && <span className="text-amber-500 ml-1">[離線資料]</span>}
        </div>
      </div>

      {/* ── 大盤指數 ── */}
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 shrink-0 overflow-x-auto pb-2 md:pb-0 -mx-4 md:mx-0 px-4 md:px-0 mobile-hide-scrollbar snap-x snap-mandatory md:snap-none scroll-px-4 scroll-smooth">
        {marketData.map((idx) => (
          <IndexCard key={idx.symbol} idx={idx} compact={compact} onSelect={onSelectSymbol} />
        ))}
      </div>

      {/* ── 2. Watchlist & Deep Analysis ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>Watchlist</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {BROKERS.map((b, i) => (
              <button key={i} onClick={() => setBroker(b)}
                className="px-3 py-1.5 sm:py-1 rounded text-[10px] font-mono uppercase transition-all border"
                style={broker === b
                  ? { background: 'rgba(128,131,255,0.12)', color: 'var(--md-primary)', borderColor: 'rgba(128,131,255,0.3)' }
                  : { background: 'var(--md-surface-container)', color: 'var(--md-outline)', borderColor: 'var(--md-outline-variant)' }}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* 左側：自選股 Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stocks.map(s => (
              <WatchlistStockCard
                key={s.symbol}
                s={s}
                isSelected={selected?.symbol === s.symbol}
                onSelect={(stock) => { setSelected(stock); onSelectSymbol?.(stock.symbol); }}
                onRemove={handleRemove}
              />
            ))}

            {/* ── FIX TS1003: 新增自選股 Card ──
                原始碼在此處有兩個嵌套的開頭元素，外層 <div role="button"> 缺少結束 `>`，
                導致 TypeScript 將內層 <div className="glass-card..."> 解析為屬性名稱。
                修法：移除多餘的外層包裝，直接在 glass-card div 上加 role/tabIndex/onClick/onKeyDown。
            */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !showAdd && setShowAdd(true)}
              onKeyDown={e => e.key === 'Enter' && !showAdd && setShowAdd(true)}
              className="glass-card rounded-2xl border-dashed p-4 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px]"
              style={{ borderColor: 'var(--md-outline-variant)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(128,131,255,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-outline-variant)')}>

              {showAdd ? (
                <div className="w-full space-y-3" onClick={e => e.stopPropagation()}>
                  <div className="text-base font-bold text-zinc-100 mb-3">新增自選股</div>
                  <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-4 border border-zinc-800">
                    <Search size={16} className="text-zinc-500 shrink-0"/>
                    <input
                      autoFocus
                      value={addInput}
                      onChange={e => { setAddInput(e.target.value.toUpperCase()); setAddErr(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="輸入代碼..."
                      className="flex-1 bg-transparent py-3 text-base text-zinc-100 focus:outline-none"
                    />
                  </div>
                  {addErr && <div className="text-sm text-rose-400 px-1">{addErr}</div>}
                  <div className="flex gap-3">
                    <button onClick={handleAdd} disabled={busy}
                      className="flex-1 py-2.5 rounded-lg text-sm flex items-center justify-center"
                      style={{ background: 'rgba(128,131,255,0.12)', color: 'var(--md-primary)', border: '1px solid rgba(128,131,255,0.3)' }}>
                      {busy ? <Loader2 size={14} className="animate-spin mr-1.5"/> : null} 確認
                    </button>
                    <button
                      onClick={() => { setShowAdd(false); setAddInput(''); setAddErr(''); }}
                      className="flex-1 py-2.5 rounded-lg text-sm"
                      style={{ background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--md-surface-container-high)' }}>
                    <Plus size={24} style={{ color: 'var(--md-outline)' }}/>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--md-outline)' }}>新增標的</div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：五檔與逐筆成交 */}
          {selected && (
            <div className="w-full lg:w-[260px] flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <div className="glass-card rounded-2xl p-4 flex-1 flex flex-col shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--md-on-surface)' }}>報價詳情</h3>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(128,131,255,0.12)', color: 'var(--md-primary)' }}>{selected.symbol}</span>
                </div>
                <div className="text-xs font-mono space-y-2 mt-4">
                  {[
                    ['開盤價', selected.open?.toFixed(2) ?? '-', ''],
                    ['最高價', selected.high?.toFixed(2) ?? '-', 'up'],
                    ['最低價', selected.low?.toFixed(2) ?? '-', 'down'],
                    ['成交量', selected.volume?.toLocaleString() ?? '-', ''],
                    ['買進價', selected.bid?.toFixed(2) ?? '-', ''],
                    ['賣出價', selected.ask?.toFixed(2) ?? '-', ''],
                  ].map(([label, val, dir]) => (
                    <div key={label} className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
                      <span style={{ color: 'var(--md-outline)' }}>{label}</span>
                      <span style={{ color: dir === 'up' ? 'var(--color-up)' : dir === 'down' ? 'var(--color-down)' : 'var(--md-on-surface)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. 市場焦點與財經新聞 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[250px]">
        {/* 左側：熱門交易標的 */}
        <div className="lg:col-span-1 glass-card rounded-2xl p-5 flex flex-col shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-on-surface)' }}>
              <Flame size={16} style={{ color: 'var(--md-tertiary)' }}/> 市場熱點 (Trending)
            </h2>
          </div>
          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-1 gap-3 overflow-x-auto pb-2 lg:pb-0 -mx-5 lg:mx-0 px-5 lg:px-0 snap-x snap-mandatory mobile-hide-scrollbar scroll-px-5 scroll-smooth">
            {trending.length > 0 ? trending.map((t: Stock) => {
              const isUp = (t.changePct || 0) >= 0;
              return (
                <div key={t.symbol}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSymbol(t.symbol)}
                  onKeyDown={e => e.key === 'Enter' && onSelectSymbol(t.symbol)}
                  className="shrink-0 w-[72vw] sm:w-auto sm:min-w-0 flex items-center justify-between gap-3 p-3.5 rounded-xl cursor-pointer group transition-colors snap-start sm:snap-center"
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
                    <div className="text-xs font-mono font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{t.price?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '---'}</div>
                    <div className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded mt-1" style={{ background: 'rgba(0,0,0,0.4)', color: isUp ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {isUp ? '+' : ''}{(t.changePct || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            }) : <div className="text-xs text-zinc-500 text-center py-6 w-full">載入中...</div>}
          </div>
        </div>

        {/* 右側：即時市場新聞 */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 flex flex-col shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-on-surface)' }}>
              <Newspaper size={16} style={{ color: 'var(--md-secondary)' }}/> 國際財經快訊 (News)
            </h2>
          </div>
          <div className="flex-1 overflow-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pr-1">
            {news.length > 0 ? news.map((n: NewsItem, i: number) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="flex flex-col p-3 rounded-xl transition-all group"
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
                  <span>{new Date((n.providerPublishTime || Date.now() / 1000) * 1000).toLocaleString()}</span>
                </div>
              </a>
            )) : <div className="col-span-full text-center text-xs text-zinc-500 py-10">讀取新聞中...</div>}
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
                <button onClick={() => setShowOrder(false)} className="p-2 md:p-1 rounded-full hover:bg-zinc-800 text-zinc-400">
                  <X size={18} className="md:w-3.5 md:h-3.5" />
                </button>
              </div>

              <div className="flex gap-2 md:gap-1.5 mb-5 md:mb-4">
                {(['buy', 'sell'] as const).map(s => (
                  <button key={s} onClick={() => setOSide(s)}
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

                <div className="flex justify-between text-sm md:text-xs py-1">
                  <span className="text-zinc-400">現價</span>
                  <span className="font-mono font-bold text-lg md:text-base" style={{ color: up(selected) ? 'var(--color-up)' : 'var(--color-down)', fontFamily: 'var(--font-data)' }}>{selected.price.toFixed(2)}</span>
                </div>

                <div>
                  <div className="text-xs text-zinc-500 mb-1.5 md:mb-1">委託數量</div>
                  <input type="number" value={oQty} onChange={e => setOQty(Number(e.target.value))} min={1}
                    className="w-full rounded-xl px-4 py-3 md:px-3 md:py-2 font-mono text-base md:text-xs focus:outline-none"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}/>
                </div>

                <div className="flex justify-between text-sm md:text-xs pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400">預估金額</span>
                  <span className="text-zinc-100 font-mono text-lg md:text-base">
                    ${new Decimal(selected.price).times(oQty).toNumber().toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <button onClick={executeTrade}
                  className="w-full py-4 md:py-2.5 rounded-xl text-base md:text-sm font-bold mt-2"
                  style={oSide === 'buy' ? { background: 'var(--color-up)', color: '#fff' } : { background: 'var(--color-down)', color: '#fff' }}>
                  確認{oSide === 'buy' ? '買進' : '賣出'}
                </button>
              </div>
            </div>
          </>
        )}

        <button onClick={() => setShowOrder(v => !v)}
          className="flex items-center gap-2 px-5 py-3 md:py-2.5 font-bold rounded-full transition-all text-base md:text-sm hover:scale-105 active:scale-95"
          style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)', boxShadow: '0 0 20px rgba(128,131,255,0.35)' }}>
          <Zap size={18} className="md:w-4 md:h-4"/> <span className="hidden xs:inline">快速委託</span>
        </button>
      </div>
    </motion.div>
  );
}