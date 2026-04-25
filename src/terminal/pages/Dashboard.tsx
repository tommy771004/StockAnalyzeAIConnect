import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, RefreshCw, Wifi, WifiOff, Plus, Trash2, X, Microscope } from 'lucide-react';
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
  const { 
    loading, isLive, watchlist, gainers, losers, candles, news, 
    selected, setSelected, selectedRow, refresh,
    addToWatchlist, removeFromWatchlist 
  } = data;

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 overflow-y-auto md:overflow-hidden pb-8 md:pb-0">
      {/* Left column */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3 md:min-h-0 shrink-0 md:shrink">
        <WatchlistPanel
          rows={watchlist}
          selected={selected}
          onSelect={setSelected}
          isLive={isLive}
          loading={loading}
          onRefresh={refresh}
          onAdd={addToWatchlist}
          onDelete={removeFromWatchlist}
        />
        <TopMoversPanel 
          gainers={gainers} 
          losers={losers} 
          loading={loading} 
          onSelect={setSelected}
        />
      </div>

      {/* Center column */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-6 md:min-h-0 shrink-0 md:shrink">
        <MarketPulsePanel watchlist={watchlist} onSelect={setSelected} />
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
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3 md:min-h-0 shrink-0 md:shrink">
        <MarketNewsPanel news={news} onSelect={setSelected} />
        <QuickTradePanel symbol={selectedRow.symbol} price={selectedRow.last} />
      </div>
    </div>
  );
}

// ─── WatchlistPanel ────────────────────────────────────────────────────────────
export function WatchlistPanel({
  rows,
  selected,
  onSelect,
  isLive,
  loading,
  onRefresh,
  onAdd,
  onDelete,
}: {
  rows: WatchlistRow[];
  selected: string;
  onSelect: (s: string) => void;
  isLive: boolean;
  loading: boolean;
  onRefresh: () => void;
  onAdd: (s: string) => Promise<void>;
  onDelete: (s: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newSymbol, setNewSymbol] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    await onAdd(newSymbol.trim());
    setNewSymbol('');
    setShowAdd(false);
  };

  return (
    <Panel
      title={t('dashboard.watchlist', 'WATCHLIST')}
      actions={
        <div className="flex items-center gap-2">
          {/* Add button */}
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className={cn("transition-colors", showAdd ? "text-(--color-term-accent)" : "text-(--color-term-muted) hover:text-(--color-term-accent)")}
          >
            <Plus className="h-4 w-4" />
          </button>
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
      bodyClassName="overflow-auto flex flex-col"
    >
      {showAdd && (
        <form onSubmit={handleAdd} className="flex border-b border-(--color-term-border) bg-black/20 p-2">
          <input
            autoFocus
            className="flex-1 bg-transparent px-2 text-[12px] font-bold tracking-widest text-(--color-term-text) focus:outline-none placeholder:text-(--color-term-muted)/50"
            placeholder={t('dashboard.enterTicker', 'ENTER TICKER...')}
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
          />
          <button type="submit" className="text-(--color-term-accent) px-2">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-(--color-term-muted) px-2">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      <table className="w-full text-[12px]">
        <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
          <tr className="border-b border-(--color-term-border)">
            <th className="px-3 py-3 text-left font-medium">SYM</th>
            <th className="px-3 py-3 text-right font-medium">LAST</th>
            <th className="px-3 py-3 text-right font-medium">CHG%</th>
            <th className="px-3 py-3 text-right font-medium w-8"></th>
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
                  'group cursor-pointer border-b border-(--color-term-border)/60 transition-colors',
                  isActive
                    ? 'bg-(--color-term-accent)/10 text-(--color-term-accent)'
                    : 'hover:bg-white/5',
                )}
              >
                <td className="px-3 py-3 font-semibold tracking-wider">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2',
                      isActive && 'border-l-2 border-(--color-term-accent) pl-2 -ml-2',
                    )}
                  >
                    {row.symbol}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.last > 0 ? row.last.toFixed(2) : '—'}
                </td>
                <td className={cn('px-3 py-3 text-right tabular-nums', toneClass(row.changePct))}>
                  {formatPct(row.changePct)}
                </td>
                <td className="px-3 py-3 text-right">
                   <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remove ${row.symbol}?`)) onDelete(row.symbol);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-rose-500/60 hover:text-rose-500 transition-all p-1"
                   >
                     <Trash2 className="h-3.5 w-3.5" />
                   </button>
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
export function TopMoversPanel({
  gainers,
  losers,
  loading,
  onSelect,
}: {
  gainers: { symbol: string; changePct: number }[];
  losers:  { symbol: string; changePct: number }[];
  loading: boolean;
  onSelect: (s: string) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = tab === 'gainers' ? gainers : losers;
  return (
    <Panel title={t('dashboard.topMovers', 'TOP MOVERS')} collapsible className="min-h-[220px]">
      <div className="flex border-b border-(--color-term-border) text-[11px] tracking-widest">
        {(['gainers', 'losers'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'flex-1 py-3 uppercase transition-colors',
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
          <li className="px-3 py-4 text-center text-[11px] text-(--color-term-muted)">{t('common.loading')}</li>
        ) : (
          rows.map((m) => (
            <li 
              key={m.symbol} 
              onClick={() => onSelect(m.symbol)}
              className="flex items-center justify-between px-3 py-3 text-[12px] hover:bg-white/5 cursor-pointer transition-colors group/mover"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    m.changePct >= 0 ? 'bg-(--color-term-positive)' : 'bg-(--color-term-negative)',
                  )}
                />
                <span className="font-semibold tracking-wider group-hover/mover:text-(--color-term-accent) transition-colors">{m.symbol}</span>
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
export function MarketPulsePanel({ watchlist, onSelect }: { watchlist: WatchlistRow[], onSelect: (s: string) => void }) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('dashboard.marketPulse', 'MARKET PULSE')}
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-positive)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" />
          LIVE
        </span>
      }
      className="h-[240px]"
      bodyClassName="p-2"
    >
      <Heatmap watchlist={watchlist} onSelect={onSelect} />
    </Panel>
  );
}

// ─── Dynamic Heatmap ────────────────────────────────────────────────────────
export function Heatmap({ watchlist, onSelect }: { watchlist: WatchlistRow[], onSelect: (s: string) => void }) {
  const { t } = useTranslation();
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
        <HeatCell cell={items[0]!} onSelect={onSelect} className="col-span-5 row-span-2" size="lg" />
        <HeatCell cell={items[1]!} onSelect={onSelect} className="col-span-3" />
        <HeatCell cell={items[2]!} onSelect={onSelect} className="col-span-4" />
        <HeatCell cell={items[3]!} onSelect={onSelect} className="col-span-7 row-span-2" size="lg" />
      </div>
      <div className="hidden grid-cols-12 gap-1" />
      <div className="grid grid-cols-12 gap-1">
        <HeatCell cell={items[4]!} onSelect={onSelect} className="col-span-6" />
        <HeatCell cell={items[5]!} onSelect={onSelect} className="col-span-6" />
      </div>
    </div>
  );
}

export function HeatCell({
  cell,
  className,
  onSelect,
  size = 'md',
}: {
  cell: { symbol: string; changePct: number };
  className?: string;
  onSelect: (s: string) => void;
  size?: 'md' | 'lg';
}) {
  const { t } = useTranslation();
  const isDummy = cell.symbol === '--';
  const shade = isDummy 
    ? 'bg-zinc-800/20' 
    : cell.changePct > 0.8
      ? 'bg-emerald-700/80 hover:bg-emerald-700 active:scale-[0.98]'
      : cell.changePct > 0
        ? 'bg-emerald-800/70 hover:bg-emerald-800 active:scale-[0.98]'
        : cell.changePct < -0.8
          ? 'bg-rose-700/80 hover:bg-rose-700 active:scale-[0.98]'
          : cell.changePct < 0
            ? 'bg-rose-800/70 hover:bg-rose-800 active:scale-[0.98]'
            : 'bg-zinc-700/70 hover:bg-zinc-700 active:scale-[0.98]';
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
export function SelectedChartPanel({
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
  const { t } = useTranslation();
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
        <button
          onClick={() => {
            sessionStorage.setItem('research-symbol', row.symbol);
            window.location.hash = 'research';
          }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-widest text-(--color-term-accent) border border-(--color-term-accent)/40 rounded-sm hover:bg-(--color-term-accent)/10 transition-colors"
          title="深入研究"
        >
          <Microscope className="h-3 w-3" />
          深入研究
        </button>
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
            {t('common.loading')}
          </div>
        ) : (
          <ChartWidget
            symbol={row.symbol}
            data={chartData}
            liveMode={isLive}
            timeframe={range}
            onTimeframeChange={(t) => setRange(t as any)}
          />
        )}
      </div>
    </Panel>
  );
}


// ─── MarketNewsPanel ───────────────────────────────────────────────────────────
export function MarketNewsPanel({ news, onSelect }: { news: DashboardNews[], onSelect: (s: string) => void }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<NewsCategory['id'] | 'ALL'>('ALL');
  
  const filteredNews = useMemo(() => {
    if (filter === 'ALL') return news;
    return news.filter(n => n.category === filter);
  }, [news, filter]);

  const cycleFilter = () => {
    const cats: Array<NewsCategory['id'] | 'ALL'> = ['ALL', 'MACRO', 'TECH', 'EARNINGS', 'CRYPTO'];
    const idx = cats.indexOf(filter);
    setFilter(cats[(idx + 1) % cats.length]);
  };

  return (
    <Panel
      title={`MARKET NEWS ${filter !== 'ALL' ? `(${filter})` : ''}`}
      actions={
        <button 
          onClick={cycleFilter}
          title="切換新聞類別"
          className="p-1 hover:bg-white/10 rounded-sm transition-colors text-(--color-term-accent)"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      }
      className="flex-1 min-h-[300px]"
      bodyClassName="overflow-auto"
    >
      {filteredNews.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-(--color-term-muted)">
          {t('dashboard.noRecentNews', 'No recent news')}
        </div>
      ) : (
        <ul className="divide-y divide-(--color-term-border)/60">
          {filteredNews.map((n) => {
            const cat = CATEGORY_STYLE[n.category] || CATEGORY_STYLE['TECH'];
            return (
              <li 
                key={n.id} 
                className="px-3 py-4 hover:bg-white/5 cursor-pointer transition-colors group/news"
                onClick={() => n.link && window.open(n.link, '_blank', 'noopener')}
              >
                <div className="mb-1.5 flex items-center justify-between text-[10px] tracking-widest">
                  <span className={cn('border px-1.5 py-0.5 uppercase', cat.className)}>
                    {cat.label}
                  </span>
                  <span className="text-(--color-term-muted)">{n.time}</span>
                </div>
                <p className="mb-1.5 text-[12.5px] font-medium leading-snug text-(--color-term-text) group-hover/news:text-(--color-term-accent) transition-colors">
                  {n.title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-(--color-term-muted)">
                  <span>Mentions:</span>
                  {n.tickers?.map((t, i) => (
                    <span key={t}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(t);
                        }}
                        className="text-(--color-term-positive) hover:underline hover:text-(--color-term-accent)"
                      >
                        {t}
                      </button>
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

export function QuickTradePanel({ symbol, price }: { symbol: string; price: number }) {
  const { t } = useTranslation();
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
          {t('dashboard.quickTrade', 'QUICK TRADE')}
        </span>
      </header>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Field label="">{symbol}</Field>
          <Field label="">
            <select 
              className="w-full h-full bg-transparent outline-none cursor-pointer appearance-none text-center"
              value="limit"
              onChange={() => {}}
            >
              <option value="limit">LMT</option>
              <option value="market">MKT</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput
            label={t('dashboard.quantity', 'QUANTITY')}
            value={qty}
            onChange={(v) => setQty(Number(v) || 0)}
          />
          <LabeledInput
            label={t('dashboard.price', 'PRICE')}
            value={orderPrice.toFixed(2)}
            onChange={(v) => setOrderPrice(Number(v) || 0)}
          />
        </div>
        <div className="flex items-center justify-between border-t border-(--color-term-border) pt-3 text-[11px]">
          <span className="tracking-widest text-(--color-term-muted)">{t('dashboard.estTotal', 'EST. TOTAL')}</span>
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
              'border border-sky-300/50 bg-sky-300/20 py-3 text-[12px] font-semibold tracking-widest text-sky-200 transition-colors',
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
              'border border-rose-300/50 bg-rose-300/20 py-3 text-[12px] font-semibold tracking-widest text-rose-200 transition-colors',
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
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] tracking-widest text-(--color-term-muted)">{label}</span>
      )}
      <div className="flex h-11 items-center justify-center border border-(--color-term-border) bg-(--color-term-surface) px-3 text-[13px] font-semibold tracking-widest text-(--color-term-text)">
        {children}
      </div>
    </div>
  );
}

export function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-widest text-(--color-term-muted)">{label}</span>
      <input
        className="h-11 border border-(--color-term-border) bg-(--color-term-surface) px-3 text-center text-[13px] tabular-nums text-(--color-term-text) focus:border-(--color-term-accent) focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
