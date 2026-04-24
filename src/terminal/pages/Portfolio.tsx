import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { Sparkline } from '../ui/Sparkline';
import { formatPct, toneClass } from '../ui/format';
import { cn } from '../../lib/utils';
import {
  navSeries,
  portfolioHoldings,
  sectorAllocation,
  tradeLog,
} from '../mockData';

export function PortfolioPage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-12 grid-rows-[auto_1fr_auto] gap-3">
      <div className="col-span-12 md:col-span-5 row-span-1">
        <EquityPanel />
      </div>
      <div className="col-span-12 md:col-span-7 row-span-1">
        <NavPanel />
      </div>
      <div className="col-span-12 md:col-span-8 row-span-1 min-h-0">
        <HoldingsPanel />
      </div>
      <div className="col-span-12 md:col-span-4 row-span-1 min-h-0">
        <AllocationPanel />
      </div>
      <div className="col-span-12 row-span-1">
        <TradeLogPanel />
      </div>
    </div>
  );
}

function EquityPanel() {
  return (
    <Panel title="總權益" actions={<span className="text-(--color-term-positive)">+1.24% 今日</span>}>
      <div className="space-y-5 p-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums text-(--color-term-text)">
            $2,450,183.45
          </div>
          <div className="mt-1 text-[12px] text-(--color-term-positive) tabular-nums">
            + $30,145.20 Unrealized
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-(--color-term-border) pt-4 text-[12px]">
          <Metric label="夏普比率 (SHARPE)" value="1.84" />
          <Metric label="年化波動率" value="12.4%" />
          <Metric label="BETA (VS SPX)" value="1.12" />
          <Metric label="最大回撤" value="-8.45%" tone="negative" />
        </div>
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'negative' }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-widest text-(--color-term-muted)">{label}</div>
      <div
        className={cn(
          'text-base font-semibold tabular-nums',
          tone === 'negative' ? 'text-(--color-term-negative)' : 'text-(--color-term-text)',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NavPanel() {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | 'YTD' | '1Y'>('YTD');
  return (
    <Panel
      title="績效走勢 (NAV)"
      actions={
        <div className="flex items-center gap-1">
          {(['1D', '1W', '1M', 'YTD', '1Y'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'h-6 min-w-9 px-1.5 text-[10px] tracking-widest',
                range === r
                  ? 'border border-(--color-term-accent) text-(--color-term-accent)'
                  : 'text-(--color-term-muted) hover:text-(--color-term-text)',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      }
      bodyClassName="relative p-3"
    >
      <div className="relative h-[180px] w-full">
        <Sparkline
          data={navSeries.map((p) => p.v)}
          stroke="#22d3ee"
          fill="rgba(34, 211, 238, 0.14)"
          className="absolute inset-0"
        />
        <div className="absolute inset-y-0 right-0 flex flex-col justify-between py-2 text-[10px] text-(--color-term-muted) tabular-nums">
          <span>2.46M</span>
          <span>2.30M</span>
          <span>2.10M</span>
        </div>
      </div>
    </Panel>
  );
}

function HoldingsPanel() {
  return (
    <Panel
      title="持倉明細"
      actions={<span className="text-(--color-term-muted)">共 14 檔標的</span>}
      className="h-full"
      bodyClassName="overflow-auto"
    >
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-(--color-term-panel) text-[10px] tracking-widest text-(--color-term-muted)">
          <tr className="border-b border-(--color-term-border)">
            <th className="px-4 py-2 text-left font-medium">代號 (SYMBOL)</th>
            <th className="px-4 py-2 text-right font-medium">數量 (QTY)</th>
            <th className="px-4 py-2 text-right font-medium">成本 (COST)</th>
            <th className="px-4 py-2 text-right font-medium">現價 (PRICE)</th>
            <th className="px-4 py-2 text-right font-medium">市值 (MARKET VALUE)</th>
            <th className="px-4 py-2 text-right font-medium">未實現損益 (P/L)</th>
          </tr>
        </thead>
        <tbody>
          {portfolioHoldings.map((h) => (
            <tr
              key={h.symbol}
              className="border-b border-(--color-term-border)/60 hover:bg-white/5"
            >
              <td className="px-4 py-2.5 font-semibold tracking-wider">
                <span className="inline-flex items-center gap-2">
                  <span className={cn('h-2 w-2', h.sectorTint)} />
                  {h.symbol}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{h.qty.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{h.cost.toFixed(2)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{h.price.toFixed(2)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {h.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td
                className={cn(
                  'px-4 py-2.5 text-right tabular-nums',
                  toneClass(h.pnl),
                )}
              >
                {`${h.pnl >= 0 ? '+' : ''}${h.pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${formatPct(h.pnlPct, 1)})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function AllocationPanel() {
  return (
    <Panel title="資產配置 (板塊)" className="h-full" bodyClassName="flex flex-col p-4 gap-4">
      <div className="flex items-center justify-center">
        <Donut />
      </div>
      <ul className="space-y-1.5 text-[12px]">
        {sectorAllocation.map((s) => (
          <li key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2" style={{ background: s.color }} />
              <span className="text-(--color-term-text)">{s.label}</span>
            </span>
            <span className="tabular-nums text-(--color-term-muted)">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Donut() {
  const size = 160;
  const r = 58;
  const stroke = 18;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#111827" strokeWidth={stroke} />
      {sectorAllocation.map((s) => {
        const dash = (s.pct / 100) * circumference;
        const el = (
          <circle
            key={s.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
      <g transform={`rotate(90 ${cx} ${cy})`}>
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill="#6b7280"
          fontSize="10"
          letterSpacing="0.15em"
        >
          EQUITY
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill="#e6e8eb"
          fontSize="14"
          fontWeight="600"
        >
          100%
        </text>
      </g>
    </svg>
  );
}

function TradeLogPanel() {
  return (
    <Panel
      title="近期交易日誌"
      actions={<a className="text-(--color-term-accent) hover:underline">查看全部</a>}
    >
      <table className="w-full text-[12px]">
        <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
          <tr className="border-b border-(--color-term-border)">
            <th className="px-4 py-2 text-left font-medium">時間 (DATE)</th>
            <th className="px-4 py-2 text-left font-medium">類型 (TYPE)</th>
            <th className="px-4 py-2 text-left font-medium">標的 (SYMBOL)</th>
            <th className="px-4 py-2 text-right font-medium">數量 (QTY)</th>
            <th className="px-4 py-2 text-right font-medium">成交價 (PRICE)</th>
            <th className="px-4 py-2 text-right font-medium">總額 (TOTAL)</th>
          </tr>
        </thead>
        <tbody>
          {tradeLog.map((t) => (
            <tr
              key={t.datetime + t.symbol}
              className="border-b border-(--color-term-border)/60 hover:bg-white/5"
            >
              <td className="px-4 py-2.5 text-(--color-term-muted) tabular-nums">{t.datetime}</td>
              <td
                className={cn(
                  'px-4 py-2.5 font-semibold tracking-widest',
                  t.type === 'BUY' ? 'text-sky-300' : 'text-rose-300',
                )}
              >
                {t.type}
              </td>
              <td className="px-4 py-2.5 font-semibold tracking-wider">{t.symbol}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{t.qty.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{t.price.toFixed(2)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {t.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
