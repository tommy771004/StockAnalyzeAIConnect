/**
 * App.tsx — central nav + prop wiring
 *
 * Fixes vs previous:
 * - Portfolio receives onGoBacktest and onGoJournal callbacks
 * - TradingCore receives onGoBacktest callback
 * - All keyboard shortcuts intact
 * - FIXED: Added missing searchOpen and searchQ state variables
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Zap, FlaskConical,Activity, Wallet, BookOpen,
  Terminal, Settings as SettingsIcon, Target,
  Menu, BarChart2, Cpu, ChevronDown, Search, Moon, Sun, User, TrainFront, WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { vibrate } from './utils/helpers';
import { MODELS } from './constants';
import { useDeviceType } from './hooks/useDeviceType';

import { ErrorBoundary } from './components/ErrorBoundary';
import MarketOverview from './components/MarketOverview';
import TradingCore    from './components/TradingCore';
import BacktestPage  from './components/BacktestPage';
import StrategyLab   from './components/StrategyLab';
import Portfolio     from './components/Portfolio';
import TradeJournal  from './components/TradeJournal';
import SystemLogs    from './components/SystemLogs';
import Settings      from './components/Settings';
import SentimentPage from './components/SentimentPage';
import StockScreener from './components/StockScreener';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './contexts/ToastContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { MarketDataProvider, useMarketData } from './contexts/MarketDataContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage       from './components/auth/AuthPage';
import PricingModal  from './components/PricingModal';
import { NotificationProvider } from './components/NotificationCenter';
import { NotificationBell }     from './components/NotificationCenter';
import NotificationCenter       from './components/NotificationCenter';

class AppErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean;error:unknown}> {
  constructor(props: {children:React.ReactNode}) { super(props); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(e: unknown) { return {hasError:true,error:e}; }
  render() {
    if (this.state.hasError) return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-rose-950 text-rose-200 p-8 select-none">
        <h1 className="text-3xl font-black mb-4">⚠️ 系統崩潰</h1>
        <div className="bg-black/50 p-6 rounded-xl border border-rose-500/30 max-w-3xl w-full overflow-auto max-h-64">
          <p className="text-sm font-mono text-rose-300 break-words">{String(this.state.error)}</p>
        </div>
        <button onClick={()=>window.location.reload()} className="mt-8 px-6 py-2.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-500">強制重新整理</button>
      </div>
    );
    return this.props.children;
  }
}

type Page   = 'market'|'trading'|'backtest'|'strategy'|'portfolio'|'journal'|'logs'|'settings'|'sentiment'|'screener';
type TopTab = 'markets'|'orders'|'analytics';

const NAV: {id:Page;icon:React.ElementType;label:string;topTab:TopTab;shortcut?:string}[] = [
  {id:'market',   icon:LayoutDashboard, label:'市場總覽',     topTab:'markets',   shortcut:'M'},
  {id:'trading',  icon:Zap,             label:'Trading Core', topTab:'markets',   shortcut:'T'},
  {id:'backtest', icon:BarChart2,       label:'回測引擎',     topTab:'analytics', shortcut:'B'},
  {id:'strategy',  icon:FlaskConical,    label:'策略實驗室',   topTab:'analytics'},
  {id:'sentiment', icon:Activity,        label:'市場情緒',     topTab:'analytics', shortcut:'S'},
  {id:'screener',  icon:Target,         label:'智慧選股',     topTab:'analytics', shortcut:'X'},
  {id:'portfolio',icon:Wallet,          label:'投資組合',     topTab:'orders',    shortcut:'P'},
  {id:'journal',  icon:BookOpen,        label:'交易日誌',     topTab:'orders',    shortcut:'J'},
  {id:'logs',     icon:Terminal,        label:'系統配置',     topTab:'orders'},
  {id:'settings', icon:SettingsIcon,    label:'設定',         topTab:'orders'},
];
const TOP_TABS:{id:TopTab;label:string}[] = [
  {id:'markets',  label:'Markets'},
  {id:'orders',   label:'Orders'},
  {id:'analytics',label:'Analytics'},
];

const QUICK_NAVS = NAV.filter(item => item.shortcut);
const MOBILE_NAVS = NAV.filter(item => ['market', 'trading', 'backtest', 'portfolio', 'sentiment'].includes(item.id));

function MainApp() {
  const { tickers, latency } = useMarketData();
  const { page, setPage, topTab, setTopTab } = useNavigation();
  const { settings, updateSetting } = useSettings();
  const set = (key: string, val: unknown) => updateSetting(key, val);
  const model = String(settings.defaultModel || MODELS[0].id);
  const setModel = (m: string) => set('defaultModel', m);
  const [modelOpen,  setModelOpen]  = useState(false);
  const [symbol,     setSymbol]     = useState('2330.TW');
  // 🌟 修正：將 sidebar 狀態初始化邏輯移出 useEffect，避免 set-state-in-effect
  const [sidebar, setSidebar] = useState(() => {
    if (typeof window !== 'undefined' && settings.sidebarDefaultState) {
      return settings.sidebarDefaultState !== 'collapsed';
    }
    return window.innerWidth >= 768;
  });
  const [notifOpen,  setNotifOpen]  = useState(false);
  
  // 🌟 修正：補上遺漏的搜尋框狀態變數
  const [searchOpen, setSearch]     = useState(false);
  const [searchQ,    setSearchQ]    = useState('');
  const { isMobile } = useDeviceType();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Landscape Chart Mode trigger
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      // Landscape mode is active if aspect ratio is wide and we are on a mobile-like device width
      // Alternatively, just trust window.orientation if it exists, or window.innerWidth > window.innerHeight
      if (isMobile || window.innerWidth < 1024) {
        setIsLandscape(window.innerWidth > window.innerHeight);
      } else {
        setIsLandscape(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
       setIsOffline(true);
       vibrate([100, 100, 100]); // Alert user to offline status
       if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
           new Notification('Quantum AI Alert', { body: '網路連線中斷。已切換至快取模式。', icon: '/favicon.svg' });
       }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Request notification permissions for "Live Activity" mocking
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebar) {
      document.body.classList.add('scroll-locked');
    } else {
      document.body.classList.remove('scroll-locked');
    }
    return () => { document.body.classList.remove('scroll-locked'); };
  }, [isMobile, sidebar]);

  useEffect(() => {
    if (settings.sidebarDefaultState) {
      const shouldBeOpen = settings.sidebarDefaultState !== 'collapsed';
      if (sidebar !== shouldBeOpen) {
        // 使用 setTimeout 將狀態更新排入下一個 tick，避免在渲染期間更新狀態
        setTimeout(() => setSidebar(shouldBeOpen), 0);
      }
    }
  }, [settings.sidebarDefaultState, sidebar]);

  useEffect(() => {
    document.documentElement.classList.remove('font-size-small', 'font-size-normal', 'font-size-large');
    document.documentElement.classList.add(`font-size-${settings.fontSize || 'normal'}`);
  }, [settings.fontSize]);

  useEffect(() => {
    if (settings.commuteMode) {
      document.body.classList.add('commute-mode');
    } else {
      document.body.classList.remove('commute-mode');
    }
  }, [settings.commuteMode]);

  useEffect(() => {
    const theme = settings.theme || 'dark';
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [settings.theme]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goTrading = useCallback((sym:string)=>{
    setSymbol(sym);
    setPage('trading');
    setTopTab('markets');
  },[setPage, setTopTab]);

  // ← KEY FIX: Portfolio and TradingCore can now trigger backtest navigation
  const goBacktest = useCallback((sym:string)=>{
    setSymbol(sym);
    setPage('backtest');
    setTopTab('analytics');
  },[setPage, setTopTab]);

  const goJournal = useCallback((sym?:string)=>{
    if(sym) setSymbol(sym);
    setPage('journal');
    setTopTab('orders');
  },[setPage, setTopTab]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      const tag=(e.target as HTMLElement)?.tagName?.toLowerCase();
      if(tag==='input'||tag==='textarea'||tag==='select') return;
      switch(e.key.toUpperCase()){
        case 'M': setPage('market');    setTopTab('markets');   break;
        case 'T': setPage('trading');   setTopTab('markets');   break;
        case 'B': setPage('backtest');  setTopTab('analytics'); break;
        case 'P': setPage('portfolio'); setTopTab('orders');    break;
        case 'J': setPage('journal');   setTopTab('orders');    break;
        case 'S': setPage('sentiment'); setTopTab('analytics'); break;
        case 'X': setPage('screener'); setTopTab('analytics');  break;
        case 'R': window.location.reload();                     break;
        case 'K': if(e.ctrlKey||e.metaKey){ e.preventDefault(); setSearch(v=>!v); } break;
        case 'ESCAPE': setModelOpen(false); setSearch(false); setSearchQ(''); break;
      }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[setPage, setTopTab]);

  const handleTopTab=(tab:TopTab)=>{setTopTab(tab);const f=NAV.find(n=>n.topTab===tab);if(f)setPage(f.id); if(isMobile) setSidebar(false);};
  const handleNav=(item:typeof NAV[0])=>{setPage(item.id);setTopTab(item.topTab); if(isMobile) setSidebar(false);};
  const visibleNav=NAV.filter(n=>n.topTab===topTab);
  const activeLabel=NAV.find(n=>n.id===page)?.label??'';

  return (
    <div className={cn("h-screen w-screen flex flex-col bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden select-none relative font-sans")}>
      {isOffline && (
         <div className="w-full bg-amber-500/20 text-amber-400 text-xs font-bold py-1.5 px-4 flex items-center justify-center gap-2 border-b border-amber-500/30 shrink-0 z-[100]">
            <WifiOff size={14} /> 網路連線已中斷，目前處於離線閱讀模式。AI 分析與圖表將顯示最後一次抓取的快取資料。
         </div>
      )}
      


      {/* ── Top Nav ── */}
      {!isLandscape && (
        <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-white/[0.08] shrink-0 z-50 sticky top-0 liquid-glass-strong safe-area-top" role="banner">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSidebar(v=>!v)} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 transition-colors" aria-label={sidebar ? '收合側邊欄' : '展開側邊欄'} aria-expanded={sidebar}>
              <Menu size={18}/>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center">
                <Zap size={18} className="text-black fill-current" />
              </div>
              <span className="text-lg font-black tracking-tighter text-white hidden sm:block">QUANTUM<span className="text-emerald-400">AI</span></span>
            </div>
          </div>

        <nav className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {TOP_TABS.map(t=>(
            <button key={t.id} onClick={()=>handleTopTab(t.id)}
              className={cn('px-5 py-1.5 rounded-full text-xs font-bold transition-all tracking-wide',
                topTab===t.id?'text-white bg-white/10 shadow-inner':'text-slate-500 hover:text-slate-300 hover:bg-white/5')}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 liquid-glass rounded-xl border border-white/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live Market</span>
          </div>

          <div className="relative hidden sm:block">
            <button onClick={()=>setModelOpen(v=>!v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 hover:bg-white/10 transition-all">
              <Cpu size={12} className="text-indigo-400"/>
              <span className="max-w-[100px] truncate uppercase tracking-wider">{String(MODELS.find(m=>m.id===model)?.label??model)}</span>
              <ChevronDown size={10} className="text-slate-500"/>
            </button>
            {modelOpen&&(
              <div className="absolute right-0 top-full mt-2 w-56 liquid-glass-strong border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                {MODELS.map(m=>(
                  <button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false);}}
                    className={cn('w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 flex items-center justify-between transition-colors',
                      model===m.id?'text-emerald-400 bg-emerald-500/5':'text-slate-400')}>
                    {m.label}{model===m.id&&<span className="label-meta bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-400">ACTIVE</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={()=>{
              updateSetting('commuteMode', !settings.commuteMode);
              vibrate(50);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-white transition-all group"
            title="通勤模式 (高對比)">
              <TrainFront size={14} className={cn("transition-transform", settings.commuteMode ? "text-emerald-400" : "group-hover:scale-110")} />
              <span className="hidden lg:inline uppercase tracking-wider">{settings.commuteMode ? '通勤ON' : '通勤'}</span>
          </button>

          <button
            onClick={()=>setSearch(v=>!v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-white transition-all group">
            <Search size={14} className="group-hover:scale-110 transition-transform" />
            <span className="hidden lg:inline uppercase tracking-wider">搜尋</span>
            <kbd className="hidden md:inline label-meta bg-white/10 border border-white/10 rounded px-1.5 font-mono text-slate-500">⌘K</kbd>
          </button>

          <div className="flex items-center gap-1">
            <button onClick={()=>set('theme', settings.theme === 'light' ? 'dark' : 'light')} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 transition-colors" aria-label={`切換至${(settings.theme || 'dark') === 'light' ? '深色' : '淺色'}模式`}>
              {(settings.theme || 'dark') === 'light' ? <Moon size={18}/> : <Sun size={18}/>}
            </button>
            <NotificationBell onClick={() => setNotifOpen(v => !v)} />
          </div>

          <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <User size={16} className="text-zinc-400" />
          </div>
        </div>
      </header>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {sidebar && !isLandscape && (
          <div 
            className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setSidebar(false)}
          />
        )}

        {!isLandscape && (
          <aside
            role="navigation"
            aria-label="主導覽"
            className={cn(
            'flex flex-col border-r border-white/[0.08] transition-all duration-500 shrink-0 z-50 liquid-glass-strong min-h-0',
            'fixed md:relative h-screen md:h-full',
            sidebar ? 'w-64 translate-x-0' : 'w-16 -translate-x-full md:translate-x-0'
          )}>
            {sidebar&&(
              <div className="px-4 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-500 flex items-center justify-center text-xs font-black text-zinc-950 shrink-0">A</div>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white truncate">Alpha Trader</div>
                    <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5 tracking-widest uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"/>
                      AI CONNECTED
                    </div>
                  </div>
                </div>
              </div>
            )}
            <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto custom-scrollbar">
              {/* On mobile, show all navigation items if topTab isn't easily accessible */}
              {(isMobile ? NAV : visibleNav).map(item=>{
                const Icon=item.icon, active=page===item.id;
                return (
                  <button key={item.id} onClick={() => handleNav(item)} title={!sidebar?item.label:undefined}
                    className={cn('w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-bold transition-all group',
                      active 
                        ? 'bg-emerald-500 text-black' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-slate-200')}>
                    <Icon size={18} className={cn("shrink-0 transition-transform group-hover:scale-110", active ? 'text-black' : '')}/>
                    {(sidebar || isMobile) && <span className="flex-1 truncate text-left tracking-tight">{item.label}</span>}
                    {sidebar&&item.shortcut&&<kbd className={cn("hidden lg:inline text-[10px] border rounded px-1.5 font-mono shrink-0 transition-colors", active ? "bg-black/10 border-black/20 text-black/60" : "bg-white/5 border-white/10 text-slate-600")}>{item.shortcut}</kbd>}
                  </button>
                );
              })}
            </nav>
            {sidebar&&<div className="border-t border-white/[0.08] px-4 py-3"><div className="text-[10px] font-bold text-slate-700 tracking-widest uppercase">v4.1.0 · QUANTUM CORE</div></div>}
          </aside>
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative" role="main" aria-label="主要內容">
          {/* Breadcrumbs / Sub-header */}
          {!isLandscape && (
            <div className="h-10 flex items-center justify-between px-4 md:px-6 border-b border-white/[0.04] shrink-0 bg-[#0B0E14]/40 backdrop-blur-md z-20" aria-label="導覽路徑" role="navigation">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                <span className="text-slate-600">{TOP_TABS.find(t=>t.id===topTab)?.label}</span>
                <span className="text-slate-800">/</span>
                <span className="text-slate-300">{activeLabel}</span>
                {page==='trading'&& (
                  <>
                    <span className="text-slate-800">/</span>
                    <span className="text-emerald-400 font-mono tracking-normal">{symbol}</span>
                  </>
                )}
              </div>
              {/* Mobile ticker strip — desktop has footer ticker */}
              <div className="md:hidden flex items-center gap-3 overflow-x-auto mobile-hide-scrollbar">
                {tickers.slice(0,4).map(t=>{
                  const up=t.pct>=0;
                  return (
                    <button key={t.symbol} onClick={()=>goTrading(t.symbol)}
                      className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
                      <span className="text-slate-500">{t.symbol.replace('-USD','').replace('^','')}</span>
                      <span className={cn('font-black',up?'text-emerald-400':'text-rose-400')}>{up?'+':''}{(t.pct||0).toFixed(1)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={cn("flex-1 min-h-0 overflow-auto custom-scrollbar relative", isLandscape ? "p-0 bg-black" : "p-2 sm:p-4 md:p-6 lg:p-8")}>
            <div className="w-full h-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.99 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full"
                >
                  {page==='market'    && <ErrorBoundary name="市場總覽"><MarketOverview onSelectSymbol={goTrading}/></ErrorBoundary>}
                  {page==='trading'   && <ErrorBoundary name="Trading Core"><TradingCore model={model} symbol={symbol} onSymbolChange={setSymbol} onGoBacktest={goBacktest}/></ErrorBoundary>}
                  {page==='backtest'  && <ErrorBoundary name="回測引擎"><BacktestPage initialSymbol={symbol}/></ErrorBoundary>}
                  {page==='strategy'  && <ErrorBoundary name="策略實驗室"><StrategyLab /></ErrorBoundary>}
                  {page==='sentiment' && <ErrorBoundary name="市場情緒"><SentimentPage model={model} symbol={symbol}/></ErrorBoundary>}
                  {page==='screener'  && <ErrorBoundary name="智慧選股"><StockScreener onSelectSymbol={goTrading}/></ErrorBoundary>}
                  {page==='portfolio' && <ErrorBoundary name="投資組合"><Portfolio onGoBacktest={goBacktest} onGoJournal={goJournal}/></ErrorBoundary>}
                  {page==='journal'   && <ErrorBoundary name="交易日誌"><TradeJournal /></ErrorBoundary>}
                  {page==='logs'      && <ErrorBoundary name="系統配置"><SystemLogs /></ErrorBoundary>}
                  {page==='settings'  && <ErrorBoundary name="設定"><Settings /></ErrorBoundary>}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      {!isLandscape && (
        <nav className="md:hidden h-16 flex items-center justify-around border-t border-white/[0.1] px-1 shrink-0 z-50 liquid-glass-strong rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] safe-area-bottom" role="navigation" aria-label="行動導覽">
          {MOBILE_NAVS.map(item => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => {setPage(item.id as Page); setTopTab(item.topTab);}}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn('flex flex-col items-center justify-center min-w-[52px] min-h-[48px] px-2 py-1.5 rounded-2xl transition-all press-feedback',
                  active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500')}>
                <Icon size={active ? 24 : 22} className="transition-all" />
                {active && <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1"/>}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Global Search (Ctrl/Cmd + K) ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 md:pt-24 safe-area-top"
          style={{background:'rgba(0,0,0,0.65)'}}
          onClick={()=>{setSearch(false);setSearchQ('');}}
          role="dialog"
          aria-modal="true"
          aria-label="搜尋股票"
        >
          <div
            className="w-[calc(100vw-1.5rem)] sm:w-full max-w-lg liquid-glass-strong rounded-2xl border border-white/15 shadow-2xl overflow-hidden"
            onClick={e=>e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
              <Search size={16} className="text-slate-500" />
              <input
                autoFocus
                value={searchQ}
                onChange={e=>setSearchQ(e.target.value.toUpperCase())}
                onKeyDown={e=>{
                  if(e.key==='Enter'&&searchQ.trim()){
                    goTrading(searchQ.trim());
                    setSearch(false); setSearchQ('');
                  }
                  if(e.key==='Escape'){setSearch(false);setSearchQ('');}
                }}
                placeholder="搜尋股票代碼… (AAPL, 2330.TW, BTC-USD)"
                className="flex-1 bg-transparent text-white font-bold text-sm placeholder:text-slate-600 placeholder:font-normal focus:outline-none uppercase"
              />
              <kbd className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-slate-500 font-mono">Esc</kbd>
            </div>
            {/* Quick nav shortcuts */}
            <div className="px-4 py-2">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">快速導覽</div>
              <div className="space-y-0.5">
                {QUICK_NAVS.map(item => (
                  <button key={item.shortcut}
                    onClick={()=>{handleNav(item);setSearch(false);setSearchQ('');}}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors group">
                    <kbd className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 text-slate-600 font-mono">{item.shortcut}</kbd>
                    <span className="text-sm text-slate-400 group-hover:text-white transition-colors">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {searchQ && (
              <div className="border-t border-white/5 px-4 py-2">
                <button
                  onClick={()=>{goTrading(searchQ.trim());setSearch(false);setSearchQ('');}}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Zap size={13} className="text-emerald-400"/>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-white">查看 {searchQ}</div>
                    <div className="text-xs text-slate-500">開啟 TradingCore 分析此代碼</div>
                  </div>
                  <kbd className="ml-auto text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-slate-500 font-mono">Enter</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Notification Center ── */}
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* ── Footer (Desktop Only) ── */}
      <footer className="hidden md:flex h-8 items-center justify-between px-6 border-t border-white/[0.06] bg-black/60 backdrop-blur-xl shrink-0 z-40" role="contentinfo">
        <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">LATENCY</span>
            <span className="text-emerald-400 font-mono">{latency}MS</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            SYSTEM ONLINE
          </div>
        </div>
        <div className="flex items-center gap-6">
          {tickers.map(t=>{
            const up=t.pct>=0;
            return (
              <button key={t.symbol} onClick={()=>goTrading(t.symbol)}
                className="flex items-center gap-2 text-[10px] font-mono hover:text-white transition-colors group">
                <span className="text-slate-500 group-hover:text-slate-300 transition-colors">{t.symbol.replace('-USD','').replace('^','')}</span>
                <span className={cn('font-black',up?'text-emerald-400':'text-rose-400')}>{up?'+':''}{(t.pct||0).toFixed(1)}%</span>
              </button>
            );
          })}
        </div>
        <div className="text-[10px] font-bold text-slate-700 tracking-[0.2em] uppercase">© 2026 QUANTUM AI</div>
      </footer>
    </div>
  );
}

const queryClient = new QueryClient();

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="w-screen h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
      載入中...
    </div>
  );
  if (!user) return <AuthPage />;
  return (
    <SettingsProvider>
      <MarketDataProvider>
        <MainApp/>
        <PricingModal />
      </MarketDataProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SubscriptionProvider>
            <ToastProvider>
              <NotificationProvider>
                <NavigationProvider>
                  <AuthGate />
                </NavigationProvider>
              </NotificationProvider>
            </ToastProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}