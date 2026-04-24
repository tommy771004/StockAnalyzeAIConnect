import React from 'react';
import { Plus, X, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { safeCn, safeN } from '../utils/helpers';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { vibrate } from '../utils/helpers';
import { useSettings } from '../contexts/SettingsContext';
import { WatchlistItem, SearchResult } from '../types';

interface WatchlistProps {
  watchlist: WatchlistItem[];
  norm: string;
  symbol: string;
  onSymbolChange: (sym: string) => void;
  wlAdding: boolean;
  setWlAdding: React.Dispatch<React.SetStateAction<boolean>>;
  wlSearch: string;
  setWlSearch: React.Dispatch<React.SetStateAction<string>>;
  addToWatchlist: (sym: string) => void;
  searchResults?: SearchResult[];
  isSearching?: boolean;
  onSwipeAction?: (sym: string, side: 'buy'|'sell') => void;
}

const SwipeableWatchlistItem = React.memo(({ w, isActive, wUp, compact, onClick, onSwipeAction }: any) => {
  const controls = useAnimation();
  const [swipeSide, setSwipeSide] = React.useState<'buy' | 'sell' | null>(null);
  
  // Tick Flash Feedback
  const prevPriceRef = React.useRef(w.price);
  const [flashDir, setFlashDir] = React.useState<'up' | 'down' | null>(null);

  React.useEffect(() => {
    if (w.price !== undefined && prevPriceRef.current !== undefined && w.price !== prevPriceRef.current) {
      if (w.price > prevPriceRef.current) setFlashDir('up');
      else if (w.price < prevPriceRef.current) setFlashDir('down');
      
      const timer = setTimeout(() => setFlashDir(null), 300);
      prevPriceRef.current = w.price;
      return () => clearTimeout(timer);
    }
  }, [w.price]);

  const handleBuy = React.useCallback((e: React.MouseEvent) => { 
    e.stopPropagation(); 
    vibrate(30); 
    onSwipeAction?.(w.symbol, 'buy'); 
  }, [onSwipeAction, w.symbol]);

  const handleSell = React.useCallback((e: React.MouseEvent) => { 
    e.stopPropagation(); 
    vibrate(30); 
    onSwipeAction?.(w.symbol, 'sell'); 
  }, [onSwipeAction, w.symbol]);

  return (
    <div className="relative overflow-hidden rounded-2xl col-span-1 border border-transparent">
      <div className={safeCn("absolute inset-0 flex items-center px-4 transition duration-300 backdrop-blur-md", swipeSide === 'buy' ? 'bg-emerald-500/80 justify-start' : swipeSide === 'sell' ? 'bg-rose-500/80 justify-end' : 'bg-transparent')}>
        {swipeSide === 'buy' && <span className="font-black text-black text-[10px] tracking-[0.2em] uppercase">BUY EXEC</span>}
        {swipeSide === 'sell' && <span className="font-black text-white text-[10px] tracking-[0.2em] uppercase">SELL EXEC</span>}
      </div>
      <motion.div
        drag={onSwipeAction ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        animate={controls}
        onDrag={(e, i) => {
           if (i.offset.x > 40) setSwipeSide('buy');
           else if (i.offset.x < -40) setSwipeSide('sell');
           else setSwipeSide(null);
        }}
        onDragEnd={(e, i) => {
           if (i.offset.x > 80 && onSwipeAction) {
              vibrate(50);
              onSwipeAction(w.symbol, 'buy');
           } else if (i.offset.x < -80 && onSwipeAction) {
              vibrate(50);
              onSwipeAction(w.symbol, 'sell');
           }
           controls.start({ x: 0 });
           setSwipeSide(null);
        }}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        tabIndex={0}
        role="option"
        aria-selected={isActive}
        className={safeCn(
          'stock-card flex flex-col rounded-2xl cursor-pointer transition active:scale-[0.98] bg-[#0a0a0c]/40 z-10 relative overflow-hidden',
          compact ? 'p-2' : 'p-3',
          isActive
            ? 'bg-indigo-500/10 border-2 border-indigo-500/30 ring-4 ring-indigo-500/5'
            : 'border border-white/5 hover:border-white/10'
        )}>
        {/* Flash Background layer */}
        <div className={safeCn(
          "absolute inset-0 transition-opacity duration-300 pointer-events-none z-0",
          flashDir === 'up' ? "bg-emerald-500/10 opacity-100" : flashDir === 'down' ? "bg-rose-500/10 opacity-100" : "opacity-0"
        )} />
        
        <div className="flex justify-between items-start mb-1.5 relative z-10 min-w-0">
          <div className={safeCn('font-black tracking-tighter truncate pr-1', compact ? 'text-xs md:text-sm' : 'text-sm md:text-base', isActive ? 'text-indigo-300' : 'text-white')} style={{ fontFamily: 'var(--font-heading)' }}>
            {w.shortName ?? w.name ?? ''}
          </div>
          <div className="text-[9px] font-black tracking-widest text-zinc-600 uppercase shrink-0" style={{ fontFamily: 'var(--font-data)' }}>{w.symbol}</div>
        </div>
        
        <div className="flex items-end justify-between relative z-10 w-full">
          <div className="flex flex-col">
            <div className={safeCn(
              'font-black tabular-nums tracking-tighter transition-colors duration-150 leading-none mb-1', 
              compact ? 'text-lg md:text-xl' : 'text-xl md:text-2xl', 
              flashDir === 'up' ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : flashDir === 'down' ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.8)]' : isActive ? 'text-indigo-300' : 'text-white'
            )} style={{ fontFamily: 'var(--font-data)' }}>
              {w.price?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? '—'}
            </div>
            
            <div className={safeCn(
              'font-black tabular-nums flex items-center gap-1.5 leading-none text-data-xs', 
              wUp ? 'text-emerald-400' : 'text-rose-400'
            )} style={{ fontFamily: 'var(--font-data)' }}>
              <span className="opacity-40">{wUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}</span>
              {wUp ? '+' : ''}{(Number(w.changePct) || 0).toFixed(2)}%
            </div>
          </div>
          
          <div className="flex gap-1 ml-2 shrink-0">
            <button type="button" onClick={handleBuy} className="w-5 h-5 flex items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400 text-[9px] font-black hover:bg-emerald-500/20 transition-colors">B</button>
            <button type="button" onClick={handleSell} className="w-5 h-5 flex items-center justify-center rounded-md bg-rose-500/10 text-rose-400 text-[9px] font-black hover:bg-rose-500/20 transition-colors">S</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

export const Watchlist: React.FC<WatchlistProps> = React.memo(({
  watchlist, norm, symbol, onSymbolChange, wlAdding, setWlAdding, wlSearch, setWlSearch, addToWatchlist, searchResults = [], isSearching = false, onSwipeAction
}) => {
  const { settings, format } = useSettings();
  const compact = settings.compactMode;
  const [filter, setFilter] = React.useState<'all' | 'bullish' | 'bearish'>('all');

  const filteredWatchlist = React.useMemo(() => {
    return watchlist.filter(w => {
      const isUp = (Number(w.changePct) || 0) >= 0;
      if (filter === 'bullish') return isUp;
      if (filter === 'bearish') return !isUp;
      return true;
    });
  }, [watchlist, filter]);

  return (
    <div className={safeCn("flex-1 flex flex-col min-h-0 bg-transparent", compact ? "p-2" : "p-3")}>
      <div className="flex items-center justify-between shrink-0 mb-3 px-1">
        <div className="flex flex-col">
          <span className="text-heading-xs text-zinc-500" style={{ fontFamily: 'var(--font-heading)' }}>{compact ? '追蹤 WATCH' : '追蹤清單 WATCHLIST'}</span>
          <span className="text-data-xs font-bold text-zinc-700 tracking-widest uppercase">REAL-TIME MONITOR</span>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={filter} 
            onChange={e => { setFilter(e.target.value as 'all' | 'bullish' | 'bearish'); vibrate(15); }} 
            className="bg-black/40 text-[10px] font-black uppercase tracking-widest text-zinc-400 rounded-xl px-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 border border-white/5 cursor-pointer hover:text-white transition-colors"
          >
            <option value="all">ALL</option>
            <option value="bullish">BULL</option>
            <option value="bearish">BEAR</option>
          </select>
          <button type="button" onClick={(e) => { setWlAdding(v => !v); vibrate(20); }} 
            className={safeCn(
              "w-8 h-8 flex items-center justify-center rounded-xl transition border",
              wlAdding ? "bg-indigo-500 text-black border-indigo-400 rotate-45 shadow-lg" : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
            )}
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {wlAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mb-4 flex flex-col gap-2 shrink-0 relative z-50 overflow-hidden"
          >
            <div className="flex gap-2 p-1">
              <input
                value={wlSearch}
                onChange={e => setWlSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addToWatchlist(wlSearch.toUpperCase())}
                placeholder="搜尋代碼或名稱 SYMBOL..."
                autoFocus
                className="flex-1 bg-black/60 border border-white/5 rounded-2xl px-4 py-3 text-xs font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition shadow-inner"
              />
              <button type="button" onClick={(e) => { addToWatchlist(wlSearch.toUpperCase()); vibrate(20); }} 
                className="aspect-square flex items-center justify-center rounded-2xl bg-indigo-500 text-black hover:bg-indigo-400 transition shadow-lg active:scale-95 group shrink-0"
              >
                <Plus size={20} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            
            {/* Auto-complete Dropdown */}
            {wlSearch.length >= 2 && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full left-0 right-0 mt-2 glass-card border border-white/5 rounded-3xl shadow-2xl overflow-hidden z-[60] max-h-60 overflow-y-auto backdrop-blur-3xl"
              >
                {isSearching ? (
                  <div className="p-6 text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center justify-center gap-3">
                    <Loader2 size={16} className="animate-spin text-indigo-400" /> PROXY SEARCHING...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((res, i) => (
                    <button type="button" key={`${res.symbol}-${i}`} onClick={(e) => {
                        addToWatchlist(res.symbol);
                        setWlSearch('');
                        setWlAdding(false);
                        vibrate(20);
                      }}
                      className="w-full text-left px-5 py-3 hover:bg-indigo-500/[0.08] flex items-center justify-between border-b border-white/5 last:border-0 transition group"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors" style={{ fontFamily: 'var(--font-heading)' }}>{res.symbol}</span>
                        <span className="text-[10px] font-medium text-zinc-500 truncate group-hover:text-zinc-400">{res.shortname || res.longname}</span>
                      </div>
                      <span className="text-[9px] font-black px-2 py-1 rounded bg-white/5 text-zinc-500 uppercase tracking-widest">{res.exchDisp}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 opacity-40">NO RESULTS FOUND</div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={safeCn("flex-1 overflow-y-auto grid grid-cols-2 gap-2 min-h-0 content-start p-1 custom-scrollbar", compact ? "gap-1.5" : "gap-2")} role="listbox" aria-label="追蹤清單">
        <AnimatePresence mode="popLayout">
          {filteredWatchlist.length === 0
            ? <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col-span-2 flex flex-col items-center justify-center gap-4 py-20 opacity-30">
                <div className="w-16 h-16 rounded-[2rem] bg-zinc-800/20 flex items-center justify-center border-2 border-zinc-700/20">
                  <TrendingUp size={24} className="text-zinc-600"/>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase">{filter === 'all' ? 'EMPTY MONITOR' : `NO ${filter.toUpperCase()} TRENDS`}</p>
                  {filter === 'all' && <p className="text-[9px] font-bold text-zinc-700 tracking-wider">TAP + TO TRACK ASSETS</p>}
                </div>
              </motion.div>
            : filteredWatchlist.map((w, idx) => {
              const isActive = w.symbol === norm || w.symbol === symbol;
              const wUp = (Number(w.changePct) || 0) >= 0;
              return (
                <motion.div
                  key={`${w.symbol}-${idx}`}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <SwipeableWatchlistItem
                    w={w}
                    isActive={isActive}
                    wUp={wUp}
                    compact={compact}
                    onClick={() => onSymbolChange(w.symbol)}
                    onSwipeAction={onSwipeAction}
                  />
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>
    </div>
  );
});
