import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Filter, RefreshCw, Plus, Trash2, X, Microscope, BarChart3 } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { formatPct, toneClass } from '../ui/format';
import { cn } from '../../lib/utils';
import type { NewsCategory, WatchlistRow, Mover, CandlePoint, DashboardNews } from '../types';
import { useDashboardData, type ChartRange } from '../hooks/useDashboardData';
import { executeTrade, getBest5, getTwSectorHeatmap, getBatchQuotes, type Best5Quote, type SectorHeatCell } from '../../services/api';
import { parseSymbol } from '../../utils/symbolParser';
import { summarizeDepth, sectorHeatClass } from './dashboardMarketUtils';
import ChartWidget from '../../components/ChartWidget';
import { DataStatusBadge } from '../ui/DataStatusBadge';
import { SmartMoneyRecentEventsPanel } from '../ui/SmartMoneyRecentEventsPanel';
import { canShowUsBrokerageSymbol } from '../../config/marketFeatures';

const CATEGORY_STYLE: Record<NewsCategory['id'], { className: string }> = {
  EARNINGS: { className: 'text-(--color-term-accent) border-(--color-term-accent)' },
  MACRO:    { className: 'text-(--color-term-positive) border-(--color-term-positive)' },
  ALERT:    { className: 'text-(--color-term-negative) border-(--color-term-negative)' },
  CRYPTO:   { className: 'text-violet-300 border-violet-400/60' },
  TECH:     { className: 'text-cyan-300 border-cyan-400/60' },
  ENERGY:   { className: 'text-amber-300 border-amber-400/60' },
};

function getNumberLocale(language: string): string {
  return language.startsWith('zh') ? 'zh-TW' : 'en-US';
}

function formatFixedLocale(value: number, locale: string, digits = 2): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState<ChartRange>('1W');
  const data = useDashboardData(range);
  const {
    loading, isLive, dataMode, watchlist, gainers, losers, candles, news, lastUpdated,
    selected, setSelected, selectedRow, refresh,
    addToWatchlist, removeFromWatchlist
  } = data;

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">
      <h1 className="sr-only">{t('nav.dashboard', 'Dashboard')}</h1>
      {/* Left column */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3 md:min-h-0 shrink-0 md:shrink">
        <WatchlistPanel
          rows={watchlist}
          selected={selected}
          onSelect={setSelected}
          dataMode={dataMode}
          lastUpdated={lastUpdated}
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
        <SectorHeatmapPanel symbol={selectedRow.symbol} dataMode={dataMode} lastUpdated={lastUpdated} />
        <SelectedChartPanel
          row={selectedRow}
          candles={candles}
          range={range}
          setRange={setRange}
          loading={loading}
          isLive={isLive}
          dataMode={dataMode}
          lastUpdated={lastUpdated}
        />
      </div>

      {/* Right column */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3 md:min-h-0 shrink-0 md:shrink">
        {['TW', 'TWO'].includes(parseSymbol(selectedRow.symbol).market)
          ? <Best5Panel symbol={selectedRow.symbol} />
          : <MarketNewsPanel news={news} onSelect={setSelected} />}
        <SmartMoneyRecentEventsPanel symbol={selectedRow.symbol} maxEvents={3} compact navigateOnEventClick />
        {canShowUsBrokerageSymbol(selectedRow.symbol) && (
          <QuickTradePanel symbol={selectedRow.symbol} price={selectedRow.last} />
        )}
      </div>
    </div>
  );
}

// ─── WatchlistPanel ────────────────────────────────────────────────────────────
export function WatchlistPanel({
  rows,
  selected,
  onSelect,
  dataMode,
  lastUpdated,
  loading,
  onRefresh,
  onAdd,
  onDelete,
}: {
  rows: WatchlistRow[];
  selected: string;
  onSelect: (s: string) => void;
  dataMode: 'LIVE' | 'DELAYED' | 'MOCK';
  lastUpdated: string | null;
  loading: boolean;
  onRefresh: () => void;
  onAdd: (s: string) => Promise<void>;
  onDelete: (s: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const [newSymbol, setNewSymbol] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const numberLocale = getNumberLocale(i18n.language);

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
             aria-label={t('dashboard.addSymbol', 'Add symbol')}
             className={cn("focus-ring inline-flex min-h-11 min-w-11 items-center justify-center", "motion-safe:transition-colors", showAdd ? "text-(--color-term-accent)" : "text-(--color-term-muted) hover:text-(--color-term-accent)")}
           >
             <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <DataStatusBadge mode={dataMode} lastUpdated={lastUpdated} />
          {/* Manual refresh */}
          <button
             type="button"
             title={t('dashboard.refresh', 'Refresh')}
             aria-label={t('dashboard.refresh', 'Refresh')}
            onClick={onRefresh}
            className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-accent) motion-safe:transition-colors"
          >
             <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      }
      className="flex-1 min-h-[260px]"
      bodyClassName="overflow-auto flex flex-col scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
    >
      {showAdd && (
        <form onSubmit={handleAdd} className="flex border-b border-(--color-term-border) bg-black/20 p-2">
          <input
            autoFocus
            className="flex-1 bg-transparent px-2 text-[12px] font-bold tracking-widest text-(--color-term-text) focus:outline-none placeholder:text-(--color-term-muted)/50"
             placeholder={t('dashboard.enterTicker', 'ENTER TICKER...')}
             aria-label={t('dashboard.enterTicker', 'Enter ticker')}
             name="watchlist-symbol"
             autoComplete="off"
             spellCheck={false}
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
          />
           <button type="submit" aria-label={t('dashboard.addSymbol', 'Add symbol')} className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center text-(--color-term-accent)">
             <Plus className="h-4 w-4" aria-hidden="true" />
           </button>
           <button type="button" onClick={() => setShowAdd(false)} aria-label={t('common.close', 'Close')} className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center text-(--color-term-muted)">
             <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      )}

      <div className="overflow-x-auto w-full scrollbar-thin scroll-shadow-x">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
            <tr className="border-b border-(--color-term-border)">
              <th className="px-3 py-3 text-left font-medium whitespace-nowrap">{t('dashboard.symbolHeader', 'SYM')}</th>
              <th className="px-3 py-3 text-right font-medium whitespace-nowrap">{t('dashboard.lastHeader', 'LAST')}</th>
              <th className="px-3 py-3 text-right font-medium whitespace-nowrap">{t('dashboard.changeHeader', 'CHG%')}</th>
              <th className="px-3 py-3 text-right font-medium w-8 whitespace-nowrap"></th>
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
                  <td className="px-3 py-3 font-semibold tracking-wider whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={t('dashboard.openSymbol', 'Open {{symbol}}', { symbol: row.symbol })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row.symbol);
                      }}
                      className={cn(
                        'focus-ring inline-flex items-center gap-2 text-left',
                        isActive && 'border-l-2 border-(--color-term-accent) pl-2 -ml-2',
                      )}
                    >
                      <span className="flex flex-col leading-tight">
                        <span>{row.symbol}</span>
                        {row.name && /\.(TW|TWO)$/i.test(row.symbol) && (
                          <span className="text-[10px] font-normal text-(--color-term-muted) tracking-normal truncate max-w-[80px] sm:max-w-[120px] block">
                            {row.name}
                          </span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    {row.last > 0 ? formatFixedLocale(row.last, numberLocale) : '—'}
                  </td>
                  <td className={cn('px-3 py-3 text-right tabular-nums whitespace-nowrap', toneClass(row.changePct))}>
                    {formatPct(row.changePct)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                     <button
                       type="button"
                       aria-label={t('dashboard.removeSymbol', 'Remove {{symbol}}', { symbol: row.symbol })}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirm({
                          message: t('dashboard.removeSymbolConfirm', 'Remove {{symbol}}?', { symbol: row.symbol }),
                          confirmLabel: t('common.remove', 'Remove'),
                          destructive: true,
                        })) onDelete(row.symbol);
                      }}
                      className="focus-ring opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-rose-500/60 hover:text-rose-500 motion-safe:transition-all p-1"
                     >
                       <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                     </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  gainers: Mover[];
  losers:  Mover[];
  loading: boolean;
  onSelect: (s: string) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = tab === 'gainers' ? gainers : losers;
  return (
    <Panel title={t('dashboard.topMovers', 'TOP MOVERS')} collapsible className="min-h-[220px]" bodyClassName="overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent flex flex-col min-h-0 max-h-[300px] lg:max-h-none">
      <div className="flex border-b border-(--color-term-border) text-[11px] tracking-widest">
        {(['gainers', 'losers'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'focus-ring flex-1 py-3 uppercase motion-safe:transition-colors',
              tab === k
                ? 'text-(--color-term-accent) border-b-2 border-(--color-term-accent)'
                : 'text-(--color-term-muted) hover:text-(--color-term-text)',
            )}
          >
            {k === 'gainers' ? t('dashboard.gainers', 'GAINERS') : t('dashboard.losers', 'LOSERS')}
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
              className="flex items-center justify-between px-3 py-3 text-[12px] cursor-pointer transition-all group/mover hover:bg-white/[0.04]"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full transition-all',
                    m.changePct >= 0 ? 'bg-emerald-400' : 'bg-rose-400',
                  )}
                  style={{
                    boxShadow: m.changePct >= 0 ? '0 0 6px rgba(52,211,153,0.6)' : '0 0 6px rgba(248,113,113,0.6)',
                  }}
                />
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold tracking-wider group-hover/mover:text-(--color-term-accent) transition-colors">{m.symbol}</span>
                  {m.name && /\.(TW|TWO)$/i.test(m.symbol) && (
                    <span className="text-[10px] font-normal text-(--color-term-muted) tracking-normal">{m.name}</span>
                  )}
                </span>
              </span>
              <span className={`${toneClass(m.changePct)} tabular-nums font-bold`}>
                {formatPct(m.changePct, 1)}
              </span>
            </li>
          ))
        )}
      </ul>
    </Panel>
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
  dataMode,
  lastUpdated,
}: {
  row: WatchlistRow;
  candles: CandlePoint[];
  range: ChartRange;
  setRange: (r: ChartRange) => void;
  loading: boolean;
  isLive: boolean;
  dataMode: 'LIVE' | 'DELAYED' | 'MOCK';
  lastUpdated: string | null;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const numberLocale = getNumberLocale(i18n.language);
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
          {row.name && /\.(TW|TWO)$/i.test(row.symbol) && (
            <span className="text-[11px] text-(--color-term-muted) tracking-normal">{row.name}</span>
          )}
          <DataStatusBadge mode={dataMode} lastUpdated={lastUpdated} compact />
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem('research-symbol', row.symbol);
            navigate('/research');
          }}
          className="focus-ring flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-widest text-(--color-term-accent) border border-(--color-term-accent)/40 rounded-sm hover:bg-(--color-term-accent)/10 motion-safe:transition-colors"
          title={t('dashboard.deepResearch', '深入研究')}
        >
          <Microscope className="h-3 w-3" />
          {t('dashboard.deepResearch', '深入研究')}
        </button>
      </header>

      {/* OHLC summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 text-[10px] sm:text-[11px] text-(--color-term-muted)">
        <div className="flex flex-wrap gap-2.5 sm:gap-4 tabular-nums">
          <span>
            <span className="text-(--color-term-muted)/70 mr-0.5">{t('dashboard.ohlcOpen', 'O')}</span>
            <span className="text-(--color-term-text)">{formatFixedLocale(open, numberLocale)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-0.5">{t('dashboard.ohlcHigh', 'H')}</span>
            <span className="text-(--color-term-text)">{formatFixedLocale(high, numberLocale)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-0.5">{t('dashboard.ohlcLow', 'L')}</span>
            <span className="text-(--color-term-text)">{formatFixedLocale(low, numberLocale)}</span>
          </span>
          <span>
            <span className="text-(--color-term-muted)/70 mr-0.5">{t('dashboard.ohlcClose', 'C')}</span>
            <span className="text-(--color-term-text)">{formatFixedLocale(close, numberLocale)}</span>
          </span>
        </div>
        <span className={cn(toneClass(changeAbs), "whitespace-nowrap font-mono")}>
          {`${changeAbs > 0 ? '+' : ''}${formatFixedLocale(Math.abs(changeAbs), numberLocale)} (${formatPct(changePct)})`}
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
  const categoryLabels: Record<NewsCategory['id'] | 'ALL', string> = {
    ALL: t('dashboard.newsCategory.all', 'ALL'),
    EARNINGS: t('dashboard.newsCategory.earnings', 'EARNINGS'),
    MACRO: t('dashboard.newsCategory.macro', 'MACRO'),
    ALERT: t('dashboard.newsCategory.alert', 'ALERT'),
    CRYPTO: t('dashboard.newsCategory.crypto', 'CRYPTO'),
    TECH: t('dashboard.newsCategory.tech', 'TECH'),
    ENERGY: t('dashboard.newsCategory.energy', 'ENERGY'),
  };
  
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
      title={`${t('dashboard.marketNews', 'MARKET NEWS')} ${filter !== 'ALL' ? `(${categoryLabels[filter]})` : ''}`}
      actions={
        <button 
          onClick={cycleFilter}
          title={t('dashboard.cycleNewsCategory', '切換新聞類別')}
          className="focus-ring p-1 hover:bg-white/10 rounded-sm motion-safe:transition-colors text-(--color-term-accent)"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      }
      className="flex-1 min-h-[300px]"
      bodyClassName="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
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
                    {categoryLabels[n.category]}
                  </span>
                  <span className="text-(--color-term-muted)">{n.time}</span>
                </div>
                <p className="mb-1.5 text-[12.5px] font-medium leading-snug text-(--color-term-text) group-hover/news:text-(--color-term-accent) transition-colors break-words text-pretty">
                  {n.title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-(--color-term-muted)">
                  <span>{t('dashboard.mentions', 'Mentions')}:</span>
                  {n.tickers?.map((t, i) => (
                    <span key={t}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(t);
                        }}
                        className="focus-ring text-(--color-term-positive) hover:underline hover:text-(--color-term-accent)"
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

// ─── Best5Panel (即時五檔 / DOM) ────────────────────────────────────────────────
export function Best5Panel({ symbol }: { symbol: string }) {
  const { t, i18n } = useTranslation();
  const numberLocale = getNumberLocale(i18n.language);
  const [best5, setBest5] = useState<Best5Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const b = await getBest5(symbol); if (alive) setBest5(b); }
      catch { if (alive) setBest5(null); }
      finally { if (alive) setLoading(false); }
    };
    setLoading(true);
    load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol]);

  const asks = best5?.asks ?? [];
  const bids = best5?.bids ?? [];
  const hasDepth = asks.length > 0 || bids.length > 0;
  const { buyPct, sellPct } = summarizeDepth(asks, bids);
  const maxSize = Math.max(1, ...asks.map(l => l.size), ...bids.map(l => l.size));

  const Row = ({ level, side }: { level: { price: number; size: number }; side: 'ask' | 'bid' }) => (
    <div className="relative flex items-center justify-between px-3 py-1.5 text-[11px] tabular-nums">
      <span
        className={cn('absolute inset-y-0 right-0', side === 'ask' ? 'bg-rose-500/10' : 'bg-emerald-500/10')}
        style={{ width: `${(level.size / maxSize) * 100}%` }}
        aria-hidden="true"
      />
      <span className={cn('relative z-10 font-semibold', side === 'ask' ? 'text-rose-300' : 'text-emerald-300')}>
        {formatFixedLocale(level.price, numberLocale)}
      </span>
      <span className="relative z-10 text-(--color-term-muted)">{level.size}</span>
    </div>
  );

  return (
    <Panel
      title={t('dashboard.best5.title', '即時五檔')}
      icon={<BarChart3 className="h-3 w-3" aria-hidden="true" />}
      className="flex-1 min-h-[300px]"
      bodyClassName="flex flex-col overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
    >
      {!hasDepth ? (
        <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-[11px] text-(--color-term-muted)">
          {loading ? t('common.loading', '載入中...') : t('dashboard.best5.empty', '目前非交易時段或無五檔資料')}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-1 text-[9px] tracking-widest text-(--color-term-muted) uppercase border-b border-(--color-term-border)/60">
            <span>{t('dashboard.best5.price', '價格')}</span>
            <span>{t('dashboard.best5.size', '張數')}</span>
          </div>
          <div className="flex flex-col-reverse">
            {asks.map((l, i) => <Row key={`a${i}`} level={l} side="ask" />)}
          </div>
          <div className="border-y border-(--color-term-border) px-3 py-1.5 text-center text-[12px] font-bold tabular-nums text-(--color-term-accent)">
            {best5 ? formatFixedLocale(best5.price, numberLocale) : '—'}
          </div>
          <div className="flex flex-col">
            {bids.map((l, i) => <Row key={`b${i}`} level={l} side="bid" />)}
          </div>
          {/* Buy% / Sell% bar */}
          <div className="mt-2 px-3 pb-3">
            <div className="flex h-2 overflow-hidden rounded-full">
              <span className="bg-emerald-500/70" style={{ width: `${buyPct}%` }} />
              <span className="bg-rose-500/70" style={{ width: `${sellPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[9px] tracking-widest text-(--color-term-muted)">
              <span className="text-emerald-300">{t('dashboard.best5.buyPct', '買')} {buyPct}%</span>
              <span className="text-rose-300">{t('dashboard.best5.sellPct', '賣')} {sellPct}%</span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── SectorHeatmapPanel (市場熱點 → 類股熱力圖) ──────────────────────────────────
const US_SECTOR_ETFS: { etf: string; label: string }[] = [
  { etf: 'XLK', label: 'TECHNOLOGY' },
  { etf: 'XLC', label: 'COMMUNICATION' },
  { etf: 'XLY', label: 'CONSUMER CYCLICAL' },
  { etf: 'XLF', label: 'FINANCIALS' },
  { etf: 'XLV', label: 'HEALTHCARE' },
  { etf: 'XLI', label: 'INDUSTRIALS' },
  { etf: 'XLP', label: 'CONSUMER DEFENSIVE' },
  { etf: 'XLE', label: 'ENERGY' },
  { etf: 'XLRE', label: 'REAL ESTATE' },
  { etf: 'XLU', label: 'UTILITIES' },
  { etf: 'XLB', label: 'MATERIALS' },
];

export function SectorHeatmapPanel({
  symbol,
  dataMode,
  lastUpdated,
}: {
  symbol: string;
  dataMode: 'LIVE' | 'DELAYED' | 'MOCK';
  lastUpdated: string | null;
}) {
  const { t } = useTranslation();
  const isTw = ['TW', 'TWO'].includes(parseSymbol(symbol).market);
  const [cells, setCells] = useState<SectorHeatCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (isTw) {
          const c = await getTwSectorHeatmap();
          if (alive) setCells(c);
        } else {
          const quotes = await getBatchQuotes(US_SECTOR_ETFS.map(s => s.etf));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const qMap = new Map(quotes.filter(Boolean).map((q: any) => [q.symbol, q]));
          if (alive) setCells(US_SECTOR_ETFS.map(s => ({
            id: s.etf,
            name: s.label,
            changePct: qMap.get(s.etf)?.regularMarketChangePercent ?? 0,
          })));
        }
      } catch { if (alive) setCells([]); }
      finally { if (alive) setLoading(false); }
    };
    setLoading(true);
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [isTw]);

  return (
    <Panel
      title={t('dashboard.sectorHeatmap.title', '類股熱力圖')}
      actions={<DataStatusBadge mode={dataMode} lastUpdated={lastUpdated} />}
      className="h-[240px]"
      bodyClassName="p-2 flex flex-col"
    >
      {cells.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[10px] text-(--color-term-muted)">
          {loading ? t('common.loading', '載入中...') : t('dashboard.sectorHeatmap.unavailable', '類股資料暫不可用')}
        </div>
      ) : (
        <>
          <div className="grid flex-1 grid-cols-3 gap-1">
            {cells.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'flex flex-col items-center justify-center rounded-md p-1.5 text-center text-white/90',
                  sectorHeatClass(c.changePct, isTw),
                )}
              >
                <span className="text-[9.5px] font-bold leading-tight tracking-wide line-clamp-1">{c.name}</span>
                <span className="text-[10px] font-medium tabular-nums">{formatPct(c.changePct)}</span>
              </div>
            ))}
          </div>
          {/* Color scale legend */}
          <div className="mt-1.5 flex items-center justify-center gap-1 text-[8px] text-(--color-term-muted)">
            <span>-2%</span>
            <span className={cn('h-1.5 w-6 rounded-sm', isTw ? 'bg-emerald-700/70' : 'bg-rose-700/70')} />
            <span className="h-1.5 w-6 rounded-sm bg-zinc-700/40" />
            <span className={cn('h-1.5 w-6 rounded-sm', isTw ? 'bg-rose-700/70' : 'bg-emerald-700/70')} />
            <span>+2%</span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── QuickTradePanel ──────────────────────────────────────────────────────────
type TradeStatus = 'idle' | 'submitting' | 'success' | 'error';

export function QuickTradePanel({ symbol, price }: { symbol: string; price: number }) {
  const { t, i18n } = useTranslation();
  const [qty, setQty]           = useState(100);
  const [orderPrice, setOrderPrice] = useState(price);
  const [side, setSide]         = useState<'buy' | 'sell'>('buy');
  const [status, setStatus]     = useState<TradeStatus>('idle');
  const [errMsg, setErrMsg]     = useState('');
  const total = qty * orderPrice;
  const numberLocale = getNumberLocale(i18n.language);

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
      setErrMsg(e instanceof Error ? e.message : t('dashboard.tradeFailed', 'Trade failed'));
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <Panel accent="amber" className="min-h-[260px]" bodyClassName="overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent min-h-0 max-h-[360px] lg:max-h-none">
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
            ${total.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Status feedback */}
        {status === 'success' && (
          <p className="text-center text-[11px] text-(--color-term-positive) tracking-widest">
            ✓ {t('dashboard.orderSubmitted', 'Order submitted')}
          </p>
        )}
        {status === 'error' && (
          <p className="text-center text-[11px] text-(--color-term-negative) truncate" title={errMsg}>
            ✗ {errMsg || t('dashboard.tradeFailed', 'Trade failed')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setSide('buy'); handleTrade(); }}
            disabled={status === 'submitting'}
            className={cn(
              'focus-ring relative overflow-hidden py-3 text-[12px] font-bold tracking-widest transition-all rounded-sm',
              'border border-sky-400/50 bg-sky-400/15 text-sky-200',
              status === 'submitting' && side === 'buy'
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-sky-400/25 hover:border-sky-400/70 hover:shadow-[0_0_12px_rgba(56,189,248,0.25)]',
            )}
          >
            {status !== 'submitting' && (
              <span className="absolute inset-0 shimmer-btn opacity-50 pointer-events-none" />
            )}
            <span className="relative z-10">
              {status === 'submitting' && side === 'buy' ? '…' : t('dashboard.buy', 'BUY')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setSide('sell'); handleTrade(); }}
            disabled={status === 'submitting'}
            className={cn(
              'focus-ring relative overflow-hidden py-3 text-[12px] font-bold tracking-widest transition-all rounded-sm',
              'border border-rose-400/50 bg-rose-400/15 text-rose-200',
              status === 'submitting' && side === 'sell'
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-rose-400/25 hover:border-rose-400/70 hover:shadow-[0_0_12px_rgba(251,113,133,0.25)]',
            )}
          >
            {status !== 'submitting' && (
              <span className="absolute inset-0 shimmer-btn opacity-50 pointer-events-none" />
            )}
            <span className="relative z-10">
              {status === 'submitting' && side === 'sell' ? '…' : t('dashboard.sell', 'SELL')}
            </span>
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
