import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { formatPct, toneClass } from '../ui/format';
import {
  dashboardNews,
  heatmapCells,
  nvdaWeekly,
  topGainers,
  topLosers,
  watchlistRows,
} from '../mockData';
import { cn } from '../../lib/utils';
import type { NewsCategory, WatchlistRow } from '../types';

const CATEGORY_STYLE: Record<NewsCategory['id'], { label: string; className: string }> = {
  EARNINGS: { label: 'EARNINGS', className: 'text-(--color-term-accent) border-(--color-term-accent)' },
  MACRO: { label: 'MACRO', className: 'text-(--color-term-positive) border-(--color-term-positive)' },
  ALERT: { label: 'ALERT', className: 'text-(--color-term-negative) border-(--color-term-negative)' },
  CRYPTO: { label: 'CRYPTO', className: 'text-violet-300 border-violet-400/60' },
  TECH: { label: 'TECH', className: 'text-cyan-300 border-cyan-400/60' },
  ENERGY: { label: 'ENERGY', className: 'text-amber-300 border-amber-400/60' },
};

export function DashboardPage() {
  const [selected, setSelected] = useState<string>('NVDA');
  const selectedRow = useMemo(
    () => watchlistRows.find((r) => r.symbol === selected) ?? watchlistRows[0],
    [selected],
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      {/* Left column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
        <WatchlistPanel selected={selected} onSelect={setSelected} />
        <TopMoversPanel />
      </div>

      {/* Center column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-6">
        <MarketPulsePanel />
        <SelectedChartPanel row={selectedRow} />
      </div>

      {/* Right column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
        <MarketNewsPanel />
        <QuickTradePanel symbol={selectedRow.symbol} price={selectedRow.last} />
      </div>
    </div>
  );
}

function WatchlistPanel({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (s: string) => void;
}) {
  return (
    <Panel
      title="WATCHLIST"
      actions={<button className="text-base leading-none hover:text-(--color-term-accent)">+</button>}
      className="flex-1 min-h-[260px]"
      bodyClassName="overflow-auto"
    >
      <table className="w-full text-[12px]">
        <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
          <tr className="border-b border-(--color-term-border)">
            <th className="px-3 py-2 text-left font-medium">SYM</th>
            <th className="px-3 py-2 text-right font-medium">LAST</th>
            <th className="px-3 py-2 text-right font-medium">CHG%</th>
            <th className="px-3 py-2 text-right font-medium">VOL</th>
          </tr>
        </thead>
        <tbody>
          {watchlistRows.map((row) => {
            const isActive = row.symbol === selected;
            return (
              <tr
                key={row.symbol}
                onClick={() => onSelect(row.symbol)}
                className={cn(
                  'cursor-pointer border-b border-(--color-term-border)/60 transition-colors',
                  isActive
                    ? 'bg-(--color-term-accent)/10 text-(--color-term-accent)'
                    : 'hover:bg-white/5',
                )}
              >
                <td className="px-3 py-2 font-semibold tracking-wider">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2',
                      isActive && 'border-l-2 border-(--color-term-accent) pl-2 -ml-2',
                    )}
                  >
                    {row.symbol}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.last.toFixed(2)}
                </td>
                <td className={cn('px-3 py-2 text-right tabular-nums', toneClass(row.changePct))}>
                  {formatPct(row.changePct)}
                </td>
                <td className="px-3 py-2 text-right text-(--color-term-muted) tabular-nums">
                  {row.volume}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function TopMoversPanel() {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = tab === 'gainers' ? topGainers : topLosers;
  return (
    <Panel title="TOP MOVERS" className="min-h-[220px]">
      <div className="flex border-b border-(--color-term-border) text-[11px] tracking-widest">
        {(['gainers', 'losers'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'flex-1 py-2 uppercase transition-colors',
              tab === k
                ? 'text-(--color-term-accent) border-b-2 border-(--color-term-accent)'
                : 'text-(--color-term-muted) hover:text-(--color-term-text)',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-(--color-term-border)/60">
        {rows.map((m) => (
          <li key={m.symbol} className="flex items-center justify-between px-3 py-2 text-[12px]">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  m.changePct >= 0 ? 'bg-(--color-term-positive)' : 'bg-(--color-term-negative)',
                )}
              />
              <span className="font-semibold tracking-wider">{m.symbol}</span>
            </span>
            <span className={`${toneClass(m.changePct)} tabular-nums`}>
              {formatPct(m.changePct, 1)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MarketPulsePanel() {
  return (
    <Panel
      title="MARKET PULSE (S&P 500)"
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-positive)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" />
          LIVE
        </span>
      }
      className="h-[240px]"
      bodyClassName="p-2"
    >
      <Heatmap />
    </Panel>
  );
}

function Heatmap() {
  // Render grid based on weights: top row 3 wide cells, middle row 3 narrow, bottom 2 spans
  const rowA = heatmapCells.filter((c) => ['TECH', 'FIN', 'HC', 'CD'].includes(c.label));
  const rowB = heatmapCells.filter((c) => ['IND', 'ENG'].includes(c.label));
  const rowC = heatmapCells.filter((c) => ['COMM', 'UTIL'].includes(c.label));
  return (
    <div className="grid h-full grid-rows-[2fr_1fr_1fr] gap-1">
      <div className="grid grid-cols-12 gap-1">
        <HeatCell cell={rowA[0]!} className="col-span-5 row-span-2" size="lg" />
        <HeatCell cell={rowA[1]!} className="col-span-3" />
        <HeatCell cell={rowA[2]!} className="col-span-4" />
        <HeatCell cell={rowA[3]!} className="col-span-7 row-span-2" size="lg" />
        <HeatCell cell={rowB[0]!} className="col-span-5" />
      </div>
      <div className="hidden grid-cols-12 gap-1" />
      <div className="grid grid-cols-12 gap-1">
        <HeatCell cell={rowC[0]!} className="col-span-6" />
        <HeatCell cell={rowC[1]!} className="col-span-6" />
      </div>
    </div>
  );
}

function HeatCell({
  cell,
  className,
  size = 'md',
}: {
  cell: { label: string; changePct: number };
  className?: string;
  size?: 'md' | 'lg';
}) {
  const shade =
    cell.changePct > 0.8
      ? 'bg-emerald-700/80'
      : cell.changePct > 0
        ? 'bg-emerald-800/70'
        : cell.changePct < -0.8
          ? 'bg-rose-700/80'
          : cell.changePct < 0
            ? 'bg-rose-800/70'
            : 'bg-zinc-700/70';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between p-2 text-white/90',
        shade,
        className,
      )}
    >
      <div className={cn('font-semibold tracking-widest', size === 'lg' ? 'text-sm' : 'text-xs')}>
        {cell.label}
      </div>
      <div className={cn('self-end tabular-nums', size === 'lg' ? 'text-xs' : 'text-[10px]')}>
        {formatPct(cell.changePct, 1)}
      </div>
    </div>
  );
}

function SelectedChartPanel({ row }: { row: WatchlistRow }) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | 'YTD'>('1W');
  const close = row.last;
  const open = close - 2.85;
  const high = close + 3.98;
  const low = close - 12.97;
  const changeAbs = close - open;
  return (
    <Panel className="flex-1 min-h-[320px]" bodyClassName="flex flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-bold tracking-widest text-(--color-term-accent)">
            {row.symbol}
          </span>
          <span className="text-[11px] text-(--color-term-muted)">NVIDIA Corp.</span>
        </div>
        <div className="flex items-center gap-1">
          {(['1D', '1W', '1M', 'YTD'] as const).map((r) => (
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
      </header>
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-(--color-term-muted)">
        <div className="flex gap-4 tabular-nums">
          <span>
            <span className="text-(--color-term-muted)/70 mr-1">O</span>
            <span className="text-(--color-term-text)">{open.toFixed(2)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-1">H</span>
            <span className="text-(--color-term-text)">{high.toFixed(2)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-1">L</span>
            <span className="text-(--color-term-text)">{low.toFixed(2)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-1">C</span>
            <span className="text-(--color-term-text)">{close.toFixed(2)}</span>
          </span>
        </div>
        <span className={toneClass(changeAbs)}>
          {`${changeAbs > 0 ? '+' : ''}${changeAbs.toFixed(2)} (${formatPct((changeAbs / open) * 100)})`}
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        <BarChart />
      </div>
    </Panel>
  );
}

function BarChart() {
  const data = nvdaWeekly;
  const min = Math.min(...data.map((d) => d.low)) - 2;
  const max = Math.max(...data.map((d) => d.high)) + 2;
  const range = max - min;
  return (
    <svg className="h-full w-full" viewBox="0 0 700 340" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1="0"
          x2="700"
          y1={p * 340}
          y2={p * 340}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}
      {data.map((d, i) => {
        const w = 700 / data.length;
        const x = i * w + w * 0.25;
        const bw = w * 0.5;
        const y = 340 - ((d.close - min) / range) * 300 - 20;
        const h = 340 - y;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} fill="url(#barfill)" stroke="#93c5fd" strokeOpacity="0.5" />
            {i === data.length - 1 && (
              <>
                <line
                  x1="0"
                  x2="700"
                  y1={y}
                  y2={y}
                  stroke="#f59e0b"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                <rect x="632" y={y - 10} width="60" height="18" fill="#f59e0b" />
                <text
                  x="662"
                  y={y + 3}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#0a0d13"
                  fontWeight="600"
                >
                  {d.close.toFixed(2)}
                </text>
              </>
            )}
          </g>
        );
      })}
      <text x="690" y="20" fontSize="10" fill="#6b7280" textAnchor="end">800</text>
      <text x="690" y="140" fontSize="10" fill="#6b7280" textAnchor="end">790</text>
      <text x="690" y="230" fontSize="10" fill="#6b7280" textAnchor="end">780</text>
      <text x="690" y="325" fontSize="10" fill="#6b7280" textAnchor="end">770</text>
    </svg>
  );
}

function MarketNewsPanel() {
  return (
    <Panel
      title="MARKET NEWS"
      actions={<Filter className="h-3.5 w-3.5" />}
      className="flex-1 min-h-[300px]"
      bodyClassName="overflow-auto"
    >
      <ul className="divide-y divide-(--color-term-border)/60">
        {dashboardNews.map((n) => {
          const cat = CATEGORY_STYLE[n.category];
          return (
            <li key={n.id} className="px-3 py-3">
              <div className="mb-1.5 flex items-center justify-between text-[10px] tracking-widest">
                <span className={cn('border px-1.5 py-0.5 uppercase', cat.className)}>
                  {cat.label}
                </span>
                <span className="text-(--color-term-muted)">{n.time}</span>
              </div>
              <p className="mb-1.5 text-[12.5px] leading-snug text-(--color-term-text)">
                {n.title}
              </p>
              <div className="flex items-center gap-1.5 text-[10px] text-(--color-term-muted)">
                <span>Mentions:</span>
                {n.tickers.map((t, i) => (
                  <span key={t}>
                    <span className="text-(--color-term-positive)">{t}</span>
                    {i < n.tickers.length - 1 && ','}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function QuickTradePanel({ symbol, price }: { symbol: string; price: number }) {
  const [qty, setQty] = useState(100);
  const [orderPrice, setOrderPrice] = useState(price);
  const total = qty * orderPrice;
  return (
    <Panel accent="amber" className="min-h-[260px]">
      <header className="flex h-9 items-center justify-between border-b border-(--color-term-border) bg-(--color-term-accent)/10 px-3">
        <span className="text-[11px] font-semibold tracking-[0.22em] text-(--color-term-accent)">
          QUICK TRADE
        </span>
      </header>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Field label="">{symbol}</Field>
          <Field label="">
            <span className="flex items-center justify-between">
              LMT
              <svg
                className="h-3 w-3 text-(--color-term-muted)"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </span>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput
            label="QUANTITY"
            value={qty}
            onChange={(v) => setQty(Number(v) || 0)}
          />
          <LabeledInput
            label="PRICE"
            value={orderPrice.toFixed(2)}
            onChange={(v) => setOrderPrice(Number(v) || 0)}
          />
        </div>
        <div className="flex items-center justify-between border-t border-(--color-term-border) pt-3 text-[11px]">
          <span className="tracking-widest text-(--color-term-muted)">EST. TOTAL</span>
          <span className="font-semibold tabular-nums text-(--color-term-text)">
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="border border-sky-300/50 bg-sky-300/20 py-2 text-[12px] font-semibold tracking-widest text-sky-200 hover:bg-sky-300/30"
          >
            BUY
          </button>
          <button
            type="button"
            className="border border-rose-300/50 bg-rose-300/20 py-2 text-[12px] font-semibold tracking-widest text-rose-200 hover:bg-rose-300/30"
          >
            SELL
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] tracking-widest text-(--color-term-muted)">{label}</span>
      )}
      <div className="flex h-9 items-center justify-center border border-(--color-term-border) bg-(--color-term-surface) px-3 text-[13px] font-semibold tracking-widest text-(--color-term-text)">
        {children}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-widest text-(--color-term-muted)">{label}</span>
      <input
        className="h-9 border border-(--color-term-border) bg-(--color-term-surface) px-3 text-center text-[13px] tabular-nums text-(--color-term-text) focus:border-(--color-term-accent) focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
