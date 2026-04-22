/**
 * App.tsx — central nav + prop wiring
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
import { MODELS, FREE_MODEL } from './constants';
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
import { SubscriptionProvider, useSubscription, SubscriptionTier } from './contexts/SubscriptionContext';
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

/**
 * AuthGate — blocks data-fetching providers from mounting until auth is confirmed.
 * Shows a loading spinner while validating a stored token, or AuthPage when logged out.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--md-background, #0B0E14)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--md-primary, #34d399)', borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--md-on-surface-variant, #8B8FA8)' }}>驗證中…</span>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <>{children}</>;
}

function MainApp() {
  const { tickers, latency } = useMarketData();
  const { page, setPage, topTab, setTopTab } = useNavigation();
  const { settings, updateSetting } = useSettings();
  const { user, logout } = useAuth();
  const { tier } = useSubscription();
  const isFree = tier === SubscriptionTier.FREE;
  const set = (key: string, val: unknown) => updateSetting(key, val);
  const model = isFree ? FREE_MODEL : String(settings.defaultModel || MODELS[0].id);
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
  const [notifOpen,   setNotifOpen]  = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  
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
    <div className={cn("h-screen w-screen flex flex-col overflow-hidden select-none relative font-sans")}
         style={{ background: 'var(--md-background)', color: 'var(--md-on-background)' }}>
      {/* Ambient glow effects */}
      <div className="ambient-glow-primary" aria-hidden="true" />
      <div className="ambient-glow-secondary" aria-hidden="true" />

      {isOffline && (
         <div className="w-full text-xs font-bold py-1.5 px-4 flex items-center justify-center gap-2 border-b shrink-0 z-[100]"
              style={{ background: 'rgba(217,119,33,0.15)', color: '#ffb783', borderColor: 'rgba(217,119,33,0.3)' }}>
            <WifiOff size={14} /> 網路連線已中斷，目前處於離線閱讀模式。AI 分析與圖表將顯示最後一次抓取的快取資料。
         </div>
      )}
      

      {/* ── Top Nav ── */}
      {!isLandscape && (
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b shrink-0 z-50 sticky top-0 safe-area-top"
                style={{ background: 'rgba(7,13,31,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderColor: 'var(--md-outline-variant)' }}
                role="banner">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSidebar(v=>!v)}
                    className="p-2 rounded-xl transition-colors"
                    style={{ color: 'var(--md-outline)' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,193,255,0.08)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    aria-label={sidebar ? '收合側邊欄' : '展開側邊欄'} aria-expanded={sidebar}>
              <Menu size={18}/>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                   style={{ background: 'var(--md-primary-container)' }}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: 'var(--md-on-primary-container)', fontVariationSettings: "'FILL' 1" }}>terminal</span>
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-base font-black tracking-tighter" style={{ fontFamily: 'var(--font-heading)', color: 'var(--md-primary)' }}>QUANTUM</span>
                <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--md-outline)' }}>COMMAND</span>
              </div>
            </div>
            {/* Desktop search bar */}
            <div className="relative ml-4 hidden md:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--md-outline)' }} />
              <input
                onFocus={()=>setSearch(true)}
                readOnly
                placeholder="搜尋代碼、公司或指令 (⌘K)"
                className="pl-9 pr-4 py-2 rounded-full text-sm w-64 cursor-pointer"
                style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', outline: 'none' }}
              />
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {TOP_TABS.map(t=>(
              <button key={t.id} onClick={()=>handleTopTab(t.id)}
                className="px-5 py-1.5 rounded-full text-xs font-bold transition-all tracking-wide"
                style={topTab===t.id
                  ? { color: 'var(--md-on-surface)', background: 'rgba(192,193,255,0.12)', boxShadow: 'inset 0 0 0 1px rgba(192,193,255,0.15)' }
                  : { color: 'var(--md-outline)' }}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Live indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl"
                 style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#52c41a' }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#52c41a' }}>Live</span>
            </div>

            {/* AI Model selector */}
            <div className="relative hidden sm:block">
              {isFree ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                  <Cpu size={12} style={{ color: 'var(--md-outline)' }}/>
                  <span className="uppercase tracking-wider">免費模型</span>
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(255,183,131,0.15)', color: 'var(--md-tertiary)', border: '1px solid rgba(255,183,131,0.3)' }}>FREE</span>
                </div>
              ) : (
                <>
                  <button onClick={()=>setModelOpen(v=>!v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                    style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
                    <Cpu size={12} style={{ color: 'var(--md-primary)' }}/>
                    <span className="max-w-[100px] truncate uppercase tracking-wider">{String(MODELS.find(m=>m.id===model)?.label??model)}</span>
                    <ChevronDown size={10} style={{ color: 'var(--md-outline)' }}/>
                  </button>
                  {modelOpen&&(
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-2xl z-50 overflow-hidden py-1"
                         style={{ background: 'var(--md-surface-container-lowest)', border: '1px solid var(--md-outline-variant)' }}>
                      {MODELS.map(m=>(
                        <button key={m.id} onClick={()=>{setModel(m.id);setModelOpen(false);}}
                          className="w-full text-left px-4 py-2.5 text-xs font-bold flex items-center justify-between transition-colors"
                          style={model===m.id
                            ? { color: 'var(--md-primary)', background: 'rgba(192,193,255,0.06)' }
                            : { color: 'var(--md-on-surface-variant)' }}>
                          {m.label}
                          {model===m.id&&<span className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(192,193,255,0.15)', color: 'var(--md-primary)' }}>ACTIVE</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              onClick={()=>{updateSetting('commuteMode', !settings.commuteMode); vibrate(50);}}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: settings.commuteMode ? 'var(--md-primary)' : 'var(--md-outline)' }}
              title="通勤模式 (高對比)">
              <TrainFront size={14} />
              <span className="hidden lg:inline uppercase tracking-wider">{settings.commuteMode ? '通勤ON' : '通勤'}</span>
            </button>

            <div className="flex items-center gap-1">
              <button onClick={()=>set('theme', settings.theme==='light'?'dark':'light')}
                      className="p-2 rounded-xl transition-colors"
                      style={{ color: 'var(--md-outline)' }}
                      aria-label={`切換至${(settings.theme||'dark')==='light'?'深色':'淺色'}模式`}>
                {(settings.theme||'dark')==='light'?<Moon size={18}/>:<Sun size={18}/>}
              </button>
              <NotificationBell onClick={()=>setNotifOpen(v=>!v)} />
            </div>

            {/* ── Profile Button + Dropdown ─────────────────────────── */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(v => !v)}
                aria-label="個人檔案"
                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all"
                style={{ background: profileOpen ? 'var(--md-primary-container)' : 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: profileOpen ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}>
                <User size={16} />
              </button>

              {profileOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-[199]" onClick={() => setProfileOpen(false)} />
                  {/* Card */}
                  <div
                    className="absolute right-0 top-11 z-[200] w-72 rounded-2xl shadow-2xl overflow-hidden"
                    style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)' }}>

                    {/* Header */}
                    <div className="px-5 py-4" style={{ background: 'var(--md-surface-container-highest)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-lg font-black"
                             style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
                          {(user?.name ?? user?.email ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: 'var(--md-on-surface)' }}>
                            {user?.name ?? '未設定名稱'}
                          </div>
                          <div className="text-xs truncate" style={{ color: 'var(--md-outline)' }}>
                            {user?.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--md-outline-variant)' }}>
                      <div className="flex flex-col items-center py-3" style={{ background: 'var(--md-surface-container-high)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--md-outline)' }}>方案</span>
                        <span className="mt-1 text-xs font-black px-2 py-0.5 rounded-full"
                              style={{ background: user?.tier === 'pro' ? 'rgba(52,211,153,0.15)' : 'var(--md-surface-container)', color: user?.tier === 'pro' ? '#34d399' : 'var(--md-on-surface-variant)', border: `1px solid ${user?.tier === 'pro' ? 'rgba(52,211,153,0.3)' : 'var(--md-outline-variant)'}` }}>
                          {(user?.tier ?? 'free').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col items-center py-3" style={{ background: 'var(--md-surface-container-high)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--md-outline)' }}>狀態</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#52c41a' }} />
                          <span className="text-xs font-bold" style={{ color: '#52c41a' }}>在線</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-2">
                      <button
                        onClick={() => { setProfileOpen(false); setPage('settings'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left"
                        style={{ color: 'var(--md-on-surface-variant)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(192,193,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <SettingsIcon size={15} style={{ color: 'var(--md-outline)' }} />
                        設定
                      </button>
                      <div className="my-1 h-px" style={{ background: 'var(--md-outline-variant)' }} />
                      <button
                        onClick={() => { setProfileOpen(false); logout(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left"
                        style={{ color: '#f87171' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span className="material-symbols-outlined text-[15px]">logout</span>
                        登出
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Mobile Sidebar Overlay */}
        {sidebar && !isLandscape && (
          <div
            className="md:hidden fixed inset-0 backdrop-blur-sm z-40 transition-opacity"
            style={{ background: 'rgba(7,13,31,0.6)' }}
            onClick={() => setSidebar(false)}
          />
        )}

        {!isLandscape && (
          <aside
            role="navigation"
            aria-label="主導覽"
            className={cn(
              'flex flex-col border-r transition-all duration-500 shrink-0 z-50 min-h-0',
              'fixed md:relative h-screen md:h-full',
              sidebar ? 'w-64 translate-x-0' : 'w-16 -translate-x-full md:translate-x-0'
            )}
            style={{ background: 'rgba(7,13,31,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderColor: 'var(--md-outline-variant)' }}>
            {sidebar && (
              <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                       style={{ background: 'var(--md-surface-container-high)' }}>
                    <span className="material-symbols-outlined text-[20px]" style={{ color: 'var(--md-primary)', fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black tracking-wide truncate"
                         style={{ fontFamily: 'var(--font-heading)', color: 'var(--md-primary)' }}>Hermes AI</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#52c41a' }} />
                      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--md-outline)' }}>系統狀態: 正常</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto custom-scrollbar">
              {(isMobile ? NAV : visibleNav).map(item => {
                const Icon = item.icon, active = page === item.id;
                return (
                  <button key={item.id} onClick={() => handleNav(item)} title={!sidebar ? item.label : undefined}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all relative"
                    style={active
                      ? { background: 'rgba(128,131,255,0.12)', color: 'var(--md-primary)', borderRight: sidebar ? '2px solid var(--md-primary)' : 'none' }
                      : { color: 'var(--md-outline)' }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(192,193,255,0.06)'; e.currentTarget.style.color = 'var(--md-on-surface)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--md-outline)'; } }}>
                    <Icon size={18} className="shrink-0" />
                    {(sidebar || isMobile) && <span className="flex-1 truncate text-left tracking-tight">{item.label}</span>}
                    {sidebar && item.shortcut && (
                      <kbd className="hidden lg:inline text-[10px] border rounded px-1.5 font-mono shrink-0 transition-colors"
                           style={active
                             ? { background: 'rgba(192,193,255,0.12)', border: '1px solid rgba(192,193,255,0.2)', color: 'var(--md-primary)' }
                             : { background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </nav>
            {sidebar && (
              <div className="border-t px-4 py-3" style={{ borderColor: 'var(--md-outline-variant)' }}>
                <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--md-outline-variant)' }}>v4.1.0 · QUANT_CORE</div>
              </div>
            )}
          </aside>
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative" role="main" aria-label="主要內容">
          {/* Breadcrumbs / Sub-header */}
          {!isLandscape && (
            <div className="h-10 flex items-center justify-between px-4 md:px-6 border-b shrink-0 z-20"
                 style={{ background: 'rgba(7,13,31,0.5)', backdropFilter: 'blur(8px)', borderColor: 'rgba(70,69,84,0.3)' }}
                 aria-label="導覽路徑" role="navigation">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                <span style={{ color: 'var(--md-outline-variant)' }}>{TOP_TABS.find(t=>t.id===topTab)?.label}</span>
                <span style={{ color: 'var(--md-outline-variant)' }}>/</span>
                <span style={{ color: 'var(--md-on-surface)' }}>{activeLabel}</span>
                {page==='trading'&& (
                  <>
                    <span style={{ color: 'var(--md-outline-variant)' }}>/</span>
                    <span className="font-mono tracking-normal" style={{ color: 'var(--md-primary)' }}>{symbol}</span>
                  </>
                )}
              </div>
              {/* Mobile ticker strip */}
              <div className="md:hidden flex items-center gap-3 overflow-x-auto mobile-hide-scrollbar">
                {tickers.slice(0,4).map(t=>{
                  const up=t.pct>=0;
                  return (
                    <button key={t.symbol} onClick={()=>goTrading(t.symbol)}
                      className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
                      <span style={{ color: 'var(--md-outline)' }}>{t.symbol.replace('-USD','').replace('^','')}</span>
                      <span className={cn('font-black')} style={{ color: up ? 'var(--color-up)' : 'var(--color-down)' }}>{up?'+':''}{(t.pct||0).toFixed(1)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={cn("flex-1 min-h-0 overflow-auto custom-scrollbar relative", isLandscape ? "p-0" : "p-2 sm:p-4 md:p-6 lg:p-8")}
               style={isLandscape ? { background: '#000' } : {}}>
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
        <nav className="md:hidden h-16 flex items-center justify-around border-t px-1 shrink-0 z-50 safe-area-bottom"
             style={{ background: 'rgba(7,13,31,0.95)', backdropFilter: 'blur(20px)', borderColor: 'var(--md-outline-variant)' }}
             role="navigation" aria-label="行動導覽">
          {MOBILE_NAVS.map(item => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => {setPage(item.id as Page); setTopTab(item.topTab);}}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center min-w-[52px] min-h-[48px] px-2 py-1.5 rounded-xl transition-all"
                style={active ? { color: 'var(--md-primary)', background: 'rgba(128,131,255,0.12)' } : { color: 'var(--md-outline)' }}>
                <Icon size={active ? 22 : 20} className="transition-all" />
                {active && <div className="w-1 h-1 rounded-full mt-1" style={{ background: 'var(--md-primary)' }} />}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Global Search (Ctrl/Cmd + K) ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 md:pt-24 safe-area-top"
          style={{ background: 'rgba(7,13,31,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={()=>{setSearch(false);setSearchQ('');}}
          role="dialog"
          aria-modal="true"
          aria-label="搜尋股票"
        >
          <div
            className="w-[calc(100vw-1.5rem)] sm:w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--md-surface-container-lowest)', border: '1px solid var(--md-outline-variant)' }}
            onClick={e=>e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
              <Search size={16} style={{ color: 'var(--md-outline)' }} />
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
                className="flex-1 bg-transparent text-sm font-bold focus:outline-none uppercase"
                style={{ color: 'var(--md-on-surface)' }}
              />
              <kbd className="text-[10px] rounded px-1.5 py-0.5 font-mono"
                   style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>Esc</kbd>
            </div>
            {/* Quick nav shortcuts */}
            <div className="px-4 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--md-outline-variant)' }}>快速導覽</div>
              <div className="space-y-0.5">
                {QUICK_NAVS.map(item => (
                  <button key={item.shortcut}
                    onClick={()=>{handleNav(item);setSearch(false);setSearchQ('');}}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl transition-colors group"
                    style={{ color: 'var(--md-outline)' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,193,255,0.06)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <kbd className="text-[10px] rounded px-1.5 font-mono"
                         style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>{item.shortcut}</kbd>
                    <span className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {searchQ && (
              <div className="border-t px-4 py-2" style={{ borderColor: 'var(--md-outline-variant)' }}>
                <button
                  onClick={()=>{goTrading(searchQ.trim());setSearch(false);setSearchQ('');}}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors"
                  style={{ background: 'rgba(128,131,255,0.08)', border: '1px solid rgba(128,131,255,0.2)', color: 'var(--md-primary)' }}>
                  <span className="text-sm font-bold truncate">搜尋與前往: {searchQ.trim()}</span>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(128,131,255,0.2)' }}>Enter ↵</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 建立 React Query 用戶端
const queryClient = new QueryClient();

/**
 * 最終匯出的 App 組件，封裝所有全域狀態 Provider
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <NavigationProvider>
            <AuthGate>
              <SettingsProvider>
                <MarketDataProvider>
                  <SubscriptionProvider>
                    <NotificationProvider>
                      <AppErrorBoundary>
                        <MainApp />
                      </AppErrorBoundary>
                    </NotificationProvider>
                  </SubscriptionProvider>
                </MarketDataProvider>
              </SettingsProvider>
            </AuthGate>
          </NavigationProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
