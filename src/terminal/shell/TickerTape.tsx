/**
 * TickerTape.tsx
 * Infinite auto-scrolling marquee with:
 * - Clickable items → Research page navigation
 * - ⚙ Manage button to add/remove custom symbols
 * - Persists custom list to localStorage
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, X, Plus, RotateCcw } from 'lucide-react';
import { formatPct, toneClass } from '../ui/format';
import { TICKER_LABEL_MAP, TICKER_TAPE_SYMBOLS } from '../hooks/useMarketData';
import { cn } from '../../lib/utils';
import { StockSymbolAutocomplete } from '../../components/common/StockSymbolAutocomplete';
import { resolveSymbolWithLookup } from '../../utils/stockSymbolLookup';

import type { PriceFlash } from '../hooks/useMarketData';

export interface TickerItem {
  symbol: string;
  label: string;
  value: string;      // Formatted price string
  changePct: number;  // % change
  change?: number;    // Absolute change (for Bloomberg-style display)
}

interface TickerTapeProps {
  items: TickerItem[];
  onSelect?: (symbol: string) => void;
  onSymbolsChange?: (symbols: string[]) => void;
  /** Map<symbol, 'up'|'down'> — symbols with a fresh price change */
  changedSymbols?: Map<string, PriceFlash>;
}

import { TICKER_STORAGE_KEY } from '../constants/storage'; // Fix #9: shared key, single source of truth
const SCROLL_PX_PER_SEC = 55;

export function TickerTape({ items, onSelect, onSymbolsChange, changedSymbols }: TickerTapeProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // ── Marquee animation ──────────────────────────────────────────────────────
  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const half = track.scrollWidth / 2;
    const step = (now: number) => {
      if (!paused) {
        const dt = lastTimeRef.current != null ? (now - lastTimeRef.current) / 1000 : 0;
        posRef.current += SCROLL_PX_PER_SEC * dt;
        if (half > 0 && posRef.current >= half) posRef.current -= half;
        track.style.transform = `translateX(-${posRef.current}px)`;
      }
      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [items, paused]);

  if (items.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-(--color-term-border) bg-(--color-term-bg) px-5">
        <span className="text-[11px] text-(--color-term-muted) animate-pulse tracking-widest">
          {t('market.loading', 'LOADING...')}
        </span>
      </div>
    );
  }

  const displayed = [...items, ...items];

  return (
    <div className="relative flex h-9 items-center border-b border-(--color-term-border) bg-(--color-term-bg)">
      {/* Manage button — icon-only, requires aria-label */}
      <button
        type="button"
        onClick={() => setShowManager(v => !v)}
        aria-label={t('ticker.manage')}
        aria-expanded={showManager}
        className={cn(
          'shrink-0 flex items-center justify-center h-full px-2.5 border-r border-(--color-term-border) transition-opacity z-20',
          showManager
            ? 'text-(--color-term-accent) bg-(--color-term-accent)/5'
            : 'text-(--color-term-muted) hover:text-(--color-term-accent)'
        )}
      >
        <Settings2 size={13} aria-hidden="true" />
      </button>

      {/* Scrolling marquee */}
      <div
        className="relative flex-1 overflow-hidden h-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Fade gradients */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-(--color-term-bg) to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-(--color-term-bg) to-transparent" />

        <div
          ref={trackRef}
          className="flex h-full items-center whitespace-nowrap"
          style={{
            width: 'max-content',
            // will-change applied only while the rAF loop is running (active animation)
            willChange: 'transform',
          }}
        >
          {displayed.map((item, i) => (
            <TickerChip
              key={`${item.symbol}-${i}`}
              item={item}
              onSelect={onSelect}
              flash={changedSymbols?.get(item.symbol)}
            />
          ))}
        </div>
      </div>

      {/* Manager panel */}
      {showManager && (
        <TickerManager
          currentSymbols={items.map(i => i.symbol).filter((s, i, arr) => arr.indexOf(s) === i)}
          onClose={() => setShowManager(false)}
          onChange={onSymbolsChange}
        />
      )}
    </div>
  );
}

// ── Ticker chip ────────────────────────────────────────────────────────────────
// Keyframe CSS injected once into the document head
const KEYFRAME_ID = '__ticker-flash-kf__';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAME_ID)) {
  const style = document.createElement('style');
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes tickerFlashUp {
      0%   { background: transparent; }
      20%  { background: rgba(16,185,129,0.22); }   /* emerald-500 */
      50%  { background: rgba(16,185,129,0.10); }
      80%  { background: rgba(16,185,129,0.18); }
      100% { background: transparent; }
    }
    @keyframes tickerFlashDown {
      0%   { background: transparent; }
      20%  { background: rgba(239,68,68,0.22); }    /* red-500 */
      50%  { background: rgba(239,68,68,0.10); }
      80%  { background: rgba(239,68,68,0.18); }
      100% { background: transparent; }
    }
    .ticker-flash-up   { animation: tickerFlashUp   3.5s ease-in-out forwards; }
    .ticker-flash-down { animation: tickerFlashDown 3.5s ease-in-out forwards; }
  `;
  document.head.appendChild(style);
}

function TickerChip({
  item,
  onSelect,
  flash,
}: {
  item: TickerItem;
  onSelect?: (s: string) => void;
  flash?: PriceFlash;
}) {
  const isClickable = onSelect
    && !item.symbol.startsWith('^')
    && !item.symbol.includes('=F')
    && !item.symbol.endsWith('=X')
    && item.symbol !== 'USDTWD=X';

  const isIndex     = item.symbol.startsWith('^');
  const isCrypto    = item.symbol.endsWith('-USD');
  const isForex     = item.symbol.endsWith('=X');
  const isCommodity = item.symbol.endsWith('=F');

  const dot = isIndex ? '▸' : isCrypto ? '₿' : isForex ? '◈' : isCommodity ? '◆' : '●';
  const dotColor = isIndex
    ? 'text-sky-500'
    : isCrypto
    ? 'text-amber-400'
    : isForex
    ? 'text-violet-400'
    : isCommodity
    ? 'text-yellow-600'
    : 'text-emerald-500';

  // Absolute change: (+123.45) or (-0.31)
  const abs = item.change;
  let absDisplay = '';
  if (abs != null) {
    const sign = abs >= 0 ? '+' : '';
    const val  = Math.abs(abs) >= 100
      ? abs.toFixed(0)
      : Math.abs(abs) >= 1
      ? abs.toFixed(2)
      : abs.toFixed(4);
    absDisplay = `(${sign}${val})`;
  }

  // Flash class: only applied when flash is defined (price changed)
  const flashClass = flash === 'up'
    ? 'ticker-flash-up'
    : flash === 'down'
    ? 'ticker-flash-down'
    : '';

  return (
    <button
      type="button"
      onClick={() => isClickable && onSelect?.(item.symbol)}
      className={cn(
        'flex items-center gap-1 px-3 h-full text-[11px] border-r border-(--color-term-border)/20 transition-colors shrink-0',
        isClickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default',
        flashClass,
      )}
    >
      <span className={cn('text-[8px] leading-none', dotColor)}>{dot}</span>
      <span className="font-bold tracking-wide text-(--color-term-text) mr-0.5">{item.label}</span>
      <span className="font-mono text-(--color-term-muted) tabular-nums">{item.value}</span>
      <span className={cn('font-mono font-bold tabular-nums', toneClass(item.changePct))}>
        {formatPct(item.changePct)}
      </span>
      {absDisplay ? (
        <span className={cn('font-mono tabular-nums text-[10px] opacity-65', toneClass(item.changePct))}>
          {absDisplay}
        </span>
      ) : null}
    </button>
  );
}


// ── Ticker Manager Panel ───────────────────────────────────────────────────────
function TickerManager({
  currentSymbols,
  onClose,
  onChange,
}: {
  currentSymbols: string[];
  onClose: () => void;
  onChange?: (symbols: string[]) => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(TICKER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : currentSymbols;
    } catch { return currentSymbols; }
  });
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);

  const handleAdd = async (rawInput?: string) => {
    const resolved = await resolveSymbolWithLookup(rawInput ?? input);
    const sym = resolved.trim().toUpperCase();
    if (!sym || list.includes(sym)) { setInput(''); return; }
    setList(prev => [...prev, sym]);
    setInput('');
  };

  const handleRemove = (sym: string) => setList(prev => prev.filter(s => s !== sym));

  const handleSave = useCallback(() => {
    try {
      // client-localstorage-schema: always wrap setItem (throws in incognito/quota exceeded)
      localStorage.setItem(TICKER_STORAGE_KEY, JSON.stringify(list));
    } catch { /* no-op: storage unavailable */ }
    onChange?.(list);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [list, onChange]);

  const handleReset = () => {
    setList(TICKER_TAPE_SYMBOLS);
  };

  return (
    <div className="absolute left-0 top-full z-[80] mt-px w-[340px] max-w-[calc(100vw-8px)] bg-(--color-term-panel) border border-(--color-term-border) shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border)">
        <span className="text-[11px] font-bold tracking-widest text-(--color-term-accent) uppercase">
          {t('ticker.manage')}
        </span>
        <button type="button" onClick={onClose} className="text-(--color-term-muted) hover:text-(--color-term-text)">
          <X size={14} />
        </button>
      </div>

      {/* Add row */}
      <div className="flex gap-2 p-3 border-b border-(--color-term-border)">
        <StockSymbolAutocomplete
          value={input}
          onValueChange={setInput}
          onSymbolSubmit={(symbol) => {
            setInput(symbol);
            void handleAdd(symbol);
          }}
          placeholder={t('ticker.placeholder')}
          className="flex-1"
          inputClassName="h-8 px-2 bg-(--color-term-bg) border border-(--color-term-border) text-xs font-mono text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
          dropdownClassName="left-0 right-0"
        />
        <button
          type="button"
          onClick={() => { void handleAdd(); }}
          className="flex items-center gap-1 h-8 px-3 bg-(--color-term-accent) text-black text-xs font-bold hover:opacity-90"
        >
          <Plus size={12} />{t('ticker.add')}
        </button>
      </div>

      {/* Symbol list */}
      <div className="max-h-52 overflow-y-auto">
        {list.map(sym => (
          <div key={sym} className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 group">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-(--color-term-muted)">
                {TICKER_LABEL_MAP[sym] ?? sym}
              </span>
              <span className="text-[10px] text-(--color-term-muted)/50 font-mono">{sym}</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(sym)}
              className="opacity-0 group-hover:opacity-100 text-(--color-term-muted) hover:text-rose-400 transition-all p-1"
              title={t('market.removeSymbol')}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-(--color-term-border) bg-(--color-term-bg)/50">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-[10px] text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
        >
          <RotateCcw size={11} />
          {t('ticker.reset')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 px-4 h-7 text-[11px] font-bold transition-all',
            saved
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-(--color-term-accent) text-black hover:opacity-90'
          )}
        >
          {saved ? `✓ ${t('ticker.saved')}` : t('common.save')}
        </button>
      </div>
    </div>
  );
}
