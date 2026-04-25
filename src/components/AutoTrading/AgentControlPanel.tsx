/**
 * src/components/AutoTrading/AgentControlPanel.tsx
 * 主控制面板 (重構優化版) — 導航中心與核心狀態管理
 */
import React, { useState } from 'react';
import { 
  BarChart3, Settings2, Cpu, LayoutGrid, ShieldCheck, Activity, MessageSquareCode, 
  AlertTriangle, FlaskConical, BookOpen, Users 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';
import type { AgentStatus, AgentConfig, StrategyType, TradingMode, StrategyParams, DecisionHeat, EquitySnapshot } from './types';

// Tab Components (P2 Refactor)
import { MonitorTab } from './MonitorTab';
import { StrategyTab } from './StrategyTab';
import { SectorSelector } from './SectorSelector';
import { BrokerSettings } from './BrokerSettings';
import { BacktestPanel } from './BacktestPanel';
import { CommanderTerminal } from './CommanderTerminal';
import { StrategySandbox } from './StrategySandbox';
import { AlphaReport } from './AlphaReport';
import { CopyTradingPanel } from './CopyTradingPanel';

interface Props {
  status: AgentStatus;
  config: AgentConfig | null;
  decisionHeats: Record<string, DecisionHeat>;
  globalSentiment: number;
  equityHistory: EquitySnapshot[];
  onStart: (cfg: Partial<AgentConfig>) => void;
  onStop: () => void;
}

export function AgentControlPanel({ status, config, decisionHeats, globalSentiment, equityHistory, onStart, onStop }: Props) {
  const [activeTab, setActiveTab] = useState<'monitor' | 'strategy' | 'broker' | 'backtest' | 'commander' | 'lab' | 'journal' | 'accounts'>('monitor');
  const [defaultsConfig, setDefaultsConfig] = useState<Partial<AgentConfig> | null>(null);

  // 第一次掛載時從伺服器拉預設值；避免在元件中寫死預算/策略
  React.useEffect(() => {
    api.getAutotradingDefaults().then((d: any) => setDefaultsConfig(d?.config ?? null)).catch(() => {/* ignore */});
  }, []);

  const [mode] = useState<TradingMode>(config?.mode ?? 'simulated');
  const [strategies, setStrategies] = useState<StrategyType[]>(config?.strategies ?? defaultsConfig?.strategies ?? []);
  const [params, setParams] = useState<StrategyParams>(config?.params ?? defaultsConfig?.params ?? {});
  const [symbols, setSymbols] = useState<string[]>(config?.symbols ?? defaultsConfig?.symbols ?? []);
  const isRunning = status === 'running';

  // Sync state with backend config when it changes
  React.useEffect(() => {
    if (config) {
      if (config.strategies) setStrategies(config.strategies);
      if (config.params) setParams(config.params);
      if (config.symbols) setSymbols(config.symbols);
    } else if (defaultsConfig) {
      // Fallback：尚未拿到 user config 時，套用 server defaults
      if (defaultsConfig.strategies) setStrategies(defaultsConfig.strategies as StrategyType[]);
      if (defaultsConfig.params) setParams(defaultsConfig.params);
      if (defaultsConfig.symbols) setSymbols(defaultsConfig.symbols);
    }
  }, [config, defaultsConfig]);

  const updateConfig = (patch: Partial<AgentConfig>) => {
    onStart({ mode, strategies, params, symbols, ...patch });
  };

  return (
    <div className="border border-(--color-term-border) rounded-sm p-3 space-y-4">
      {/* 1. Header & System Guard */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
           <div className={cn("p-2 rounded-full", isRunning ? "bg-emerald-500/10" : "bg-white/5")}>
              <Cpu className={cn("h-4 w-4", isRunning ? "text-emerald-400 animate-pulse" : "text-white/20")} />
           </div>
           <div>
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">AI_COMMAND_CENTER v3.0</div>
              <div className="text-[9px] text-(--color-term-muted) font-mono">STATUS: {status.toUpperCase()}</div>
           </div>
        </div>

        {status === 'cooldown' && (
          <button 
            onClick={() => api.resetCircuitBreaker()}
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 text-black text-[10px] font-bold rounded animate-pulse"
          >
            <AlertTriangle className="h-3 w-3" /> RESET_BREAKER
          </button>
        )}
      </div>

      {/* 2. Navigation Matrix */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-white/5">
        {[
          { id: 'monitor', icon: <Activity className="h-3.5 w-3.5" />, label: 'Monitor' },
          { id: 'strategy', icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'Strategy' },
          { id: 'lab', icon: <FlaskConical className="h-3.5 w-3.5" />, label: 'Lab' },
          { id: 'accounts', icon: <Users className="h-3.5 w-3.5" />, label: 'Accounts' },
          { id: 'journal', icon: <BookOpen className="h-3.5 w-3.5" />, label: 'Journal' },
          { id: 'backtest', icon: <BarChart3 className="h-3.5 w-3.5" />, label: 'Backtest' },
          { id: 'commander', icon: <MessageSquareCode className="h-3.5 w-3.5" />, label: 'Chat' },
          { id: 'broker', icon: <ShieldCheck className="h-3.5 w-3.5" />, label: 'Broker' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-t-sm transition-all relative",
              activeTab === t.id ? "bg-white/5 text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-violet-500" : "text-white/30 hover:text-white"
            )}
          >
            {t.icon}
            <span className="text-[9px] font-bold uppercase tracking-widest">{t.label}</span>
          </button>
        ))}
      </div>

      {/* 3. Dynamic Tab Content */}
      <div className="min-h-[450px]">
        {activeTab === 'monitor' && (
          <MonitorTab 
            symbols={symbols} 
            isRunning={isRunning} 
            decisionHeats={decisionHeats}
            globalSentiment={globalSentiment}
            equityHistory={equityHistory}
            onStart={() => onStart({ mode, strategies, params, symbols })} 
            onStop={onStop} 
          />
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-4">
            <SectorSelector 
              selectedSymbols={symbols} 
              onSelectSymbols={setSymbols} 
              disabled={isRunning} 
            />
            <StrategyTab 
              strategies={strategies} 
              params={params} 
              onStrategiesChange={setStrategies} 
              onParamsChange={setParams} 
              isRunning={isRunning}
              activeHeat={config?.decisionHeat?.score}
            />
          </div>
        )}

        {activeTab === 'lab' && (
          <StrategySandbox 
            config={config!} 
            onUpdateShadow={(n, p) => updateConfig({ shadowConfigs: { ...config?.shadowConfigs, [n]: p } })} 
            onPromote={p => updateConfig({ params: p })} 
            onDelete={n => { const next = { ...config?.shadowConfigs }; delete next[n]; updateConfig({ shadowConfigs: next }); }} 
          />
        )}

        {activeTab === 'journal' && <AlphaReport />}
        {activeTab === 'accounts' && <CopyTradingPanel />}
        {activeTab === 'backtest' && <BacktestPanel symbol={symbols[0]} config={{ mode, strategies, params, symbols, symbolConfigs: {} }} />}
        {activeTab === 'commander' && <CommanderTerminal />}
        {activeTab === 'broker' && <BrokerSettings onConnect={async (c) => { const res = await fetch('/api/autotrading/broker/connect', { method: 'POST', body: JSON.stringify(c) }); return res.json(); }} disabled={isRunning} />}
      </div>
    </div>
  );
}
