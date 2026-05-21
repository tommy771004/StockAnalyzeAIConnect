import React, { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownUp, BellRing, ExternalLink,
  Filter, Landmark, Loader2, RefreshCw, Search,
} from 'lucide-react';
import { StockSymbolAutocomplete } from '../../components/common/StockSymbolAutocomplete';
import { Panel } from '../ui/Panel';
import { InsiderTradesPanel } from '../ui/InsiderTradesPanel';
import { SmartMoney13FPanel } from '../ui/SmartMoney13FPanel';
import { SmartMoneyAlertSettingsPanel } from '../ui/SmartMoneyAlertSettingsPanel';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';
import type { SmartMoneyAlertEvent } from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type EventTypeFilter = 'all' | '13f_new_position' | 'insider_large_buy';
type SortOrder = 'date' | 'amount';

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_AMOUNT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0,          label: '不限' },
  { value: 10_000,     label: '$10K+' },
  { value: 50_000,     label: '$50K+' },
  { value: 100_000,    label: '$100K+' },
  { value: 500_000,    label: '$500K+' },
  { value: 1_000_000,  label: '$1M+' },
];

const SOURCE_LINKS = [
  {
    title: 'SEC / EDGAR',
    href: 'https://www.sec.gov/edgar/search/',
    descriptionKey: 'smartMoney.sourceEdgarDescription',
    fallback: '直接查看 13F 與 Form 4 原始申報，確認最新申報日期與披露內容。',
  },
  {
    title: 'WhaleWisdom / Dataroma',
    href: 'https://whalewisdom.com/',
    descriptionKey: 'smartMoney.source13fDescription',
    fallback: '把 13F 原始文件整理成可讀的機構持倉與新建倉列表，方便追蹤高信念買入。',
  },
  {
    title: 'OpenInsider',
    href: 'https://openinsider.com/',
    descriptionKey: 'smartMoney.sourceOpenInsiderDescription',
    fallback: '聚焦公開市場內部人買賣與大額交易，快速辨識 cluster buying。',
  },
  {
    title: 'Finviz',
    href: 'https://finviz.com/',
    descriptionKey: 'smartMoney.sourceFinvizDescription',
    fallback: '用圖表與基本面條件交叉驗證 insider / 13F 訊號，避免只靠單一來源追價。',
  },
];

const PLAYBOOK = [
  {
    titleKey: 'smartMoney.playbook13fTitle',
    bodyKey: 'smartMoney.playbook13fBody',
    fallbackTitle: '優先看新建倉',
    fallbackBody: '13F 最有價值的是最新新建倉，不是多年持有的第一大重倉。',
    icon: Landmark,
  },
  {
    titleKey: 'smartMoney.playbookInsiderTitle',
    bodyKey: 'smartMoney.playbookInsiderBody',
    fallbackTitle: '聚焦大額買入',
    fallbackBody: '單筆 10 萬美元以上且為公開市場買入的 insider trades，訊號最乾淨。',
    icon: BellRing,
  },
  {
    titleKey: 'smartMoney.playbookTimingTitle',
    bodyKey: 'smartMoney.playbookTimingBody',
    fallbackTitle: '用技術面決定時機',
    fallbackBody: '13F 可能延遲 45 天，先用資金流找方向，再用 K 線與結構決定進場。',
    icon: AlertTriangle,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatAmount(amountUsd: number | null, locale: string): string {
  if (amountUsd == null) return '---';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amountUsd >= 1_000 ? 2 : 0,
  }).format(amountUsd);
}

// ── EventRow ──────────────────────────────────────────────────────────────────
function EventRow({
  event,
  locale,
  isActive,
  onSelect,
  onOpenResearch,
}: {
  event: SmartMoneyAlertEvent;
  locale: string;
  isActive: boolean;
  onSelect: (event: SmartMoneyAlertEvent) => void;
  onOpenResearch: (symbol: string) => void;
}) {
  const { t } = useTranslation();
  const is13f = event.type === '13f_new_position';

  return (
    <li className={cn(
      'flex items-start gap-3 px-4 py-3 transition-colors',
      isActive ? 'bg-emerald-500/5' : 'hover:bg-white/5',
    )}>
      <span className={cn(
        'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest',
        is13f
          ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      )}>
        {is13f
          ? t('smartMoney.recentBadge13f', '13F')
          : t('smartMoney.recentBadgeBuy', 'BUY')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[12px] font-semibold text-(--color-term-text) break-words text-pretty">{event.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] text-(--color-term-muted) break-words text-pretty">{event.summary}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-(--color-term-muted)">
          <span>{new Date(event.eventDate).toLocaleDateString(locale)}</span>
          {event.amountUsd != null && (
            <span className="font-mono">{formatAmount(event.amountUsd, locale)}</span>
          )}
          {event.managerName && <span>· {event.managerName}</span>}
          {event.insiderName && <span>· {event.insiderName}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {event.symbol && (
          <button
            type="button"
            onClick={() => onSelect(event)}
            className={cn(
              'focus-ring rounded border px-1.5 py-0.5 sm:px-2 sm:py-1 text-[9px] sm:text-[10px] font-bold tracking-wider transition-colors',
              isActive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent)/30 hover:text-(--color-term-accent)',
            )}
            title={t('smartMoney.pageClickSymbol', '點擊設為觀察標的')}
          >
            {event.symbol}
          </button>
        )}
        {event.symbol && (
          <button
            type="button"
            onClick={() => onOpenResearch(event.symbol!)}
            className="focus-ring text-(--color-term-muted) hover:text-(--color-term-accent)"
            title={t('smartMoney.openResearch', '前往 Research：{{symbol}}', { symbol: event.symbol })}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-(--color-term-muted) hover:text-(--color-term-accent)"
          title={t('smartMoney.openSource', '開啟來源')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </li>
  );
}

// ── SmartMoneyPage ────────────────────────────────────────────────────────────
export function SmartMoneyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';

  // ── 1. Fetch all data ──────────────────────────────────────────────────────
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['smart-money-summary'],
    queryFn: api.getSmartMoneyConfig,
    refetchInterval: 5 * 60_000,
  });

  // ── 2. Filter state ────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter]     = useState<EventTypeFilter>('all');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [minAmount, setMinAmount]       = useState(0);
  const [withSymbolOnly, setWithSymbolOnly] = useState(false);
  const [sortOrder, setSortOrder]       = useState<SortOrder>('date');

  // Active symbol drives the 13F detail & Insider panel below
  const [activeSymbol, setActiveSymbol] = useState('NVDA');
  const [symbolInput, setSymbolInput]   = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      const symbol = (event as CustomEvent<string>).detail;
      if (!symbol) return;
      setActiveSymbol(symbol.toUpperCase());
      setSymbolInput('');
    };
    window.addEventListener('symbol-search', handler);
    return () => window.removeEventListener('symbol-search', handler);
  }, []);

  // ── 3. Apply filters ───────────────────────────────────────────────────────
  const allEvents: SmartMoneyAlertEvent[] = data?.recentEvents ?? [];

  const filteredEvents = useMemo<SmartMoneyAlertEvent[]>(() => {
    const q = symbolFilter.trim().toLowerCase();
    return allEvents
      .filter((e) => typeFilter === 'all' || e.type === typeFilter)
      .filter((e) => !withSymbolOnly || !!e.symbol)
      .filter((e) => {
        if (!q) return true;
        return (
          e.symbol?.toLowerCase().includes(q) ||
          e.issuer?.toLowerCase().includes(q) ||
          e.managerName?.toLowerCase().includes(q) ||
          e.insiderName?.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q)
        );
      })
      .filter((e) => minAmount === 0 || (e.amountUsd != null && e.amountUsd >= minAmount))
      .sort((a, b) =>
        sortOrder === 'amount'
          ? (b.amountUsd ?? 0) - (a.amountUsd ?? 0)
          : new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
      );
  }, [allEvents, typeFilter, symbolFilter, withSymbolOnly, minAmount, sortOrder]);

  const stats = useMemo(() => ({
    total: filteredEvents.length,
    new13f: filteredEvents.filter((e: SmartMoneyAlertEvent) => e.type === '13f_new_position').length,
    insider: filteredEvents.filter((e: SmartMoneyAlertEvent) => e.type === 'insider_large_buy').length,
  }), [filteredEvents]);

  function handleEventSelect(event: SmartMoneyAlertEvent) {
    if (!event.symbol) return;
    setActiveSymbol(event.symbol.toUpperCase());
  }

  function openResearch(symbol: string) {
    sessionStorage.setItem('research-symbol', symbol);
    navigate('/research');
  }

  const scanStatus = data?.lastScanAt
    ? new Date(data.lastScanAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    : t('smartMoney.recentNotScanned', '尚未掃描');

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 md:gap-6 overflow-auto pb-20 md:pb-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="col-span-12 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-balance">{t('smartMoney.pageTitle', '聰明錢追蹤')}</h1>
          <p className="mt-1 text-sm text-(--color-term-muted) text-pretty">
            {t('smartMoney.pageSubtitle', '把 Follow.md 的 13F、內部人交易與基金追蹤流程集中成單一工作台。')}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-(--color-term-muted)">
          <span>{t('smartMoney.recentLastScan', '最近掃描：{{value}}', { value: scanStatus })}</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="focus-ring flex items-center gap-1.5 rounded border border-(--color-term-border) px-3 py-1.5 text-[11px] text-(--color-term-muted) hover:text-(--color-term-text) disabled:opacity-40"
          >
            {isFetching
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
            {t('smartMoney.pageRefetch', '更新資料')}
          </button>
        </div>
      </div>

      {/* ── Events panel: fetch + filter + list ───────────────────────────── */}
      <div className="col-span-12">
        <Panel
          title={t('smartMoney.pageEventsTitle', '事件流')}
          icon={<Filter className="h-4 w-4" aria-hidden="true" />}
          bodyClassName="flex flex-col"
        >
          {/* Filter toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-(--color-term-border) px-4 py-3">
            {/* Type tabs */}
            <div className="flex rounded border border-(--color-term-border) bg-(--color-term-surface) p-0.5 gap-0.5">
              {((['all', '13f_new_position', 'insider_large_buy'] as const)).map((v) => {
                const labels: Record<EventTypeFilter, string> = {
                  all: t('smartMoney.filterTypeAll', '全部'),
                  '13f_new_position': t('smartMoney.filterType13f', '13F'),
                  insider_large_buy: t('smartMoney.filterTypeInsider', 'Insider'),
                };
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTypeFilter(v)}
                    className={cn(
                      'focus-ring rounded px-2.5 py-1 text-[10px] font-bold tracking-widest transition-colors',
                      typeFilter === v
                        ? 'bg-(--color-term-accent) text-black'
                        : 'text-(--color-term-muted) hover:text-(--color-term-text)',
                    )}
                  >
                    {labels[v]}
                  </button>
                );
              })}
            </div>

            {/* Keyword filter */}
            <div className="relative flex-1 min-w-[140px] max-w-[200px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-(--color-term-muted)" />
              <input
                type="text"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                placeholder={t('smartMoney.pageFilterSymbol', '代號 / 名稱...')}
                className="h-7 w-full rounded border border-(--color-term-border) bg-(--color-term-panel) pl-6 pr-2 text-[11px] text-(--color-term-text) placeholder:text-(--color-term-muted) outline-none focus:border-(--color-term-accent)"
              />
            </div>

            {/* Min amount */}
            <select
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              className="h-7 rounded border border-(--color-term-border) bg-(--color-term-panel) px-2 text-[11px] text-(--color-term-muted) outline-none focus:border-(--color-term-accent) appearance-none"
              aria-label={t('smartMoney.pageFilterMinAmount', '最低金額')}
            >
              {MIN_AMOUNT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-(--color-term-panel)">
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Symbol-only toggle */}
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-(--color-term-muted) select-none">
              <input
                type="checkbox"
                checked={withSymbolOnly}
                onChange={(e) => setWithSymbolOnly(e.target.checked)}
                className="rounded"
              />
              {t('smartMoney.pageFilterWithSymbol', '有代號')}
            </label>

            {/* Sort */}
            <button
              type="button"
              onClick={() => setSortOrder((prev) => prev === 'date' ? 'amount' : 'date')}
              className="focus-ring flex items-center gap-1 rounded border border-(--color-term-border) px-2 py-1 text-[10px] text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
              title={sortOrder === 'date'
                ? t('smartMoney.pageFilterSortAmount', '切換：金額最高優先')
                : t('smartMoney.pageFilterSortDate', '切換：最新優先')}
            >
              <ArrowDownUp className="h-3 w-3" />
              {sortOrder === 'date'
                ? t('smartMoney.filterSortDate', '最新優先')
                : t('smartMoney.filterSortAmount', '金額最高')}
            </button>

            <div className="ml-auto text-[10px] text-(--color-term-muted) tabular-nums">
              {t('smartMoney.pageEventsCount', '{{filtered}} / {{total}} 筆', {
                filtered: stats.total,
                total: allEvents.length,
              })}
              {stats.new13f > 0 && (
                <span className="ml-2 text-sky-300">13F ×{stats.new13f}</span>
              )}
              {stats.insider > 0 && (
                <span className="ml-2 text-emerald-300">Insider ×{stats.insider}</span>
              )}
            </div>
          </div>

          {/* Events list */}
          {isLoading && !data && (
            <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-(--color-term-muted)">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('smartMoney.recentSyncing', '正在同步 Smart Money 事件...')}
            </div>
          )}

          {error && (
            <div className="p-4 text-[12px] text-rose-400">{(error as Error).message}</div>
          )}

          {data && !data.settings.enabled && (
            <div className="px-4 py-6 text-center text-[12px] text-(--color-term-muted)">
              {t('smartMoney.recentDisabled', 'Smart Money 背景監控目前未啟用，可在 Alerts 頁開啟。')}
            </div>
          )}

          {data && data.settings.enabled && filteredEvents.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-(--color-term-muted)">
              {allEvents.length === 0
                ? t('smartMoney.recentEmpty', '目前沒有最近的 Smart Money 事件。')
                : t('smartMoney.pageNoMatchEvents', '沒有符合篩選條件的事件。')}
            </div>
          )}

          {data && data.settings.enabled && filteredEvents.length > 0 && (
            <ul className="divide-y divide-(--color-term-border)/60 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent" style={{ maxHeight: '420px' }}>
              {filteredEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  locale={locale}
                  isActive={!!event.symbol && event.symbol.toUpperCase() === activeSymbol}
                  onSelect={handleEventSelect}
                  onOpenResearch={openResearch}
                />
              ))}
            </ul>
          )}

          {/* Active symbol indicator */}
          {activeSymbol && (
            <div className="flex items-center gap-2 border-t border-(--color-term-border) bg-(--color-term-surface)/50 px-4 py-2 text-[10px] text-(--color-term-muted)">
              <span>{t('smartMoney.pageActiveSymbol', '目前觀察標的：')}</span>
              <span className="font-mono font-bold text-(--color-term-accent)">{activeSymbol}</span>
              <span>·</span>
              <StockSymbolAutocomplete
                value={symbolInput}
                onValueChange={setSymbolInput}
                onSymbolSubmit={(sym) => {
                  if (!sym) return;
                  setActiveSymbol(sym.toUpperCase());
                  setSymbolInput('');
                }}
                placeholder={t('smartMoney.pageSymbolPlaceholder', '搜尋美股代號...')}
                inputClassName="h-6 rounded border border-(--color-term-border) bg-(--color-term-panel) px-2 text-[11px] text-(--color-term-text) outline-none focus:border-(--color-term-accent) w-[110px] sm:w-[180px]"
              />
            </div>
          )}
        </Panel>
      </div>

      {/* ── 13F + Insider detail ───────────────────────────────────────────── */}
      <div className="col-span-12 xl:col-span-6 min-h-0">
        <SmartMoney13FPanel />
      </div>

      <div className="col-span-12 xl:col-span-6 min-h-0">
        <InsiderTradesPanel symbol={activeSymbol} />
      </div>

      {/* ── Sources ───────────────────────────────────────────────────────── */}
      <div className="col-span-12">
        <Panel
          title={t('smartMoney.pageSourcesTitle', '資料來源')}
          icon={<Landmark className="h-4 w-4" aria-hidden="true" />}
          bodyClassName="p-4"
          collapsible
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SOURCE_LINKS.map((source) => (
              <a
                key={source.title}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-(--color-term-border) bg-(--color-term-surface) p-3 transition-colors hover:border-(--color-term-accent)/40 hover:bg-(--color-term-accent)/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-(--color-term-text)">{source.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-(--color-term-muted) group-hover:text-(--color-term-accent)" aria-hidden="true" />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-(--color-term-muted)">
                  {t(source.descriptionKey, source.fallback)}
                </p>
              </a>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {PLAYBOOK.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.titleKey} className="rounded-xl border border-(--color-term-border) bg-(--color-term-surface) p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-(--color-term-accent)" aria-hidden="true" />
                    <h2 className="text-[12px] font-semibold text-(--color-term-text)">{t(item.titleKey, item.fallbackTitle)}</h2>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-(--color-term-muted)">{t(item.bodyKey, item.fallbackBody)}</p>
                </article>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ── Smart Money settings ───────────────────────────────────────────── */}
      <div className="col-span-12 min-h-0">
        <SmartMoneyAlertSettingsPanel />
      </div>
    </div>
  );
}