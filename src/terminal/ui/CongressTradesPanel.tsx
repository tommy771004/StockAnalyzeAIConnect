/**
 * src/terminal/ui/CongressTradesPanel.tsx
 *
 * 美國國會議員交易申報面板
 * 根據 STOCK Act，議員必須在 45 天內申報股票交易
 */

import React, { useEffect, useState } from 'react';
import { Panel } from './Panel';
import { Loader2, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CongressTrade {
  politician:      string;
  party:           'D' | 'R' | 'I';
  chamber:         'House' | 'Senate';
  ticker:          string;
  tradeDate:       string;
  reportedDate:    string;
  action:          'Buy' | 'Sell' | 'Exchange';
  amountFormatted: string;
  comment:         string;
  state:           string;
}

interface CongressData {
  ticker?: string;
  summary: {
    totalTrades: number;
    buyCount:    number;
    sellCount:   number;
    buyBias:     'bullish' | 'bearish' | 'neutral';
    topTraders:  Array<{ name: string; count: number; lastAction: string }>;
  };
  trades: CongressTrade[];
}

interface Props {
  /** 若提供，顯示特定股票；否則顯示所有最近交易 */
  symbol?: string;
}

const PARTY_COLOR: Record<string, string> = {
  D: 'bg-blue-500/20 text-blue-400',
  R: 'bg-red-500/20  text-red-400',
  I: 'bg-zinc-500/20 text-zinc-400',
};

const ACTION_CONFIG = {
  Buy:      { icon: TrendingUp,   color: 'text-emerald-400', label: '買入' },
  Sell:     { icon: TrendingDown, color: 'text-rose-400',    label: '賣出' },
  Exchange: { icon: Minus,        color: 'text-amber-400',   label: '交換' },
};

export function CongressTradesPanel({ symbol }: Props) {
  const [data, setData]       = useState<CongressData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);

    const url = symbol
      ? `/api/research/congress/${symbol.toUpperCase()}`
      : '/api/research/congress';

    fetch(url)
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as CongressData;
      })
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [symbol]);

  const biasConfig = data?.summary.buyBias === 'bullish'
    ? { label: '偏多', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' }
    : data?.summary.buyBias === 'bearish'
    ? { label: '偏空', color: 'text-rose-400',    bg: 'bg-rose-400/10 border-rose-400/20' }
    : { label: '中性', color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' };

  return (
    <Panel
      title={symbol ? `🏛️ 國會議員交易 — ${symbol}` : '🏛️ 國會議員最新交易'}
      className="min-h-[300px]"
      bodyClassName="flex flex-col"
      actions={
        <button
          onClick={load}
          disabled={loading}
          className="text-(--color-term-muted) hover:text-(--color-term-text) transition-colors disabled:opacity-40"
          title="重新整理"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      }
    >
      {loading && !data && (
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-(--color-term-muted) text-[12px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在載入國會申報資料...</span>
        </div>
      )}

      {error && (
        <div className="p-4 text-[12px] text-rose-400">{error}</div>
      )}

      {data && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-4 border-b border-(--color-term-border) px-4 py-3">
            <div className={cn('rounded border px-3 py-1.5 text-center', biasConfig.bg)}>
              <div className={cn('text-[16px] font-bold', biasConfig.color)}>{biasConfig.label}</div>
              <div className="text-[9px] text-(--color-term-muted) tracking-widest">議員倉位</div>
            </div>
            <div className="flex gap-5">
              <div className="text-center">
                <div className="text-[18px] font-bold text-emerald-400 tabular-nums">{data.summary.buyCount}</div>
                <div className="text-[9px] text-(--color-term-muted) tracking-widest">BUY</div>
              </div>
              <div className="text-center">
                <div className="text-[18px] font-bold text-rose-400 tabular-nums">{data.summary.sellCount}</div>
                <div className="text-[9px] text-(--color-term-muted) tracking-widest">SELL</div>
              </div>
              <div className="text-center">
                <div className="text-[18px] font-bold text-(--color-term-text) tabular-nums">{data.summary.totalTrades}</div>
                <div className="text-[9px] text-(--color-term-muted) tracking-widest">TOTAL</div>
              </div>
            </div>

            {/* Top traders */}
            {data.summary.topTraders.length > 0 && (
              <div className="ml-auto hidden lg:block">
                <div className="text-[9px] text-(--color-term-muted) tracking-widest mb-1">最活躍議員</div>
                {data.summary.topTraders.slice(0, 3).map(t => (
                  <div key={t.name} className="text-[10px] text-(--color-term-text) flex gap-2">
                    <span>{t.name}</span>
                    <span className={t.lastAction === 'Buy' ? 'text-emerald-400' : 'text-rose-400'}>
                      ×{t.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="border-b border-(--color-term-border) bg-amber-400/5 px-4 py-2 text-[10px] text-amber-400/80">
            ⚠️ 資料來源：STOCK Act 公開申報（最長45天延遲）。並非投資建議，亦不構成內線交易指控。
          </div>

          {/* Trades list */}
          <ul className="flex flex-col divide-y divide-(--color-term-border)/60 overflow-auto" style={{ maxHeight: '360px' }}>
            {data.trades.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-(--color-term-muted)">
                {symbol ? `尚無 ${symbol} 的國會議員申報交易` : '尚無最新交易資料'}
              </li>
            )}
            {data.trades.map((t, i) => {
              const action = ACTION_CONFIG[t.action] ?? ACTION_CONFIG.Exchange;
              const Icon   = action.icon;
              return (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                  {/* Party badge */}
                  <span className={cn('mt-0.5 shrink-0 rounded px-1.5 text-[9px] font-bold', PARTY_COLOR[t.party])}>
                    {t.party}
                  </span>

                  {/* Politician + ticker */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-(--color-term-text) truncate">{t.politician}</span>
                      {!symbol && (
                        <span className="shrink-0 text-[11px] font-bold text-(--color-term-accent)">{t.ticker}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-(--color-term-muted) mt-0.5">
                      {t.chamber} · {t.state} · 交易: {t.tradeDate} · 申報: {t.reportedDate}
                    </div>
                  </div>

                  {/* Action + amount */}
                  <div className="shrink-0 text-right">
                    <div className={cn('flex items-center gap-1 justify-end text-[12px] font-semibold', action.color)}>
                      <Icon size={12} />
                      {action.label}
                    </div>
                    <div className="text-[10px] text-(--color-term-muted) mt-0.5">{t.amountFormatted}</div>
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
