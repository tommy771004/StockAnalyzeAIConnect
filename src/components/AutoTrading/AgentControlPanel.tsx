/**
 * src/components/AutoTrading/AgentControlPanel.tsx
 * 主控制面板 (重構優化版) — 導航中心與核心狀態管理
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  onStart: (cfg: Partial<AgentConfig>) => Promise<void>;
  onStop: () => void;
  onUpdateConfig: (cfg: Record<string, unknown>) => Promise<unknown>;
}

export function AgentControlPanel({ status, config, decisionHeats, globalSentiment, equityHistory, onStart, onStop, onUpdateConfig }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'monitor' | 'strategy' | 'broker' | 'backtest' | 'commander' | 'lab' | 'journal' | 'accounts'>('monitor');
  const [defaultsConfig, setDefaultsConfig] = useState<Partial<AgentConfig> | null>(null);

  // 第一次掛載時從伺服器拉預設值；避免在元件中寫死預算/策略
  React.useEffect(() => {
    api.getAutotradingDefaults().then((d: any) => setDefaultsConfig(d?.config ?? null)).catch(() => {/* ignore */});
  }, []);

  // Refresh defaults every 15 s so that RiskControlPanel saves are reflected in effectiveConfig
  React.useEffect(() => {
    const timer = setInterval(() => {
      api.getAutotradingDefaults()
        .then((d: any) => setDefaultsConfig(d?.config ?? null))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  const [mode] = useState<TradingMode>(config?.mode ?? 'simulated');
  const [strategies, setStrategies] = useState<StrategyType[]>(config?.strategies ?? defaultsConfig?.strategies ?? []);
  const [params, setParams] = useState<StrategyParams>(config?.params ?? defaultsConfig?.params ?? {});
  const [symbols, setSymbols] = useState<string[]>(config?.symbols ?? defaultsConfig?.symbols ?? []);
  const isRunning = status === 'running';

  // Merge live WS config with server defaults so pre-flight checks (hasRisk) work before first engine start
  const effectiveConfig: AgentConfig | null = config ?? (defaultsConfig as AgentConfig | null);

  // Sync from live WS/Ably config — runs only when the server pushes a config update.
  // Keeping defaultsConfig out of deps prevents the 15s defaults-refresh from overwriting
  // symbols the user just selected via the sector picker.
  React.useEffect(() => {
    if (!config) return;
    if (config.strategies) setStrategies(config.strategies);
    if (config.params) setParams(config.params);
    if (config.symbols) setSymbols(config.symbols);
  }, [config]);

  // Initial hydration from server defaults — only applies before the first WS config arrives.
  React.useEffect(() => {
    if (config) return; // live config takes priority
    if (!defaultsConfig) return;
    if (defaultsConfig.strategies) setStrategies(defaultsConfig.strategies as StrategyType[]);
    if (defaultsConfig.params) setParams(defaultsConfig.params);
    if (defaultsConfig.symbols) setSymbols(defaultsConfig.symbols);
  }, [config, defaultsConfig]);

  const updateConfig = async (patch: Partial<AgentConfig>) => {
    return await onUpdateConfig({ mode, strategies, params, symbols, ...patch });
  };

  const handleSymbolsChange = (nextSymbols: string[]) => {
    setSymbols(nextSymbols);
    void updateConfig({ symbols: nextSymbols });
  };

  const handleStrategiesChange = (nextStrategies: StrategyType[]) => {
    setStrategies(nextStrategies);
    void updateConfig({ strategies: nextStrategies });
  };

  const handleParamsChange = (nextParams: StrategyParams) => {
    setParams(nextParams);
    void updateConfig({ params: nextParams });
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
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">{t('autotrading.commanderCenter')}</div>
              <div className="text-[9px] text-(--color-term-muted) font-mono">{t('autotrading.status')}: {status.toUpperCase()}</div>
           </div>
        </div>

        {status === 'cooldown' && (
          <button
            type="button"
            onClick={() => api.resetCircuitBreaker()}
            className="focus-ring flex items-center gap-2 px-4 py-1.5 bg-amber-500 text-black text-[10px] font-bold rounded animate-pulse"
          >
            <AlertTriangle className="h-3 w-3" /> {t('autotrading.resetBreaker')}
          </button>
        )}
      </div>

      {/* 2. Navigation Matrix */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-white/5">
        {[
          { id: 'monitor', icon: <Activity className="h-3.5 w-3.5" />, label: t('autotrading.nav.monitor') },
          { id: 'strategy', icon: <LayoutGrid className="h-3.5 w-3.5" />, label: t('autotrading.nav.strategy') },
          { id: 'lab', icon: <FlaskConical className="h-3.5 w-3.5" />, label: t('autotrading.nav.lab') },
          { id: 'accounts', icon: <Users className="h-3.5 w-3.5" />, label: t('autotrading.nav.accounts') },
          { id: 'journal', icon: <BookOpen className="h-3.5 w-3.5" />, label: t('autotrading.nav.journal') },
          { id: 'backtest', icon: <BarChart3 className="h-3.5 w-3.5" />, label: t('autotrading.nav.backtest') },
          { id: 'commander', icon: <MessageSquareCode className="h-3.5 w-3.5" />, label: t('autotrading.nav.chat') },
          { id: 'broker', icon: <ShieldCheck className="h-3.5 w-3.5" />, label: t('autotrading.nav.broker') },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={cn(
              "focus-ring flex items-center gap-2 px-4 py-2 rounded-t-sm motion-safe:transition-all relative",
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
            config={effectiveConfig}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onStart={() => onStart({ mode, strategies, params, symbols })}
            onStop={onStop}
          />
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-4">
            <SectorSelector 
              selectedSymbols={symbols} 
              onSelectSymbols={handleSymbolsChange} 
              disabled={isRunning} 
            />
            <StrategyTab 
              strategies={strategies} 
              params={params} 
              onStrategiesChange={handleStrategiesChange} 
              onParamsChange={handleParamsChange} 
              isRunning={isRunning}
              activeHeat={config?.decisionHeat?.score}
            />
          </div>
        )}

        {activeTab === 'lab' && (
          <StrategySandbox 
            config={config ?? { mode, strategies, params, symbols }} 
            onUpdateShadow={(n, p) => updateConfig({ shadowConfigs: { ...config?.shadowConfigs, [n]: p } })} 
            onPromote={p => updateConfig({ params: p })} 
            onDelete={n => { const next = { ...config?.shadowConfigs }; delete next[n]; updateConfig({ shadowConfigs: next }); }} 
          />
        )}

        {activeTab === 'journal' && <AlphaReport />}
        {activeTab === 'accounts' && <CopyTradingPanel />}
        {activeTab === 'backtest' && <BacktestPanel symbol={symbols[0]} config={{ mode, strategies, params, symbols, symbolConfigs: {} }} />}
        {activeTab === 'commander' && <CommanderTerminal />}
        {activeTab === 'broker' && <BrokerSettings onConnect={api.connectAutotradingBroker} disabled={isRunning} />}
      </div>
    </div>
  );
}
