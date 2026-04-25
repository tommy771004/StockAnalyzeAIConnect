/**
 * src/components/AutoTrading/AccountSummary.tsx
 * 帳戶摘要面板
 */
import React from 'react';
import { cn } from '../../lib/utils';
import type { AccountBalance } from './types';

interface Props {
  balance: AccountBalance | null;
}

const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });

export function AccountSummary({ balance }: Props) {
  const pnlPositive = (balance?.dailyPnl ?? 0) >= 0;
  const utilization = balance
    ? Math.round((balance.usedMargin / balance.totalAssets) * 100)
    : 0;

  return (
    <div className="border border-(--color-term-border) rounded-sm p-3 space-y-3">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-(--color-term-muted) uppercase flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-(--color-term-accent)/30 flex items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-(--color-term-accent)" />
        </span>
        Account Summary
      </h3>

      <div className="space-y-2">
        <div>
          <div className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">總資產 (Total Assets)</div>
          <div className="text-sm font-bold font-mono text-(--color-term-text) mt-0.5">
            TWD {balance ? fmt(balance.totalAssets) : '---'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">可用資金 (Available Margin)</div>
          <div className="text-sm font-bold font-mono text-(--color-term-accent) mt-0.5">
            TWD {balance ? fmt(balance.availableMargin) : '---'}
          </div>
        </div>

        {/* Utilization bar */}
        <div>
          <div className="flex justify-between text-[9px] text-(--color-term-muted) mb-1">
            <span>Utilization</span>
            <span>{utilization}%</span>
          </div>
          <div className="h-1 bg-(--color-term-border) rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                utilization > 70 ? 'bg-rose-500' : utilization > 40 ? 'bg-amber-500' : 'bg-(--color-term-accent)'
              )}
              style={{ width: `${Math.min(100, utilization)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">當日損益 (Daily P/L)</div>
          <div className={cn(
            'text-base font-bold font-mono mt-0.5',
            pnlPositive ? 'text-cyan-400' : 'text-rose-400'
          )}>
            {pnlPositive ? '+' : ''}TWD {balance ? fmt(balance.dailyPnl) : '0'}
          </div>
        </div>
      </div>
    </div>
  );
}
