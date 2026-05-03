import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Cpu } from 'lucide-react';
import type { BacktestForecast } from '../../types';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  symbol: string;
  forecast?: BacktestForecast;
  loading?: boolean;
}

const ForecastTip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl p-3 text-xs shadow-xl"
      style={{
        background: 'var(--md-surface-container-high)',
        border: '1px solid var(--md-outline-variant)',
        fontFamily: 'var(--font-data)',
      }}
    >
      <div className="mb-1" style={{ color: 'var(--md-outline)' }}>
        Day {label}
      </div>
      <div style={{ color: 'var(--md-primary)' }}>
        ${Number(payload[0]?.value ?? 0).toFixed(2)}
      </div>
    </div>
  );
};

export function PriceForecastPanel({ symbol, forecast, loading }: Props) {
  if (loading || !forecast) {
    return (
      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-20 w-36 rounded-2xl" />
        </div>
        <Skeleton className="h-[220px] w-full mb-8 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const { predictions, lastPrice, targetPrice, bearTarget, bullTarget, changesPct, model } = forecast;

  const chartData = predictions.map((price, idx) => ({
    day: idx + 1,
    price,
  }));

  const isPositive = changesPct >= 0;
  const usedFallback = model === 'fallback_linear_trend';

  return (
    <div
      className="glass-card rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700"
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: isPositive ? 'rgba(82,196,26,0.1)' : 'rgba(255,77,79,0.1)',
              border: `1px solid ${isPositive ? 'rgba(82,196,26,0.25)' : 'rgba(255,77,79,0.25)'}`,
              color: isPositive ? 'var(--color-down)' : 'var(--color-up)',
            }}
          >
            {isPositive ? <TrendingUp size={26} /> : <TrendingDown size={26} />}
          </div>
          <div>
            <h3
              className="text-xl font-black tracking-tight"
              style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}
            >
              未來 30 天價格預測
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: 'var(--md-outline)' }}
              >
                {symbol}
              </span>
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: 'var(--md-outline-variant)' }}
              />
              <span
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest"
                style={{ color: 'var(--md-outline)' }}
              >
                <Cpu size={10} />
                {usedFallback ? 'Linear Trend' : 'TimesFM'}
              </span>
            </div>
          </div>
        </div>

        {/* Main target badge */}
        <div
          className="px-6 py-4 rounded-2xl flex flex-col items-end"
          style={{
            background: isPositive ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)',
            border: `1px solid ${isPositive ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}`,
          }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-[0.2em] mb-1"
            style={{ color: 'var(--md-outline)' }}
          >
            Target Price
          </span>
          <span
            className="text-2xl font-black tabular-nums tracking-tight"
            style={{
              color: isPositive ? 'var(--color-down)' : 'var(--color-up)',
              fontFamily: 'var(--font-data)',
            }}
          >
            ${targetPrice.toFixed(2)}
          </span>
          <span
            className="text-xs font-bold mt-0.5"
            style={{ color: isPositive ? 'var(--color-down)' : 'var(--color-up)' }}
          >
            {isPositive ? '+' : ''}{changesPct}% vs current
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[220px] mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--md-primary)" stopOpacity={0.6} />
                <stop offset="100%" stopColor={isPositive ? '#52c41a' : '#ff4d4f'} stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `D${v}`}
              interval={Math.max(1, Math.floor(predictions.length / 6))}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${Number(v).toFixed(0)}`}
              domain={['auto', 'auto']}
              width={55}
            />
            <Tooltip content={<ForecastTip />} />
            <ReferenceLine
              y={lastPrice}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
              label={{ value: 'Now', position: 'insideTopLeft', fill: '#64748b', fontSize: 9, fontWeight: 'bold' }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="url(#forecastGrad)"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              dot={false}
              animationDuration={1200}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Scenario targets */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Bear Case', value: bearTarget, color: 'var(--color-up)', bg: 'rgba(255,77,79,0.06)', border: 'rgba(255,77,79,0.2)' },
          { label: 'Base Case', value: targetPrice, color: 'var(--md-primary)', bg: 'rgba(128,131,255,0.06)', border: 'rgba(128,131,255,0.2)', icon: true },
          { label: 'Bull Case', value: bullTarget, color: 'var(--color-down)', bg: 'rgba(82,196,26,0.06)', border: 'rgba(82,196,26,0.2)' },
        ].map(({ label, value, color, bg, border, icon }) => (
          <div
            key={label}
            className="rounded-2xl p-4 flex flex-col items-center gap-1"
            style={{ background: bg, border: `1px solid ${border}` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {icon && <Target size={11} style={{ color }} />}
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>
                {label}
              </span>
            </div>
            <span
              className="text-lg font-black tabular-nums tracking-tight"
              style={{ color, fontFamily: 'var(--font-data)' }}
            >
              ${value.toFixed(2)}
            </span>
            <span className="text-[9px] font-bold" style={{ color: 'var(--md-outline)' }}>
              {((value - lastPrice) / lastPrice * 100) >= 0 ? '+' : ''}
              {((value - lastPrice) / lastPrice * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {usedFallback && (
        <p
          className="mt-4 text-[10px] font-medium leading-relaxed"
          style={{ color: 'var(--md-outline)' }}
        >
          * 預測使用線性趨勢回退模型（TimesFM 服務未啟動）。啟動 Python 科學服務可獲得更精確的 AI 預測。
        </p>
      )}
    </div>
  );
}
