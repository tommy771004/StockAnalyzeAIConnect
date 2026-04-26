/**
 * src/components/AutoTrading/SignalAttributionPanel.tsx
 * 訊號來源分解面板：顯示 technical/ai/quantum/macro 各信號的貢獻與最終決策。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Zap, TrendingUp, Globe, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SignalComponentInfo } from './types';

interface Attribution {
  components: SignalComponentInfo[];
  dominantSource?: string;
  quantumGated?: boolean;
  leverageMultiplier?: number;
  fallbackMode?: boolean;
  preQuantumAction?: string;
  finalAction?: string;
}

interface Props {
  attribution: Attribution | null;
  quantumEnabled: boolean;
}

const SOURCE_META: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  technical: { icon: TrendingUp, color: 'text-cyan-400', label: 'Technical' },
  ai:        { icon: Cpu,        color: 'text-violet-400', label: 'AI/LLM' },
  quantum:   { icon: Zap,        color: 'text-amber-400', label: 'Quantum' },
  macro:     { icon: Globe,      color: 'text-emerald-400', label: 'Macro' },
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.abs(score) * 100);
  const isBull = score >= 0;
  return (
    <div className="flex items-center gap-1 flex-1">
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn('h-full rounded-full motion-safe:transition-[width]', isBull ? 'bg-cyan-500' : 'bg-rose-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-[9px] font-mono w-8 text-right', isBull ? 'text-cyan-400' : 'text-rose-400')}>
        {isBull ? '+' : ''}{score.toFixed(2)}
      </span>
    </div>
  );
}

export function SignalAttributionPanel({ attribution, quantumEnabled }: Props) {
  const { t } = useTranslation();

  if (!attribution) return null;

  const { components, quantumGated, leverageMultiplier, fallbackMode, preQuantumAction, finalAction, dominantSource } = attribution;

  return (
    <div className="space-y-2">
      {/* Degraded / fallback mode banner */}
      {(!quantumEnabled || fallbackMode) && (
        <div className="flex items-center gap-2 px-2 py-1 rounded text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            {!quantumEnabled
              ? t('autotrading.signalAttribution.quantumDisabled', '量子訊號已停用（ENABLE_QUANTUM_SIGNAL=false）')
              : t('autotrading.signalAttribution.fallbackMode', '科學模型離線，使用 fallback 代理訊號')}
          </span>
        </div>
      )}

      {/* Quantum gate indicator */}
      {quantumGated && (
        <div className="flex items-center gap-2 px-2 py-1 rounded text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <Zap className="h-3 w-3 shrink-0" />
          <span>
            {t('autotrading.signalAttribution.quantumGated', '量子不確定度過高 → 強制 HOLD')}
            {preQuantumAction && ` (原始: ${preQuantumAction})`}
          </span>
        </div>
      )}

      {/* Signal components */}
      <div className="space-y-1">
        {components.map((c, i) => {
          const meta = SOURCE_META[c.source] ?? SOURCE_META.technical;
          const Icon = meta.icon;
          const isDominant = c.source === dominantSource;
          return (
            <div key={i} className={cn('flex items-center gap-2 px-2 py-1 rounded', isDominant && 'bg-white/3')}>
              <Icon className={cn('h-3 w-3 shrink-0', meta.color)} />
              <span className={cn('text-[9px] w-16 shrink-0', meta.color)}>{meta.label}</span>
              <span className="text-[9px] text-white/40 w-8 shrink-0">{c.action}</span>
              <ScoreBar score={c.score} />
              {isDominant && <span className="text-[8px] text-white/30 shrink-0">{t('autotrading.signalAttribution.dominant', '主導')}</span>}
            </div>
          );
        })}
      </div>

      {/* Leverage multiplier */}
      {leverageMultiplier !== undefined && leverageMultiplier < 1 && (
        <div className="flex items-center gap-2 px-2 text-[9px] text-orange-300/80">
          <span>{t('autotrading.signalAttribution.leverage', '槓桿調整')}:</span>
          <span className="font-mono text-orange-400">{(leverageMultiplier * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
