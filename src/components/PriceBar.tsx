import React, { useState, useRef, useEffect } from 'react';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, X } from 'lucide-react';
import { safeCn, safeN, vibrate } from '../utils/helpers';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { TWSEData } from '../types';

interface PriceBarProps {
  symbol: string;
  twse: TWSEData | null;
  loading: boolean;
  price: number | null;
  isUp: boolean;
  change: number | null;
  pct: number | null;
  high: number | null;
  low: number | null;
  vol: number | null;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  onSetAlert: (symbol: string, price: number) => void;
  loadData: () => void;
  isLandscape?: boolean;
  recommendation?: string;
}

export const PriceBar: React.FC<PriceBarProps> = React.memo(({
  symbol, twse, loading, price, isUp, change, pct, high, low, vol, focusMode, setFocusMode, onSetAlert, loadData, isLandscape, recommendation
}) => {
  const { settings, format } = useSettings();
  const compact = settings.compactMode;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={safeCn(
          "shrink-0 flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl relative z-40 overflow-hidden",
          isLandscape ? "p-3 px-4 gap-3" : compact ? "p-2.5 px-4 gap-2" : "p-4 px-6 gap-3 sm:gap-6",
          !isLandscape && "rounded-t-3xl sm:rounded-3xl border border-white/5 shadow-2xl"
        )}
      >
        <div className={safeCn("flex flex-1 items-center justify-between sm:justify-start min-w-0", compact ? "gap-3" : "gap-4 sm:gap-6")}>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className={safeCn("font-black tracking-tighter text-white uppercase leading-none", compact ? "text-xl" : "text-2xl sm:text-3xl")} style={{ fontFamily: 'var(--font-heading)' }}>{symbol}</span>
              {twse && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase tracking-widest opacity-60">TWSE</span>}
            </div>
            <span className="text-[10px] font-medium text-zinc-500 truncate mt-1 uppercase tracking-wider">{twse?.Name || 'Market Asset'}</span>
          </div>

          <div className="w-px h-8 bg-white/10 hidden sm:block mx-1" />

          {loading ? (
            <div className="flex items-center gap-3">
              <div className={safeCn("bg-white/5 animate-pulse rounded-xl", compact ? "w-20 h-7" : "w-28 h-9")} />
              <Loader2 size={18} className="animate-spin text-indigo-400" />
            </div>
          ) : price != null && (
            <div className="flex flex-col items-end sm:items-start gap-1">
              <span className={safeCn('font-black tabular-nums tracking-tighter leading-none', compact ? 'text-2xl' : 'text-3xl sm:text-4xl', isUp ? 'text-rose-400' : 'text-emerald-400')} style={{ fontFamily: 'var(--font-data)' }}>
                {safeN(price)}
              </span>
              <div className={safeCn('font-black tabular-nums flex items-center gap-2 leading-none', compact ? 'text-[11px]' : 'text-[13px]', isUp ? 'text-rose-400' : 'text-emerald-400')} style={{ fontFamily: 'var(--font-data)' }}>
                <span className="opacity-80">{isUp ? '+' : ''}{safeN(change)}</span>
                <span className="opacity-40">({isUp ? '+' : ''}{safeN(pct)}%)</span>
                {isUp ? <TrendingUp size={12} strokeWidth={3} className="opacity-60" /> : <TrendingDown size={12} strokeWidth={3} className="opacity-60" />}
              </div>
            </div>
          )}
        </div>

        {/* Global Market Stats (Desktop only or shown selectively) */}
        {!isLandscape && (
          <div className="hidden lg:flex items-center font-mono gap-5 text-[11px] bg-black/40 p-2 px-4 rounded-2xl border border-white/5">
            {high != null && <div className="flex flex-col"><span className="opacity-30 font-black">HIGH</span><span className="text-rose-400 font-bold tabular-nums">{safeN(high)}</span></div>}
            {low != null && <div className="flex flex-col"><span className="opacity-30 font-black">LOW</span><span className="text-emerald-400 font-bold tabular-nums">{safeN(low)}</span></div>}
            {vol != null && !isNaN(Number(vol)) && (
              <div className="flex flex-col">
                <span className="opacity-30 font-black">VOL</span>
                <span className="text-white font-bold tabular-nums">{format.volume(Number(vol))}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Action buttons removed as requested */}
        </div>
      </motion.div>

      {/* Mobile-Only Key Metrics Bar (Horizontal Scroll) */}
      {!focusMode && !isLandscape && price != null && (
        <div className="lg:hidden flex items-center gap-6 px-4 py-3 bg-[#0a0a0c]/40 border-b border-white/5 overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex flex-col shrink-0">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-0.5">HIGH 日高</span>
            <span className="text-[12px] font-black text-rose-400 tabular-nums">{safeN(high)}</span>
          </div>
          <div className="flex flex-col shrink-0">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-0.5">LOW 日低</span>
            <span className="text-[12px] font-black text-emerald-400 tabular-nums">{safeN(low)}</span>
          </div>
          <div className="flex flex-col shrink-0">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-0.5">VOL. 成交量</span>
            <span className="text-[12px] font-black text-zinc-300 tabular-nums">{format.volume(Number(vol))}</span>
          </div>
          <div className="flex flex-col shrink-0">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-0.5">AVG. 平均</span>
            <span className="text-[12px] font-black text-zinc-400 tabular-nums">{safeN(((high??0)+(low??0))/2)}</span>
          </div>
          {recommendation && (
            <div className="flex flex-col shrink-0 pr-4">
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-0.5">AI SIGNAL 訊號</span>
              <span className={safeCn("text-[12px] font-black tracking-tighter uppercase", recommendation.includes('買進') ? "text-emerald-400" : recommendation.includes('賣出') ? "text-rose-400" : "text-zinc-400")}>
                {recommendation}
              </span>
            </div>
          )}
        </div>
      )}

    </>
  );
});
