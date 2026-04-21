import React from 'react';
import { BarChart2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function StrategyComparison() {
  const strategies = [
    { name: 'TrendFlow_V1', roi: 12.4, sharpe: 1.8, drawdown: 5.2, winRate: 62 },
    { name: 'MeanReversion_V2', roi: 8.1, sharpe: 1.2, drawdown: 8.5, winRate: 55 },
    { name: 'Breakout_V3', roi: 15.6, sharpe: 2.1, drawdown: 12.1, winRate: 48 },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="liquid-glass rounded-2xl p-6 flex flex-col gap-4"
    >
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <BarChart2 className="text-indigo-400" size={20} />
        策略比較 (Strategy Comparison)
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500 text-xs">
              <th className="py-3">策略名稱</th>
              <th className="py-3 text-right">ROI (%)</th>
              <th className="py-3 text-right">夏普比率</th>
              <th className="py-3 text-right">最大回撤</th>
              <th className="py-3 text-right">勝率</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s.name} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-color)] transition-colors">
                <td className="py-4 font-bold text-white">{s.name}</td>
                <td className="py-4 text-right font-mono text-emerald-400">{s.roi}%</td>
                <td className="py-4 text-right font-mono">{s.sharpe}</td>
                <td className="py-4 text-right font-mono text-rose-400">-{s.drawdown}%</td>
                <td className="py-4 text-right font-mono">{s.winRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
