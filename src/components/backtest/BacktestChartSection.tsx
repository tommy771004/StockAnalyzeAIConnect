import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Activity, Download, TrendingUp, ArrowDownRight, Target, Settings } from 'lucide-react';
import type { BacktestMetrics, BacktestTrade } from '../../types';
import type { BacktestStrategyMeta } from '../../utils/backtest';

const EquityTip = ({ active, payload, label, color }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; color?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-sm shadow-xl min-w-[160px]" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', fontFamily: 'var(--font-data)' }}>
      <div className="mb-2 text-xs" style={{ color: 'var(--md-outline)' }}>{label}</div>
      {payload.map((p, idx) => (
        <div key={`${p.dataKey}-${idx}`} className="flex justify-between gap-4" style={{ color: p.dataKey === 'portfolio' ? color : '#94a3b8' }}>
          <span>{p.dataKey === 'portfolio' ? '策略' : '買進持有'}</span>
          <span className="font-bold">{(p.value >= 0 ? '+' : '') + Number(p.value).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
};

const DdTip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-2.5 text-xs shadow-xl" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', fontFamily: 'var(--font-data)' }}>
      <div className="mb-1" style={{ color: 'var(--md-outline)' }}>{label}</div>
      <div style={{ color: 'var(--color-up)' }}>最大回撤: -{Number(payload[0]?.value || 0).toFixed(2)}%</div>
    </div>
  );
};

interface BacktestChartSectionProps {
  resultStrat: BacktestStrategyMeta;
  metrics: BacktestMetrics;
  symbol: string;
  period1: string;
  period2: string;
  onExportCSV: () => void;
  showDd: boolean;
  onToggleDd: () => void;
  chartKey: string;
  equityData: Array<{ date: string; portfolio?: number; benchmark?: number; drawdown?: number }>;
  ddData: Array<{ date: string; dd: number }>;
  benchEnd: number;
  tradesRaw: BacktestTrade[];
  maxWinStreak: number;
  maxLossStreak: number;
}

export function BacktestChartSection({
  resultStrat,
  metrics,
  symbol,
  period1,
  period2,
  onExportCSV,
  showDd,
  onToggleDd,
  chartKey,
  equityData,
  ddData,
  benchEnd,
  tradesRaw,
  maxWinStreak,
  maxLossStreak,
}: BacktestChartSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-3 glass-card rounded-[2.5rem] p-8 shadow-2xl flex flex-col min-h-[500px] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: resultStrat.color }} />
              <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--md-on-surface)' }}>{resultStrat.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: 'var(--md-outline-variant)' }} />
              <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--md-outline)' }}>Buy &amp; Hold</span>
            </div>
          </div>
          <button type="button" onClick={onToggleDd}
            className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] px-4 md:px-6 py-2 md:py-2.5 rounded-2xl transition active:scale-95 shadow-lg"
            style={showDd ? { background: 'rgba(255,77,79,0.1)', color: 'var(--color-up)', border: '1px solid rgba(255,77,79,0.25)' } : { background: 'var(--md-surface-container-high)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
            {showDd ? 'Hide Drawdown' : 'Show Drawdown'}
          </button>
        </div>

        <div key={chartKey} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={equityData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`gStrat_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={resultStrat.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={resultStrat.color} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`gBench_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} tickLine={false} axisLine={false}
                  tickFormatter={v => String(v).slice(2, 10).replace(/-/g, '/')}
                  interval={Math.max(1, Math.floor(equityData.length / 6))} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`} domain={['auto', 'auto']} />
                <Tooltip content={<EquityTip color={resultStrat.color} />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="benchmark" name="benchmark" stroke="#64748b" strokeWidth={2} strokeOpacity={0.5} fill={`url(#gBench_${chartKey})`} dot={false} animationDuration={1500} connectNulls />
                <Area type="monotone" dataKey="portfolio" name="portfolio" stroke={resultStrat.color} strokeWidth={2.5} fill={`url(#gStrat_${chartKey})`} dot={false} animationDuration={1500} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {showDd && (
            <div className="h-[120px] mt-4 pt-4" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ddData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gDd_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff4d4f" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ff4d4f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip content={<DdTip />} />
                  <Area type="monotone" dataKey="dd" stroke="#ff4d4f" strokeWidth={1.8} fill={`url(#gDd_${chartKey})`} dot={false} animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-1 space-y-6">
        <div className="glass-card rounded-[2rem] p-6 relative overflow-hidden transition duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--md-outline)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.25)', color: 'var(--color-down)' }}>
              <TrendingUp size={20} />
            </div>
            總報酬率
          </div>
          <div className="text-3xl font-black mb-1 tracking-tight tabular-nums" style={{ color: metrics.roi >= 0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
            {metrics.roi >= 0 ? '+' : ''}{metrics.roi}%
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>基準：{benchEnd >= 0 ? '+' : ''}{benchEnd.toFixed(1)}%</div>
        </div>

        <div className="glass-card rounded-[2rem] p-6 relative overflow-hidden transition duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--md-outline)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)', color: 'var(--color-up)' }}>
              <ArrowDownRight size={20} />
            </div>
            最大回撤
          </div>
          <div className="text-3xl font-black mb-1 tracking-tight tabular-nums" style={{ color: 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
            -{metrics.maxDrawdown}%
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>Peak-to-Trough Decline</div>
        </div>

        <div className="glass-card rounded-[2rem] p-6 relative overflow-hidden transition duration-300 hover:-translate-y-1">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--md-outline)' }}>
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(255,183,131,0.1)', border: '1px solid rgba(255,183,131,0.25)', color: 'var(--md-tertiary)' }}>
              <Target size={20} />
            </div>
            勝率
          </div>
          <div className="text-3xl font-black mb-1 tracking-tight tabular-nums" style={{ color: metrics.winRate >= 50 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
            {metrics.winRate}%
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>
            {tradesRaw.filter(t => t.result === 'WIN').length}W / {tradesRaw.filter(t => t.result === 'LOSS').length}L
          </div>
        </div>

        <div className="liquid-glass rounded-[2rem] p-8 border border-white/10 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-500/20 to-transparent" />
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <Settings size={14} className="text-slate-400" /> 進階績效矩陣
          </div>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            {[
              ['獲利因子', `${metrics.profitFactor?.toFixed(2) ?? '—'}`],
              ['平均獲利', metrics.avgWin != null ? `+${metrics.avgWin}%` : '—'],
              ['平均虧損', metrics.avgLoss != null ? `${metrics.avgLoss}%` : '—'],
              ['最長連勝', `${maxWinStreak}筆`],
              ['最長連敗', `${maxLossStreak}筆`],
              ['策略評級', metrics.roi > 50 ? '卓越' : metrics.roi > 20 ? '良好' : '普通'],
            ].map(([k, v], idx) => (
              <div key={`metric-${idx}`} className="space-y-1.5 group">
                <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] group-hover:text-slate-400 transition-colors">{k}</div>
                <div className="text-sm font-black text-white tracking-tight">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 glass-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
            <Activity size={32} />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-2xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{resultStrat.label}</h3>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>Strategy Report</span>
            </div>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-outline)' }}>
              <span style={{ color: 'var(--md-primary)' }}>{symbol}</span>
              <span className="w-1 h-1 rounded-full" style={{ background: 'var(--md-outline-variant)' }} />
              <span>{period1} ～ {period2}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 relative z-10 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl flex flex-col items-center sm:items-end justify-center" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--md-outline)' }}>Total Return</span>
            <span className="text-2xl md:text-3xl font-black tracking-tighter tabular-nums" style={{ color: metrics.roi >= 0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
              {metrics.roi >= 0 ? '+' : ''}{metrics.roi}%
            </span>
          </div>
          <button type="button" onClick={onExportCSV}
            className="p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors active:scale-90 shadow-xl">
            <Download size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
