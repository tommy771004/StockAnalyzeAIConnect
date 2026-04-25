/**
 * src/terminal/pages/AutoTrading.tsx
 * AI 自動化交易主頁面
 */
import React from 'react';
import { useAutotradingWS } from '../../components/AutoTrading/useAutotradingWS';
import { AgentControlPanel } from '../../components/AutoTrading/AgentControlPanel';
import { DecisionLog } from '../../components/AutoTrading/DecisionLog';
import { AssetMonitor } from '../../components/AutoTrading/AssetMonitor';
import { AccountSummary } from '../../components/AutoTrading/AccountSummary';
import { RiskControlPanel } from '../../components/AutoTrading/RiskControlPanel';
import { StrategyTab } from '../../components/AutoTrading/StrategyTab';
import { BacktestPanel } from '../../components/AutoTrading/BacktestPanel';
import { StrategySandbox } from '../../components/AutoTrading/StrategySandbox';
import type { AgentConfig } from '../../components/AutoTrading/types';
import * as api from '../../services/api';

async function callApi(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function AutoTradingPage() {
  const ws = useAutotradingWS();
  const [mainTab, setMainTab] = React.useState('LIVE_VIEW');
  const [defaults, setDefaults] = React.useState<{ config: AgentConfig } | null>(null);

  React.useEffect(() => {
    api.getAutotradingDefaults().then((d: any) => setDefaults(d)).catch(() => {/* 未登入時跳過 */});
  }, []);

  const handleStart = async (cfg: Partial<AgentConfig>) => {
    await callApi('/api/autotrading/start', 'POST', cfg);
  };

  const handleStop = async () => {
    await callApi('/api/autotrading/stop', 'POST');
  };

  const handleKillSwitch = async () => {
    await callApi('/api/autotrading/kill-switch', 'POST');
  };

  const handleUpdateConfig = async (cfg: Record<string, unknown>) => {
    return await callApi('/api/autotrading/config', 'PUT', cfg);
  };

  // 監控標的優先序：WS 載入 > /defaults > 空陣列
  const currentSymbols = ws.config?.symbols ?? defaults?.config.symbols ?? [];

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden font-mono">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border border-(--color-term-border) rounded-sm shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-(--color-term-accent) tracking-[0.25em]">QUANTUM_CORE_V1</span>
          <nav className="flex gap-3">
            {['LIVE_VIEW', 'STRATEGY', 'BACKTEST', 'SIMULATION'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMainTab(tab)}
                className={`text-[10px] uppercase tracking-widest pb-0.5 transition-colors ${
                  mainTab === tab
                    ? 'text-(--color-term-accent) border-b border-(--color-term-accent)'
                    : 'text-(--color-term-muted) hover:text-(--color-term-text)'
                }`}
              >
                {tab}
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
            {ws.connected ? '● CONNECTED' : '○ OFFLINE'}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded border ${
            ws.status === 'running'
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/15 animate-pulse'
              : 'text-(--color-term-muted) border-(--color-term-border) bg-(--color-term-surface)'
          }`}>
            {ws.status === 'running' ? '● LIVE_MODE' : 'SIMULATED'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-2">
        {/* Left — Logs + Asset Monitor or Other Tabs */}
        <div className="flex flex-col gap-2 min-h-0">
          {mainTab === 'LIVE_VIEW' && (
            <>
              {/* Decision Log */}
              <div className="flex-1 border border-(--color-term-border) rounded-sm min-h-0 overflow-hidden">
                <DecisionLog logs={ws.logs} />
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

        {/* Right sidebar */}
        <div className="flex flex-col gap-2 overflow-y-auto">
          <AgentControlPanel
            status={ws.status}
            config={ws.config}
            decisionHeats={ws.decisionHeats}
            globalSentiment={ws.globalSentiment}
            equityHistory={ws.equityHistory}
            onStart={handleStart}
            onStop={handleStop}
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
