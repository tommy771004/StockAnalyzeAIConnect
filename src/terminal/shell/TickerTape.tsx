/**
 * TickerTape.tsx
 * Infinite auto-scrolling marquee with clickable items → Research page navigation.
 * Items are duplicated to create a seamless loop. Pauses on hover.
 */
import { useRef, useEffect, useState } from 'react';
import { formatPct, toneClass } from '../ui/format';
import { TICKER_LABEL_MAP } from '../hooks/useMarketData';
import { cn } from '../../lib/utils';

export interface TickerItem {
  symbol: string;   // Yahoo symbol (e.g. '^GSPC', 'BTC-USD', '2330.TW')
  label: string;    // Short display name
  value: string;    // Formatted price string
  changePct: number;
}

interface TickerTapeProps {
  items: TickerItem[];
  onSelect?: (symbol: string) => void;
}

const SCROLL_PX_PER_SEC = 60; // scroll speed

export function TickerTape({ items, onSelect }: TickerTapeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const half = track.scrollWidth / 2;

    const step = (now: number) => {
      if (!paused) {
        const dt = lastTimeRef.current != null ? (now - lastTimeRef.current) / 1000 : 0;
        posRef.current += SCROLL_PX_PER_SEC * dt;
        if (posRef.current >= half) posRef.current -= half;
        track.style.transform = `translateX(-${posRef.current}px)`;
      }
      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [items, paused]);

  if (items.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-(--color-term-border) bg-(--color-term-bg) px-5">
        <span className="text-[11px] text-(--color-term-muted) animate-pulse tracking-widest">MARKET DATA LOADING...</span>
      </div>
    );
  }

  // Duplicate items for seamless loop
  const displayed = [...items, ...items];

  return (
    <div
      className="relative h-9 overflow-hidden border-b border-(--color-term-border) bg-(--color-term-bg) select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Left fade gradient */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-10 bg-gradient-to-r from-(--color-term-bg) to-transparent" />
      {/* Right fade gradient */}
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-10 bg-gradient-to-l from-(--color-term-bg) to-transparent" />

      <div
        ref={trackRef}
        className="flex h-full items-center gap-0 will-change-transform whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {displayed.map((item, i) => (
          <TickerItem
            key={`${item.symbol}-${i}`}
            item={item}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ item, onSelect }: { item: TickerItem; onSelect?: (s: string) => void }) {
  const isClickable = onSelect && !item.symbol.startsWith('^') && !item.symbol.includes('=F') && item.symbol !== 'USDTWD=X';
  const isIndex = item.symbol.startsWith('^');
  const isCrypto = item.symbol.endsWith('-USD');
  const isForex = item.symbol.includes('=');

  const badge = isIndex ? '▸' : isCrypto ? '₿' : isForex ? '◈' : '●';
  const badgeColor = isIndex
    ? 'text-sky-500'
    : isCrypto
    ? 'text-amber-400'
    : isForex
    ? 'text-violet-400'
    : 'text-emerald-500';

  return (
    <button
      type="button"
      onClick={() => isClickable && onSelect?.(item.symbol)}
      className={cn(
        'flex items-center gap-1.5 px-4 h-full text-[11px] border-r border-(--color-term-border)/40 transition-colors shrink-0',
        isClickable
          ? 'cursor-pointer hover:bg-white/5 hover:text-(--color-term-accent)'
          : 'cursor-default'
      )}
    >
      <span className={cn('text-[9px]', badgeColor)}>{badge}</span>
      <span className="font-bold tracking-wider text-(--color-term-text)">{item.label}</span>
      <span className="font-mono text-(--color-term-muted) tabular-nums">{item.value}</span>
      <span className={cn('font-mono font-bold tabular-nums', toneClass(item.changePct))}>
        {formatPct(item.changePct)}
      </span>
    </button>
  );
}
