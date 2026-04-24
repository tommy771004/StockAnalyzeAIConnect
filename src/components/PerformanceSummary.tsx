import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { Trade } from '../types';
import { useSettings } from '../contexts/SettingsContext';

interface PerformanceSummaryProps {
  trades: Trade[];
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = React.memo(({ trades }) => {
  const { format } = useSettings();
  const { totalPnL, winRate, maxDrawdown } = useMemo(() => {
    const total = trades.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
    const wins = trades.filter(t => (t.pnl ?? 0) > 0).length;
    const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    let peak = 0, mdd = 0, running = 0;
    trades.forEach(t => {
      running += (t.pnl ?? 0);
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > mdd) mdd = dd;
    });
    return { totalPnL: total, winRate: wr, maxDrawdown: mdd };
  }, [trades]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <SummaryCard title="總損益 (PnL)" value={format.currency(totalPnL, 'USD')} icon={Activity} color={totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
      <SummaryCard title="勝率 (Win Rate)" value={format.percent(winRate, 1)} icon={Target} color="text-sky-400" />
      <SummaryCard title="最大回撤 (Max DD)" value={format.currency(maxDrawdown, 'USD')} icon={TrendingDown} color="text-rose-400" />
      <SummaryCard title="交易次數" value={format.number(trades.length, 0)} icon={TrendingUp} color="text-zinc-400" />
    </div>
  );
});
PerformanceSummary.displayName = 'PerformanceSummary';

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

function SummaryCard({ title, value, icon: Icon, color }: SummaryCardProps) {
  return (
    <div className="liquid-glass rounded-2xl p-3 sm:p-4 md:p-5 border border-zinc-800 flex items-center gap-3 sm:gap-4 bg-zinc-900/50">
      <div className={cn("p-2 sm:p-3 rounded-xl bg-zinc-800/50 shrink-0", color)}>
        <Icon size={16} className="sm:w-5 sm:h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] sm:text-xs md:text-sm text-zinc-400 font-medium truncate">{title}</div>
        <div className={cn("text-base sm:text-lg md:text-xl font-mono font-bold truncate", color)}>{value}</div>
      </div>
    </div>
  );
}
