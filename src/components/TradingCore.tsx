/**
 * TradingCore.tsx
 *
 * Fix: watchlist items now call onSymbolChange(symbol) to switch the viewed stock.
 * All indicator math inlined. ChartWidget lazy-loaded.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as api from '../services/api';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';
import { chatWithAI } from '../services/aiService';
import { safeCn, safeN, vibrate } from '../utils/helpers';
import { motion } from 'motion/react';
import { Watchlist } from './Watchlist';
import { PriceBar } from './PriceBar';
import { BacktestPanel } from './BacktestPanel';
import { ChartSection } from './ChartSection';
import { NewsSentimentBelowChart } from './NewsSentimentBelowChart';
import TradeLogger, { pushLog } from './TradeLogger';
import { RightPanel } from './RightPanel';
import { useQueryClient } from '@tanstack/react-query';
import { useWatchlist } from '../hooks/useQueryHooks';
import { useTradeExecution, useWatchlistManagement } from '../hooks/useTradingCore';
import { useSettings } from '../contexts/SettingsContext';
import { useStockAnalysis } from '../hooks/useStockAnalysis';
import { Order, WatchlistItem, Alert } from '../types';
import Decimal from 'decimal.js';

// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  model: string;
  symbol: string;
  onSymbolChange?: (sym: string) => void;
  onGoBacktest?:   (sym: string) => void;  // ← navigate to BacktestPage with this symbol
  isLandscape?: boolean;
  focusMode?: boolean; // 新增 focusMode prop
}

const EMPTY_WATCHLIST: WatchlistItem[] = [];

export default function TradingCore({ model, symbol, onSymbolChange, onGoBacktest, isLandscape, focusMode: propFocusMode }: Props) {
  const { settings, format } = useSettings();
  const compact = Boolean(settings.compactMode);
  const [tab, setTab] = useState<'news' | 'calendar' | 'mtf'>('news');
  
  // 原有的 local focusMode
  const [localFocusMode, setLocalFocusMode] = useState(false);
  
  // 決定最終是否處於焦點模式：優先採用 prop，其次為 local state
  const isFocusActive = propFocusMode !== undefined ? propFocusMode : localFocusMode;
  
  // 用於傳遞給 sub-components 的 setter，如果傳入 propFocusMode 則此 setter 僅影響內部
  const handleSetFocusMode = useCallback((v: boolean) => {
    setLocalFocusMode(v);
  }, []);

  const {
    quote,
    hist,
    news,
    cal,
    twse,
    sentiment,
    mtfData,
    mtfStatus,
    newsStatus,
    dataState,
    loadData,
    norm,
    indic,
    setTimeframe
  } = useStockAnalysis({
    symbol,
    model,
    systemInstruction: String(settings.systemInstruction || ''),
    activeTab: tab
  });

  const onTimeframeChange = useCallback((t: string) => {
    setTimeframe(t);
    loadData(t);
  }, [setTimeframe, loadData]);

  const [portfolio, setPortfolio] = useState<Order[]>(() => loadFromStorage(STORAGE_KEYS.PORTFOLIO, []));
  const { data: rawWatchlist = EMPTY_WATCHLIST } = useWatchlist();
  // Enrich watchlist items with live quote prices
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    const base = rawWatchlist as WatchlistItem[];
    setWatchlist(base); // show symbols immediately while quotes load
    if (!base.length) return;
    const symbols = base.map(w => w.symbol);
    api.getBatchQuotes(symbols).then(quotes => {
      const qMap = new Map<string, typeof quotes[number]>(
        (Array.isArray(quotes) ? quotes.filter(Boolean) : []).map(q => [q.symbol, q])
      );
      setWatchlist(base.map(w => {
        const q = qMap.get(w.symbol);
        if (!q) return w;
        return {
          ...w,
          price:     q.regularMarketPrice           ?? w.price,
          change:    q.regularMarketChange          ?? w.change,
          changePct: q.regularMarketChangePercent   ?? w.changePct,
          name:      q.shortName ?? q.longName      ?? w.name,
          shortName: q.shortName                    ?? w.shortName,
        };
      }));
    }).catch(() => { /* keep base items displayed */ });
  }, [rawWatchlist]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PORTFOLIO, portfolio);
  }, [portfolio]);

  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string, type: 'success' | 'error', ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const onSetAlert = useCallback((symbol: string, price: number) => {
    setAlerts(prev => [...prev, { id: Date.now(), symbol, target: price, condition: 'above' }]);
    showToast(`已設定 ${symbol} 警示: ${price}`, 'success');
  }, [showToast]);

  useEffect(() => {
    if (quote && quote.regularMarketPrice) {
      const currentPrice = quote.regularMarketPrice;
      const triggered = alerts.filter(alert => alert.symbol === symbol && currentPrice >= alert.target);
      if (triggered.length > 0) {
        triggered.forEach(alert => {
          showToast(`警示觸發: ${symbol} 價格已達 ${alert.target}`, 'success', 5000);
        });
        setAlerts(prev => prev.filter(a => !triggered.includes(a)));
      }
    }
  }, [quote, alerts, symbol, showToast]);

  const { executeOrder, orderStatus } = useTradeExecution(showToast, setPortfolio);
  const { addToWatchlist, wlSearch, setWlSearch, wlAdding, setWlAdding, searchResults, isSearching } = useWatchlistManagement(watchlist, showToast);

  const [mobilePanel, setMobilePanel] = useState<'list' | 'chart' | 'panel'>('chart');
  const [orderQty,  setOrderQty]  = useState(Number(settings.defaultOrderQty) || 100);
  const [oSide,     setOSide]     = useState<'buy'|'sell'>('buy');
  const [chat,      setChat]      = useState('');
  const [chatRep,   setChatRep]   = useState('');
  const [chatStatus, setChatStatus] = useState<'idle' | 'busy'>('idle');

  useEffect(() => { setMobilePanel('chart'); }, [symbol]);

  const technicalSummary = useMemo(() => {
    if (!indic) return null;
    return [
      { label: 'RSI (14)', value: indic.rsi?.toFixed(1) || '—', status: (indic.rsi??50) > 70 ? 'bearish' : (indic.rsi??50) < 30 ? 'bullish' : 'neutral' },
      { label: 'Trend 趨勢', value: indic.trend?.toUpperCase() || '—', status: indic.trend === 'bullish' ? 'bullish' : indic.trend === 'bearish' ? 'bearish' : 'neutral' },
      { label: 'MACD (12,26,9)', value: indic.macd?.MACD?.toFixed(2) || '—', status: (indic.macd?.MACD??0) > 0 ? 'bullish' : 'bearish' },
      { label: 'SIGNAL 訊號', value: indic.action || '—', status: indic.action?.includes('BUY') ? 'bullish' : indic.action?.includes('SELL') ? 'bearish' : 'neutral' },
    ];
  }, [indic]);

  const handleChat = useCallback(async () => {
    if(!chat.trim()||chatStatus === 'busy') return;
    setChatStatus('busy'); setChatRep('');
    try {
      pushLog('info', 'AGENT', `User prompt: "${chat}"`);
      const rep = await chatWithAI(chat, symbol, quote || {}, hist, model, String(settings.systemInstruction || ''));
      if (rep) {
        setChatRep(rep.message ?? '分析失敗');
        // Handle Generative UI Intents from Hermes Agent
        if (rep.ui_action && rep.ui_action.type) {
          try {
            const actionType = rep.ui_action.type;
            const payload = rep.ui_action.payload ?? {};
            
            if (actionType === 'CHANGE_SYMBOL' && payload.symbol) {
              const newSym = String(payload.symbol).toUpperCase();
              pushLog('success', 'AGENT', `Intent [CHANGE_SYMBOL] -> Switched to ${newSym}`);
              onSymbolChange?.(newSym);
              showToast(`Quantum Agent 已為您切換至標的: ${newSym}`, 'success');
            } else if (actionType === 'SET_ORDER') {
              if (payload.side && (typeof payload.side === 'string')) {
                 const sideStr = payload.side.toLowerCase();
                 if (sideStr === 'buy' || sideStr === 'sell') setOSide(sideStr as 'buy' | 'sell');
              }
              if (payload.qty && !isNaN(Number(payload.qty))) {
                 setOrderQty(Number(payload.qty));
              }
              pushLog('success', 'AGENT', `Intent [PREPARE_ORDER] -> UI updated to ${payload.side?.toUpperCase()} ${payload.qty} shares`);
              showToast(`Quantum Agent 參數佈署：${payload.side?.toUpperCase() || ''} ${payload.qty || ''} 股`.trim(), 'success');
            }
          } catch (actionErr) {
            pushLog('error', 'AGENT', `Failed to execute intent: ${actionErr instanceof Error ? actionErr.message : 'Unknown'}`);
            console.error('[TradingCore] Agent action execution failed:', actionErr);
          }
        }
      } else {
        setChatRep('目前無法取得分析結果，請稍後再試。');
      }
    } catch(e: unknown) {
      console.error('[TradingCore] AI chat error:', e);
      setChatRep('目前無法取得分析結果，請稍後再試。');
    } finally {
      setChatStatus('idle');
    }
  }, [chat, chatStatus, symbol, quote, hist, model, settings.systemInstruction, onSymbolChange, showToast]);

  const portfolioValue = useMemo(() => portfolio.reduce((acc: number, order: Order) => {
    const value = new Decimal(order.price ?? 0).times(order.qty ?? 0).toNumber();
    return acc + (order.side === 'sell' ? -value : value);
  }, 0), [portfolio]);

  const eDateFmt = cal.earningsDate ? new Date(cal.earningsDate[0]).toLocaleDateString() : null;
  const latestHist = hist[hist.length - 1];
  const price = quote?.regularMarketPrice || latestHist?.close;
  const change = quote?.regularMarketChange ?? (latestHist && hist.length > 1 ? latestHist.close - hist[hist.length - 2].close : null);
  const pct = quote?.regularMarketChangePercent ?? (change && hist.length > 1 ? (change / hist[hist.length - 2].close) * 100 : null);
  const isUp = change != null ? change >= 0 : true;
  const high = quote?.regularMarketDayHigh || latestHist?.high;
  const low = quote?.regularMarketDayLow || latestHist?.low;
  const vol = quote?.regularMarketVolume || latestHist?.volume;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={safeCn("h-full w-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden", isLandscape ? "p-0 gap-0" : compact ? "p-2 sm:p-4 gap-2 lg:gap-4" : "p-2 sm:p-4 gap-4 lg:gap-6")}
    >


      {/* ── LEFT: Watchlist + Portfolio Summary ── */}
      {!isFocusActive && !isLandscape && (
        <div className={safeCn("w-full lg:w-[320px] flex flex-col shrink-0 lg:overflow-y-auto custom-scrollbar lg:pr-2 lg:-mr-2", compact ? "gap-3" : "gap-5", mobilePanel !== 'list' && "hidden lg:flex")}>
          {/* Portfolio Summary Group */}
          <div className="flex flex-col gap-3">
             <div className="px-4">
                <span className="text-heading-xs text-zinc-500">{compact ? '概覽' : '資產概覽 ASSET OVERVIEW'}</span>
             </div>
             <div className={safeCn("glass-card border border-white/5 rounded-3xl shadow-2xl relative overflow-hidden group", compact ? "p-4" : "p-6")}>
                <div className="absolute inset-0 bg-indigo-500/[0.03] pointer-events-none group-hover:bg-indigo-500/[0.05] transition-colors" />
                <div className="relative z-10 flex flex-col">
                  <div className="label-meta font-black text-zinc-600 uppercase tracking-widest mb-2 text-data-xs">當前權益 EQUITY</div>
                  <div className={safeCn("font-black text-white tracking-tighter tabular-nums flex items-baseline gap-2", compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")} style={{ fontFamily: 'var(--font-data)' }}>
                    <span className="text-xs sm:text-sm opacity-30 font-medium">NT$</span>
                    {portfolio.length > 0 ? format.number(portfolioValue, 0) : '0'}
                  </div>
                  {portfolio.length > 0 && (
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-indigo-500 animate-pulse" />
                      <span className="text-data-xs font-black text-zinc-500 uppercase tracking-widest">{portfolio.length} 筆活動委託 ACTIVE ORDERS</span>
                    </div>
                  )}
                </div>
             </div>
          </div>
          
          {/* Watchlist Group */}
          <div className="flex-1 min-h-[300px] md:min-h-[400px] lg:min-h-0 flex flex-col gap-3">
             <div className="glass-card flex-1 rounded-3xl border border-white/5 overflow-hidden flex flex-col shadow-2xl relative">
               <div className="absolute inset-0 bg-white/[0.01] pointer-events-none" />
               <Watchlist
                 watchlist={watchlist}
                 norm={norm}
                 symbol={symbol}
                 onSymbolChange={onSymbolChange || (() => {})}
                 wlAdding={wlAdding}
                 setWlAdding={setWlAdding}
                 wlSearch={wlSearch}
                 setWlSearch={setWlSearch}
                 addToWatchlist={addToWatchlist}
                 searchResults={searchResults}
                 isSearching={isSearching}
                 onSwipeAction={(sym, side) => {
                    vibrate(30);
                    if (onSymbolChange) onSymbolChange(sym);
                    setOSide(side);
                    setMobilePanel('panel');
                 }}
               />
             </div>
          </div>
        </div>
      )}

      {/* ── CENTER: Chart ── */}
      <div className={safeCn("flex-1 flex flex-col min-w-0 min-h-[400px] lg:min-h-0 lg:overflow-y-auto custom-scrollbar", isLandscape ? "gap-0" : compact ? "gap-3" : "gap-5", (!isFocusActive && !isLandscape) && mobilePanel !== 'chart' && "hidden lg:flex")}>
        {/* Main Display Unit */}
        <div className={safeCn(
          "shrink-0 flex flex-col overflow-hidden relative", 
          isFocusActive ? "flex-1" : "h-[60vh] lg:h-[calc(100vh-8rem)] min-h-[400px]",
          (isLandscape || isFocusActive) ? "p-0 rounded-none border-none bg-[#050505]" : "glass-card border border-white/5 rounded-3xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)]"
        )}>
          {/* Internal Top Bar */}
          <div className="shrink-0 border-b border-white/5 bg-black/40 backdrop-blur-md relative z-40">
            <PriceBar
              symbol={symbol}
              twse={twse}
              loading={dataState.status === 'loading'}
              price={price}
              isUp={isUp}
              change={change}
              pct={pct}
              high={high}
              low={low}
              vol={vol}
              focusMode={isFocusActive || Boolean(isLandscape)}
              setFocusMode={handleSetFocusMode}
              onSetAlert={onSetAlert}
              loadData={loadData}
              isLandscape={true} // Force cleaner look inside the glass container
              recommendation={indic?.recommendation}
            />
          </div>

          {/* Core Chart Field */}
          <div className="flex-1 min-h-0 relative flex flex-col">
            <div className="absolute inset-0 z-0 bg-[#0a0a0c] pointer-events-none" />
            <ChartSection 
              symbol={symbol} 
              model={model} 
              focusMode={isFocusActive || Boolean(isLandscape)} 
              data={hist} 
              onTimeframeChange={onTimeframeChange}
            />
          </div>
        </div>
        
        {/* Sub-Data Grid */}
        {!isLandscape && (
          <div className={safeCn("flex flex-col gap-4 pb-32", isFocusActive && "px-4 animate-in fade-in slide-in-from-bottom-4 duration-700")}>
             
             {/* Mobile-Only Pro Metrics Grid */}
             {mobilePanel === 'chart' && (
               <div className="lg:hidden grid grid-cols-2 gap-2 px-1">
                 {technicalSummary?.map((s) => (
                   <div key={s.label} className="glass-card p-4 border border-white/5 bg-white/[0.02] rounded-2xl flex flex-col gap-1">
                     <span className="text-data-xs font-black text-zinc-600 uppercase tracking-widest">{s.label}</span>
                     <span className={safeCn(
                       "text-base font-black tabular-nums tracking-tighter",
                       s.status === 'bullish' ? 'text-emerald-400' : s.status === 'bearish' ? 'text-rose-400' : 'text-zinc-300'
                     )}>
                       {s.value}
                     </span>
                   </div>
                 ))}
               </div>
             )}

             <NewsSentimentBelowChart news={news} sentiment={sentiment} newsStatus={newsStatus} />
             
             {/* ── STAGE 5: Trade Logger Console ── */}
             <div className="h-40 shrink-0">
               <TradeLogger />
             </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Analysis Engine ── */}
      {!isFocusActive && !isLandscape && (
        <div className={safeCn("w-full lg:w-[340px] flex flex-col shrink-0 relative lg:overflow-y-auto custom-scrollbar lg:pl-1 lg:-ml-1", compact ? "gap-3" : "gap-5", mobilePanel !== 'panel' && "hidden lg:flex")}>
          <div className="glass-card rounded-3xl border border-white/5 overflow-hidden shadow-2xl relative">
            <div className="absolute inset-0 bg-amber-500/[0.02] pointer-events-none" />
            <BacktestPanel history={hist} />
          </div>
          
          <div className="flex-1 flex flex-col min-h-[300px] md:min-h-[500px] lg:min-h-0 relative">
             <RightPanel
               price={price}
               symbol={symbol}
               news={news}
               sentiment={sentiment}
               newsStatus={newsStatus}
               tab={tab}
               setTab={setTab}
               eDateFmt={eDateFmt}
               chat={chat}
               setChat={setChat}
               chatRep={chatRep}
               chatStatus={chatStatus}
               handleChat={handleChat}
               oSide={oSide}
               setOSide={setOSide}
               orderQty={orderQty}
               setOrderQty={setOrderQty}
               isUp={isUp}
               onGoBacktest={onGoBacktest}
               executeOrder={executeOrder}
               mtfData={mtfData}
               mtfStatus={mtfStatus}
               portfolio={portfolio}
               orderStatus={orderStatus}
             />
          </div>
        </div>
      )}

      {/* ── Mobile Panel Switcher (Bottom Bar) ── */}
      {!isFocusActive && (
        <div className="lg:hidden sticky bottom-0 left-0 right-0 z-50 flex flex-col gap-2 p-1.5 safe-area-bottom">
          {/* Quick Action Bar (Only shown on Chart tab) */}
          {mobilePanel === 'chart' && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex gap-2 p-1"
            >
              <button 
                onClick={() => { setOSide('sell'); setMobilePanel('panel'); vibrate(30); }}
                className="flex-1 py-3.5 sm:py-4 bg-rose-500 text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition"
              >
                快速賣出 SELL
              </button>
              <button 
                onClick={() => { setOSide('buy'); setMobilePanel('panel'); vibrate(30); }}
                className="flex-1 py-3.5 sm:py-4 bg-emerald-500 text-black font-black text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition"
              >
                快速買進 BUY
              </button>
            </motion.div>
          )}

          {/* Navigation Bar */}
          <div className="flex gap-1 bg-black/80 backdrop-blur-3xl border border-white/5 rounded-[2rem] p-1.5 shadow-2xl">
            {([
              { id: 'list'  as const, label: '自選 WATCH', icon: '📋' },
              { id: 'chart' as const, label: '圖表 CHART', icon: '📈' },
              { id: 'panel' as const, label: '面板 TRADE', icon: '⚡' },
            ]).map(p => (
              <button key={p.id} type="button" onClick={(e) => { setMobilePanel(p.id); vibrate(20); }}
                className={safeCn(
                  'flex-1 py-3 px-2 rounded-[1.5rem] text-[10px] font-black tracking-widest uppercase transition flex flex-col items-center gap-1',
                  mobilePanel === p.id
                    ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10'
                    : 'text-zinc-500 hover:text-white'
                )}
              >
                <span className="text-base">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

