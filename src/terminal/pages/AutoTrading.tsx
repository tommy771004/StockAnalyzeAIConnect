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
import type { AgentConfig } from '../../components/AutoTrading/types';
import * as api from '../../services/api';

async function callApi(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function AutoTradingPage() {
  const ws = useAutotradingWS();

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
    await callApi('/api/autotrading/config', 'PUT', cfg);
  };

  const currentSymbols = ws.config?.symbols ?? ['2330.TW', '2317.TW'];

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden font-mono">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border border-(--color-term-border) rounded-sm shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-(--color-term-accent) tracking-[0.25em]">QUANTUM_CORE_V1</span>
          <nav className="flex gap-3">
            {['LIVE_VIEW', 'STRATEGY', 'BACKTEST', 'SIMULATION'].map((tab, i) => (
              <button
                key={tab}
                type="button"
                className={`text-[10px] uppercase tracking-widest pb-0.5 transition-colors ${
                  i === 0
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
        {/* Left — Logs + Asset Monitor */}
        <div className="flex flex-col gap-2 min-h-0">
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
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-2 overflow-y-auto">
          <AgentControlPanel
            status={ws.status}
            config={ws.config}
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
