/**
 * src/components/AutoTrading/AssetMonitor.tsx
 * 多股資產監控表格
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { Position, AgentLog } from './types';

interface Props {
  positions: Position[];
  symbols: string[];
  logs: AgentLog[];
}

function getConfidenceFromLogs(logs: AgentLog[], symbol: string): { conf: number; action?: string } {
  const recent = [...logs].reverse().find(l => l.symbol === symbol && l.confidence !== undefined);
  return recent ? { conf: recent.confidence!, action: recent.action } : { conf: 0 };
}

const fmt = (n: number, d = 2) => n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });

export function AssetMonitor({ positions, symbols, logs }: Props) {
  const { t } = useTranslation();
  const posMap = new Map(positions.map(p => [p.symbol, p]));

  // Show all monitored symbols, with positions if any
  const rows = symbols.map(sym => {
    const pos = posMap.get(sym);
    const { conf, action } = getConfidenceFromLogs(logs, sym);
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
                const price = pos?.currentPrice ?? 0;
                const changePct = pos ? ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
                const isBuy = action === 'BUY';
                const isSell = action === 'SELL';

                return (
                  <tr key={symbol} className="border-b border-(--color-term-border)/50 hover:bg-white/3 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          conf > 70 ? 'bg-cyan-400' : conf > 40 ? 'bg-amber-400' : 'bg-(--color-term-muted)'
                        )} />
                        <span className="text-(--color-term-accent) font-bold">{symbol}</span>
                        {symbol.endsWith('.TW') && (
                          <span className="text-[9px] text-(--color-term-muted)">TSE</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 text-(--color-term-text) font-bold">
                      {price > 0 ? fmt(price) : '---'}
                    </td>
                    <td className={cn('text-right px-2 py-2 font-bold', changePct >= 0 ? 'text-cyan-400' : 'text-rose-400')}>
                      {pos ? `${changePct >= 0 ? '+' : ''}${fmt(changePct)}%` : '---'}
                    </td>
                    <td className="text-right px-2 py-2">
                      {conf > 0 ? (
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold border',
                          isBuy  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                          isSell ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                   'bg-zinc-800/50 text-zinc-400 border-zinc-700'
                        )}>
                          {conf}%{isSell ? ' (Sell)' : isBuy ? '' : ''}
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
                      (pos?.unrealizedPnl ?? 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'
                    )}>
                      {pos ? `${pos.unrealizedPnl >= 0 ? '+' : ''}${fmt(pos.unrealizedPnl, 0)}` : '0'}
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
