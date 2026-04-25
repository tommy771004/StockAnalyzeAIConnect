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
import { SectorSelector } from '../components/SectorSelector';
import type { ScreenerResult } from '../../types';
import type { TerminalView } from '../types';

// ── Pre-built scan templates ──────────────────────────────────────────────────
// Exported to prevent Terser/esbuild minifier TDZ collisions
export const TEMPLATES: { id: string; label: string; desc: string; filters: ScreenerFilters; color: string }[] = [
  { id: 'oversold',     label: 'screener.oversold', desc: 'screener.oversoldDesc',          filters: { rsiBelow: 30 },                              color: 'text-rose-400' },
  { id: 'overbought',   label: 'screener.overbought', desc: 'screener.overboughtDesc',          filters: { rsiAbove: 70 },                              color: 'text-emerald-400' },
  { id: 'golden_cross',  label: 'screener.goldenCross', desc: 'screener.goldenCrossDesc',        filters: { goldenCrossOnly: true },                      color: 'text-amber-400' },
  { id: 'death_cross',   label: 'screener.deathCross', desc: 'screener.deathCrossDesc',        filters: { deathCrossOnly: true },                       color: 'text-rose-400' },
  { id: 'macd_bull',     label: 'screener.macdBull', desc: 'screener.macdBullDesc',               filters: { macdBullish: true },                          color: 'text-emerald-400' },
  { id: 'vol_spike',     label: 'screener.volSpike', desc: 'screener.volSpikeDesc',           filters: { volumeSpikeMin: 2 },                          color: 'text-amber-400' },
  { id: 'bullish_trend', label: 'screener.bullishTrend', desc: 'screener.bullishTrendDesc',           filters: { aboveSMA20: true, macdBullish: true },         color: 'text-emerald-400' },
  { id: 'bearish_trend', label: 'screener.bearishTrend', desc: 'screener.bearishTrendDesc',        filters: { belowSMA20: true, macdBearish: true },         color: 'text-rose-400' },
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

import { useTranslation } from 'react-i18next';

export function ScreenerPage({ onNavigate }: ScreenerPageProps) {
  const { t, i18n } = useTranslation();
  const { settings, format } = useSettings();
  const compact = settings.compactMode;

  // PERSISTENCE: Use localStorage to keep state between navigations
  const [results, setResults] = useState<ScreenerResult[]>(() => {
    try {
      const saved = localStorage.getItem('screener_results');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<string | null>(() => localStorage.getItem('screener_active_template'));

  const [customFilters, setCustomFilters] = useState<ScreenerFilters>(() => {
    try {
      const saved = localStorage.getItem('screener_filters');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showFilters, setShowFilters] = useState(false);
  const [customSymbols, setCustomSymbols] = useState(() => localStorage.getItem('screener_symbols') || '');
  const [selectedSectors, setSelectedSectors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('screener_sectors');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Save state to localStorage
  React.useEffect(() => {
    localStorage.setItem('screener_results', JSON.stringify(results));
    localStorage.setItem('screener_filters', JSON.stringify(customFilters));
    localStorage.setItem('screener_symbols', customSymbols);
    localStorage.setItem('screener_sectors', JSON.stringify(selectedSectors));
    if (activeTemplate) {
      localStorage.setItem('screener_active_template', activeTemplate);
    } else {
      localStorage.removeItem('screener_active_template');
    }
  }, [results, customFilters, customSymbols, selectedSectors, activeTemplate]);

  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scannedCount, setScannedCount] = useState(() => Number(localStorage.getItem('screener_scanned_count')) || 0);
  const [visibleCount, setVisibleCount] = useState(50);
  const [viewMode, setViewMode] = useState<'list' | 'chart'>(() => (localStorage.getItem('screener_view') as any) || 'list');

  React.useEffect(() => {
    localStorage.setItem('screener_view', viewMode);
    localStorage.setItem('screener_scanned_count', scannedCount.toString());
  }, [viewMode, scannedCount]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const runScan = useCallback(async (filters?: ScreenerFilters) => {
    setLoading(true);
    setError('');
    try {
      let syms: string[] = [];
      const manualSymbols = customSymbols.trim()
        ? customSymbols.split(/[,\s\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        : [];
      
      let sectorSymbols: string[] = [];
      if (selectedSectors.length > 0) {
        const results = await Promise.all(selectedSectors.map(id => api.getSectorSymbols(id)));
        sectorSymbols = Array.from(new Set(results.flat() as string[]));
      }
      
      // LOGIC FIX: 
      // 1. If we have manual symbols, use them.
      // 2. If we have sector symbols, include them.
      // 3. ONLY if both are truly empty (and no sector was even attempted), fall back to defaults.
      if (manualSymbols.length > 0 || sectorSymbols.length > 0) {
        syms = Array.from(new Set([...manualSymbols, ...sectorSymbols]));
      } else if (selectedSectors.length === 0 && customSymbols.trim() === '') {
        // Only fall back to defaults if user has NO selections and NO custom input
        syms = DEFAULT_SYMBOLS;
      } else {
        // User selected a sector or typed something that returned no results
        syms = [];
        if (selectedSectors.length > 0) {
          setError(t('screener.noSymbolsInSector', '所選類別目前查無資料，請稍後再試或換個類別'));
        }
      }

      if (syms.length === 0 && (selectedSectors.length > 0 || customSymbols.trim() !== '')) {
        setResults([]);
        setScannedCount(0);
        return;
      }

      setScannedCount(syms.length);
      const data = await api.runScreener(syms, filters ?? customFilters);
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('screener.scanFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [customSymbols, customFilters, selectedSectors, t]);

  const pullState = usePullToRefresh(containerRef, { onRefresh: () => runScan() });

  const handleTemplate = (t: typeof TEMPLATES[0]) => {
    setActiveTemplate(t.id);
    setCustomFilters(t.filters);
    runScan(t.filters);
  };

  const handleSelectSymbol = useCallback((sym: string) => {
    // 確保在導航前先存入 sessionStorage，這是 ResearchPage 的主要來源
    sessionStorage.setItem('research-symbol', sym);
    // 延遲發送事件，確保 ResearchPage 已掛載（或是讓 ResearchPage 的 mount effect 處理）
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
    }, 100);
    
    // 使用 hash 導航以符合 user 範例並確保 App.tsx 偵測到
    window.location.hash = 'research';
  }, []);

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

  const translateSignal = (sig: string) => {
    // Map backend Chinese signals to i18n keys
    if (sig === 'RSI 超賣') return t('screener.signals.rsiOversold');
    if (sig === 'RSI 超買') return t('screener.signals.rsiOverbought');
    if (sig === '均線金叉') return t('screener.signals.goldenCross');
    if (sig === '均線死叉') return t('screener.signals.deathCross');
    if (sig === 'MACD 多頭') return t('screener.signals.macdBullish');
    if (sig === 'MACD 空頭') return t('screener.signals.macdBearish');
    if (sig === '異常爆量') return t('screener.signals.volSpike');
    if (sig === '強勢多頭') return t('screener.signals.strongBull');
    return sig;
  };

  const signalColor = (sig: string) => {
    // Use the raw backend signal for color logic to stay consistent
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
              {t('screener.title')}
            </h1>
            <p className="text-xs mt-1 text-(--color-term-muted)">{t('screener.screenerDesc', 'XQ-Style Technical Screener — 多條件批量掃描')}</p>
          </div>
          <button type="button" onClick={() => runScan()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 h-11 md:h-10 rounded-sm text-sm font-bold transition active:scale-95 disabled:opacity-50 uppercase tracking-widest bg-(--color-term-accent) text-black hover:opacity-90 w-full md:w-auto"
          >
            {loading ? <Loader2Icon size={16} className="animate-spin" /> : <RefreshCwIcon size={16} />}
            {loading ? t('screener.scanningUpper') : t('screener.runScanUpper')}
          </button>
        </div>

        {/* Template Chips */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {TEMPLATES.map(tmpl => (
            <button type="button" key={tmpl.id} onClick={() => handleTemplate(tmpl)}
              className={cn(
                "px-3 py-2 md:py-1.5 rounded-sm text-[11px] md:text-xs font-bold border transition active:scale-95 tracking-wider md:tracking-widest",
                activeTemplate === tmpl.id
                  ? "bg-(--color-term-accent)/20 border-(--color-term-accent) text-(--color-term-accent)"
                  : "bg-(--color-term-panel) border-(--color-term-border) text-(--color-term-muted) hover:text-(--color-term-text) hover:border-white/20"
              )}
              title={t(tmpl.desc)}
            >
              <span className={activeTemplate === tmpl.id ? '' : tmpl.color}>{t(tmpl.label)}</span>
            </button>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-(--color-term-panel) border border-(--color-term-border) p-1 rounded-sm shrink-0 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors",
              viewMode === 'list' ? "bg-(--color-term-accent) text-black" : "text-(--color-term-muted) hover:text-white"
            )}
          >
            {t('screener.viewList', '清單 (List)')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={cn(
              "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors",
              viewMode === 'chart' ? "bg-(--color-term-accent) text-black" : "text-(--color-term-muted) hover:text-white"
            )}
          >
            {t('screener.viewChart', '附圖 (Chart)')}
          </button>
        </div>

        {/* Custom Filters Panel */}
        <div className="shrink-0 bg-(--color-term-panel) border border-(--color-term-border) rounded-sm overflow-hidden">
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-white/5 text-(--color-term-muted)"
          >
            <div className="flex items-center gap-2">
              <FilterIcon size={14} />
              {t('screener.customFilters')}
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
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">{t('screener.rsiLow')}</label>
                    <input
                      type="number" min={0} max={100} placeholder="30"
                      value={customFilters.rsiBelow ?? ''}
                      onChange={e => {
                        setActiveTemplate(null);
                        setCustomFilters(f => ({ ...f, rsiBelow: e.target.value ? Number(e.target.value) : undefined }));
                      }}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">{t('screener.rsiHigh')}</label>
                    <input
                      type="number" min={0} max={100} placeholder="70"
                      value={customFilters.rsiAbove ?? ''}
                      onChange={e => {
                        setActiveTemplate(null);
                        setCustomFilters(f => ({ ...f, rsiAbove: e.target.value ? Number(e.target.value) : undefined }));
                      }}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">{t('screener.volSpikeTitle')}</label>
                    <input
                      type="number" min={1} step={0.5} placeholder="2"
                      value={customFilters.volumeSpikeMin ?? ''}
                      onChange={e => {
                        setActiveTemplate(null);
                        setCustomFilters(f => ({ ...f, volumeSpikeMin: e.target.value ? Number(e.target.value) : undefined }));
                      }}
                      className="w-full h-11 px-3 bg-(--color-term-bg) border border-(--color-term-border) text-sm font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
                    />
                  </div>
                  <div className="flex flex-col gap-3 justify-center pt-5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-(--color-term-text)">
                      <input type="checkbox" checked={!!customFilters.macdBullish}
                        onChange={e => {
                          setActiveTemplate(null);
                          setCustomFilters(f => ({ ...f, macdBullish: e.target.checked || undefined, macdBearish: undefined }));
                        }}
                        className="w-4 h-4 accent-(--color-term-accent)" />
                      {t('screener.macdBullish')}
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer text-(--color-term-text)">
                      <input type="checkbox" checked={!!customFilters.aboveSMA20}
                        onChange={e => {
                          setActiveTemplate(null);
                          setCustomFilters(f => ({ ...f, aboveSMA20: e.target.checked || undefined, belowSMA20: undefined }));
                        }}
                        className="w-4 h-4 accent-(--color-term-accent)" />
                      {t('screener.priceAboveSma20')}
                    </label>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-2 block">{t('screener.sectors')}</label>
                    <SectorSelector 
                      selectedIds={selectedSectors} 
                      onChange={setSelectedSectors} 
                      placeholder={t('screener.searchSectors', '搜尋產業類別...')}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 mt-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--color-term-muted) mb-1.5 block">{t('screener.customSymbolsPlaceholder')}</label>
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
                      {t('screener.runCustomScan')}
                    </button>
                    <button type="button" onClick={() => { setCustomFilters({}); setActiveTemplate(null); setSelectedSectors([]); setCustomSymbols(''); }}
                      className="px-6 h-11 rounded-sm text-sm font-bold transition bg-(--color-term-bg) border border-(--color-term-border) text-(--color-term-text) hover:bg-white/5 w-full sm:w-auto"
                    >
                      {t('screener.clearFiltersBtn')}
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
            {t('screener.scannedInfoSimple', { scanned: scannedCount, matched: results.length })}
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
              <p className="text-sm font-bold text-(--color-term-muted)">{t('screener.emptyDesc1')}</p>
              <p className="text-xs mt-2 text-(--color-term-muted)/60">{t('screener.emptyDesc2', { count: DEFAULT_SYMBOLS.length })}</p>
            </div>
          </div>
        )}

        {/* Results Display */}
        {!loading && results.length > 0 && (
          viewMode === 'list' ? (
            <div className="flex-1 min-h-0 bg-(--color-term-panel) border border-(--color-term-border) rounded-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="sticky top-0 z-10 bg-(--color-term-panel) border-b border-(--color-term-border)">
                    <tr>
                      {[
                        { key: 'symbol' as SortKey, label: t('screener.colSymbol', 'SYMBOL') },
                        { key: 'price' as SortKey, label: t('screener.colPrice', 'PRICE') },
                        { key: 'changePct' as SortKey, label: t('screener.colChange', 'CHG%') },
                        { key: 'rsi' as SortKey, label: 'RSI(14)' },
                        { key: 'volumeRatio' as SortKey, label: t('screener.colVol', 'VOL RATIO') },
                        { key: 'signals' as SortKey, label: t('screener.colSignals', 'SIGNALS') },
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
                                {translateSignal(sig)}
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
                    {t('screener.loadMoreCount', { visible: visibleCount, total: sorted.length })}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sorted.slice(0, visibleCount).map((r) => (
                  <div 
                    key={r.symbol}
                    onClick={() => handleSelectSymbol(r.symbol)}
                    className="bg-(--color-term-panel) border border-(--color-term-border) rounded-sm overflow-hidden cursor-pointer hover:border-(--color-term-accent)/50 transition-colors flex flex-col h-[280px]"
                  >
                    <div className="p-3 border-b border-(--color-term-border) flex items-center justify-between shrink-0">
                      <div>
                        <div className="font-bold text-sm text-(--color-term-text)">{r.symbol}</div>
                        <div className="text-[10px] text-(--color-term-muted) truncate max-w-[120px]">{r.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm text-(--color-term-text)">{r.price.toFixed(2)}</div>
                        <div className={cn("text-[10px] font-bold", r.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-black/40 p-2 overflow-hidden relative group">
                      {/* Using a simple TradingView chart widget as a thumbnail */}
                      <iframe
                        src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_762ae&symbol=${r.symbol.includes('.') ? r.symbol.split('.')[0] : r.symbol}&interval=D&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget&utm_campaign=chart&utm_term=AAPL`}
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        allowTransparency={true}
                        scrolling="no"
                        allowFullScreen={true}
                        className="pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity"
                      ></iframe>
                      <div className="absolute inset-0 z-10"></div> {/* Click catcher */}
                    </div>
                    <div className="p-2 border-t border-(--color-term-border) flex flex-wrap gap-1 shrink-0 overflow-hidden h-[40px]">
                      {r.signals.slice(0, 3).map(sig => (
                        <span key={sig} className={cn("px-1.5 py-0.5 rounded-sm text-[9px] font-bold border", signalColor(sig))}>
                          {translateSignal(sig)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {hasMoreResults && (
                <div className="flex justify-center p-6">
                  <button type="button" onClick={() => setVisibleCount(v => v + 50)}
                    className="px-8 py-3 text-sm font-bold rounded-sm transition-all bg-(--color-term-panel) border border-(--color-term-border) text-(--color-term-text) hover:bg-white/5"
                  >
                    {t('screener.loadMoreCount', { visible: visibleCount, total: sorted.length })}
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
