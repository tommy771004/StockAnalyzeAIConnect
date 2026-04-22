import React, { useState, useRef, useEffect } from 'react';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, X } from 'lucide-react';
import { safeCn, safeN } from '../utils/helpers';
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
}

export const PriceBar: React.FC<PriceBarProps> = React.memo(({
  symbol, twse, loading, price, isUp, change, pct, high, low, vol, focusMode, setFocusMode, onSetAlert, loadData, isLandscape
}) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertVal, setAlertVal] = useState('');
  const alertInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (alertOpen && alertInputRef.current) {
      alertInputRef.current.focus();
    }
  }, [alertOpen]);

  const handleAlertSubmit = () => {
    const target = parseFloat(alertVal);
    if (!isNaN(target) && target > 0) {
      onSetAlert(symbol, target);
      setAlertOpen(false);
      setAlertVal('');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={safeCn(isLandscape ? "flex flex-col sm:flex-row sm:items-center justify-between p-2 gap-2" : "liquid-glass rounded-2xl shrink-0 flex flex-col sm:flex-row sm:items-center justify-between bg-[var(--card-bg)] border border-[var(--border-color)]", !isLandscape && compact ? "p-2 gap-2" : !isLandscape ? "p-3 sm:p-4 gap-2 sm:gap-4" : "")}
      >
        <div className={safeCn("flex items-center flex-wrap", compact ? "gap-2" : "gap-2 sm:gap-4")}>
          <span className={safeCn("font-black text-[var(--text-color)]", compact ? "text-lg" : "text-xl sm:text-2xl")}>{symbol}</span>
          {twse && <span className={safeCn("px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", compact ? "label-meta" : "text-xs")}>TWSE</span>}
          {loading ? (
            <div className="flex items-center gap-2">
              <div className={safeCn("bg-[var(--border-color)] animate-pulse rounded", compact ? "w-16 h-6" : "w-24 h-8")} />
              <Loader2 size={compact ? 16 : 20} className="animate-spin text-[var(--text-color)] opacity-50" />
            </div>
          ) : price != null && (
            <div className="flex items-center gap-2">
              <span className={safeCn('data-num font-black', compact ? 'text-xl' : 'text-2xl sm:text-3xl', isUp ? 'text-emerald-400' : 'text-rose-400')}>{safeN(price)}</span>
              {isUp ? <TrendingUp size={compact ? 16 : 18} className="text-emerald-400" /> : <TrendingDown size={compact ? 16 : 18} className="text-rose-400" />}
            </div>
          )}
          {!loading && change != null && (
            <span className={safeCn('data-num font-bold', compact ? 'text-xs' : 'text-sm', isUp ? 'text-emerald-400' : 'text-rose-400')}>
              {isUp ? '+' : ''}{safeN(change)} ({isUp ? '+' : ''}{safeN(pct)}%)
            </span>
          )}
          {loading && (
            <div className={safeCn("bg-[var(--border-color)] animate-pulse rounded", compact ? "w-20 h-4" : "w-28 h-5")} />
          )}
        </div>
        <div className={safeCn("flex items-center text-[var(--text-color)] opacity-60 font-mono flex-wrap", compact ? "gap-2 label-meta" : "gap-2 sm:gap-3 text-xs sm:text-sm")}>
          {high != null && <span className="whitespace-nowrap">高 <span className="text-emerald-400">{safeN(high)}</span></span>}
          {low != null && <span className="whitespace-nowrap">低 <span className="text-rose-400">{safeN(low)}</span></span>}
          {vol != null && !isNaN(Number(vol)) && <span className="whitespace-nowrap">量 <span className="text-[var(--text-color)]">{Number(vol) >= 1e6 ? `${(Number(vol) / 1e6).toFixed(1)}M` : Number(vol).toLocaleString()}</span></span>}
          <button onClick={() => setFocusMode(!focusMode)} aria-label="專注模式" aria-pressed={focusMode} className={safeCn("rounded-xl transition-colors whitespace-nowrap", compact ? "p-1" : "p-1.5 sm:p-2", focusMode ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-[var(--bg-color)] text-[var(--text-color)] opacity-60 hover:opacity-100")}>
            ✨ 專注
          </button>
          <button onClick={() => { setAlertVal(String(price ?? '')); setAlertOpen(true); }} aria-label="設定價格警示" className={safeCn("rounded-xl hover:bg-[var(--bg-color)] text-[var(--text-color)] opacity-60 hover:opacity-100", compact ? "p-1" : "p-1.5 sm:p-2")}>
            🔔 警示
          </button>
          <button onClick={loadData} disabled={loading} aria-label="重新載入資料" className={safeCn("rounded-xl hover:bg-[var(--bg-color)] text-[var(--text-color)] opacity-60 hover:opacity-100", compact ? "p-1" : "p-1.5 sm:p-2")}>
            <RefreshCw size={compact ? 12 : 14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {/* Alert Modal (replaces browser prompt()) */}
      <AnimatePresence>
        {alertOpen && (
          <div className="alert-modal-backdrop" onClick={() => setAlertOpen(false)} role="dialog" aria-modal="true" aria-label="設定價格警示">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="alert-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--text-color)]">設定價格警示</h3>
                <button onClick={() => setAlertOpen(false)} className="p-1 rounded-lg hover:bg-[var(--border-color)] text-zinc-500" aria-label="關閉">
                  <X size={16} />
                </button>
              </div>
              <div className="text-xs text-zinc-500 mb-3">{symbol} · 當前價格: {safeN(price)}</div>
              <label htmlFor="alert-price-input" className="text-xs font-bold text-zinc-400 mb-1 block">目標價格</label>
              <input
                ref={alertInputRef}
                id="alert-price-input"
                type="number"
                value={alertVal}
                onChange={e => setAlertVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAlertSubmit()}
                placeholder="輸入目標價格"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-color)] font-mono focus:outline-none focus:border-emerald-500/50 mb-4"
                step="any"
              />
              <div className="flex gap-2">
                <button onClick={() => setAlertOpen(false)} className="flex-1 py-2 rounded-xl bg-[var(--border-color)] text-[var(--text-color)] opacity-70 text-sm font-bold hover:opacity-100 transition-colors">取消</button>
                <button onClick={handleAlertSubmit} className="flex-1 py-2 rounded-xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 transition-colors">確認設定</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
