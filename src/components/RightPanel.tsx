import React from 'react';
import { Loader2, ArrowRight, Zap } from 'lucide-react';
import { safeCn, safeN } from '../utils/helpers';
import { vibrate } from '../utils/helpers';
import { motion, useAnimation, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { NewsItem, Order, SentimentData } from '../types';
import Decimal from 'decimal.js';

const SwipeToConfirm = ({ onConfirm, loading, side }: { onConfirm: () => void, loading: boolean, side: 'buy' | 'sell' }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  return (
    <div ref={containerRef} className={safeCn(
      "relative h-14 w-full rounded-2xl overflow-hidden border transition touch-none select-none",
      side === 'buy' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
    )}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={safeCn(
          "text-[10px] font-black uppercase tracking-[0.3em] opacity-40",
          side === 'buy' ? 'text-emerald-400' : 'text-rose-400'
        )} style={{ fontFamily: 'var(--font-heading)' }}>
          SLIDE TO {side === 'buy' ? 'BUY' : 'SELL'} &gt;&gt;
        </span>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
          <Loader2 className="animate-spin text-white" size={24} strokeWidth={3} />
        </div>
      )}

      <motion.div
        drag={loading ? false : "x"}
        dragConstraints={containerRef}
        dragElastic={0.05}
        animate={controls}
        onDragStart={() => vibrate(20)}
        onDragEnd={(e, i) => {
          if (!containerRef.current) return;
          const width = containerRef.current.offsetWidth;
          if (i.offset.x > width * 0.55) {
            vibrate([50, 50, 100]);
            onConfirm();
            controls.start({ x: width - 64 });
            setTimeout(() => { controls.start({ x: 0 }); }, 1500);
          } else {
            vibrate(30);
            controls.start({ x: 0 });
          }
        }}
        className={safeCn(
          "absolute top-1 bottom-1 left-1 w-14 rounded-xl shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing z-10 transition-shadow",
          side === 'buy' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20',
          loading && "opacity-50"
        )}
      >
        <ArrowRight size={20} className="text-black stroke-[3px]" />
      </motion.div>
    </div>
  );
}

interface RightPanelProps {
  price: number | null;
  symbol: string;
  news: NewsItem[];
  newsStatus: 'idle' | 'loading' | 'error';
  sentiment: SentimentData | null;
  tab: 'news' | 'calendar' | 'mtf';
  setTab: (tab: 'news' | 'calendar' | 'mtf') => void;
  eDateFmt: string | null;
  chat: string;
  setChat: (chat: string) => void;
  chatRep: string;
  chatStatus: 'idle' | 'busy';
  handleChat: () => void;
  oSide: 'buy' | 'sell';
  setOSide: (side: 'buy' | 'sell') => void;
  orderQty: number;
  setOrderQty: (qty: number) => void;
  isUp: boolean;
  onGoBacktest?: (sym: string) => void;
  executeOrder: (symbol: string, side: 'buy' | 'sell', qty: number, price: number) => void;
  mtfData: Record<string, string> | null;
  mtfStatus: 'idle' | 'loading' | 'error';
  portfolio: Order[];
  orderStatus?: 'idle' | 'busy';
}

const PortfolioSummary = React.memo(({ portfolio, compact, sentiment }: { portfolio: Order[], compact: boolean, sentiment: SentimentData | null }) => {
  const { format } = useSettings();

  const totalValue = React.useMemo(() => portfolio.reduce((acc, order) => {
    const price = Number(order?.price) || 0;
    const qty = Number(order?.qty) || 0;
    const value = isFinite(price) && isFinite(qty) ? new Decimal(price).times(qty).toNumber() : 0;
    return acc + (order?.side === 'sell' ? -value : value);
  }, 0), [portfolio]);

  return (
    <div className={safeCn("glass-card border border-white/5 rounded-3xl overflow-hidden relative group", compact ? "p-4" : "p-6")}>
      <div className="absolute inset-0 bg-indigo-500/[0.03] pointer-events-none group-hover:bg-indigo-500/[0.05] transition-colors" />
      <div className="flex justify-between items-start relative z-10">
        <div>
          <div className="text-heading-xs mb-1.5" style={{ color: 'var(--md-outline)' }}>{compact ? '資產' : '資產總值 PORTFOLIO VALUE'}</div>
          <div className={safeCn("font-black text-white tabular-nums tracking-tighter leading-none flex items-baseline gap-1.5", compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl")} style={{ fontFamily: 'var(--font-data)' }}>
            <span className="text-xs md:text-sm opacity-40 font-medium">NT$</span>
            {format.number(totalValue, 0)}
          </div>
        </div>
        {sentiment && (() => {
          const sStr = (typeof sentiment === 'object' ? sentiment.overall : String(sentiment)).toLowerCase();
          const isBull = sStr.includes('bullish') || sStr.includes('樂觀');
          const isBear = sStr.includes('bearish') || sStr.includes('悲觀');

          return (
            <div className={safeCn(
              "px-3 py-1.5 rounded-xl border flex flex-col items-end",
              isBull
                ? "bg-emerald-500/10 border-emerald-500/20"
                : isBear
                  ? "bg-rose-500/10 border-rose-500/20"
                  : "bg-zinc-500/10 border-zinc-500/20"
            )}>
              <div className="text-data-xs font-black tracking-widest opacity-40 uppercase leading-none mb-1">AI SENTIMENT</div>
              <div className={safeCn(
                "font-black leading-none uppercase tracking-tighter",
                compact ? "text-xs" : "text-sm",
                isBull ? "text-emerald-400" : isBear ? "text-rose-400" : "text-zinc-400"
              )} style={{ fontFamily: 'var(--font-heading)' }}>
                {typeof sentiment === 'object' ? sentiment.overall : sentiment}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
});

const InfoTabs = React.memo(({ news, newsStatus, tab, setTab, mtfData, mtfStatus, eDateFmt, compact }: any) => {
  return (
    <div className={safeCn("glass-card border border-white/5 rounded-3xl flex-1 flex flex-col min-h-0 relative", compact ? "p-0.5" : "p-1")}>
      <div className="flex p-1.5 gap-1 bg-black/40 rounded-[1.25rem] m-2 mb-1 border border-white/5 shadow-inner">
        {(['news', 'calendar', 'mtf'] as const).map(t => (
          <button type="button" key={t} onClick={(e) => { setTab(t); vibrate(15); }}
            role="tab"
            aria-selected={tab === t}
            className={safeCn(
              'flex-1 py-2 text-data-xs font-black uppercase tracking-[0.2em] transition rounded-xl',
              tab === t ? 'bg-indigo-500 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-200'
            )}
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t === 'news' ? 'NEWS' : t === 'calendar' ? 'CAL' : t === 'mtf' ? 'MTF' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar min-h-0">
        <AnimatePresence mode="wait">
          {tab === 'news' ? (
            <motion.div
              key="news"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-1.5"
            >
              {newsStatus === 'loading' ? (
                <div className="flex items-center justify-center py-10 text-zinc-500 gap-3">
                  <Loader2 size={18} className="animate-spin text-indigo-400" />
                  <span className="text-[10px] font-black tracking-widest uppercase opacity-40">SYNCING DATA</span>
                </div>
              ) : newsStatus === 'error' ? (
                <div className="text-rose-400 text-[10px] font-black tracking-widest uppercase text-center py-10 opacity-60">SYNC ERROR</div>
              ) : news.length > 0 ? news.map((n: NewsItem, i: number) => (
                <motion.a
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={n.id || i} href={n.link} target="_blank" rel="noopener noreferrer"
                  className="block p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition group overflow-hidden relative"
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-white/20 scale-y-0 group-hover:scale-y-100 transition-transform origin-center" />
                  <div className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2 tracking-tight group-hover:text-white transition-colors">{n.title}</div>
                </motion.a>
              )) : <div className="text-zinc-500 text-[10px] font-black tracking-widest uppercase text-center mt-10 opacity-40">NO DATA FOUND</div>}
            </motion.div>
          ) : tab === 'mtf' ? (
            <motion.div
              key="mtf"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-2"
            >
              {mtfStatus === 'loading' ? (
                <div className="flex items-center justify-center py-10 text-zinc-500 gap-3">
                  <Loader2 size={18} className="animate-spin text-indigo-400" />
                  <span className="text-[10px] font-black tracking-widest uppercase opacity-40">CALCULATING TRENDS</span>
                </div>
              ) : mtfStatus === 'error' ? (
                <div className="text-rose-400 text-[10px] font-black tracking-widest uppercase text-center py-10 opacity-60">QUANT ERROR</div>
              ) : mtfData ? Object.entries(mtfData).map(([tf, signal], idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={tf} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5"
                >
                  <span className="text-xs font-black text-zinc-400 tracking-widest uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{tf}</span>
                  <div className={safeCn(
                    'px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm',
                    signal === 'bullish' ? 'bg-emerald-500 text-black' :
                      signal === 'bearish' ? 'bg-rose-500 text-black' : 'bg-zinc-500/20 text-zinc-400'
                  )}>
                    {signal === 'bullish' ? 'BULL' : signal === 'bearish' ? 'BEAR' : 'NEUT'}
                  </div>
                </motion.div>
              )) : <div className="text-zinc-500 text-[10px] font-black tracking-widest uppercase text-center mt-10 opacity-40">NO QUANT DATA</div>}
            </motion.div>
          ) : (
            <motion.div
              key="cal"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              {eDateFmt ? (
                <div className="bg-amber-500/5 rounded-2xl p-4 border border-amber-500/10 group">
                  <div className="text-[10px] font-black tracking-widest text-amber-500/60 uppercase mb-3 leading-none">EARNINGS WINDOW</div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-zinc-500 tracking-tight">DATE SEQUENCE</span>
                    <span className="text-lg text-white font-black tracking-tighter tabular-nums" style={{ fontFamily: 'var(--font-data)' }}>{eDateFmt}</span>
                  </div>
                </div>
              ) : <div className="text-zinc-500 text-[10px] font-black tracking-widest uppercase text-center mt-10 opacity-40">NO EVENTS REGISTERED</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

const AIChat = React.memo(({ chat, setChat, chatRep, chatStatus, handleChat, compact }: any) => {
  return (
    <div className={safeCn("shrink-0 relative overflow-hidden", compact ? "mt-1 space-y-1" : "mt-2 space-y-2")}>
      <AnimatePresence>
        {(chatRep || chatStatus === 'busy') && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: 10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: 10 }}
            className="text-zinc-300 bg-indigo-500/[0.05] rounded-3xl p-4 border border-indigo-500/10 max-h-48 overflow-y-auto custom-scrollbar relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/20" />
            <div className={safeCn("font-medium relative z-10 leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
              {chatStatus === 'busy' ? (
                <span className="flex items-center gap-3 text-indigo-400 font-black tracking-widest uppercase italic text-[10px]">
                  <Loader2 size={16} className="animate-spin" /> PROXYING ANALYTICS...
                </span>
              ) : chatRep}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative group">
        <input
          value={chat}
          onChange={e => setChat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleChat()}
          placeholder="詢問策略分析 COMMAND..."
          className={safeCn(
            "w-full bg-black/40 border border-white/5 hover:border-indigo-500/30 rounded-2xl pl-5 pr-14 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition",
            compact ? "py-3 text-xs" : "py-4 text-sm"
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button type="button" onClick={(e) => { handleChat(); vibrate(20); }}
            disabled={chatStatus === 'busy'}
            className={safeCn(
              "rounded-xl bg-indigo-500 text-black flex items-center justify-center disabled:opacity-50 transition shadow-lg active:scale-90",
              compact ? "w-8 h-8" : "w-10 h-10",
              chatStatus === 'busy' ? "opacity-30" : "hover:bg-indigo-400"
            )}
            aria-label="EXECUTE COMMAND"
          >
            {chatStatus === 'busy' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={18} fill="currentColor" />}
          </button>
        </div>
      </div>
    </div>
  );
});

const OrderPanel = React.memo(({ price, symbol, oSide, setOSide, orderQty, setOrderQty, isUp, onGoBacktest, executeOrder, orderStatus, compact }: any) => {
  const { format } = useSettings();

  return (
    <div className={safeCn("glass-card border border-white/5 rounded-3xl overflow-hidden relative", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between mb-4 relative z-10">
        <span className="text-heading-xs text-zinc-500" style={{ fontFamily: 'var(--font-heading)' }}>{compact ? '下單' : '終端交易 TERMINAL'}</span>
        <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-white/5 overflow-hidden">
          {(['buy', 'sell'] as const).map(s => (
            <button type="button" key={s} onClick={(e) => { setOSide(s); vibrate(15); }}
              className={safeCn(
                'px-4 py-1.5 font-black rounded-lg transition text-[10px] uppercase tracking-widest active:scale-95',
                oSide === s
                  ? (s === 'buy' ? 'bg-emerald-500 text-black shadow-lg' : 'bg-rose-500 text-white shadow-lg')
                  : 'text-zinc-500 hover:text-zinc-200'
              )}
            >
              {s === 'buy' ? 'BUY' : 'SELL'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        <div className="flex justify-between items-baseline bg-white/5 p-2.5 rounded-xl border border-white/5">
          <span className="text-data-xs font-black text-zinc-500 uppercase tracking-widest">市場報價</span>
          <span className={safeCn('font-black tracking-tighter tabular-nums', compact ? 'text-base md:text-lg' : 'text-lg md:text-xl', isUp ? 'text-rose-400' : 'text-emerald-400')} style={{ fontFamily: 'var(--font-data)' }}>
            <span className="text-[9px] md:text-[10px] opacity-40 mr-1 font-medium italic">LAST</span>
            {safeN(price)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between px-1">
            <label className="text-data-xs font-black text-zinc-500 uppercase tracking-widest" htmlFor="order-qty-right">交易數量 QUANTITY</label>
            <span className="text-data-xs font-black text-indigo-400/60 uppercase tracking-widest">AUTO-STEP 100</span>
          </div>
          <div className="flex items-center h-14 bg-black/40 border border-white/5 rounded-2xl overflow-hidden group focus-within:border-indigo-500/40 transition focus-within:ring-4 focus-within:ring-indigo-500/5">
            <button type="button" onClick={(e) => { setOrderQty(Math.max(1, orderQty - 100)); vibrate(20); }}
              className="w-14 h-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-black text-xl active:scale-90 transition-transform">
              -
            </button>
            <input id="order-qty-right" type="number" value={orderQty} min={1} step={100}
              onChange={e => setOrderQty(Math.max(1, Number(e.target.value)))}
              className="flex-1 w-0 h-full bg-transparent text-center text-white font-black tabular-nums tracking-wider text-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
              style={{ fontFamily: 'var(--font-data)' }}
            />
            <button type="button" onClick={(e) => { setOrderQty(orderQty + 100); vibrate(20); }}
              className="w-14 h-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-black text-xl active:scale-90 transition-transform">
              +
            </button>
          </div>
        </div>

        <div className="flex justify-between items-baseline px-1 border-t border-white/5 pt-4">
          <span className="text-data-xs font-black text-zinc-500 uppercase tracking-widest">估算成交量 ESTIMATED</span>
          <span className="text-white font-black tracking-tighter tabular-nums flex items-baseline gap-1" style={{ fontFamily: 'var(--font-data)' }}>
            <span className="text-[10px] opacity-30 font-medium">NT$</span>
            {price && isFinite(Number(price)) && isFinite(orderQty) ? format.number(Number(price) * orderQty, 0) : '—'}
          </span>
        </div>

        <SwipeToConfirm
          onConfirm={() => price && executeOrder(symbol, oSide, orderQty, price)}
          loading={orderStatus === 'busy'}
          side={oSide}
        />

        {onGoBacktest && (
          <button type="button" onClick={(e) => { onGoBacktest(symbol); vibrate(20); }}
            className="w-full h-12 rounded-2xl font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 active:scale-95 group"
          >
            <span className="group-hover:rotate-12 transition-transform">📊</span> BACKTEST STRATEGY
          </button>
        )}
      </div>
    </div>
  );
});

export const RightPanel: React.FC<RightPanelProps> = React.memo(({
  price, symbol, news, sentiment, newsStatus, tab, setTab, eDateFmt, chat, setChat, chatRep, chatStatus, handleChat, oSide, setOSide, orderQty, setOrderQty, isUp, onGoBacktest, executeOrder, mtfData, mtfStatus, portfolio, orderStatus
}) => {
  const { settings, format } = useSettings();
  const compact = !!settings.compactMode;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={safeCn("w-full flex flex-col", compact ? "gap-1" : "gap-3")}
    >
      <PortfolioSummary portfolio={portfolio} compact={compact} sentiment={sentiment} />

      <InfoTabs
        news={news}
        newsStatus={newsStatus}
        tab={tab}
        setTab={setTab}
        mtfData={mtfData}
        mtfStatus={mtfStatus}
        eDateFmt={eDateFmt}
        compact={compact}
      />

      <AIChat
        chat={chat}
        setChat={setChat}
        chatRep={chatRep}
        chatStatus={chatStatus}
        handleChat={handleChat}
        compact={compact}
      />

      <OrderPanel
        price={price}
        symbol={symbol}
        oSide={oSide}
        setOSide={setOSide}
        orderQty={orderQty}
        setOrderQty={setOrderQty}
        isUp={isUp}
        onGoBacktest={onGoBacktest}
        executeOrder={executeOrder}
        orderStatus={orderStatus}
        compact={compact}
      />
    </motion.div>
  );
});