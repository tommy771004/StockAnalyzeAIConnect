import React from 'react';
import { Loader2, ArrowRight, Zap } from 'lucide-react';
import { safeCn, safeN } from '../utils/helpers';
import { vibrate } from '../utils/helpers';
import { motion, useAnimation } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { NewsItem, Order, SentimentData } from '../types';
import Decimal from 'decimal.js';

const SwipeToConfirm = ({ onConfirm, loading, side }: { onConfirm: () => void, loading: boolean, side: 'buy'|'sell' }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  
  return (
    <div ref={containerRef} className={safeCn("relative h-12 w-full rounded-xl overflow-hidden border touch-none user-select-none", side === 'buy' ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-rose-950/30 border-rose-900/50')}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={safeCn("text-sm font-bold tracking-widest", side === 'buy' ? 'text-emerald-500/80' : 'text-rose-500/80')}>
           滑動以{side==='buy'?'買進':'賣出'} &gt;&gt;
        </span>
      </div>
      
      {loading && (
         <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <Loader2 className="animate-spin text-white" size={20} />
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
              // snap to end briefly, then reset handled by parent or keep there 
              controls.start({ x: width - 56 });
              setTimeout(() => { controls.start({ x: 0 }); }, 1500);
           } else {
              vibrate(30);
              controls.start({ x: 0 });
           }
        }}
        className={safeCn("absolute top-0 bottom-0 left-0 w-14 shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing z-10", side === 'buy' ? 'bg-emerald-500' : 'bg-rose-500', loading && "opacity-50")}
      >
        <ArrowRight size={20} className="text-black" />
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

export const RightPanel: React.FC<RightPanelProps> = React.memo(({
  price, symbol, news, sentiment, newsStatus, tab, setTab, eDateFmt, chat, setChat, chatRep, chatStatus, handleChat, oSide, setOSide, orderQty, setOrderQty, isUp, onGoBacktest, executeOrder, mtfData, mtfStatus, portfolio, orderStatus
}) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const totalValue = portfolio.reduce((acc, order) => {
    const price = Number(order?.price) || 0;
    const qty = Number(order?.qty) || 0;
    const value = isFinite(price) && isFinite(qty) ? new Decimal(price).times(qty).toNumber() : 0;
    return acc + (order?.side === 'sell' ? -value : value);
  }, 0);
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={safeCn("w-full flex flex-col", compact ? "gap-1" : "gap-3")}
    >
      {/* Portfolio Summary */}
      <div className={safeCn("bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl", compact ? "p-2" : "p-4")}>
        <div className="flex justify-between items-start">
          <div>
            <div className={safeCn("font-serif italic opacity-50 uppercase mb-0.5", compact ? "label-meta" : "text-xs")}>Portfolio Value</div>
            <div className={safeCn("font-mono font-bold text-[var(--text-color)] tracking-tight", compact ? "text-lg" : "text-2xl")}>NT$ {totalValue.toLocaleString()}</div>
          </div>
          {sentiment && (() => {
            const sStr = (typeof sentiment === 'object' ? sentiment.overall : String(sentiment)).toLowerCase();
            const isBull = sStr.includes('bullish') || sStr.includes('樂觀');
            const isBear = sStr.includes('bearish') || sStr.includes('悲觀');
            
            return (
              <div className={safeCn(
                "border rounded px-2 py-1",
                isBull 
                  ? "bg-emerald-500/5 border-emerald-500/10" 
                  : isBear
                    ? "bg-rose-500/5 border-rose-500/10"
                    : "bg-zinc-500/5 border-zinc-500/10"
              )}>
                <div className={safeCn("font-serif italic opacity-50 uppercase", compact ? "label-meta" : "text-xs")}>Sentiment</div>
                <div className={safeCn(
                  "font-mono font-bold leading-none", 
                  compact ? "text-sm" : "text-base",
                  isBull
                    ? "text-emerald-400"
                    : isBear
                      ? "text-rose-400"
                      : "text-zinc-400"
                )}>
                  {typeof sentiment === 'object' ? sentiment.overall : sentiment}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* News/Calendar/MTF */}
      <div className={safeCn("bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl flex-1 flex flex-col min-h-0", compact ? "p-2" : "p-4")}>
        <div className={safeCn("flex gap-4 mb-2 shrink-0", compact ? "text-xs" : "text-sm")} role="tablist" aria-label="資訊面板">
          {(['news', 'calendar', 'mtf'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} className={safeCn('font-serif italic uppercase transition-colors', tab === t ? 'text-[var(--text-color)]' : 'opacity-30 hover:opacity-60')}>
              {t === 'news' ? 'News' : t === 'calendar' ? 'Calendar' : 'MTF'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'news' ? (
            <div className="flex flex-col gap-1">
              {newsStatus === 'loading' ? (
                <div className="flex items-center justify-center py-8 text-zinc-500 gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs">載入新聞中...</span>
                </div>
              ) : newsStatus === 'error' ? (
                <div className="text-rose-400 text-xs text-center py-8">新聞載入失敗</div>
              ) : news.length > 0 ? news.map((n: NewsItem, i: number) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className={safeCn("block rounded-xl bg-[var(--bg-color)] hover:bg-[var(--border-color)] transition-colors", compact ? "p-1" : "p-2")}>
                  <div className={safeCn("font-bold text-[var(--text-color)] leading-tight line-clamp-2", compact ? "text-xs" : "text-sm")}>{n.title}</div>
                </a>
              )) : <div className="text-zinc-500 text-xs text-center mt-4">無新聞</div>}
            </div>
          ) : tab === 'mtf' ? (
            <div className="flex flex-col gap-1">
              {mtfStatus === 'loading' ? (
                <div className="flex items-center justify-center py-8 text-zinc-500 gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs">分析多時框中...</span>
                </div>
              ) : mtfStatus === 'error' ? (
                <div className="text-rose-400 text-xs text-center py-8">MTF 分析失敗</div>
              ) : mtfData ? Object.entries(mtfData).map(([tf, signal]) => (
                <div key={tf} className={safeCn("flex items-center justify-between rounded-xl bg-[var(--bg-color)]", compact ? "p-1" : "p-2")}>
                  <span className={safeCn("font-bold text-[var(--text-color)]", compact ? "text-xs" : "text-sm")}>{tf}</span>
                  <div className={safeCn('px-1.5 py-0.5 rounded font-bold', compact ? "text-xs" : "text-sm",
                    signal === 'bullish' ? 'bg-emerald-500/15 text-emerald-400' :
                      signal === 'bearish' ? 'bg-rose-500/15 text-rose-400' : 'bg-[var(--border-color)] text-zinc-500')}>
                    {signal === 'bullish' ? '偏多' : signal === 'bearish' ? '偏空' : '中性'}
                  </div>
                </div>
              )) : <div className="text-zinc-500 text-xs text-center mt-4">無資料</div>}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {eDateFmt ? (
                <div className="bg-[var(--bg-color)] rounded-xl p-2.5 border border-[var(--border-color)]">
                  <div className={safeCn("font-bold text-emerald-400 mb-0.5", compact ? "text-xs" : "text-sm")}>財報發布</div>
                  <div className={safeCn("flex justify-between", compact ? "text-xs" : "text-sm")}>
                    <span className="text-zinc-500">日期</span>
                    <span className="text-[var(--text-color)] font-mono">{eDateFmt}</span>
                  </div>
                </div>
              ) : <div className="text-zinc-500 text-xs text-center mt-4">無日曆事件</div>}
            </div>
          )}
        </div>
      </div>

      {/* AI chat */}
      <div className={safeCn("shrink-0", compact ? "mt-1 space-y-1" : "mt-2 space-y-1.5")}>
        {(chatRep || chatStatus === 'busy') && (
          <div className={safeCn("text-[var(--text-color)] bg-[var(--bg-color)] rounded-xl p-2 border border-[var(--border-color)] max-h-48 overflow-y-auto custom-scrollbar", compact ? "text-xs" : "text-sm")}>
            {chatStatus === 'busy' ? <span className="flex items-center gap-1"><Loader2 size={14} className="animate-spin" />思考中…</span> : chatRep}
          </div>
        )}
        <div className="relative">
          <input value={chat} onChange={e => setChat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChat()}
            placeholder="詢問 AI 策略…"
            className={safeCn("w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-full pl-3 pr-8 text-[var(--text-color)] focus:outline-none focus:border-emerald-500/40", compact ? "py-1.5 text-xs" : "py-2 text-sm")} />
          <button onClick={handleChat} disabled={chatStatus === 'busy'}
            className={safeCn("absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 flex items-center justify-center disabled:opacity-50 transition-transform", compact ? "w-7 h-7" : "w-8 h-8", chatStatus === 'busy' ? "scale-95" : "hover:scale-105")}
            aria-label="送出 AI 詢問">
            {chatStatus === 'busy' ? <Loader2 size={14} className="animate-spin text-black" /> : <ArrowRight size={14} className="text-black" />}
          </button>
        </div>
      </div>

      {/* Order panel */}
      <div className={safeCn("liquid-glass rounded-2xl shrink-0", compact ? "p-2" : "p-3")}>
        <div className="flex items-center justify-between mb-2">
          <span className={safeCn("font-bold text-zinc-500 uppercase tracking-wider", compact ? "label-meta" : "text-xs")}>下單面板</span>
          <div className="flex gap-0.5 bg-[var(--bg-color)] rounded-lg p-0.5">
            {(['buy', 'sell'] as const).map(s => (
              <button key={s} onClick={() => setOSide(s)}
                className={safeCn('px-2 py-0.5 font-bold rounded transition-colors', compact ? "text-xs" : "text-sm",
                  oSide === s ? (s === 'buy' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white') : 'text-zinc-500 hover:text-[var(--text-color)]')}>
                {s === 'buy' ? '買進' : '賣出'}
              </button>
            ))}
          </div>
        </div>
        <div className={safeCn("space-y-1.5", compact ? "text-xs" : "text-sm")}>
          <div className="flex justify-between">
            <span className="text-zinc-500">現價</span>
            <span className={safeCn('font-mono font-bold', isUp ? 'text-emerald-400' : 'text-rose-400')}>{safeN(price)}</span>
          </div>
          <label className="sr-only" htmlFor="order-qty-right">委託數量</label>
          <div className="flex items-center h-10 md:h-11 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl overflow-hidden">
            <button
              onClick={() => { setOrderQty(Math.max(1, orderQty - 100)); vibrate(20); }}
              className="w-12 md:w-14 h-full flex items-center justify-center bg-[var(--border-color)] hover:bg-white/10 text-[var(--text-color)] font-black text-lg active:scale-90 transition-transform">
              -
            </button>
            <input id="order-qty-right" type="number" value={orderQty} min={1} step={100}
              onChange={e => setOrderQty(Math.max(1, Number(e.target.value)))}
              className="flex-1 w-0 h-full bg-transparent text-center text-[var(--text-color)] font-mono font-bold focus:outline-none focus:bg-white/5" />
            <button
               onClick={() => { setOrderQty(orderQty + 100); vibrate(20); }}
              className="w-12 md:w-14 h-full flex items-center justify-center bg-[var(--border-color)] hover:bg-white/10 text-[var(--text-color)] font-black text-lg active:scale-90 transition-transform">
              +
            </button>
          </div>
          <div className="flex justify-between mt-2 mb-3">
            <span className="text-zinc-500">預估金額</span>
            <span className="text-[var(--text-color)] font-mono font-bold">{price && isFinite(Number(price)) && isFinite(orderQty) ? `$${(Number(price) * orderQty).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</span>
          </div>
          
          <SwipeToConfirm
            onConfirm={() => price && executeOrder(symbol, oSide, orderQty, price)}
            loading={orderStatus === 'busy'}
            side={oSide}
          />
          
          {onGoBacktest && (
            <button
              onClick={() => { onGoBacktest(symbol); vibrate(20); }}
              className={safeCn("w-full rounded-xl font-bold flex items-center justify-center gap-1 transition-colors bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 mt-1 active:scale-[0.98]", compact ? "py-2 text-xs" : "py-2.5 text-sm")}>
              📊 回測此標的
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
