import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { Trade } from '../types';

interface PerformanceSummaryProps {
  trades: Trade[];
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = React.memo(({ trades }) => {
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <SummaryCard title="總損益 (PnL)" value={`${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`} icon={Activity} color={totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
      <SummaryCard title="勝率 (Win Rate)" value={`${winRate.toFixed(1)}%`} icon={Target} color="text-sky-400" />
      <SummaryCard title="最大回撤 (Max DD)" value={`${maxDrawdown.toFixed(2)}`} icon={TrendingDown} color="text-rose-400" />
      <SummaryCard title="交易次數" value={trades.length.toString()} icon={TrendingUp} color="text-zinc-400" />
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
    <div className="liquid-glass rounded-2xl p-5 border border-zinc-800 flex items-center gap-4 bg-zinc-900/50">
      <div className={cn("p-3 rounded-xl bg-zinc-800/50", color)}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-sm text-zinc-400 font-medium">{title}</div>
        <div className={cn("text-xl font-mono font-bold", color)}>{value}</div>
      </div>
    </div>
  );
}
