/**
 * src/components/AutoTrading/MonitorTab.tsx
 * 監控分頁組件：展示標的狀態與啟停控制
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Activity, Play, Square, LineChart, TrendingUp, CheckCircle2, CircleAlert, ArrowRight, X, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DecisionHeatmap } from './DecisionHeatmap';
import type { AgentConfig, DecisionHeat, EquitySnapshot } from './types';

function calculateMetrics(history: EquitySnapshot[]) {
  if (history.length < 2) return { winRate: 0, sharpe: 0, maxDrawdown: 0 };
  let wins = 0;
  let maxEquity = history[0].equity;
  let maxDrawdown = 0;
  const returns: number[] = [];

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].equity;
    const curr = history[i].equity;
    const ret = prev > 0 ? (curr - prev) / prev : 0;
    returns.push(ret);
    if (curr > prev) wins++;
    if (curr > maxEquity) maxEquity = curr;
    const dd = maxEquity > 0 ? (maxEquity - curr) / maxEquity : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const winRate = wins / returns.length;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Sample variance
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length > 1 ? returns.length - 1 : 1);
  const stdDev = Math.sqrt(variance);
  // Simple Sharpe approximation (assuming periods are evenly spaced)
  const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;

  return { winRate, sharpe, maxDrawdown };
}

interface Props {
  symbols: string[];
  isRunning: boolean;
  decisionHeats: Record<string, DecisionHeat>;
  globalSentiment: number;
  equityHistory: EquitySnapshot[];
  config: AgentConfig | null;
  onRemoveSymbol: (symbol: string) => void;
  onNavigateTab?: (tab: 'strategy' | 'broker') => void;
  onStart: () => Promise<void>;
  onStop: () => void | Promise<void>;
}

export function MonitorTab({
  symbols,
  isRunning,
  decisionHeats,
  globalSentiment,
  equityHistory,
  config,
  onRemoveSymbol,
  onNavigateTab,
  onStart,
  onStop,
}: Props) {
  const { t } = useTranslation();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Optimistic running state: set immediately after API responds so the button
  // switches without waiting for the next WS/polling cycle.
  const [optimisticRunning, setOptimisticRunning] = useState<boolean | null>(null);

  // Clear optimistic state once the real WS status arrives.
  useEffect(() => {
    setOptimisticRunning(null);
  }, [isRunning]);

  const effectiveIsRunning = optimisticRunning ?? isRunning;

  const handleStart = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      await onStart();
      setOptimisticRunning(true);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : '啟動失敗，請稍後再試');
      setOptimisticRunning(null);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await onStop();
      setOptimisticRunning(false);
    } catch {
      setOptimisticRunning(null);
    } finally {
      setIsStopping(false);
    }
  };

  const heats = Object.values(decisionHeats).sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const latestHeat = heats[0];
  const strategies = config?.strategies ?? [];
  const hasSymbols = symbols.length > 0;
  const hasStrategies = strategies.length > 0;
  const hasRisk =
    (config?.budgetLimitTWD ?? 0) > 0 &&
    (config?.maxDailyLossTWD ?? 0) > 0;
  const readyToStart = hasSymbols && hasStrategies && hasRisk;

  const missingItems: string[] = [];
  if (!hasSymbols) missingItems.push(t('autotrading.monitor.checklist.symbols'));
  if (!hasStrategies) missingItems.push(t('autotrading.monitor.checklist.strategies'));
  if (!hasRisk) missingItems.push(t('autotrading.monitor.checklist.risk'));

  const steps = [
    { id: 1, label: t('autotrading.monitor.steps.selectSymbols'), done: hasSymbols, action: () => onNavigateTab?.('strategy') },
    { id: 2, label: t('autotrading.monitor.steps.selectStrategies'), done: hasStrategies, action: () => onNavigateTab?.('strategy') },
    { id: 3, label: t('autotrading.monitor.steps.configureRisk'), done: hasRisk },
    { id: 4, label: t('autotrading.monitor.steps.startEngine'), done: effectiveIsRunning },
  ];

  const metrics = calculateMetrics(equityHistory);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Quick Start Guide */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest">
            {t('autotrading.monitor.quickstartTitle', '首屏操作指引')}
          </span>
          <span className="text-[9px] text-cyan-100/70">
            {t('autotrading.monitor.quickstartSubtitle', '先選標的 → 選策略 → 風控 → 啟動')}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={step.action}
              disabled={!step.action}
              className={cn(
                'focus-ring text-left p-2 rounded border text-[11px] motion-safe:transition-colors flex items-center justify-between gap-2',
                step.done
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-cyan-400/20 bg-black/30 text-cyan-100/90',
                !step.action && 'cursor-default'
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-cyan-300">#{step.id}</span>
                <span>{step.label}</span>
              </span>
              {step.done ? <CheckCircle2 className="h-4 w-4" /> : (step.action ? <ArrowRight className="h-4 w-4 opacity-70" /> : <CircleAlert className="h-4 w-4 opacity-70" />)}
            </button>
          ))}
        </div>
      </div>

      {/* Market Mood Gauge */}
      <div className="bg-white/2 border border-white/5 p-4 rounded-sm space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('autotrading.monitor.marketMood')}</span>
          <span className={cn(
            "text-[12px] font-mono font-bold",
            globalSentiment > 60 ? "text-emerald-400" : globalSentiment < 40 ? "text-rose-400" : "text-amber-400"
          )}>
            {globalSentiment > 60 ? t('autotrading.monitor.mood.optimistic') : globalSentiment < 40 ? t('autotrading.monitor.mood.pessimistic') : t('autotrading.monitor.mood.neutral')} ({globalSentiment}%)
          </span>
        </div>
        <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
           <div className="flex-1 h-full bg-rose-500/20" />
           <div className="flex-1 h-full bg-amber-500/20" />
           <div className="flex-1 h-full bg-emerald-500/20" />
           <div
             className={cn(
               "absolute h-1.5 rounded-full transition-all duration-1000",
               globalSentiment > 60 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
               globalSentiment < 40 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" :
               "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
             )}
             style={{ width: '4px', left: `calc(${globalSentiment}% - 2px)` }}
           />
        </div>
      </div>

      {/* Live Session Performance */}
      <div className="bg-black/20 border border-white/5 p-4 rounded-sm space-y-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('autotrading.monitor.livePerformance')}</span>
           </div>
           {equityHistory.length > 0 && (
             <span className={cn(
               "text-[10px] font-mono font-bold",
               equityHistory[equityHistory.length-1].equity >= equityHistory[0].equity ? "text-emerald-400" : "text-rose-400"
             )}>
               {((equityHistory[equityHistory.length-1].equity / equityHistory[0].equity - 1) * 100).toFixed(2)}%
             </span>
           )}
        </div>
        
        {/* Performance Metrics Dashboard */}
        {equityHistory.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 p-2 rounded border border-white/5 text-center">
              <div className="text-[8px] text-white/40 uppercase tracking-wider mb-1">Win Rate</div>
              <div className="text-[12px] font-mono font-bold text-cyan-400">{(metrics.winRate * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/5 text-center">
              <div className="text-[8px] text-white/40 uppercase tracking-wider mb-1">Sharpe</div>
              <div className={cn("text-[12px] font-mono font-bold", metrics.sharpe > 1 ? "text-emerald-400" : "text-amber-400")}>
                {metrics.sharpe.toFixed(2)}
              </div>
            </div>
            <div className="bg-white/5 p-2 rounded border border-white/5 text-center">
              <div className="text-[8px] text-white/40 uppercase tracking-wider mb-1">Max DD</div>
              <div className={cn("text-[12px] font-mono font-bold", metrics.maxDrawdown > 0.05 ? "text-rose-400" : "text-emerald-400")}>
                {(metrics.maxDrawdown * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        <div className="h-[100px] w-full">
          {equityHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityHistory}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '9px' }}
                  labelStyle={{ display: 'none' }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorEquity)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded">
               <LineChart className="h-4 w-4 text-white/10 mb-1" />
               <span className="text-[8px] text-white/20 uppercase">{t('autotrading.monitor.collectingData')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Symbols Matrix with Scroll Support */}
      <div className="max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {symbols.map(sym => (
            <div key={sym} className="p-3 bg-white/5 border border-white/10 rounded flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold font-mono text-white">{sym}</span>
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-cyan-400 opacity-50" />
                  <button
                    type="button"
                    disabled={effectiveIsRunning}
                    onClick={() => onRemoveSymbol(sym)}
                    aria-label={t('autotrading.monitor.removeSymbol', '移除監控標的')}
                    title={t('autotrading.monitor.removeSymbol', '移除監控標的')}
                    className="h-5 w-5 inline-flex items-center justify-center rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <DecisionHeatmap symbol={sym} data={decisionHeats[sym]} />
            </div>
          ))}
        </div>
      </div>

      {/* Live Intelligence Feed */}
      <div className="bg-violet-500/5 border border-violet-500/10 rounded-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">{t('autotrading.monitor.alphaReasoning')}</span>
        </div>

        <div className="space-y-2">
          {latestHeat ? (
            <div key={latestHeat.timestamp} className="flex items-start gap-3 p-2 bg-black/40 rounded border border-white/5 animate-in fade-in slide-in-from-left-2 duration-500">
              <div className="h-4 w-4 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                 <span className="text-[8px] font-bold text-cyan-400">AI</span>
              </div>
              <div className="flex-1 space-y-1">
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] font-bold text-white">{latestHeat.symbol}</span>
                   <span className="text-[8px] text-white/30">{new Date(latestHeat.timestamp).toLocaleTimeString()}</span>
                 </div>
                 <p className="text-[10px] text-white/80 leading-relaxed font-serif italic">
                   "{latestHeat.reason}"
                 </p>
                 <div className="flex gap-2">
                    <span className={cn(
                      "text-[8px] px-1.5 py-0.5 rounded",
                      latestHeat.score > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {latestHeat.score > 0 ? t('autotrading.monitor.bias.bullish') : t('autotrading.monitor.bias.bearish')}
                    </span>
                    <span className="text-[8px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">
                      {Math.abs(latestHeat.score) > 60 ? t('autotrading.monitor.confidence.high') : t('autotrading.monitor.confidence.moderate')}
                    </span>
                 </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">{t('autotrading.monitor.waitingInsights')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Action */}
      <div className="pt-6 border-t border-white/5">
        {!effectiveIsRunning && missingItems.length > 0 && (
          <div className="mb-3 p-2 rounded border border-amber-500/25 bg-amber-500/10 text-[11px] text-amber-200">
            <div className="font-bold mb-1">{t('autotrading.monitor.startBlocked', '啟動前需完成')}</div>
            <div>{missingItems.join(' / ')}</div>
          </div>
        )}
        {effectiveIsRunning ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={isStopping}
            className="focus-ring w-full py-3 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-bold uppercase tracking-[0.2em] hover:bg-rose-500/30 motion-safe:transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isStopping
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('autotrading.monitor.stopping', '停止中…')}</>
              : <><Square className="h-4 w-4 fill-current" /> {t('autotrading.monitor.emergencyStop')}</>
            }
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleStart}
              disabled={!readyToStart || isStarting}
              className={cn(
                'focus-ring w-full py-3 rounded font-bold uppercase tracking-[0.2em] motion-safe:transition-all flex items-center justify-center gap-2',
                readyToStart && !isStarting
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                  : 'bg-zinc-800/40 text-zinc-500 border border-zinc-700 cursor-not-allowed'
              )}
            >
              {isStarting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('autotrading.monitor.starting', '啟動中…')}</>
                : <><Play className="h-4 w-4 fill-current" /> {t('autotrading.monitor.initiateEngine')}</>
              }
            </button>
            {startError && (
              <p className="text-center text-[10px] text-rose-300 mt-2 px-2">{startError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
