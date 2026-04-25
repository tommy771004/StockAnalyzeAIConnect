/**
 * src/components/AutoTrading/RiskControlPanel.tsx
 * 風控設定面板 + Kill Switch
 */
import React, { useState } from 'react';
import { AlertTriangle, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RiskStats } from './types';

interface Props {
  riskStats: RiskStats | null;
  onKillSwitch: () => void;
  onUpdateConfig: (cfg: {
    budgetLimitTWD?: number;
    maxDailyLossTWD?: number;
    maxSinglePositionTWD?: number;
    stopLossPct?: number;
  }) => void;
}

export function RiskControlPanel({ riskStats, onKillSwitch, onUpdateConfig }: Props) {
  const [budgetLimit, setBudgetLimit] = useState(riskStats?.config.budgetLimitTWD ?? 10_000_000);
  const [dailyLoss, setDailyLoss] = useState(riskStats?.config.maxDailyLossTWD ?? 200_000);
  const [killConfirm, setKillConfirm] = useState(false);

  const isKillActive = riskStats?.killSwitchActive ?? false;

  const handleSave = () => {
    onUpdateConfig({ budgetLimitTWD: budgetLimit, maxDailyLossTWD: dailyLoss });
  };

  return (
    <div className={cn(
      'border rounded-sm p-3 space-y-3',
      isKillActive ? 'border-rose-500/50 bg-rose-950/20' : 'border-(--color-term-border)'
    )}>
      <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 text-rose-400">
        <AlertTriangle className="h-3 w-3" />
        Risk Control Panel
        {isKillActive && (
          <span className="ml-auto text-[9px] bg-rose-500/20 border border-rose-500/30 text-rose-300 px-1.5 py-0.5 rounded animate-pulse">
            KILL ACTIVE
          </span>
        )}
      </h3>

      <div className="space-y-2">
        <div>
          <label className="text-[9px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
            總預算上限 (Total Budget Limit)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-(--color-term-muted) shrink-0">TWD</span>
            <input
              type="number"
              value={budgetLimit}
              onChange={e => setBudgetLimit(Number(e.target.value))}
              onBlur={handleSave}
              className="flex-1 bg-(--color-term-surface) border border-(--color-term-border) rounded px-2 py-1 text-[11px] font-mono text-right text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
            />
          </div>
        </div>

        <div>
          <label className="text-[9px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
            單日最大虧損 (Max Daily Loss)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-(--color-term-muted) shrink-0">TWD</span>
            <input
              type="number"
              value={dailyLoss}
              onChange={e => setDailyLoss(Number(e.target.value))}
              onBlur={handleSave}
              className="flex-1 bg-(--color-term-surface) border border-(--color-term-border) rounded px-2 py-1 text-[11px] font-mono text-right text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)"
            />
          </div>
        </div>

        {/* Daily loss progress */}
        {riskStats && riskStats.dailyLoss > 0 && (
          <div>
            <div className="flex justify-between text-[9px] text-(--color-term-muted) mb-1">
              <span>今日虧損</span>
              <span>{((riskStats.dailyLoss / riskStats.config.maxDailyLossTWD) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-(--color-term-border) rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (riskStats.dailyLoss / riskStats.config.maxDailyLossTWD) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Loss Streak Badge */}
        {riskStats && (
          <div className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded">
             <span className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">連損計數 (Loss Streak)</span>
             <span className={cn(
               "text-[12px] font-bold font-mono",
               riskStats.lossStreakCount > 0 ? "text-amber-400" : "text-emerald-400"
             )}>
               {riskStats.lossStreakCount}
             </span>
          </div>
        )}
      </div>

      {/* Kill Switch */}
      {!killConfirm ? (
        <button
          type="button"
          onClick={() => setKillConfirm(true)}
          className={cn(
            'w-full py-2.5 rounded text-sm font-bold uppercase tracking-widest border transition-all flex items-center justify-center gap-2',
            isKillActive
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
          )}
        >
          {isKillActive ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {isKillActive ? '解除緊急停機' : '緊急平倉 (Kill Switch)'}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-rose-300 text-center">確認啟動緊急平倉？</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKillConfirm(false)}
              className="flex-1 py-2 rounded text-xs font-bold bg-(--color-term-surface) text-(--color-term-muted) border border-(--color-term-border) hover:bg-(--color-term-panel)"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => { setKillConfirm(false); onKillSwitch(); }}
              className="flex-1 py-2 rounded text-xs font-bold bg-rose-500 text-white border-rose-500 hover:bg-rose-600"
            >
              確認執行
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
