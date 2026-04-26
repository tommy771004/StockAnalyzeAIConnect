/**
 * src/components/AutoTrading/PerformanceDashboard.tsx
 *
 * 真實績效儀表板：取代 AlphaReport 中硬編碼的 Sharpe / 隨機 confidence。
 * 資料源：GET /api/autotrading/performance?period=...
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Award, ShieldAlert, BarChart3, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

type Period = '1d' | '1w' | '1m' | '3m' | 'ytd' | 'all';

interface Metrics {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  sharpe: number;
  maxDrawdown: number;
  profitFactor: number;
  bestTrade: { ticker: string; pnl: number } | null;
  worstTrade: { ticker: string; pnl: number } | null;
}

interface PerformanceData {
  metrics: Metrics;
  equityCurve: { date: string; equity: number; pnl: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
  attribution: Record<string, { pnl: number; trades: number; winRate: number }>;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'ALL' },
];

export function PerformanceDashboard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('1m');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPerformance(period);
      setData(res);
    } catch (e) {
      setError((e as Error).message ?? '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [period]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-cyan-300">{t('autotrading.performance.title', 'Performance Dashboard')}</span>
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                'text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest border',
                period === p.key
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                  : 'border-(--color-term-border) text-(--color-term-muted) hover:text-white'
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={load}
            className="ml-1 p-1 rounded text-(--color-term-muted) hover:text-white"
            title={t('common.refresh', '重新載入')}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 border border-rose-500/30 bg-rose-500/10 rounded text-[10px] text-rose-300">{error}</div>
      )}

      {!data && !error && (
        <div className="p-6 text-center text-[10px] text-(--color-term-muted)">{loading ? '計算中...' : '尚無數據'}</div>
      )}

      {data && (
        <>
          {/* 4 main cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MetricCard label={t('autotrading.performance.winRate', 'Win Rate')} value={`${data.metrics.winRate.toFixed(1)}%`} sub={`${data.metrics.totalTrades} ${t('autotrading.performance.trades', '筆')}`} positive={data.metrics.winRate >= 50} />
            <MetricCard label={t('autotrading.performance.totalPnl', 'Total PnL')} value={fmtTwd(data.metrics.totalPnL)} sub={`${t('autotrading.performance.avg', 'Avg')} ${fmtTwd(data.metrics.avgPnL)}`} positive={data.metrics.totalPnL >= 0} />
            <MetricCard label={t('autotrading.performance.sharpe', 'Sharpe')} value={data.metrics.sharpe.toFixed(2)} sub={data.metrics.sharpe >= 1 ? t('autotrading.performance.sharpeGood', '優於水準') : t('autotrading.performance.sharpeWeak', '待提升')} positive={data.metrics.sharpe >= 1} />
            <MetricCard label={t('autotrading.performance.maxDrawdown', 'Max Drawdown')} value={`${(data.metrics.maxDrawdown * 100).toFixed(2)}%`} sub={data.metrics.maxDrawdown > -0.1 ? t('autotrading.performance.drawdownGood', '良好') : t('autotrading.performance.drawdownWarn', '警戒')} positive={data.metrics.maxDrawdown > -0.1} icon={<ShieldAlert className="h-3 w-3" />} />
          </div>

          {/* Equity curve sparkline */}
          {data.equityCurve.length > 1 && (
            <div className="border border-(--color-term-border) rounded p-3">
              <div className="text-[9px] text-(--color-term-muted) uppercase mb-2">{t('autotrading.performance.equityCurve', 'Equity Curve')}</div>
              <Sparkline points={data.equityCurve.map(p => p.equity)} color="#34d399" />
            </div>
          )}

          {/* Drawdown */}
          {data.drawdownCurve.length > 1 && (
            <div className="border border-(--color-term-border) rounded p-3">
              <div className="text-[9px] text-(--color-term-muted) uppercase mb-2">{t('autotrading.performance.drawdown', 'Drawdown')}</div>
              <Sparkline points={data.drawdownCurve.map(p => p.drawdown)} color="#f43f5e" fillBelow />
            </div>
          )}

          {/* Strategy attribution */}
          {Object.keys(data.attribution).length > 0 && (
            <div className="border border-(--color-term-border) rounded">
              <div className="px-3 py-2 text-[9px] text-(--color-term-muted) uppercase border-b border-(--color-term-border)">
                {t('autotrading.performance.strategyAttribution', 'Strategy Attribution')}
              </div>
              <div className="divide-y divide-(--color-term-border)">
                {(Object.entries(data.attribution) as [string, { pnl: number; trades: number; winRate: number }][]).map(([key, v]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2 text-[10px]">
                    <span className="font-bold text-white/80">{key}</span>
                    <div className="flex items-center gap-4 font-mono">
                      <span>{v.trades} 筆</span>
                      <span className={v.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{v.winRate.toFixed(1)}%</span>
                      <span className={v.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmtTwd(v.pnl)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best / Worst trade */}
          {(data.metrics.bestTrade || data.metrics.worstTrade) && (
            <div className="grid grid-cols-2 gap-2">
              {data.metrics.bestTrade && (
                <div className="border border-emerald-500/30 bg-emerald-500/5 rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Award className="h-3 w-3" />
                    <span className="text-[10px] font-bold">{data.metrics.bestTrade.ticker}</span>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-300">{fmtTwd(data.metrics.bestTrade.pnl)}</span>
                </div>
              )}
              {data.metrics.worstTrade && (
                <div className="border border-rose-500/30 bg-rose-500/5 rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-300">
                    <TrendingDown className="h-3 w-3" />
                    <span className="text-[10px] font-bold">{data.metrics.worstTrade.ticker}</span>
                  </div>
                  <span className="font-mono text-[10px] text-rose-300">{fmtTwd(data.metrics.worstTrade.pnl)}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtTwd(n: number): string {
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat('zh-TW', { signDisplay: 'auto', maximumFractionDigits: 0 }).format(n);
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon?: React.ReactNode;
}
function MetricCard({ label, value, sub, positive, icon }: MetricCardProps) {
  const Icon = icon ?? (positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />);
  return (
    <div className="border border-(--color-term-border) rounded p-2 bg-black/30">
      <div className={cn('flex items-center gap-1 text-[9px] uppercase', positive ? 'text-emerald-400' : 'text-rose-400')}>
        {Icon}
        <span>{label}</span>
      </div>
      <div className="text-[18px] font-bold font-mono mt-1 text-(--color-term-text)">{value}</div>
      {sub && <div className="text-[9px] text-(--color-term-muted) mt-0.5">{sub}</div>}
    </div>
  );
}

interface SparklineProps {
  points: number[];
  color: string;
  fillBelow?: boolean;
}
function Sparkline({ points, color, fillBelow }: SparklineProps) {
  if (points.length < 2) return <div className="text-[9px] text-(--color-term-muted)">資料不足</div>;
  const w = 600;
  const h = 80;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      {fillBelow && (
        <path d={`${path} L ${w},${h} L 0,${h} Z`} fill={color} fillOpacity={0.15} />
      )}
      <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
