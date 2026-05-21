import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BellRing, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Panel } from './Panel';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

interface Props {
  symbol?: string;
  maxEvents?: number;
  compact?: boolean;
  navigateOnEventClick?: boolean;
}

function formatAmount(amountUsd: number | null, locale: string): string {
  if (amountUsd == null) return '---';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amountUsd >= 1_000 ? 2 : 0,
  }).format(amountUsd);
}

export function SmartMoneyRecentEventsPanel({ symbol, maxEvents = 4, compact = false, navigateOnEventClick = false }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const upperSymbol = symbol?.trim().toUpperCase() ?? '';
  const locale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['smart-money-summary'],
    queryFn: api.getSmartMoneyConfig,
    refetchInterval: 60_000,
  });

  function openResearchForSymbol(targetSymbol: string): void {
    sessionStorage.setItem('research-symbol', targetSymbol);
    navigate('/research');
  }

  const recentEvents = data?.recentEvents ?? [];
  const stats = useMemo(() => ({
    new13f: recentEvents.filter((event) => event.type === '13f_new_position').length,
    insiderBuys: recentEvents.filter((event) => event.type === 'insider_large_buy').length,
    related: upperSymbol ? recentEvents.filter((event) => event.symbol?.toUpperCase() === upperSymbol).length : 0,
  }), [recentEvents, upperSymbol]);

  const visibleEvents = useMemo(() => {
    if (!upperSymbol) return recentEvents.slice(0, maxEvents);

    const related = recentEvents.filter((event) => event.symbol?.toUpperCase() === upperSymbol);
    const others = recentEvents.filter((event) => event.symbol?.toUpperCase() !== upperSymbol);
    return [...related, ...others].slice(0, maxEvents);
  }, [recentEvents, upperSymbol, maxEvents]);

  return (
    <Panel
      title={t('smartMoney.recentTitle', 'Smart Money 雷達')}
      icon={<BellRing className="h-4 w-4" aria-hidden="true" />}
      className={compact ? 'min-h-[220px]' : 'min-h-[280px]'}
      bodyClassName="flex flex-col"
      actions={
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-(--color-term-muted) hover:text-(--color-term-text) transition-colors disabled:opacity-40"
          title={t('smartMoney.refresh', '重新整理')}
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      }
    >
      {isLoading && !data && (
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-[12px] text-(--color-term-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('smartMoney.recentSyncing', '正在同步 Smart Money 事件...')}</span>
        </div>
      )}

      {error && <div className="p-4 text-[12px] text-rose-400">{(error as Error).message}</div>}

      {data && (
        <>
          <div className={cn(
            'grid grid-cols-3 gap-1.5 sm:gap-3 border-b border-(--color-term-border) px-2 sm:px-4 py-3',
            compact && 'gap-1 px-1.5 py-2',
          )}>
            <div className="rounded border border-sky-500/20 bg-sky-500/10 px-1.5 sm:px-3 py-2 text-center">
              <div className={cn('font-bold tabular-nums text-sky-300', compact ? 'text-[13px] sm:text-[15px]' : 'text-[15px] sm:text-[18px]')}>{stats.new13f.toLocaleString(locale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.recent13fStat', '13F NEW')}</div>
            </div>
            <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 sm:px-3 py-2 text-center">
              <div className={cn('font-bold tabular-nums text-emerald-300', compact ? 'text-[13px] sm:text-[15px]' : 'text-[15px] sm:text-[18px]')}>{stats.insiderBuys.toLocaleString(locale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.recentInsiderStat', 'INSIDER')}</div>
            </div>
            <div className="rounded border border-(--color-term-border) bg-(--color-term-surface) px-1.5 sm:px-3 py-2 text-center">
              <div className={cn('font-bold tabular-nums text-(--color-term-text)', compact ? 'text-[13px] sm:text-[15px]' : 'text-[15px] sm:text-[18px]')}>{stats.related.toLocaleString(locale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{upperSymbol ? `${upperSymbol}` : t('smartMoney.recentRelatedStat', 'RELATED')}</div>
            </div>
          </div>

          <div className={cn('border-b border-(--color-term-border) bg-amber-400/5 text-[10px] text-amber-300/80', compact ? 'px-3 py-1.5' : 'px-4 py-2')}>
            <div>
              {data.settings.enabled
                ? t('smartMoney.recentLastScan', '最近掃描：{{value}}', {
                    value: data.lastScanAt
                      ? new Date(data.lastScanAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
                      : t('smartMoney.recentNotScanned', '尚未掃描'),
                  })
                : t('smartMoney.recentDisabled', 'Smart Money 背景監控目前未啟用，可在 Alerts 頁開啟。')}
            </div>
            {navigateOnEventClick && (
              <div className={cn('tracking-widest text-cyan-300/80', compact ? 'mt-1 text-[8px]' : 'mt-1 text-[9px]')}>
                {t('smartMoney.recentClickHint', '點擊事件可進入 Research')}
              </div>
            )}
          </div>

          <ul className="flex flex-1 flex-col divide-y divide-(--color-term-border)/60 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            {!data.settings.enabled && (
              <li className="px-4 py-8 text-center text-[12px] text-(--color-term-muted)">
                {t('smartMoney.recentEnableHint', '啟用後會在這裡同步最近的 13F 新建倉與 insider 大額買入。')}
              </li>
            )}

            {data.settings.enabled && visibleEvents.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-(--color-term-muted)">
                {t('smartMoney.recentEmpty', '目前沒有最近的 Smart Money 事件。')}
              </li>
            )}

            {data.settings.enabled && visibleEvents.map((event) => {
              const related = upperSymbol && event.symbol?.toUpperCase() === upperSymbol;
              const canNavigate = navigateOnEventClick && Boolean(event.symbol);
              return (
                <li key={event.id} className={cn('flex items-start gap-3', compact ? 'px-3 py-2.5' : 'px-4 py-3', related && 'bg-emerald-500/5')}>
                  <span className={cn(
                    'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest',
                    event.type === '13f_new_position'
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                  )}>
                    {event.type === '13f_new_position'
                      ? t('smartMoney.recentBadge13f', '13F')
                      : t('smartMoney.recentBadgeBuy', 'BUY')}
                  </span>

                  {canNavigate ? (
                    <button
                      type="button"
                      onClick={() => openResearchForSymbol(event.symbol!)}
                      className="focus-ring min-w-0 flex-1 rounded-sm text-left transition-colors hover:bg-white/5 hover:text-(--color-term-accent)"
                      title={t('smartMoney.openResearch', '前往 Research：{{symbol}}', { symbol: event.symbol! })}
                    >
                      <div className="text-[12px] font-semibold text-(--color-term-text) break-words text-pretty">{event.title}</div>
                      <div className={cn('text-(--color-term-muted) break-words text-pretty', compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]')}>{event.summary}</div>
                      <div className={cn('text-(--color-term-muted)', compact ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]')}>
                        {new Date(event.eventDate).toLocaleDateString(locale)}
                        {event.symbol ? ` · ${event.symbol}` : ''}
                        {event.amountUsd != null ? ` · ${formatAmount(event.amountUsd, locale)}` : ''}
                      </div>
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-(--color-term-text) break-words text-pretty">{event.title}</div>
                      <div className={cn('text-(--color-term-muted) break-words text-pretty', compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]')}>{event.summary}</div>
                      <div className={cn('text-(--color-term-muted)', compact ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]')}>
                        {new Date(event.eventDate).toLocaleDateString(locale)}
                        {event.symbol ? ` · ${event.symbol}` : ''}
                        {event.amountUsd != null ? ` · ${formatAmount(event.amountUsd, locale)}` : ''}
                      </div>
                    </div>
                  )}

                  <a
                    href={event.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="shrink-0 text-(--color-term-muted) hover:text-(--color-term-accent)"
                    title={t('smartMoney.openSource', '開啟來源')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}