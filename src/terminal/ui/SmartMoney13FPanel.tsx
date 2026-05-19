import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Panel } from './Panel';
import { cn } from '../../lib/utils';

interface TrackedManager {
  id: string;
  name: string;
  cik: string;
}

interface SmartMoneyHolding {
  issuer: string;
  classTitle: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  shareType: string;
  investmentDiscretion: string;
  isNewPosition: boolean;
}

interface SmartMoney13FData {
  availableManagers: TrackedManager[];
  manager: TrackedManager;
  currentFiling: {
    accessionNumber: string;
    filingDate: string;
    reportDate: string | null;
    url: string;
  };
  previousFiling: {
    accessionNumber: string;
    filingDate: string;
    reportDate: string | null;
    url: string;
  } | null;
  summary: {
    totalHoldings: number;
    totalValueUsd: number;
    newPositions: number;
  };
  newPositions: SmartMoneyHolding[];
  topHoldings: SmartMoneyHolding[];
  sourceLinks: {
    sec: string;
    whaleWisdom: string;
    dataroma: string;
  };
}

const DEFAULT_MANAGER_ID = 'berkshire-hathaway';

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatShares(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function HoldingRow({
  holding,
  locale,
  emphasizeNew = false,
}: {
  holding: SmartMoneyHolding;
  locale: string;
  emphasizeNew?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-(--color-term-text)">{holding.issuer}</span>
          {(emphasizeNew || holding.isNewPosition) && (
            <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-emerald-400">
              {t('smartMoney.13fNewBadge', 'NEW')}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-(--color-term-muted)">
          {holding.classTitle || t('smartMoney.notAvailableShort', 'N/A')}
          {holding.cusip ? ` · CUSIP ${holding.cusip}` : ''}
          {holding.investmentDiscretion ? ` · ${holding.investmentDiscretion}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[12px] font-semibold tabular-nums text-(--color-term-text)">{formatUsd(holding.valueUsd, locale)}</div>
        <div className="mt-0.5 text-[10px] text-(--color-term-muted)">
          {formatShares(holding.shares, locale)} {holding.shareType || t('smartMoney.sharesLabel', 'shares')}
        </div>
      </div>
    </li>
  );
}

export function SmartMoney13FPanel() {
  const { t, i18n } = useTranslation();
  const [managerId, setManagerId] = useState(DEFAULT_MANAGER_ID);
  const [data, setData] = useState<SmartMoney13FData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';

  const load = (nextManagerId: string) => {
    setLoading(true);
    setError(null);

    fetch(`/api/research/smart-money/13f?manager=${encodeURIComponent(nextManagerId)}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
        return json as SmartMoney13FData;
      })
      .then((nextData) => {
        setData(nextData);
        if (nextData.manager.id !== managerId) {
          setManagerId(nextData.manager.id);
        }
      })
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(managerId);
  }, [managerId]);

  return (
    <Panel
      title={t('smartMoney.13fTitle', '13F 機構持倉雷達')}
      className="min-h-[320px]"
      bodyClassName="flex flex-col"
      actions={
        <button
          type="button"
          onClick={() => load(managerId)}
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
          <span>{t('smartMoney.13fLoading', '正在載入 13F 機構持倉...')}</span>
        </div>
      )}

      {error && <div className="p-4 text-[12px] text-rose-400">{error}</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-(--color-term-border) px-4 py-3">
            <div className="min-w-0 flex-1">
              <select
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                className="w-full max-w-[260px] rounded border border-(--color-term-border) bg-(--color-term-surface) px-2 py-1 text-[12px] font-semibold text-(--color-term-text) outline-none"
              >
                {data.availableManagers.map((manager) => (
                  <option key={manager.id} value={manager.id} className="bg-(--color-term-panel)">
                    {manager.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[10px] text-(--color-term-muted)">
                {t('smartMoney.13fLatestFiling', '最新申報 {{date}}', { date: data.currentFiling.filingDate })}
                {data.currentFiling.reportDate ? ` · ${t('smartMoney.13fReportPeriod', '報告期 {{date}}', { date: data.currentFiling.reportDate })}` : ''}
                {data.previousFiling?.reportDate ? ` · ${t('smartMoney.13fPreviousPeriod', '前一期 {{date}}', { date: data.previousFiling.reportDate })}` : ''}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              {([
                ['SEC', data.sourceLinks.sec],
                ['WhaleWisdom', data.sourceLinks.whaleWisdom],
                ['Dataroma', data.sourceLinks.dataroma],
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

          <div className="grid grid-cols-1 gap-3 border-b border-(--color-term-border) px-4 py-3 sm:grid-cols-3">
            <div className="rounded border border-(--color-term-border) bg-(--color-term-surface) px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-(--color-term-text)">{data.summary.totalHoldings.toLocaleString(numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.13fHoldingsStat', 'HOLDINGS')}</div>
            </div>
            <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-emerald-400">{data.summary.newPositions.toLocaleString(numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.13fNewStat', 'NEW')}</div>
            </div>
            <div className="rounded border border-(--color-term-border) bg-(--color-term-surface) px-3 py-2 text-center">
              <div className="text-[18px] font-bold tabular-nums text-(--color-term-text)">{formatUsd(data.summary.totalValueUsd, numberLocale)}</div>
              <div className="text-[9px] tracking-widest text-(--color-term-muted)">{t('smartMoney.13fAumStat', 'AUM')}</div>
            </div>
          </div>

          <div className="border-b border-(--color-term-border) bg-amber-400/5 px-4 py-2 text-[10px] text-amber-400/80">
            {t('smartMoney.13fDelayHint', '13F 最長有 45 天延遲。這裡優先標示「新建倉」，避免只盯著長年重倉股。')}
          </div>

          <div className="flex flex-1 min-h-0 flex-col divide-y divide-(--color-term-border)">
            <div className="min-h-0">
              <div className="border-b border-(--color-term-border) px-4 py-2 text-[10px] font-bold tracking-[0.24em] text-emerald-400 uppercase">
                {t('smartMoney.13fNewPositions', '新建倉')}
              </div>
              <ul className="divide-y divide-(--color-term-border)/60 overflow-auto" style={{ maxHeight: '190px' }}>
                {data.newPositions.length === 0 && (
                  <li className="px-4 py-6 text-center text-[12px] text-(--color-term-muted)">
                    {t('smartMoney.13fNewEmpty', '這期尚未辨識到新建倉。')}
                  </li>
                )}
                {data.newPositions.map((holding) => (
                  <HoldingRow key={`${holding.cusip}-${holding.issuer}`} holding={holding} locale={numberLocale} emphasizeNew />
                ))}
              </ul>
            </div>

            <div className="min-h-0">
              <div className="border-b border-(--color-term-border) px-4 py-2 text-[10px] font-bold tracking-[0.24em] text-(--color-term-muted) uppercase">
                {t('smartMoney.13fTopHoldings', '前十大持倉')}
              </div>
              <ul className="divide-y divide-(--color-term-border)/60 overflow-auto" style={{ maxHeight: '240px' }}>
                {data.topHoldings.map((holding) => (
                  <HoldingRow key={`${holding.cusip}-${holding.issuer}`} holding={holding} locale={numberLocale} />
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}