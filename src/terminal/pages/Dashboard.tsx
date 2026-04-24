import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Filter, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { formatPct, toneClass } from '../ui/format';
import { cn } from '../../lib/utils';
import type { NewsCategory, WatchlistRow, CandlePoint, DashboardNews } from '../types';
import { useDashboardData, type ChartRange } from '../hooks/useDashboardData';
import { executeTrade } from '../../services/api';
import ChartWidget from '../../components/ChartWidget';

const CATEGORY_STYLE: Record<NewsCategory['id'], { label: string; className: string }> = {
  EARNINGS: { label: 'EARNINGS', className: 'text-(--color-term-accent) border-(--color-term-accent)' },
  MACRO:    { label: 'MACRO',    className: 'text-(--color-term-positive) border-(--color-term-positive)' },
  ALERT:    { label: 'ALERT',    className: 'text-(--color-term-negative) border-(--color-term-negative)' },
  CRYPTO:   { label: 'CRYPTO',  className: 'text-violet-300 border-violet-400/60' },
  TECH:     { label: 'TECH',    className: 'text-cyan-300 border-cyan-400/60' },
  ENERGY:   { label: 'ENERGY',  className: 'text-amber-300 border-amber-400/60' },
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const [range, setRange] = useState<ChartRange>('1W');
  const data = useDashboardData(range);
  const { loading, isLive, watchlist, gainers, losers, candles, news, selected, setSelected, selectedRow, refresh } = data;

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      {/* Left column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
        <WatchlistPanel
          rows={watchlist}
          selected={selected}
          onSelect={setSelected}
          isLive={isLive}
          loading={loading}
          onRefresh={refresh}
        />
        <TopMoversPanel gainers={gainers} losers={losers} loading={loading} />
      </div>

      {/* Center column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-6">
        <MarketPulsePanel watchlist={watchlist} />
        <SelectedChartPanel
          row={selectedRow}
          candles={candles}
          range={range}
          setRange={setRange}
          loading={loading}
          isLive={isLive}
        />
      </div>

      {/* Right column */}
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
        <MarketNewsPanel news={news} />
        <QuickTradePanel symbol={selectedRow.symbol} price={selectedRow.last} />
      </div>
    </div>
  );
}

// ─── WatchlistPanel ────────────────────────────────────────────────────────────
function WatchlistPanel({
  rows,
  selected,
  onSelect,
  isLive,
  loading,
  onRefresh,
}: {
  rows: WatchlistRow[];
  selected: string;
  onSelect: (s: string) => void;
  isLive: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Panel
      title="WATCHLIST"
      actions={
        <div className="flex items-center gap-2">
          {/* Live / Offline badge */}
          <span
            className={cn(
              'flex items-center gap-1 text-[10px] tracking-widest',
              isLive ? 'text-(--color-term-positive)' : 'text-(--color-term-muted)',
            )}
          >
            {isLive ? (
              <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" /><Wifi className="h-3 w-3" /></>
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
          </span>
          {/* Manual refresh */}
          <button
            type="button"
            title="Refresh"
            onClick={onRefresh}
            className="text-(--color-term-muted) hover:text-(--color-term-accent) transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      }
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
          {rows.map((row) => {
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
                  {row.last > 0 ? row.last.toFixed(2) : '—'}
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

// ─── TopMoversPanel ────────────────────────────────────────────────────────────
function TopMoversPanel({
  gainers,
  losers,
  loading,
}: {
  gainers: { symbol: string; changePct: number }[];
  losers:  { symbol: string; changePct: number }[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = tab === 'gainers' ? gainers : losers;
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
        {loading && rows.length === 0 ? (
          <li className="px-3 py-4 text-center text-[11px] text-(--color-term-muted)">Loading…</li>
        ) : (
          rows.map((m) => (
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
          ))
        )}
      </ul>
    </Panel>
  );
}

// ─── MarketPulsePanel ──────────────────────────────────────────────────────────
function MarketPulsePanel({ watchlist }: { watchlist: WatchlistRow[] }) {
  return (
    <Panel
      title="MARKET PULSE (WATCHLIST)"
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-positive)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" />
          LIVE
        </span>
      }
      className="h-[240px]"
      bodyClassName="p-2"
    >
      <Heatmap watchlist={watchlist} />
    </Panel>
  );
}

// ─── Dynamic Heatmap ────────────────────────────────────────────────────────
function Heatmap({ watchlist }: { watchlist: WatchlistRow[] }) {
  if (!watchlist || watchlist.length === 0) {
    return <div className="flex h-full items-center justify-center text-[10px] text-(--color-term-muted)">Pulse unavailable</div>;
  }
  
  // Create a grid of up to 6 core items
  const items = watchlist.slice(0, 6);
  if (items.length < 6) {
    // PAD if needed for visual structure
    while(items.length < 6) items.push({ symbol: '--', last: 0, changePct: 0, volume: '—' });
  }

  return (
    <div className="grid h-full grid-rows-[2fr_1fr_1fr] gap-1">
      <div className="grid grid-cols-12 gap-1">
        <HeatCell cell={items[0]!} className="col-span-5 row-span-2" size="lg" />
        <HeatCell cell={items[1]!} className="col-span-3" />
        <HeatCell cell={items[2]!} className="col-span-4" />
        <HeatCell cell={items[3]!} className="col-span-7 row-span-2" size="lg" />
      </div>
      <div className="hidden grid-cols-12 gap-1" />
      <div className="grid grid-cols-12 gap-1">
        <HeatCell cell={items[4]!} className="col-span-6" />
        <HeatCell cell={items[5]!} className="col-span-6" />
      </div>
    </div>
  );
}

function HeatCell({
  cell,
  className,
  size = 'md',
}: {
  cell: { symbol: string; changePct: number };
  className?: string;
  size?: 'md' | 'lg';
}) {
  const isDummy = cell.symbol === '--';
  const shade = isDummy 
    ? 'bg-zinc-800/20' 
    : cell.changePct > 0.8
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
      <span className={cn('font-bold tracking-widest text-[#e2e8f0]', size === 'lg' ? 'text-[14px]' : 'text-[11px]')}>
        {cell.symbol}
      </span>
      {!isDummy && (
        <span className={cn('font-medium', size === 'lg' ? 'text-[13px]' : 'text-[10px]')}>
          {formatPct(cell.changePct)}
        </span>
      )}
    </div>
  );
}

// ─── SelectedChartPanel ────────────────────────────────────────────────────────
function SelectedChartPanel({
  row,
  candles,
  range,
  setRange,
  loading,
  isLive,
}: {
  row: WatchlistRow;
  candles: CandlePoint[];
  range: ChartRange;
  setRange: (r: ChartRange) => void;
  loading: boolean;
  isLive: boolean;
}) {
  const last = candles[candles.length - 1];
  const first = candles[0];
  const close   = last?.close  ?? row.last;
  const open    = first?.open  ?? close;
  const high    = Math.max(...candles.map((c) => c.high), close);
  const low     = Math.min(...candles.map((c) => c.low),  close);
  const changeAbs = close - open;
  const changePct = open > 0 ? (changeAbs / open) * 100 : 0;

  const chartData = candles.map(c => ({
    date: new Date(c.t * 1000).toISOString(), // Assume `t` is seconds
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  return (
    <Panel className="flex-1 min-h-[320px]" bodyClassName="flex flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-bold tracking-widest text-(--color-term-accent)">
            {row.symbol}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] tracking-widest text-(--color-term-positive)">
              <span className="h-1 w-1 animate-pulse rounded-full bg-(--color-term-positive)" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(['1D', '1W', '1M', 'YTD'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'h-6 min-w-9 px-1.5 text-[10px] tracking-widest transition-colors',
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

      {/* OHLC summary bar */}
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
          {`${changeAbs > 0 ? '+' : ''}${changeAbs.toFixed(2)} (${formatPct(changePct)})`}
        </span>
      </div>

      {/* Chart */}
      <div className="relative flex-1 min-h-0">
        {loading && chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-(--color-term-muted)">
            Loading chart…
          </div>
        ) : (
          <ChartWidget
            symbol={row.symbol}
            data={chartData}
            liveMode={isLive}
          />
        )}
      </div>
    </Panel>
  );
}

// ─── CandlestickChart — renders real OHLC SVG ─────────────────────────────────
function CandlestickChart({ candles }: { candles: CandlePoint[] }) {
  const W = 700; const H = 320;
  const PAD_LEFT = 8; const PAD_RIGHT = 52; const PAD_TOP = 12; const PAD_BOTTOM = 20;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  if (candles.length === 0) return null;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const priceRange = maxPrice - minPrice || 1;

  const toY = (p: number) => PAD_TOP + chartH - ((p - minPrice) / priceRange) * chartH;
  const barW = Math.max(2, (chartW / candles.length) * 0.6);
  const barStep = chartW / candles.length;

  // Price grid lines
  const gridPrices = [0.2, 0.4, 0.6, 0.8].map((p) => minPrice + priceRange * p);

  // Last price tag
  const lastPrice = candles[candles.length - 1]!.close;
  const lastY = toY(lastPrice);
  const lastPriceLabel = lastPrice.toFixed(2);

  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="candleGreenFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="candleRedFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#f87171" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridPrices.map((p) => {
        const y = toY(p);
        return (
          <g key={p}>
            <line
              x1={PAD_LEFT} x2={W - PAD_RIGHT}
              y1={y} y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
            <text
              x={W - PAD_RIGHT + 4}
              y={y + 4}
              fontSize="9"
              fill="#6b7280"
              fontFamily="monospace"
            >
              {p >= 1000 ? p.toFixed(0) : p.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Candles */}
      {candles.map((c, i) => {
        const x = PAD_LEFT + i * barStep + barStep / 2;
        const isGreen = c.close >= c.open;
        const color = isGreen ? '#34d399' : '#f87171';
        const bodyTop    = toY(Math.max(c.open, c.close));
        const bodyBottom = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyBottom - bodyTop);

        return (
          <g key={i}>
            {/* Wick */}
            <line
              x1={x} x2={x}
              y1={toY(c.high)} y2={toY(c.low)}
              stroke={color}
              strokeWidth="1"
              strokeOpacity="0.6"
            />
            {/* Body */}
            <rect
              x={x - barW / 2}
              y={bodyTop}
              width={barW}
              height={bodyH}
              fill={isGreen ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)'}
              stroke={color}
              strokeWidth="0.5"
            />
          </g>
        );
      })}

      {/* Last price dashed line + label */}
      <line
        x1={PAD_LEFT} x2={W - PAD_RIGHT}
        y1={lastY} y2={lastY}
        stroke="#f59e0b"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <rect
        x={W - PAD_RIGHT + 2}
        y={lastY - 9}
        width={48}
        height={18}
        fill="#f59e0b"
        rx="2"
      />
      <text
        x={W - PAD_RIGHT + 26}
        y={lastY + 4}
        textAnchor="middle"
        fontSize="10"
        fill="#0a0d13"
        fontWeight="700"
        fontFamily="monospace"
      >
        {lastPriceLabel}
      </text>
    </svg>
  );
}

// ─── MarketNewsPanel ───────────────────────────────────────────────────────────
function MarketNewsPanel({ news }: { news: DashboardNews[] }) {
  return (
    <Panel
      title="MARKET NEWS"
      actions={<Filter className="h-3.5 w-3.5" />}
      className="flex-1 min-h-[300px]"
      bodyClassName="overflow-auto"
    >
      {news.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-(--color-term-muted)">
          No recent news.
        </div>
      ) : (
        <ul className="divide-y divide-(--color-term-border)/60">
          {news.map((n) => {
            const cat = CATEGORY_STYLE[n.category] || CATEGORY_STYLE['TECH'];
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
                  {n.tickers?.map((t, i) => (
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
      )}
    </Panel>
  );
}

// ─── QuickTradePanel ──────────────────────────────────────────────────────────
type TradeStatus = 'idle' | 'submitting' | 'success' | 'error';

function QuickTradePanel({ symbol, price }: { symbol: string; price: number }) {
  const [qty, setQty]           = useState(100);
  const [orderPrice, setOrderPrice] = useState(price);
  const [side, setSide]         = useState<'buy' | 'sell'>('buy');
  const [status, setStatus]     = useState<TradeStatus>('idle');
  const [errMsg, setErrMsg]     = useState('');
  const total = qty * orderPrice;

  // Sync order price when selected symbol changes
  useEffect(() => {
    setOrderPrice(price);
    setStatus('idle');
    setErrMsg('');
  }, [symbol, price]);

  const handleTrade = async () => {
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrMsg('');
    try {
      await executeTrade({
        symbol,
        side,
        amount: qty,
        price: orderPrice,
        total: qty * orderPrice,
        type: 'limit',
      } as Parameters<typeof executeTrade>[0]);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (e: unknown) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'Trade failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

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
              <svg className="h-3 w-3 text-(--color-term-muted)" viewBox="0 0 12 12" fill="currentColor">
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

        {/* Status feedback */}
        {status === 'success' && (
          <p className="text-center text-[11px] text-(--color-term-positive) tracking-widest">
            ✓ Order submitted
          </p>
        )}
        {status === 'error' && (
          <p className="text-center text-[11px] text-(--color-term-negative) truncate" title={errMsg}>
            ✗ {errMsg || 'Trade failed'}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setSide('buy'); handleTrade(); }}
            disabled={status === 'submitting'}
            className={cn(
              'border border-sky-300/50 bg-sky-300/20 py-2 text-[12px] font-semibold tracking-widest text-sky-200 transition-colors',
              status === 'submitting' && side === 'buy'
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-sky-300/30',
            )}
          >
            {status === 'submitting' && side === 'buy' ? '…' : 'BUY'}
          </button>
          <button
            type="button"
            onClick={() => { setSide('sell'); handleTrade(); }}
            disabled={status === 'submitting'}
            className={cn(
              'border border-rose-300/50 bg-rose-300/20 py-2 text-[12px] font-semibold tracking-widest text-rose-200 transition-colors',
              status === 'submitting' && side === 'sell'
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-rose-300/30',
            )}
          >
            {status === 'submitting' && side === 'sell' ? '…' : 'SELL'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
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
