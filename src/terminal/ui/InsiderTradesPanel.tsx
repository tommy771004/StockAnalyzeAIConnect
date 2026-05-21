import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Panel } from './Panel';
import { cn } from '../../lib/utils';

interface InsiderTransaction {
  filingDate: string;
  tradeDate: string;
  insiderName: string;
  title: string;
  securityTitle: string;
  action: 'Buy' | 'Sell';
  code: 'P' | 'S';
  shares: number | null;
  price: number | null;
  amountUsd: number | null;
  ownership: 'D' | 'I' | null;
  filingUrl: string;
  isLargeBuy: boolean;
}

interface InsiderTradesData {
  company: {
    ticker: string;
    name: string;
    cik: string;
  };
  summary: {
    openMarketBuys: number;
    openMarketSells: number;
    largeBuys: number;
    clusterBuying: boolean;
    clusterBuyerCount: number;
    latestTradeDate: string | null;
  };
  transactions: InsiderTransaction[];
  sourceLinks: {
    sec: string;
    openInsider: string;
    finviz: string;
  };
}

interface Props {
  symbol: string;
}

function formatMoney(value: number | null, locale: string, maximumFractionDigits = 0): string {
  return value == null
    ? '---'
    : new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits,
    }).format(value);
}

function formatNumber(value: number | null, locale: string): string {
  return value == null
    ? '---'
    : new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value);
}

export function InsiderTradesPanel({ symbol }: Props) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<InsiderTradesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';

  const load = () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);

    fetch(`/api/research/smart-money/insider/${symbol}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
        return json as InsiderTradesData;
      })
      .then(setData)
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setData(null);
    load();
  }, [symbol]);

  return (
    <Panel
      title={t('smartMoney.insiderTitle', '內部人交易雷達 — {{symbol}}', { symbol })}
      className="min-h-[320px]"
      bodyClassName="flex flex-col"
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-(--color-term-muted) hover:text-(--color-term-text) transition-colors disabled:opacity-40"
          title={t('smartMoney.refresh', '重新整理')}
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      }
    >
      {loading && !data && (
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-[12px] text-(--color-term-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('smartMoney.insiderLoading', '正在載入 Form 4 內部人交易...')}</span>
        </div>
      )}

      {error && <div className="p-4 text-[12px] text-rose-400">{error}</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-(--color-term-border) px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-(--color-term-text)">{data.company.name}</div>
              <div className="mt-0.5 text-[10px] text-(--color-term-muted)">
                {data.company.ticker} · CIK {data.company.cik}
                {data.summary.latestTradeDate ? ` · ${t('smartMoney.insiderLatestTrade', '最新交易 {{date}}', { date: data.summary.latestTradeDate })}` : ''}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              {([
                ['SEC', data.sourceLinks.sec],
                ['OpenInsider', data.sourceLinks.openInsider],
                ['Finviz', data.sourceLinks.finviz],
              ] as Array<[string, string]>).map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-(--color-term-border) px-2 py-1 text-(--color-term-muted) hover:text-(--color-term-accent)"
                >
                  {label}
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-(--color-term-border) px-4 py-3 lg:grid-cols-4">
            <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-emerald-400">{data.summary.openMarketBuys.toLocaleString(numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.insiderBuyStat', 'BUY')}</div>
            </div>
            <div className="rounded border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-rose-400">{data.summary.openMarketSells.toLocaleString(numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.insiderSellStat', 'SELL')}</div>
            </div>
            <div className="rounded border border-(--color-term-border) bg-(--color-term-surface) px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-(--color-term-text)">{data.summary.largeBuys.toLocaleString(numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.insiderLargeBuyStat', '100K+ BUY')}</div>
            </div>
            <div className={cn(
              'rounded border px-3 py-2 text-center',
              data.summary.clusterBuying ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-(--color-term-border) bg-(--color-term-surface)',
            )}>
              <div className={cn(
                'text-[18px] font-bold tabular-nums',
                data.summary.clusterBuying ? 'text-emerald-400' : 'text-(--color-term-text)',
              )}>
                {data.summary.clusterBuyerCount.toLocaleString(numberLocale)}
              </div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.insiderClusterStat', 'CLUSTER')}</div>
            </div>
          </div>

          <div className="border-b border-(--color-term-border) bg-amber-400/5 px-4 py-2 text-[10px] text-amber-400/80">
            {t('smartMoney.insiderHint', '只顯示 Form 4 的公開市場買賣代碼 P / S。大額買入以單筆 100,000 美元以上標示。')}
          </div>

          <ul className="flex flex-col divide-y divide-(--color-term-border)/60 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent" style={{ maxHeight: '360px' }}>
            {data.transactions.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-(--color-term-muted)">
                {t('smartMoney.insiderEmpty', '尚未辨識到近期公開市場內部人交易。')}
              </li>
            )}

            {data.transactions.map((transaction, index) => {
              const isBuy = transaction.action === 'Buy';
              const Icon = isBuy ? TrendingUp : TrendingDown;

              return (
                <li key={`${transaction.filingUrl}-${index}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                  <span className={cn(
                    'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest',
                    isBuy ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-rose-400/30 bg-rose-400/10 text-rose-400',
                  )}>
                    {transaction.code}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block truncate max-w-[120px] sm:max-w-[200px] text-[12px] font-semibold text-(--color-term-text) align-bottom">{transaction.insiderName}</span>
                      {transaction.isLargeBuy && (
                        <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-emerald-400">
                          {t('smartMoney.insiderLargeBuyBadge', '100K+')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-(--color-term-muted) break-words text-pretty">
                      {transaction.title || t('smartMoney.insiderFallbackTitle', 'Insider')} · {transaction.securityTitle} · {t('smartMoney.insiderTradeDate', '交易 {{date}}', { date: transaction.tradeDate })} · {t('smartMoney.insiderFilingDate', '申報 {{date}}', { date: transaction.filingDate })}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={cn(
                      'flex items-center justify-end gap-1 text-[12px] font-semibold',
                      isBuy ? 'text-emerald-400' : 'text-rose-400',
                    )}>
                      <Icon size={12} />
                      {transaction.action === 'Buy'
                        ? t('smartMoney.insiderActionBuy', '買入')
                        : t('smartMoney.insiderActionSell', '賣出')}
                    </div>
                    <div className="mt-0.5 text-[10px] text-(--color-term-muted)">
                      {formatNumber(transaction.shares, numberLocale)} {t('smartMoney.shareUnit', '股')} · {transaction.price != null ? formatMoney(transaction.price, numberLocale, 2) : t('smartMoney.notAvailableLong', '---')}
                    </div>
                    <a
                      href={transaction.filingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-(--color-term-muted) hover:text-(--color-term-accent)"
                      title={t('smartMoney.openSource', '開啟來源')}
                    >
                      {formatMoney(transaction.amountUsd, numberLocale)}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}