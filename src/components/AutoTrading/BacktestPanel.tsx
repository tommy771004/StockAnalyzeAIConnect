/**
 * src/components/AutoTrading/BacktestPanel.tsx
 * 詳細回測介面：設定區間、執行回測、查看報表
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, TrendingUp, History, BarChart3, ChevronRight, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { runBacktest as runGlobalBacktest } from '../../services/api';
import { fetchJ } from '../../utils/api';
import { DEFAULT_BACKTEST_METRICS, getDateRangeByPeriod, mapToBacktestStrategy, normalizeBacktestResult } from '../../utils/backtest';
import type { BacktestResult } from '../../types';
import type { AgentConfig } from './types';

interface Props {
  symbol?: string;
  config?: Partial<AgentConfig>;
}

export function BacktestPanel({ symbol, config }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(BacktestResult & { strategy: string }) | null>(null);
  const [period, setPeriod] = useState(180);
  const canRun = !!symbol?.trim();
  const selectedStrategy = useMemo(
    () => mapToBacktestStrategy(config?.strategies?.[0]),
    [config?.strategies],
  );

  const runBacktest = async (): Promise<void> => {
    if (!symbol?.trim()) return;
    setLoading(true);
    setError('');

    try {
      const data = await fetchJ<{ ok?: boolean; data?: unknown }>('/api/autotrading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period, config }),
      });

      if (data.ok && data.data) {
        setResult(normalizeBacktestResult(data.data, selectedStrategy));
        return;
      }

      throw new Error('AutoTrading backtest payload invalid');
    } catch (primaryError) {
      try {
        const { period1, period2 } = getDateRangeByPeriod(period);
        const fallback = await runGlobalBacktest({
          symbol: symbol.trim().toUpperCase(),
          strategy: selectedStrategy,
          initialCapital: 1_000_000,
          period1,
          period2,
        });
        setResult(normalizeBacktestResult(fallback, selectedStrategy));
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'Backtest failed';
        setError(message);
        console.error('[AutoTrading.BacktestPanel] backtest error:', primaryError, fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const metrics = result?.metrics ?? DEFAULT_BACKTEST_METRICS;
  const trades = result?.trades ?? [];
  const equityCurve = result?.equityCurve ?? [];

  return (
    <div className="space-y-4">
      {/* Control Header */}
      <div className="flex items-center justify-between bg-white/5 border border-(--color-term-border) p-3 rounded-sm">
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 text-violet-400" />
          <div>
            <div className="text-[11px] font-bold text-white">{t('autotrading.backtest.title', { symbol })}</div>
            <div className="text-[9px] text-(--color-term-muted)">{t('autotrading.backtest.desc')}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={period} 
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none"
          >
            <option value={30}>{t('autotrading.backtest.periods.30d')}</option>
            <option value={90}>{t('autotrading.backtest.periods.90d')}</option>
            <option value={180}>{t('autotrading.backtest.periods.180d')}</option>
            <option value={365}>{t('autotrading.backtest.periods.1y')}</option>
          </select>
          
          <button
            onClick={runBacktest}
            disabled={loading || !canRun}
            className={cn(
              "flex items-center gap-2 px-4 py-1 rounded text-[10px] font-bold transition-all",
              loading || !canRun ? "bg-white/10 text-white/50 cursor-not-allowed" : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20"
            )}
          >
            {loading ? <Activity className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
            {t('autotrading.backtest.run')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-sm text-[10px] text-rose-300">
          {error}
        </div>
      )}

      {result ? (
        <div className="space-y-4">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: t('autotrading.backtest.roi'), val: `${metrics.roi}%`, color: metrics.roi > 0 ? 'text-emerald-400' : 'text-rose-400' },
              { label: t('autotrading.backtest.winRate'), val: `${metrics.winRate.toFixed(1)}%`, color: 'text-violet-400' },
              { label: t('autotrading.backtest.maxDrawdown'), val: `-${metrics.maxDrawdown}%`, color: 'text-rose-400' },
              { label: t('autotrading.backtest.totalTrades'), val: metrics.totalTrades, color: 'text-blue-400' },
            ].map((m, i) => (
              <div key={i} className="bg-white/2 border border-white/5 p-2 rounded-sm">
                <div className="text-[8px] text-(--color-term-muted) uppercase tracking-wider">{m.label}</div>
                <div className={cn("text-sm font-bold font-mono mt-0.5", m.color)}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Equity Chart */}
          <div className="bg-black/20 border border-white/5 p-4 rounded-sm h-[200px]">
             <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '10px' }}
                  itemStyle={{ color: '#8b5cf6' }}
                />
                <Area type="monotone" dataKey="portfolio" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorP)" strokeWidth={2} />
                <Area type="monotone" dataKey="benchmark" stroke="#555" fill="transparent" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Trade Log */}
          <div className="bg-white/2 border border-white/5 rounded-sm overflow-hidden">
            <div className="p-2 border-b border-white/5 flex items-center gap-2">
              <BarChart3 className="h-3 w-3 text-violet-400" />
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">{t('autotrading.backtest.history')}</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto font-mono">
              {trades.map((trade, i) => (
                <div key={`${trade.entryTime || trade.entryDate || i}`} className="flex items-center justify-between p-2 border-b border-white/5 text-[9px] hover:bg-white/2">
                  <div className="flex items-center gap-3">
                    <span className={cn("w-8 text-center rounded-sm", (trade.pnl ?? 0) > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                      {(trade.pnl ?? 0) > 0 ? t('autotrading.backtest.win') : t('autotrading.backtest.loss')}
                    </span>
                    <span className="text-white">{(trade.entryDate || trade.entryTime || '').split('T')[0]}</span>
                    <ChevronRight className="h-2 w-2 text-(--color-term-muted)" />
                    <span className="text-white">{(trade.exitDate || trade.exitTime || '').split('T')[0]}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-(--color-term-muted)">{Number(trade.entryPrice ?? 0).toFixed(2)} → {Number(trade.exitPrice ?? 0).toFixed(2)}</span>
                    <span className={cn("font-bold", (trade.pnl ?? 0) > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {(trade.pnl ?? 0) > 0 ? '+' : ''}{Number(trade.pnlPct ?? 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[300px] flex flex-col items-center justify-center border border-dashed border-white/10 rounded-sm bg-black/20">
          <TrendingUp className="h-8 w-8 text-white/10 mb-3" />
          <div className="text-[10px] text-white/30">{t('autotrading.backtest.prompt')}</div>
        </div>
      )}
    </div>
  );
}
