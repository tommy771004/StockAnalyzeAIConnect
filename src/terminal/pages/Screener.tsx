/**
 * src/terminal/pages/Screener.tsx
 * Integrated XQ-style multi-criteria stock screener for the terminal.
 */
import React, { useState, useCallback, useRef } from 'react';
import { 
  Filter as FilterIcon, 
  Loader2 as Loader2Icon, 
  ArrowUpDown as ArrowUpDownIcon, 
  ChevronDown as ChevronDownIcon, 
  X as XIcon, 
  RefreshCw as RefreshCwIcon, 
  Target as TargetIcon 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence as AnimatePresenceWrapper } from 'motion/react';
import * as api from '../../services/api';
import type { ScreenerFilters } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '../../components/PullToRefreshIndicator';
import type { ScreenerResult } from '../../types';
import type { TerminalView } from '../types';

// ── Pre-built scan templates ──────────────────────────────────────────────────
// Exported to prevent Terser/esbuild minifier TDZ collisions
export const TEMPLATES: { id: string; label: string; desc: string; filters: ScreenerFilters; color: string }[] = [
  { id: 'oversold',     label: 'RSI 超賣反彈',   desc: 'RSI < 30，超賣區反彈機會',          filters: { rsiBelow: 30 },                              color: 'text-rose-400' },
  { id: 'overbought',   label: 'RSI 超買警示',   desc: 'RSI > 70，超買區注意回檔',          filters: { rsiAbove: 70 },                              color: 'text-emerald-400' },
  { id: 'golden_cross',  label: '均線金叉',       desc: 'SMA5 上穿 SMA20，趨勢轉多',        filters: { goldenCrossOnly: true },                      color: 'text-amber-400' },
  { id: 'death_cross',   label: '均線死叉',       desc: 'SMA5 下穿 SMA20，趨勢轉空',        filters: { deathCrossOnly: true },                       color: 'text-rose-400' },
  { id: 'macd_bull',     label: 'MACD 多頭動能',  desc: 'MACD 柱狀由負轉正',               filters: { macdBullish: true },                          color: 'text-emerald-400' },
  { id: 'vol_spike',     label: '異常爆量',       desc: '成交量 > 20 日均量 2 倍',           filters: { volumeSpikeMin: 2 },                          color: 'text-amber-400' },
  { id: 'bullish_trend', label: '多頭排列',       desc: '價格 > SMA20，趨勢向上',           filters: { aboveSMA20: true, macdBullish: true },         color: 'text-emerald-400' },
  { id: 'bearish_trend', label: '空頭排列',       desc: '價格 < SMA20 且 MACD 空頭',        filters: { belowSMA20: true, macdBearish: true },         color: 'text-rose-400' },
];

export const DEFAULT_SYMBOLS = [
  // 台股
  '2330.TW','2317.TW','2454.TW','2382.TW','2412.TW','2881.TW','2882.TW','2303.TW','3711.TW','2308.TW',
  // 美股
  'AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD','AVGO','TSM',
  // 加密
  'BTC-USD','ETH-USD',
];

type SortKey = 'symbol' | 'price' | 'changePct' | 'rsi' | 'volumeRatio' | 'signals';
type SortDir = 'asc' | 'desc';

interface ScreenerPageProps {
  onNavigate: (view: TerminalView) => void;
}

export function ScreenerPage({ onNavigate }: ScreenerPageProps) {
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

  const handleSelectSymbol = useCallback((sym: string) => {
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
    onNavigate('research');
  }, [onNavigate]);

  const hasMoreResults = results.length > visibleCount;

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
    if (sig.includes('超賣') || sig.includes('金叉') || sig.includes('多頭')) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (sig.includes('超買') || sig.includes('死叉') || sig.includes('空頭')) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    return 'text-(--color-term-muted) bg-white/5 border-white/10';
  };

  const rsiColor = (rsi: number) => {
    if (rsi > 70) return 'text-rose-400';
    if (rsi < 30) return 'text-emerald-400';
    return '';
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-(--color-term-bg)">
      {/* Terminal-style header bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-2 border-b"
        style={{
          borderColor: 'var(--color-term-border)',
          background: 'var(--color-term-panel)',
        }}
      >
        <span
          className="text-[10px] font-bold tracking-[0.25em] uppercase hidden sm:inline-block"
          style={{ color: 'var(--color-term-muted)' }}
        >
          MODULE
        </span>
        <span
          className="text-[11px] font-bold tracking-[0.2em] uppercase"
          style={{ color: 'var(--color-term-accent)' }}
        >
          STOCK_SCREENER.EXE
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[10px] tracking-widest"
          style={{ color: 'var(--color-term-positive)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[var(--color-term-positive)]" />
          <span className="hidden sm:inline-block">MULTI-ASSET SCAN READY</span>
          <span className="sm:hidden">READY</span>
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex flex-col gap-4 p-4 md:p-6 overflow-y-auto"
      >
        <PullToRefreshIndicator state={pullState} />

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className={cn("font-black tracking-tight flex items-center gap-2", compact ? "text-xl" : "text-2xl text-(--color-term-text)")}>
              <TargetIcon size={compact ? 20 : 24} className="text-(--color-term-accent)" />
              智慧選股器 (Smart Screener)
            </h1>
            <p className="text-xs mt-1 text-(--color-term-muted)">XQ-Style Technical Screener — 多條件批量掃描</p>
          </div>
          <button type="button" onClick={() => runScan()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 h-11 md:h-10 rounded-sm text-sm font-bold transition active:scale-95 disabled:opacity-50 uppercase tracking-widest bg-(--color-term-accent) text-black hover:opacity-90 w-full md:w-auto"
          >
            {loading ? <Loader2Icon size={16} className="animate-spin" /> : <RefreshCwIcon size={16} />}
            {loading ? '掃描中 SCANNING...' : '開始掃描 RUN SCAN'}
          </button>
        </div>

        {/* Template Chips */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {TEMPLATES.map(t => (
            <button type="button" key={t.id} onClick={() => handleTemplate(t)}
              className={cn(
                "px-3 py-2 md:py-1.5 rounded-sm text-[11px] md:text-xs font-bold border transition active:scale-95 tracking-wider md:tracking-widest",
                activeTemplate === t.id
                  ? "bg-(--color-term-accent)/20 border-(--color-term-accent) text-(--color-term-accent)"
                  : "bg-(--color-term-panel) border-(--color-term-border) text-(--color-term-muted) hover:text-(--color-term-text) hover:border-white/20"
              )}
              title={t.desc}
            >
              <span className={activeTemplate === t.id ? '' : t.color}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Custom Filters Panel */}
        <div className="shrink-0 bg-(--color-term-panel) border border-(--color-term-border) rounded-sm overflow-hidden">
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-white/5 text-(--color-term-muted)"
          >
            <div className="flex items-center gap-2">
              <FilterIcon size={14} />
              自訂篩選條件 (CUSTOM FILTERS)
            </div>
            <ChevronDownIcon size={14} className={cn("transition-transform duration-300", showFilters && "rotate-180")} />
          </button>
          <AnimatePresenceWrapper>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-(--color-term-border)"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">RSI 低於 (Oversold)</label>
                    <input
                      type="number" min={0} max={100} placeholder="30"
                      value={customFilters.rsiBelow ?? ''}
                      onChange={e => setCustomFilters(f => ({ ...f, rsiBelow: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">RSI 高於 (Overbought)</label>
                    <input
                      type="number" min={0} max={100} placeholder="70"
                      value={customFilters.rsiAbove ?? ''}
                      onChange={e => setCustomFilters(f => ({ ...f, rsiAbove: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">量能倍數 ≥ (Volume Spike)</label>
                    <input
                      type="number" min={1} step={0.5} placeholder="2"
                      value={customFilters.volumeSpikeMin ?? ''}
                      onChange={e => setCustomFilters(f => ({ ...f, volumeSpikeMin: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div className="flex flex-col gap-3 justify-center pt-5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-(--color-term-text)">
                      <input type="checkbox" checked={!!customFilters.macdBullish}
                        onChange={e => setCustomFilters(f => ({ ...f, macdBullish: e.target.checked || undefined, macdBearish: undefined }))}
                        className="w-4 h-4 accent-(--color-term-accent)" />
                      MACD 多頭 (Bullish)
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-(--color-term-text)">
                      <input type="checkbox" checked={!!customFilters.aboveSMA20}
                        onChange={e => setCustomFilters(f => ({ ...f, aboveSMA20: e.target.checked || undefined, belowSMA20: undefined }))}
                        className="w-4 h-4 accent-(--color-term-accent)" />
                      價格 &gt; SMA20 (Uptrend)
                    </label>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">自訂代碼 (留空使用預設清單)</label>
                    <input
                      type="text"
                      value={customSymbols}
                      onChange={e => setCustomSymbols(e.target.value.toUpperCase())}
                      placeholder="AAPL, NVDA, 2330.TW, BTC-USD …"
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 flex flex-col sm:flex-row gap-3 mt-2">
                    <button type="button" onClick={() => { setActiveTemplate(null); runScan(); }}
                      className="px-6 h-11 rounded-sm text-sm font-bold transition bg-(--color-term-accent) text-black hover:opacity-90 w-full sm:w-auto"
                    >
                      執行自訂掃描
                    </button>
                    <button type="button" onClick={() => { setCustomFilters({}); setActiveTemplate(null); }}
                      className="px-6 h-11 rounded-sm text-sm font-bold transition bg-(--color-term-bg) border border-(--color-term-border) text-(--color-term-text) hover:bg-white/5 w-full sm:w-auto"
                    >
                      清除條件
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresenceWrapper>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
            <XIcon size={16} />{error}
          </div>
        )}

        {/* Results Summary */}
        {results.length > 0 && (
          <div className="text-xs shrink-0 text-(--color-term-muted)">
            掃描 <span className="font-mono">{scannedCount}</span> 檔標的 → 符合條件 <span className="font-bold text-(--color-term-accent)">{results.length}</span> 檔
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-4">
              <Loader2Icon className="w-8 h-8 animate-spin text-(--color-term-accent)" />
              <span className="text-sm font-bold tracking-widest text-(--color-term-muted)">SCANNING UNIVERSE...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !error && (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <TargetIcon className="w-12 h-12 mx-auto mb-4 text-(--color-term-border)" />
              <p className="text-sm font-bold text-(--color-term-muted)">請選擇左上方篩選模板或展開自訂條件，開始掃描</p>
              <p className="text-xs mt-2 text-(--color-term-muted)/60">預設掃描台股 + 美股 + 加密貨幣共 {DEFAULT_SYMBOLS.length} 檔</p>
            </div>
          </div>
        )}

        {/* Results Table */}
        {!loading && results.length > 0 && (
          <div className="flex-1 min-h-0 bg-(--color-term-panel) border border-(--color-term-border) rounded-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-(--color-term-panel) border-b border-(--color-term-border)">
                  <tr>
                    {[
                      { key: 'symbol' as SortKey, label: '代碼 (SYMBOL)' },
                      { key: 'price' as SortKey, label: '現價 (PRICE)' },
                      { key: 'changePct' as SortKey, label: '漲跌 (CHG%)' },
                      { key: 'rsi' as SortKey, label: 'RSI(14)' },
                      { key: 'volumeRatio' as SortKey, label: '量比 (VOL)' },
                      { key: 'signals' as SortKey, label: '技術訊號 (SIGNALS)' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-white/5 transition-colors select-none text-(--color-term-muted) whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1.5">
                          {col.label}
                          {sortKey === col.key && (
                            <ArrowUpDownIcon size={12} className="text-(--color-term-accent)" />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-term-border)/40">
                  {sorted.slice(0, visibleCount).map((r, i) => (
                    <tr
                      key={r.symbol}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSymbol(r.symbol)}
                      onKeyDown={e => e.key === 'Enter' && handleSelectSymbol(r.symbol)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-white/5",
                        i % 2 === 0 ? '' : 'bg-black/20'
                      )}
                    >
                      <td className="px-4 py-3.5 min-w-[120px]">
                        <div className="font-bold text-(--color-term-text) text-sm truncate">{r.symbol}</div>
                        <div className="text-[10px] truncate max-w-[120px] text-(--color-term-muted)">{r.name}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-(--color-term-text) whitespace-nowrap">
                        {format.number(r.price, 2)}
                      </td>
                      <td className={cn("px-4 py-3.5 font-mono font-bold whitespace-nowrap", r.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {r.changePct >= 0 ? '+' : ''}{format.percent(r.changePct)}
                      </td>
                      <td className={cn("px-4 py-3.5 font-mono font-bold whitespace-nowrap", rsiColor(r.rsi))}>
                        {format.number(r.rsi, 1)}
                      </td>
                      <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                        <span className={cn("font-bold", r.volumeRatio >= 2 ? 'text-amber-400' : 'text-(--color-term-muted)')}>
                          {format.number(r.volumeRatio, 1)}x
                        </span>
                      </td>
                      <td className="px-4 py-3.5 min-w-[160px]">
                        <div className="flex flex-wrap gap-1.5">
                          {r.signals.length === 0 && <span className="text-[10px] text-(--color-term-muted)">—</span>}
                          {r.signals.map(sig => (
                            <span
                              key={sig}
                              className={cn("px-2 py-0.5 rounded-sm text-[10px] font-bold border whitespace-nowrap", signalColor(sig))}
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
            </div>
            {hasMoreResults && (
              <div className="flex justify-center p-4 border-t border-(--color-term-border) bg-(--color-term-bg)">
                <button type="button" onClick={() => setVisibleCount(v => v + 50)}
                  className="px-6 py-2.5 text-xs font-bold rounded-sm transition-all border border-(--color-term-border) text-(--color-term-text) hover:bg-white/5"
                >
                  載入更多 LOAD MORE ({visibleCount}/{sorted.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
