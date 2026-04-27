/**
 * src/components/AutoTrading/BacktestPanel.tsx
 * 詳細回測介面：設定區間、執行回測、查看報表
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, TrendingUp, History, BarChart3, ChevronRight, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { runBacktest as runGlobalBacktest } from '../../services/api';
import { fetchJ } from '../../utils/api';
import { BACKTEST_STRATEGIES, DEFAULT_BACKTEST_METRICS, getDateRangeByPeriod, mapToBacktestStrategy, normalizeBacktestResult, type BacktestStrategyId } from '../../utils/backtest';
import { mapBacktestStrategyToStrategyType } from './strategyParamSchema';
import type { BacktestResult } from '../../types';
import type { AgentConfig } from './types';
import { StockSymbolAutocomplete } from '../common/StockSymbolAutocomplete';
import { normalizeSymbolInput, searchStockSymbols } from '../../utils/stockSymbolLookup';

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

  // 來自 props 的預設值（Strategy tab 配置）
  const defaultSymbol = symbol?.trim() ?? '';
  const defaultStrategy = useMemo<BacktestStrategyId>(
    () => mapToBacktestStrategy(config?.strategies?.[0]),
    [config?.strategies],
  );

  // 本地覆寫值：使用者可在此面板直接調整，無需回 Strategy tab
  const [symbolInput, setSymbolInput] = useState<string>(defaultSymbol);
  const [strategyInput, setStrategyInput] = useState<BacktestStrategyId>(defaultStrategy);
  const [symbolDirty, setSymbolDirty] = useState(false);
  const [strategyDirty, setStrategyDirty] = useState(false);

  // 當外部 props 變動時，若使用者尚未自行覆寫，跟著同步
  useEffect(() => {
    if (!symbolDirty) setSymbolInput(defaultSymbol);
  }, [defaultSymbol, symbolDirty]);

  useEffect(() => {
    if (!strategyDirty) setStrategyInput(defaultStrategy);
  }, [defaultStrategy, strategyDirty]);

  const trimmedSymbol = normalizeSymbolInput(symbolInput);
  const canRun = symbolInput.trim().length > 0 && !loading;
  const isOverridden = symbolDirty || strategyDirty;

  const resetToConfig = () => {
    setSymbolInput(defaultSymbol);
    setStrategyInput(defaultStrategy);
    setSymbolDirty(false);
    setStrategyDirty(false);
  };

  const resolveSymbolForRun = async (): Promise<string> => {
    const raw = symbolInput.trim();
    if (!raw) return '';
    const tickerLike = /^[A-Za-z0-9.\-:=/]+$/.test(raw);
    if (tickerLike) return normalizeSymbolInput(raw);

    try {
      const fuzzy = await searchStockSymbols(raw, 1);
      if (fuzzy[0]?.symbol) return normalizeSymbolInput(fuzzy[0].symbol);
    } catch {
      // ignore and use normalized raw as fallback
    }
    return normalizeSymbolInput(raw);
  };

  const runBacktest = async (): Promise<void> => {
    const resolvedSymbol = await resolveSymbolForRun();
    if (!resolvedSymbol) return;
    if (resolvedSymbol !== trimmedSymbol) {
      setSymbolInput(resolvedSymbol);
      setSymbolDirty(true);
    }
    setLoading(true);
    setError('');

    // 將 BacktestStrategyId (rsi/macd/...) 反轉成 AgentConfig 用的 StrategyType
    const strategyType = mapBacktestStrategyToStrategyType(strategyInput);
    const overrideConfig: Partial<AgentConfig> = {
      ...(config || {}),
      strategies: [strategyType],
    };

    try {
      const data = await fetchJ<{ ok?: boolean; data?: unknown }>('/api/autotrading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: resolvedSymbol, period, config: overrideConfig }),
      });

      if (data.ok && data.data) {
        setResult(normalizeBacktestResult(data.data, strategyInput));
        return;
      }

      throw new Error('AutoTrading backtest payload invalid');
    } catch (primaryError) {
      try {
        const { period1, period2 } = getDateRangeByPeriod(period);
        const fallback = await runGlobalBacktest({
          symbol: resolvedSymbol,
          strategy: strategyInput,
          initialCapital: 1_000_000,
          period1,
          period2,
        });
        setResult(normalizeBacktestResult(fallback, strategyInput));
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
      <div className="bg-white/5 border border-(--color-term-border) p-3 rounded-sm space-y-3">
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-white">
              {t('autotrading.backtest.title', { symbol: trimmedSymbol || '---' })}
            </div>
            <div className="text-[9px] text-(--color-term-muted)">
              {t('autotrading.backtest.descConfigurable', '可在此修改回測標的與策略，不會影響 Strategy tab 的正式配置')}
            </div>
          </div>
          {isOverridden && (
            <button
              type="button"
              onClick={resetToConfig}
              className="focus-ring text-[9px] uppercase tracking-widest text-(--color-term-muted) hover:text-(--color-term-accent) motion-safe:transition-colors px-2 py-1 border border-(--color-term-border) rounded"
            >
              {t('autotrading.backtest.resetToConfig', '套用配置')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-[9px] uppercase tracking-widest text-(--color-term-muted)">
              {t('autotrading.backtest.symbolLabel', '標的 (Symbol)')}
            </span>
            <StockSymbolAutocomplete
              value={symbolInput}
              onValueChange={(next) => { setSymbolInput(next); setSymbolDirty(true); }}
              onSymbolSubmit={(next) => { setSymbolInput(next); setSymbolDirty(true); }}
              placeholder="2330.TW"
              inputClassName="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-white outline-none focus:border-(--color-term-accent)"
            />
          </label>

          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-[9px] uppercase tracking-widest text-(--color-term-muted)">
              {t('autotrading.backtest.strategyLabel', '策略 (Strategy)')}
            </span>
            <select
              value={strategyInput}
              onChange={(e) => { setStrategyInput(e.target.value as BacktestStrategyId); setStrategyDirty(true); }}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-(--color-term-accent)"
            >
              {BACKTEST_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id} className="bg-(--color-term-panel)">
                  {s.label}（{s.en}）
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-(--color-term-muted)">
              {t('autotrading.backtest.periodLabel', '期間 (Period)')}
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-(--color-term-accent)"
            >
              <option value={30}>{t('autotrading.backtest.periods.30d')}</option>
              <option value={90}>{t('autotrading.backtest.periods.90d')}</option>
              <option value={180}>{t('autotrading.backtest.periods.180d')}</option>
              <option value={365}>{t('autotrading.backtest.periods.1y')}</option>
            </select>
          </label>

          <Button
            variant="feature"
            size="md"
            loading={loading}
            disabled={!canRun}
            onClick={runBacktest}
            className="self-end"
            leftIcon={<Play className="h-3 w-3 fill-current" />}
          >
            {t('autotrading.backtest.run')}
          </Button>
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
