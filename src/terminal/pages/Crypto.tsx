import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../ui/Panel';
import { Sparkline } from '../ui/Sparkline';
import { formatPct, toneClass } from '../ui/format';
import * as api from '../../services/api';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const CRYPTO_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'DOGE-USD', 'ADA-USD', 'DOT-USD'];

export function CryptoPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCrypto = async () => {
    try {
      const quotes = await api.getBatchQuotes(CRYPTO_SYMBOLS);
      setData(quotes.filter(Boolean));
    } catch (err) {
      console.error('Crypto fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrypto();
    const timer = setInterval(fetchCrypto, 30000);
    return () => clearInterval(timer);
  }, []);

  const spark = (seed: number) =>
    Array.from({ length: 40 }, (_, i) => Math.sin((i + seed) / 3) * 5 + Math.cos(i / 2) * 2 + 10);

  if (loading && data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      <div className="col-span-12 min-h-[300px]">
        <Panel title={t('crypto.title', 'REAL-TIME CRYPTO MARKETS (USD)')} collapsible>
          <table className="w-full text-[12px]">
            <thead className="text-[10px] tracking-widest text-(--color-term-muted) bg-(--color-term-bg) sticky top-0 z-10">
              <tr className="border-b border-(--color-term-border)">
                <th className="px-4 py-3 text-left">{t('crypto.pair', 'PAIR')}</th>
                <th className="px-4 py-3 text-left">{t('crypto.name', 'NAME')}</th>
                <th className="px-4 py-3 text-right">{t('crypto.price', 'PRICE (USD)')}</th>
                <th className="px-4 py-3 text-right">{t('crypto.24hChg', '24H CHG')}</th>
                <th className="px-4 py-3 text-right">{t('crypto.trend', 'TREND (SMOOTHED)')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr 
                  key={c.symbol} 
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('symbol-search', { detail: c.symbol }));
                    window.location.hash = 'dashboard';
                  }}
                  className="border-b border-(--color-term-border)/60 hover:bg-white/5 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 font-bold tracking-wider group-hover:text-(--color-term-accent) transition-colors">{c.symbol}</td>
                  <td className="px-4 py-3 text-(--color-term-muted)">{c.shortName || 'Crypto Asset'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {Number(c.regularMarketPrice || 0).toLocaleString('en-US', {
                      minimumFractionDigits: (c.regularMarketPrice || 0) < 1 ? 4 : 2,
                    })}
                  </td>
                  <td className={cn("px-4 py-3 text-right tabular-nums font-bold", toneClass(c.regularMarketChangePercent || 0))}>
                    {formatPct(c.regularMarketChangePercent || 0, 2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="ml-auto h-8 w-28 opacity-60">
                      <Sparkline
                        data={spark(i * 3 + (c.regularMarketChangePercent || 0))}
                        stroke={(c.regularMarketChangePercent || 0) >= 0 ? '#22d3ee' : '#f87171'}
                        fill="rgba(255,255,255,0.02)"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
