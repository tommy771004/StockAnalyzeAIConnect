/**
 * src/components/AutoTrading/AgentControlPanel.tsx
 * 主控制面板 — 啟動/停止引擎、模式切換、策略/標的設定
 */
import React, { useState } from 'react';
import { Play, Square, Settings2, Plus, X, Cpu } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentStatus, AgentConfig, StrategyType, TradingMode } from './types';
import { STRATEGY_LABELS } from './types';

interface Props {
  status: AgentStatus;
  config: AgentConfig | null;
  onStart: (cfg: Partial<AgentConfig>) => void;
  onStop: () => void;
}

export function AgentControlPanel({ status, config, onStart, onStop }: Props) {
  const [mode, setMode] = useState<TradingMode>(config?.mode ?? 'simulated');
  const [strategies, setStrategies] = useState<StrategyType[]>(config?.strategies ?? ['RSI_REVERSION']);
  const [symbols, setSymbols] = useState<string[]>(config?.symbols ?? ['2330.TW', '2317.TW']);
  const [newSymbol, setNewSymbol] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const isRunning = status === 'running';

  const toggleStrategy = (s: StrategyType) => {
    setStrategies(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const addSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols(prev => [...prev, sym]);
    }
    setNewSymbol('');
  };

  return (
    <div className="border border-(--color-term-border) rounded-sm p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-(--color-term-accent)" />
          <span className="text-[11px] font-bold tracking-[0.15em] text-(--color-term-text) uppercase">
            QUANTUM_CORE_V1
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(s => !s)}
          className="text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Mode Switch */}
      <div className="flex gap-1.5">
        {(['simulated', 'real'] as TradingMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={isRunning}
            className={cn(
              'flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border transition disabled:opacity-40',
              mode === m
                ? m === 'real'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-(--color-term-accent)/10 text-(--color-term-accent) border-(--color-term-accent)/30'
                : 'bg-(--color-term-surface) text-(--color-term-muted) border-(--color-term-border) hover:bg-(--color-term-panel)'
            )}
          >
            {m === 'simulated' ? '模擬模式' : '⚠️ 真實模式'}
          </button>
        ))}
      </div>

      {/* Strategy Selector (collapsible) */}
      {showSettings && (
        <div className="space-y-2">
          <div className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">AI 策略選擇</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(STRATEGY_LABELS) as StrategyType[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStrategy(s)}
                disabled={isRunning}
                className={cn(
                  'text-left p-2 rounded border text-[10px] transition disabled:opacity-40',
                  strategies.includes(s)
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                    : 'border-(--color-term-border) bg-(--color-term-surface) text-(--color-term-muted) hover:bg-(--color-term-panel)'
                )}
              >
                <div className="font-bold">{STRATEGY_LABELS[s].name}</div>
                <div className="text-[9px] opacity-70 mt-0.5">{STRATEGY_LABELS[s].desc}</div>
              </button>
            ))}
          </div>

          {/* Symbol Management */}
          <div className="text-[9px] text-(--color-term-muted) uppercase tracking-widest mt-2">監控標的</div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newSymbol}
              onChange={e => setNewSymbol(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSymbol()}
              placeholder="2330.TW / AAPL"
              disabled={isRunning}
              className="flex-1 bg-(--color-term-surface) border border-(--color-term-border) rounded px-2 py-1 text-[11px] font-mono text-(--color-term-text) placeholder-(--color-term-muted) focus:outline-none focus:border-(--color-term-accent) disabled:opacity-40"
            />
            <button
              type="button"
              onClick={addSymbol}
              disabled={isRunning}
              className="px-2 py-1 rounded border border-(--color-term-border) text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-(--color-term-panel) disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {symbols.map(sym => (
              <span key={sym} className="flex items-center gap-1 text-[10px] font-mono bg-(--color-term-panel) border border-(--color-term-border) rounded px-2 py-0.5 text-(--color-term-accent)">
                {sym}
                {!isRunning && (
                  <button type="button" onClick={() => setSymbols(prev => prev.filter(s => s !== sym))}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Start / Stop */}
      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="w-full py-2.5 rounded text-sm font-bold uppercase tracking-widest border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 flex items-center justify-center gap-2 transition"
        >
          <Square className="h-4 w-4" />
          停止 AI 引擎
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onStart({ mode, strategies, symbols })}
          disabled={strategies.length === 0 || symbols.length === 0}
          className="w-full py-2.5 rounded text-sm font-bold uppercase tracking-widest border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="h-4 w-4" />
          啟動 AI 引擎
        </button>
      )}

      {/* Status badge */}
      <div className="flex items-center justify-center gap-1.5">
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-(--color-term-muted)'
        )} />
        <span className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">
          {status === 'running' ? 'LIVE_MODE' : 'STANDBY'}
        </span>
      </div>
    </div>
  );
}
