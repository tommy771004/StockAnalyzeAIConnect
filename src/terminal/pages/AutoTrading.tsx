/**
 * src/terminal/pages/AutoTrading.tsx
 * AI 自動化交易主頁面
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAutotradingWS } from '../../components/AutoTrading/useAutotradingWS';
import { AgentControlPanel } from '../../components/AutoTrading/AgentControlPanel';
import { DecisionLog } from '../../components/AutoTrading/DecisionLog';
import { AssetMonitor } from '../../components/AutoTrading/AssetMonitor';
import { AccountSummary } from '../../components/AutoTrading/AccountSummary';
import { RiskControlPanel } from '../../components/AutoTrading/RiskControlPanel';
import { StrategyTab } from '../../components/AutoTrading/StrategyTab';
import { BacktestPanel } from '../../components/AutoTrading/BacktestPanel';
import { StrategySandbox } from '../../components/AutoTrading/StrategySandbox';
import { Splitter } from '../../components/AutoTrading/Splitter';
import { OrderBookPanel } from '../../components/AutoTrading/OrderBookPanel';
import { PerformanceDashboard } from '../../components/AutoTrading/PerformanceDashboard';
import type { AgentConfig } from '../../components/AutoTrading/types';
import * as api from '../../services/api';
import '../../components/AutoTrading/autotrading.css';
import { cn } from '../../lib/utils';
import { DecisionAnalysisPanel } from '../../components/AutoTrading/DecisionAnalysisPanel';
import { TradeToast } from '../../components/AutoTrading/TradeToast';
import { DataStatusBadge, type DataMode } from '../ui/DataStatusBadge';

const SIDEBAR_WIDTH_KEY = 'autotrading.sidebarWidthPx';
const SIDEBAR_MIN_PX = 260;
const SIDEBAR_MAX_PX = 640;
const SIDEBAR_DEFAULT_PX = 320;

function clampSidebar(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_PX;
  return Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, Math.round(width)));
}

function readStoredSidebarWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_PX;
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return clampSidebar(Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_PX);
}

export function AutoTradingPage() {
  const { t } = useTranslation();
  const ws = useAutotradingWS();
  const [mainTab, setMainTab] = React.useState('LIVE_VIEW');
  const [defaults, setDefaults] = React.useState<{ config: AgentConfig } | null>(null);
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(readStoredSidebarWidth);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);
  const [liveViewMobileTab, setLiveViewMobileTab] = React.useState<'decision' | 'log' | 'position'>('log');
  const [highlightedSymbols, setHighlightedSymbols] = React.useState<Set<string>>(new Set());
  const highlightTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevOrderEventsLenRef = React.useRef(0);

  React.useEffect(() => {
    api.getAutotradingDefaults().then((d: any) => setDefaults(d)).catch(() => {/* 未登入時跳過 */});
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  React.useEffect(() => {
    const events = ws.orderEvents;
    if (events.length <= prevOrderEventsLenRef.current) {
      prevOrderEventsLenRef.current = events.length;
      return;
    }
    const newEvents = events.slice(prevOrderEventsLenRef.current);
    prevOrderEventsLenRef.current = events.length;

    const filledSymbols = newEvents
      .filter(e => e.status === 'FILLED')
      .map(e => e.symbol);

    if (filledSymbols.length === 0) return;

    setHighlightedSymbols(prev => new Set([...prev, ...filledSymbols]));

    filledSymbols.forEach(sym => {
      const existing = highlightTimersRef.current.get(sym);
      if (existing) clearTimeout(existing);
      highlightTimersRef.current.set(sym, setTimeout(() => {
        setHighlightedSymbols(prev => { const n = new Set(prev); n.delete(sym); return n; });
        highlightTimersRef.current.delete(sym);
      }, 1500));
    });
  }, [ws.orderEvents]);

  React.useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const handleSplitterResize = React.useCallback((deltaX: number) => {
    setSidebarWidth(prev => clampSidebar(prev - deltaX));
  }, []);

  const handleStart = async (cfg: Partial<AgentConfig>) => {
    await api.startAutotrading(cfg);
  };

  const handleStop = async () => {
    await api.stopAutotrading();
  };

  const handleKillSwitch = async () => {
    await api.triggerKillSwitch();
  };

  const handleUpdateConfig = async (cfg: Record<string, unknown>) => {
    return await api.updateAutotradingConfig(cfg);
  };

  // 監控標的優先序：WS 載入 > /defaults > 空陣列
  const currentSymbols = ws.config?.symbols ?? defaults?.config.symbols ?? [];
  const autoTradingDataMode: DataMode = ws.connected
    ? 'LIVE'
    : ws.transport === 'polling'
      ? 'DELAYED'
      : 'MOCK';
  const autoTradingLastUpdated = React.useMemo(() => {
    const candidates = [
      ws.orderEvents[ws.orderEvents.length - 1]?.timestamp,
      ws.logs[ws.logs.length - 1]?.timestamp,
      ws.equityHistory[ws.equityHistory.length - 1]?.timestamp,
    ].filter(Boolean) as string[];

    let latest = 0;
    for (const c of candidates) {
      const ts = new Date(c).getTime();
      if (!Number.isNaN(ts) && ts > latest) latest = ts;
    }
    return latest > 0 ? new Date(latest).toISOString() : null;
  }, [ws.orderEvents, ws.logs, ws.equityHistory]);
  const connectionLabel = ws.connected
    ? (ws.transport === 'ably'
      ? t('autotrading.statusLabels.connectedViaAbly', '● Ably Realtime')
      : t('autotrading.statusLabels.connected'))
    : (ws.transport === 'polling'
      ? t('autotrading.statusLabels.polling', '◐ 輪詢模式')
      : t('autotrading.statusLabels.offline'));

  return (
    <div className="autotrading-pane h-full flex flex-col gap-2 overflow-hidden">
      <TradeToast events={ws.orderEvents} />
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border border-(--color-term-border) rounded-sm shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-(--color-term-accent) tracking-[0.25em]">QUANTUM_CORE_V1</span>
          <nav className="flex gap-3">
            {[
              { id: 'LIVE_VIEW', label: t('autotrading.tabs.liveView') },
              { id: 'STRATEGY', label: t('autotrading.tabs.strategy') },
              { id: 'BACKTEST', label: t('autotrading.tabs.backtest') },
              { id: 'SIMULATION', label: t('autotrading.tabs.simulation') },
              { id: 'PERFORMANCE', label: 'PERFORMANCE' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`focus-ring text-[10px] uppercase tracking-widest pb-0.5 motion-safe:transition-colors ${
                  mainTab === tab.id
                    ? 'text-(--color-term-accent) border-b border-(--color-term-accent)'
                    : 'text-(--color-term-muted) hover:text-(--color-term-text)'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex lg:hidden">
          <button onClick={() => setIsMobileDrawerOpen(true)} className="px-3 py-1 text-[10px] border border-(--color-term-border) text-(--color-term-accent) rounded focus-ring">CONTROLS</button>
        </div>
        <div className="flex items-center gap-2">
          <DataStatusBadge mode={autoTradingDataMode} lastUpdated={autoTradingLastUpdated} />
          <span className="text-[9px] uppercase tracking-widest px-2 py-1 rounded border text-(--color-term-muted) border-(--color-term-border)">
            {connectionLabel}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded border ${
            ws.status === 'running'
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/15 animate-pulse'
              : 'text-(--color-term-muted) border-(--color-term-border) bg-(--color-term-surface)'
          }`}>
            {ws.status === 'running' ? t('autotrading.statusLabels.liveMode') : t('autotrading.statusLabels.simulated')}
          </span>
        </div>
      </div>

      {ws.transport === 'polling' && (
        <div className="px-3 py-2 border border-amber-500/25 bg-amber-500/10 text-amber-200 rounded-sm text-[11px]">
          {t('autotrading.statusLabels.fallbackPolling', 'Realtime 未連線，已切換為輪詢模式。')}
          {ws.offlineReason ? ` ${ws.offlineReason}` : ''}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2">
        {/* Left — Logs + Asset Monitor or Other Tabs */}
        <div className="flex flex-col gap-2 min-h-0 flex-1 min-w-0">
          {mainTab === 'LIVE_VIEW' && (
            <>
              {/* Mobile tab switcher — hidden on md+ */}
              <div className="flex md:hidden shrink-0 border-b border-(--color-term-border)">
                {(['decision', 'log', 'position'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLiveViewMobileTab(tab)}
                    className={cn(
                      'flex-1 py-2 text-[10px] uppercase tracking-widest transition-colors',
                      liveViewMobileTab === tab
                        ? 'text-(--color-term-accent) border-b border-(--color-term-accent)'
                        : 'text-(--color-term-muted) hover:text-(--color-term-text)'
                    )}
                  >
                    {tab === 'decision' ? '決策' : tab === 'log' ? '日誌' : '部位'}
                  </button>
                ))}
              </div>

              {/* Three-column grid (desktop) / single column (mobile) */}
              <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr_280px] gap-2">

                {/* Left: Decision Analysis Panel */}
                <div className={cn(
                  'border border-(--color-term-border) rounded-sm overflow-hidden flex flex-col',
                  liveViewMobileTab !== 'decision' ? 'hidden md:flex' : 'flex'
                )}>
                  <DecisionAnalysisPanel
                    decisionFusions={ws.decisionFusions}
                    logs={ws.logs}
                    symbols={currentSymbols}
                  />
                </div>

                {/* Center: Decision Log */}
                <div className={cn(
                  'border border-(--color-term-border) rounded-sm min-h-0 overflow-hidden',
                  liveViewMobileTab !== 'log' ? 'hidden md:block' : 'block'
                )}>
                  <DecisionLog
                    logs={ws.logs}
                    highlightedSymbols={highlightedSymbols}
                    connectionInfo={{
                      connected: ws.connected,
                      transport: ws.transport,
                      reason: ws.offlineReason,
                    }}
                  />
                </div>

                {/* Right: Asset Monitor + Order Book */}
                <div className={cn(
                  'flex flex-col gap-2',
                  liveViewMobileTab !== 'position' ? 'hidden md:flex' : 'flex'
                )}>
                  <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-hidden">
                    <AssetMonitor
                      positions={ws.positions}
                      symbols={currentSymbols}
                      decisionFusions={ws.decisionFusions}
                      highlightedSymbols={highlightedSymbols}
                    />
                  </div>
                  <div className="h-52 shrink-0 border border-(--color-term-border) rounded-sm overflow-hidden">
                    <OrderBookPanel events={ws.orderEvents} />
                  </div>
                </div>

              </div>
            </>
          )}

          {mainTab === 'STRATEGY' && (
            <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-y-auto bg-black/40 p-4">
              <StrategyTab 
                strategies={ws.config?.strategies ?? []}
                params={ws.config?.params ?? {}}
                onStrategiesChange={(s) => handleUpdateConfig({ strategies: s })}
                onParamsChange={(p) => handleUpdateConfig({ params: p })}
                isRunning={ws.status === 'running'}
              />
            </div>
          )}

          {mainTab === 'BACKTEST' && (
            <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-y-auto bg-black/40 p-4">
              <BacktestPanel 
                symbol={currentSymbols[0]} 
                config={ws.config || ({ mode: 'simulated', strategies: ['RSI_REVERSION'], params: {}, symbols: currentSymbols, symbolConfigs: {} } as unknown as AgentConfig)} 
              />
            </div>
          )}

          {mainTab === 'SIMULATION' && (
            <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-y-auto bg-black/40 p-4">
              <StrategySandbox 
                config={ws.config || ({ mode: 'simulated', strategies: [], params: {}, symbols: currentSymbols, symbolConfigs: {} } as unknown as AgentConfig)}
                onUpdateShadow={(n, p) => handleUpdateConfig({ shadowConfigs: { ...ws.config?.shadowConfigs, [n]: p } })}
                onPromote={p => handleUpdateConfig({ params: p })}
                onDelete={n => { const next = { ...ws.config?.shadowConfigs }; delete next[n]; handleUpdateConfig({ shadowConfigs: next }); }}
              />
            </div>
          )}

          {mainTab === 'PERFORMANCE' && (
            <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-y-auto bg-black/40 p-4">
              <PerformanceDashboard />
            </div>
          )}
        </div>

        <Splitter
          onResize={handleSplitterResize}
          ariaLabel={t('autotrading.layout.resizeSidebar', '調整側欄寬度')}
        />

        {isMobileDrawerOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setIsMobileDrawerOpen(false)} />}
        {/* Right sidebar */}
        <div
          className={`autotrading-sidebar flex flex-col gap-2 overflow-y-auto shrink-0 bg-(--color-term-surface) p-4 lg:p-0 lg:bg-transparent fixed lg:relative inset-y-0 right-0 z-50 transition-transform ${isMobileDrawerOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
          style={{ ['--autotrading-sidebar-width' as string]: `${sidebarWidth}px` }}
        >
          <div className="lg:hidden flex justify-end mb-2">
            <button onClick={() => setIsMobileDrawerOpen(false)} className="text-(--color-term-muted) hover:text-white px-3 py-1 border border-(--color-term-border) rounded text-[10px] focus-ring">CLOSE</button>
          </div>
          <AgentControlPanel
            status={ws.status}
            config={ws.config}
            decisionHeats={ws.decisionHeats}
            globalSentiment={ws.globalSentiment}
            equityHistory={ws.equityHistory}
            onStart={handleStart}
            onStop={handleStop}
            onUpdateConfig={handleUpdateConfig}
          />
          <AccountSummary balance={ws.balance} />
          <RiskControlPanel
            riskStats={ws.riskStats}
            onKillSwitch={handleKillSwitch}
            onUpdateConfig={handleUpdateConfig}
          />
        </div>
      </div>
    </div>
  );
}
