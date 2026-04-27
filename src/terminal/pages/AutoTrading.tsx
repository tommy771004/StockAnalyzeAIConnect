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
import type { AgentConfig } from '../../components/AutoTrading/types';
import * as api from '../../services/api';
import '../../components/AutoTrading/autotrading.css';

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

  React.useEffect(() => {
    api.getAutotradingDefaults().then((d: any) => setDefaults(d)).catch(() => {/* 未登入時跳過 */});
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

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
  const connectionLabel = ws.connected
    ? (ws.transport === 'ably'
      ? t('autotrading.statusLabels.connectedViaAbly', '● Ably Realtime')
      : t('autotrading.statusLabels.connected'))
    : (ws.transport === 'polling'
      ? t('autotrading.statusLabels.polling', '◐ 輪詢模式')
      : t('autotrading.statusLabels.offline'));

  return (
    <div className="autotrading-pane h-full flex flex-col gap-2 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border border-(--color-term-border) rounded-sm shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-(--color-term-accent) tracking-[0.25em]">QUANTUM_CORE_V1</span>
          <nav className="flex gap-3">
            {[
              { id: 'LIVE_VIEW', label: t('autotrading.tabs.liveView') },
              { id: 'STRATEGY', label: t('autotrading.tabs.strategy') },
              { id: 'BACKTEST', label: t('autotrading.tabs.backtest') },
              { id: 'SIMULATION', label: t('autotrading.tabs.simulation') }
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
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <span className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded border ${
            ws.connected
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-(--color-term-muted) border-(--color-term-border)'
          }`}>
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
              {/* Decision Log */}
              <div className="flex-1 border border-(--color-term-border) rounded-sm min-h-0 overflow-hidden">
                <DecisionLog
                  logs={ws.logs}
                  connectionInfo={{
                    connected: ws.connected,
                    transport: ws.transport,
                    reason: ws.offlineReason,
                  }}
                />
              </div>
              {/* Asset Monitor */}
              <div className="h-52 border border-(--color-term-border) rounded-sm overflow-hidden shrink-0">
                <AssetMonitor
                  positions={ws.positions}
                  symbols={currentSymbols}
                  logs={ws.logs}
                />
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
        </div>

        <Splitter
          onResize={handleSplitterResize}
          ariaLabel={t('autotrading.layout.resizeSidebar', '調整側欄寬度')}
        />

        {/* Right sidebar */}
        <div
          className="autotrading-sidebar flex flex-col gap-2 overflow-y-auto shrink-0"
          style={{ ['--autotrading-sidebar-width' as string]: `${sidebarWidth}px` }}
        >
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
