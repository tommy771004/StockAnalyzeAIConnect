/**
 * StockScreener.tsx — XQ-style multi-criteria stock screener
 *
 * Features:
 * - Batch scan symbols against technical indicators (RSI, MACD, SMA, Volume)
 * - Pre-built scan templates (oversold, golden cross, volume spike, etc.)
 * - Sortable results table with signal badges
 * - Click to navigate to TradingCore for deep analysis
 */
import React, { useState, useCallback, useRef } from 'react';
import { Filter, Loader2, ArrowUpDown, ChevronDown, X, RefreshCw, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../services/api';
import type { ScreenerFilters } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { ScreenerResult } from '../types';

// ── Pre-built scan templates ──────────────────────────────────────────────────
const TEMPLATES: { id: string; label: string; desc: string; filters: ScreenerFilters; color: string }[] = [
  { id: 'oversold',     label: 'RSI 超賣反彈',   desc: 'RSI < 30，超賣區反彈機會',          filters: { rsiBelow: 30 },                              color: 'text-price-down' },
  { id: 'overbought',   label: 'RSI 超買警示',   desc: 'RSI > 70，超買區注意回檔',          filters: { rsiAbove: 70 },                              color: 'text-rose-400' },
  { id: 'golden_cross',  label: '均線金叉',       desc: 'SMA5 上穿 SMA20，趨勢轉多',        filters: { goldenCrossOnly: true },                      color: 'text-yellow-400' },
  { id: 'death_cross',   label: '均線死叉',       desc: 'SMA5 下穿 SMA20，趨勢轉空',        filters: { deathCrossOnly: true },                       color: 'text-red-400' },
  { id: 'macd_bull',     label: 'MACD 多頭動能',  desc: 'MACD 柱狀由負轉正',               filters: { macdBullish: true },                          color: 'text-price-down' },
  { id: 'vol_spike',     label: '異常爆量',       desc: '成交量 > 20 日均量 2 倍',           filters: { volumeSpikeMin: 2 },                          color: 'text-orange-400' },
  { id: 'bullish_trend', label: '多頭排列',       desc: '價格 > SMA20，趨勢向上',           filters: { aboveSMA20: true, macdBullish: true },         color: 'text-price-down' },
  { id: 'bearish_trend', label: '空頭排列',       desc: '價格 < SMA20 且 MACD 空頭',        filters: { belowSMA20: true, macdBearish: true },         color: 'text-rose-400' },
];

// ── Default scan universe ────────────────────────────────────────────────────
const DEFAULT_SYMBOLS = [
  // 台股
  '2330.TW','2317.TW','2454.TW','2382.TW','2412.TW','2881.TW','2882.TW','2303.TW','3711.TW','2308.TW',
  // 美股
  'AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD','AVGO','TSM',
  // 加密
  'BTC-USD','ETH-USD',
];

type SortKey = 'symbol' | 'price' | 'changePct' | 'rsi' | 'volumeRatio' | 'signals';
type SortDir = 'asc' | 'desc';

interface Props {
  onSelectSymbol?: (sym: string) => void;
}

export default function StockScreener({ onSelectSymbol }: Props) {
  const { settings, format } = useSettings();
  const compact = settings.compactMode;

  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [customFilters, setCustomFilters] = useState<ScreenerFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [customSymbols, setCustomSymbols] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scannedCount, setScannedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const runScan = useCallback(async (filters?: ScreenerFilters) => {
    setLoading(true);
    setError('');
    try {
      const syms = customSymbols.trim()
        ? customSymbols.split(/[,\s\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_SYMBOLS;
      setScannedCount(syms.length);
      const data = await api.runScreener(syms, filters ?? customFilters);
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '掃描失敗';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [customSymbols, customFilters]);

  const pullState = usePullToRefresh(containerRef, { onRefresh: () => runScan() });

  const handleTemplate = (t: typeof TEMPLATES[0]) => {
    setActiveTemplate(t.id);
    setCustomFilters(t.filters);
    runScan(t.filters);
  };

  const handleSort = (key: SortKey) => {
    setVisibleCount(50);
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...results].sort((a, b) => {
    let va: number | string | undefined, vb: number | string | undefined;
    if (sortKey === 'signals') { va = a.signals.length; vb = b.signals.length; }
    else { va = a[sortKey]; vb = b[sortKey]; }
    if (va == null) va = 0; if (vb == null) vb = 0;
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const signalColor = (sig: string) => {
    if (sig.includes('超賣') || sig.includes('金叉') || sig.includes('多頭')) return 'md3-signal-bull';
    if (sig.includes('超買') || sig.includes('死叉') || sig.includes('空頭')) return 'md3-signal-bear';
    return 'md3-signal-neutral';
  };

  const rsiColor = (rsi: number) => {
    if (rsi > 70) return 'text-price-up';
    if (rsi < 30) return 'text-price-down';
    return '';
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 pb-10 overflow-auto"
    >
      <PullToRefreshIndicator state={pullState} />

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className={cn("font-black tracking-tight", compact ? "text-xl" : "text-2xl")} style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
            <Target className="inline mr-2" size={compact ? 20 : 24} style={{ color: 'var(--md-primary)' }} />
            智慧選股器
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--md-outline)' }}>XQ-Style Technical Screener — 多條件批量揁描</p>
        </div>
        <button type="button" onClick={() => runScan()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition active:scale-95 disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-indigo-500/20"
          style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? '掃描中 SCANNING...' : '開始掃描 RUN SCAN'}
        </button>
      </div>

      {/* Template Chips */}
      <div className="flex flex-wrap gap-2 shrink-0">
        {TEMPLATES.map(t => (
          <button type="button" key={t.id} onClick={() => handleTemplate(t)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-black border transition active:scale-95 uppercase tracking-wider md:tracking-widest",
              activeTemplate === t.id
                ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
                : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"
            )}
            title={t.desc}
          >
            <span className={activeTemplate === t.id ? t.color : ''}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Custom Filters Panel */}
      <div className="shrink-0">
        <button type="button" onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-widest transition-colors hover:text-white active:scale-95" style={{ color: 'var(--md-outline)' }}
        >
          <Filter size={13} />
          自訂篩選條件 FILTERS
          <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
        </button>
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 p-4 glass-card rounded-2xl">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>RSI 低於</label>
                  <input
                    type="number" min={0} max={100} placeholder="30"
                    value={customFilters.rsiBelow ?? ''}
                    onChange={e => setCustomFilters(f => ({ ...f, rsiBelow: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-base md:text-sm font-mono focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>RSI 高於</label>
                  <input
                    type="number" min={0} max={100} placeholder="70"
                    value={customFilters.rsiAbove ?? ''}
                    onChange={e => setCustomFilters(f => ({ ...f, rsiAbove: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-base md:text-sm font-mono focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>量能倍數 ≥</label>
                  <input
                    type="number" min={1} step={0.5} placeholder="2"
                    value={customFilters.volumeSpikeMin ?? ''}
                    onChange={e => setCustomFilters(f => ({ ...f, volumeSpikeMin: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-base md:text-sm font-mono focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                  />
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--md-outline)' }}>
                    <input type="checkbox" checked={!!customFilters.macdBullish}
                      onChange={e => setCustomFilters(f => ({ ...f, macdBullish: e.target.checked || undefined, macdBearish: undefined }))}
                      className="accent-[var(--md-primary)]" />
                    MACD 多頭
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--md-outline)' }}>
                    <input type="checkbox" checked={!!customFilters.aboveSMA20}
                      onChange={e => setCustomFilters(f => ({ ...f, aboveSMA20: e.target.checked || undefined, belowSMA20: undefined }))}
                      className="accent-[var(--md-primary)]" />
                    價格 &gt; SMA20
                  </label>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>自訂代碼（逗號分隔，留空使用預設清單）</label>
                  <input
                    type="text"
                    value={customSymbols}
                    onChange={e => setCustomSymbols(e.target.value.toUpperCase())}
                    placeholder="AAPL, NVDA, 2330.TW, BTC-USD …"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl text-base md:text-sm font-mono focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                  <button type="button" onClick={(e) => { setActiveTemplate(null); runScan(); }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition" style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}
                  >
                    執行自訂掃描
                  </button>
                  <button type="button" onClick={(e) => { setCustomFilters({}); setActiveTemplate(null); }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}
                  >
                    清除條件
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl p-3 shrink-0 text-sm" style={{ background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.3)', color: 'var(--color-up)' }}>
          <X size={13} />{error}
        </div>
      )}

      {/* Results Summary */}
      {results.length > 0 && (
        <div className="text-xs shrink-0" style={{ color: 'var(--md-outline)' }}>
          揁描 {scannedCount} 殔 → 符合條件 <span className="font-bold" style={{ color: 'var(--md-primary)' }}>{results.length}</span> 殔
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--md-primary)' }} />
            <span className="text-sm" style={{ color: 'var(--md-outline)' }}>批量揁描技術指標中…</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Target className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--md-outline-variant)' }} />
            <p className="text-sm" style={{ color: 'var(--md-outline)' }}>選擇筛選模板或自訂條件，開始揁描</p>
            <p className="text-xs mt-1" style={{ color: 'var(--md-outline-variant)' }}>預設揁描台股 + 美股 + 加密貨幣共 {DEFAULT_SYMBOLS.length} 殔</p>
          </div>
        </div>
      )}

      {/* Results Table */}
      {!loading && results.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto liquid-glass rounded-2xl border border-[var(--border-color)]">
          <table className="w-full text-xs sm:text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--bg-color)]/90 backdrop-blur-md">
              <tr className="border-b border-[var(--border-color)]">
                {[
                  { key: 'symbol' as SortKey, label: '代碼' },
                  { key: 'price' as SortKey, label: '現價' },
                  { key: 'changePct' as SortKey, label: '漲跌%' },
                  { key: 'rsi' as SortKey, label: 'RSI(14)' },
                  { key: 'volumeRatio' as SortKey, label: '量比' },
                  { key: 'signals' as SortKey, label: '技術訊號' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors select-none" style={{ color: 'var(--md-outline)' }}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && (
                        <ArrowUpDown size={10} style={{ color: 'var(--md-primary)' }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, visibleCount).map((r, i) => (
                <tr
                  key={r.symbol}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSymbol?.(r.symbol)}
                  onKeyDown={e => e.key === 'Enter' && onSelectSymbol?.(r.symbol)}
                  className={cn(
                    "border-b border-[var(--border-color)] cursor-pointer transition-colors hover:bg-[var(--bg-color)] active:bg-[var(--border-color)]",
                    i % 2 === 0 ? '' : 'bg-[var(--card-bg)]'
                  )}
                >
                  <td className="px-3 sm:px-4 py-3 min-w-[80px]">
                    <div className="font-black text-[var(--text-color)] text-xs sm:text-sm truncate">{r.symbol}</div>
                    <div className="text-[10px] truncate max-w-[80px] sm:max-w-[120px]" style={{ color: 'var(--md-outline)' }}>{r.name}</div>
                  </td>
                  <td className="px-3 sm:px-4 py-3 font-mono font-bold text-[var(--text-color)] text-xs sm:text-sm whitespace-nowrap">
                    {format.number(r.price, 2)}
                  </td>
                  <td className="px-3 sm:px-4 py-3 font-mono font-black text-xs sm:text-sm whitespace-nowrap" style={{ color: r.changePct >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontFamily: 'var(--font-data)' }}>
                    {format.percent(r.changePct)}
                  </td>
                  <td className={cn("px-3 sm:px-4 py-3 font-mono font-bold text-xs sm:text-sm", rsiColor(r.rsi))}>
                    {format.number(r.rsi, 1)}
                  </td>
                  <td className="px-3 sm:px-4 py-3 font-mono text-xs sm:text-sm">
                    <span className="font-bold" style={{ color: r.volumeRatio >= 2 ? 'var(--md-tertiary)' : 'var(--md-outline)' }}>
                      {format.number(r.volumeRatio, 1)}x
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3 min-w-[120px]">
                    <div className="flex flex-wrap gap-1">
                      {r.signals.length === 0 && <span className="text-[10px]" style={{ color: 'var(--md-outline-variant)' }}>—</span>}
                      {r.signals.map(sig => (
                        <span
                          key={sig}
                          className={cn("px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold border whitespace-nowrap", signalColor(sig))}
                        >
                          {sig}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            <div className="flex justify-center p-6 border-t border-[var(--border-color)]">
              <button type="button" onClick={() => setVisibleCount(v => v + 50)}
                className="px-6 py-2 text-xs font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-black/20"
                style={{ background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', border: '1px solid var(--md-outline-variant)' }}
              >
                載入更多項目 ({visibleCount}/{sorted.length})
              </button>
            </div>
        </div>
      )}
    </motion.div>
  );
}
