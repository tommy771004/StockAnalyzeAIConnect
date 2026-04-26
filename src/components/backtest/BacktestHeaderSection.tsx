import React from 'react';
import { Play, Download, Loader2, TrendingUp, ChevronDown, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BacktestStrategyId, BacktestStrategyMeta } from '../../utils/backtest';
import type { StrategyParams } from '../AutoTrading/types';
import {
  getStrategyParamValue,
  mapBacktestStrategyToStrategyType,
  RISK_EXIT_PARAM_SCHEMA,
  STRATEGY_PARAM_SCHEMA,
} from '../AutoTrading/strategyParamSchema';
import { StockSymbolAutocomplete } from '../common/StockSymbolAutocomplete';

interface BacktestHeaderSectionProps {
  strategies: readonly BacktestStrategyMeta[];
  strategy: BacktestStrategyId;
  currentStrategy: BacktestStrategyMeta;
  symbolsList: string[];
  symbol: string;
  onSymbolChange: (value: string) => void;
  onStrategyChange: (value: BacktestStrategyId) => void;
  compareMode: boolean;
  comparing: boolean;
  resultExists: boolean;
  onToggleCompare: () => void;
  onExportPDF: () => void;
  onRun: () => void;
  running: boolean;
  capital: string;
  onCapitalChange: (value: string) => void;
  period1: string;
  period2: string;
  onPeriod1Change: (value: string) => void;
  onPeriod2Change: (value: string) => void;
  strategyParams: StrategyParams;
  onStrategyParamChange: (path: string, value: number) => void;
}

export function BacktestHeaderSection({
  strategies,
  strategy,
  currentStrategy,
  symbolsList,
  symbol,
  onSymbolChange,
  onStrategyChange,
  compareMode,
  comparing,
  resultExists,
  onToggleCompare,
  onExportPDF,
  onRun,
  running,
  capital,
  onCapitalChange,
  period1,
  period2,
  onPeriod1Change,
  onPeriod2Change,
  strategyParams,
  onStrategyParamChange,
}: BacktestHeaderSectionProps) {
  const strategyType = mapBacktestStrategyToStrategyType(strategy);
  const strategyParamSchema = STRATEGY_PARAM_SCHEMA[strategyType] ?? [];

  return (
    <>
      <div className="glass-card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 md:gap-6 rounded-2xl md:rounded-[2.5rem] p-4 md:p-6 lg:p-8 shadow-2xl shrink-0 relative z-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />

        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--md-primary-container)' }}>
            <Play size={20} className="fill-current md:hidden" style={{ color: 'var(--md-on-primary)' }} />
            <Play size={28} className="fill-current hidden md:block" style={{ color: 'var(--md-on-primary)' }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-black tracking-tighter" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>回測引擎 <span className="text-[10px] md:text-sm font-bold ml-1 px-1.5 md:px-2 py-0.5 rounded-lg" style={{ color: 'var(--md-primary)', background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)' }}>V4.2</span></h1>
            <p className="label-meta font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1 truncate" style={{ color: 'var(--md-outline)' }}>Quantum Backtesting Lab</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full lg:w-auto">
          <div className="flex-1 min-w-[140px] lg:flex-none lg:min-w-[160px] relative">
            <StockSymbolAutocomplete
              value={symbol}
              onValueChange={onSymbolChange}
              onSymbolSubmit={onSymbolChange}
              placeholder="代碼 (AAPL, 2330.TW)"
              className="relative w-full"
              inputClassName="w-full rounded-xl md:rounded-2xl px-3 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
              inputStyle={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
              dropdownClassName="max-h-64"
            />
          </div>

          <div className="flex-1 min-w-[140px] lg:flex-none lg:min-w-[180px] relative">
            <select
              value={strategy}
              onChange={e => onStrategyChange(e.target.value as BacktestStrategyId)}
              className="relative w-full rounded-xl md:rounded-2xl px-3 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition appearance-none cursor-pointer"
              style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
            >
              {strategies.map(s => <option key={`opt-${s.id}`} value={s.id} style={{ background: 'var(--md-surface-container)' }}>{s.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--md-outline)' }} />
          </div>

          <div className="flex items-center gap-2 md:gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={onToggleCompare}
              className={cn("flex-1 lg:flex-none px-4 py-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95", compareMode ? "bg-indigo-500 text-black shadow-lg shadow-indigo-500/20" : "bg-white/5 text-zinc-400 border border-white/10")}>
              {comparing ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
              比較績效 COMPARE
            </button>
            {resultExists && (
              <button type="button" onClick={onExportPDF}
                className="flex-1 lg:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition flex items-center justify-center gap-2" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}
              >
                <Download size={16} /> 匯出 PDF
              </button>
            )}
            <button type="button" onClick={onRun} disabled={running}
              className="flex-1 lg:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-indigo-500 text-black shadow-lg shadow-indigo-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50">
              {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-current" />}
              {running ? '執行中 COMPUTING...' : '開始回測 RUN'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 shrink-0 relative z-10">
        <div className="md:col-span-2 xl:col-span-1 glass-card rounded-2xl md:rounded-[2rem] p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
              <Settings size={18} />
            </div>
            <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.15em] md:tracking-[0.2em]" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>回測設定</h3>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2 md:space-y-3">
              <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>初始資金 (USD)</label>
              <div className="relative group">
                <input
                  type="text"
                  value={capital}
                  onChange={e => onCapitalChange(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-xs" style={{ color: 'var(--md-outline)' }}>$</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <div className="space-y-3">
                <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>開始日期</label>
                <input
                  type="date"
                  value={period1}
                  onChange={e => onPeriod1Change(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-base md:text-xs font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                />
              </div>
              <div className="space-y-2 md:space-y-3">
                <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>結束日期</label>
                <input
                  type="date"
                  value={period2}
                  onChange={e => onPeriod2Change(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-base md:text-xs font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 space-y-4" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
            <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>策略參數</label>
            <div className="grid grid-cols-1 gap-3">
              {strategyParamSchema.map((field) => {
                const value = getStrategyParamValue(strategyParams, field.path, field.defaultValue);
                if (field.type === 'range') {
                  return (
                    <div key={field.path} className="space-y-2">
                      <label className="label-meta" style={{ color: 'var(--md-outline)' }}>{field.label}</label>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={value}
                        onChange={e => onStrategyParamChange(field.path, Number(e.target.value))}
                        className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-violet-400"
                      />
                      <div className="text-[10px] font-bold" style={{ color: 'var(--md-outline)' }}>{value}{field.unit ?? ''}</div>
                    </div>
                  );
                }
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="label-meta" style={{ color: 'var(--md-outline)' }}>{field.label}</label>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      onChange={e => onStrategyParamChange(field.path, Number(e.target.value))}
                      className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                      style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                    />
                  </div>
                );
              })}
              {RISK_EXIT_PARAM_SCHEMA.map((field) => {
                const value = getStrategyParamValue(strategyParams, field.path, field.defaultValue);
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="label-meta" style={{ color: 'var(--md-outline)' }}>{field.label}</label>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      onChange={e => onStrategyParamChange(field.path, Number(e.target.value))}
                      className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                      style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="glass-card md:col-span-2 xl:col-span-3 rounded-[2rem] p-6 lg:p-8 transition relative overflow-hidden shadow-xl" style={{ borderColor: currentStrategy.color + '40' }}>
          <div className="flex flex-col h-full relative z-10">
            <div className="flex flex-col md:flex-row items-start justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: currentStrategy.bg, border: `1px solid ${currentStrategy.color}40` }}>
                  <div className="w-8 h-8 rounded-full" style={{ backgroundColor: currentStrategy.color }} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2" style={{ color: currentStrategy.color, fontFamily: 'var(--font-heading)' }}>{currentStrategy.label}</h2>
                  <div className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--md-outline)' }}>{currentStrategy.type}</div>
                </div>
              </div>
            </div>

            <p className="text-sm leading-relaxed font-medium mt-6 mb-6" style={{ color: 'var(--md-on-surface-variant)' }}>{currentStrategy.desc}</p>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                <span>📈</span> {currentStrategy.suitable}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                <span>⚠️</span> {currentStrategy.avoid}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
