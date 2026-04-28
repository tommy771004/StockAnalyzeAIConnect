/**
 * src/components/AutoTrading/AssetMonitor.tsx
 * 多股資產監控表格 — 含即時報價輪詢
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { getBatchQuotes } from '../../services/api';
import { isTaiwanTradingHours } from '../../services/cache';
import type { Position, DecisionFusion } from './types';

interface LiveQuote {
  price: number;
  changePct: number;
}

interface Props {
  positions: Position[];
  symbols: string[];
  decisionFusions: Record<string, DecisionFusion>;
}

const fmt = (n: number, d = 2) => n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });

export function AssetMonitor({ positions, symbols, decisionFusions }: Props) {
  const { t } = useTranslation();
  const [liveQuotes, setLiveQuotes] = useState<Map<string, LiveQuote>>(new Map());
  const busyRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    if (symbols.length === 0) return;

    let elapsed = 0;
    const BASE_MS = 2_000;

    const fetchQuotes = async () => {
      if (busyRef.current || unmountedRef.current) return;
      busyRef.current = true;
      try {
        const quotes = await getBatchQuotes(symbols);
        if (unmountedRef.current) return;
        const next = new Map<string, LiveQuote>();
        quotes.forEach((q: any, i: number) => {
          if (!q) return;
          const sym = q.symbol ?? symbols[i];
          if (!sym) return;
          const price: number = q.regularMarketPrice ?? 0;
          const changePct: number = q.regularMarketChangePercent ?? 0;
          if (price > 0) next.set(sym, { price, changePct });
        });
        setLiveQuotes(next);
      } catch {
        // keep previous data on error
      } finally {
        busyRef.current = false;
      }
    };

    void fetchQuotes();

    const timer = setInterval(() => {
      elapsed += BASE_MS;
      const isTaiwanLive = isTaiwanTradingHours();
      const threshold = isTaiwanLive ? BASE_MS : 30_000;
      if (elapsed < threshold) return;
      elapsed = 0;
      void fetchQuotes();
    }, BASE_MS);

    return () => {
      unmountedRef.current = true;
      clearInterval(timer);
    };
  }, [symbols]);

  const posMap = new Map(positions.map(p => [p.symbol, p]));

  const rows = symbols.map(sym => {
    const pos = posMap.get(sym);
    const fusion = decisionFusions[sym];
    const conf = fusion?.confidence ?? 0;
    const action = fusion?.action;
    return { symbol: sym, pos, conf, action };
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border) shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-(--color-term-muted) uppercase">
          {t('autotrading.asset.title')}
        </span>
        <span className="text-[9px] text-(--color-term-muted) border border-(--color-term-border) px-2 py-0.5 rounded">
          {t('autotrading.asset.filterActive')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-(--color-term-border) text-(--color-term-muted) text-[9px] uppercase tracking-wider">
              <th className="text-left px-3 py-1.5">{t('autotrading.asset.colSymbol')}</th>
              <th className="text-right px-2 py-1.5">{t('autotrading.asset.colPrice')}</th>
              <th className="text-right px-2 py-1.5">{t('autotrading.asset.colChange')}</th>
              <th className="text-right px-2 py-1.5">{t('autotrading.asset.colConf')}</th>
              <th className="text-right px-2 py-1.5">{t('autotrading.asset.colPos')}</th>
              <th className="text-right px-3 py-1.5">{t('autotrading.asset.colPnl')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-(--color-term-muted)">
                  {t('autotrading.asset.noSymbols')}
                </td>
              </tr>
            ) : (
              rows.map(({ symbol, pos, conf, action }) => {
                const live = liveQuotes.get(symbol);
                const price = live?.price ?? pos?.currentPrice ?? 0;
                // Daily change % from live quote; fallback to unrealised cost-basis change
                const changePct = live
                  ? live.changePct
                  : pos ? ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
                // PnL: recalculate client-side from live price so it updates without waiting
                // for the next server positions_update push.
                const unrealizedPnl = live && pos
                  ? (live.price - pos.avgCost) * pos.qty
                  : pos?.unrealizedPnl ?? 0;
                const isBuy = action === 'BUY';
                const isSell = action === 'SELL';

                return (
                  <tr key={symbol} className="border-b border-(--color-term-border)/50 hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          live ? 'animate-pulse bg-emerald-400' :
                          conf > 70 ? 'bg-cyan-400' : conf > 40 ? 'bg-amber-400' : 'bg-(--color-term-muted)'
                        )} />
                        <span className="text-(--color-term-accent) font-bold">{symbol}</span>
                        {symbol.endsWith('.TW') && (
                          <span className="text-[9px] text-(--color-term-muted)">{t('autotrading.asset.marketTse', 'TSE')}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 text-(--color-term-text) font-bold">
                      {price > 0 ? fmt(price) : '---'}
                    </td>
                    <td className={cn('text-right px-2 py-2 font-bold', changePct >= 0 ? 'text-cyan-400' : 'text-rose-400')}>
                      {price > 0 ? `${changePct >= 0 ? '+' : ''}${fmt(changePct)}%` : '---'}
                    </td>
                    <td className="text-right px-2 py-2">
                      {conf > 0 ? (
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold border',
                          isBuy  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                          isSell ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                   'bg-zinc-800/50 text-zinc-400 border-zinc-700'
                        )}>
                          {conf}%{isSell ? ` ${t('autotrading.asset.sellTag', '(Sell)')}` : isBuy ? '' : ''}
                        </span>
                      ) : (
                        <span className="text-(--color-term-muted)">---</span>
                      )}
                    </td>
                    <td className="text-right px-2 py-2 text-(--color-term-text)">
                      {pos ? pos.qty.toLocaleString() : '0'}
                    </td>
                    <td className={cn(
                      'text-right px-3 py-2 font-bold',
                      unrealizedPnl >= 0 ? 'text-cyan-400' : 'text-rose-400'
                    )}>
                      {pos ? `${unrealizedPnl >= 0 ? '+' : ''}${fmt(unrealizedPnl, 0)}` : '0'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
