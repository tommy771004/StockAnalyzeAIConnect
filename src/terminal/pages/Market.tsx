import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../hooks/useMarketData';
import { formatPct, toneClass } from '../ui/format';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Panel } from '../ui/Panel';
import { DataStatusBadge, type DataMode } from '../ui/DataStatusBadge';

export function MarketPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { sectors, indices, loading, lastUpdated } = useMarketData();
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const marketDataMode: DataMode = loading && sectors.length === 0 && indices.length === 0
    ? 'MOCK'
    : (lastUpdated ? 'LIVE' : 'DELAYED');

  if (loading && sectors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 overflow-auto pb-20 md:pb-10">
      <h1 className="sr-only">{t('nav.market', 'Market')}</h1>
      <div className="col-span-12">
        <Panel
          title={t('market.sectorTitle')}
          collapsible
          actions={<DataStatusBadge mode={marketDataMode} lastUpdated={lastUpdated || null} />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-1">
            {sectors.map((s) => (
              <button
                type="button"
                key={s.symbol}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('symbol-search', { detail: s.symbol }));
                  navigate('/dashboard');
                }}
                className={cn(
                  'min-w-0 flex flex-col items-start justify-between p-3 text-left text-[12px] h-24 cursor-pointer hover:brightness-125 hover:scale-[1.01] active:scale-[0.98] motion-safe:transition-[filter,transform]',
                  s.regularMarketChangePercent >= 0 ? 'bg-emerald-900/60 text-emerald-100' : 'bg-rose-900/60 text-rose-100',
                )}
              >
                <div className="flex w-full min-w-0 flex-col">
                  <span className="font-bold tracking-widest text-[13px]">{s.symbol}</span>
                  <span className="block w-full truncate text-[10px] opacity-70">
                    {s.shortName?.replace('Select Sector SPDR Fund', '').trim() || t('market.sectorFallback', 'Sector')}
                  </span>
                </div>
                <div className="flex w-full items-end justify-between tabular-nums">
                  <span className="text-[14px] font-semibold">
                    {s.regularMarketPrice?.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="font-mono">{formatPct(s.regularMarketChangePercent || 0, 1)}</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="col-span-12 min-h-[260px]">
        <Panel
          title={t('market.indicesTitle')}
          collapsible
          actions={<DataStatusBadge mode={marketDataMode} lastUpdated={lastUpdated || null} />}
        >
          <div className="overflow-x-auto w-full -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin scroll-shadow-x">
            <table className="w-full text-[12px]">
              <thead className="text-[10px] tracking-widest text-(--color-term-muted) bg-(--color-term-bg) z-10 sticky top-0">
                <tr className="border-b border-(--color-term-border)">
                  <th className="px-4 py-3 text-left whitespace-nowrap">{t('market.indexSymbol')}</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">{t('market.lastPrice')}</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">{t('market.change')}</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">{t('market.changePct')}</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">{t('market.dayRange')}</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-b border-(--color-term-border)/40 hover:bg-white/5 transition-colors cursor-pointer group"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('symbol-search', { detail: r.symbol }));
                      navigate('/dashboard');
                    }}
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <button
                        type="button"
                        aria-label={t('market.openIndex', 'Open {{symbol}}', { symbol: r.symbol })}
                        onClick={(event) => {
                          event.stopPropagation();
                          window.dispatchEvent(new CustomEvent('symbol-search', { detail: r.symbol }));
                          navigate('/dashboard');
                        }}
                        className="focus-ring font-bold tracking-wider text-(--color-term-text) group-hover:text-(--color-term-accent) transition-colors"
                      >
                        {r.symbol}
                      </button>
                      <div className="text-[10px] text-(--color-term-muted)">{r.shortName}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold whitespace-nowrap">
                      {r.regularMarketPrice?.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={cn('px-4 py-3.5 text-right tabular-nums whitespace-nowrap', toneClass(r.regularMarketChange))}>
                      {r.regularMarketChange >= 0 ? '+' : ''}{r.regularMarketChange?.toFixed(2)}
                    </td>
                    <td className={cn('px-4 py-3.5 text-right tabular-nums font-bold whitespace-nowrap', toneClass(r.regularMarketChangePercent))}>
                      {formatPct(r.regularMarketChangePercent || 0)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-(--color-term-muted) tabular-nums whitespace-nowrap">
                      {r.regularMarketDayHigh?.toLocaleString(numberLocale, { maximumFractionDigits: 0 })} - {r.regularMarketDayLow?.toLocaleString(numberLocale, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
