import React, { useState } from 'react';
import { Lock, ChevronRight, TrendingUp, Brain, Target, BarChart3, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSubscription, SubscriptionTier } from '../contexts/SubscriptionContext';

/** Maps a feature context → what to show in the gate overlay */
export interface FeatureGateConfig {
  /** Short headline: what they unlock */
  headline: string;
  /** One-sentence description of the value */
  description: string;
  /** Which tier is required */
  requiredTier: SubscriptionTier;
  /** Bullet benefits shown in the gate */
  benefits: string[];
  /** Icon to show alongside the headline */
  icon?: React.ReactNode;
  /** CTA button label */
  ctaLabel?: string;
}

/** Pre-built configs for common feature gates in this app */
export const FEATURE_GATES = {
  AI_ANALYSIS: {
    headline: '解鎖 AI 趨勢評估',
    description: 'AI 即時分析市場脈動，給出明確的買賣訊號與趨勢評估。',
    requiredTier: SubscriptionTier.BASIC,
    benefits: [
      'AI 趨勢強度評估 (Bull / Bear)',
      '基本買賣訊號提示',
      '每日 50 次 AI 查詢',
    ],
    icon: <TrendingUp className="size-5" />,
    ctaLabel: '解鎖 AI 分析 — $199/月',
  },
  PRO_STRATEGY: {
    headline: '解鎖深度交易策略',
    description: '完整的 AI 推理邏輯、目標價預測與停損建議，為專業交易員而生。',
    requiredTier: SubscriptionTier.PRO,
    benefits: [
      'AI 完整推理邏輯與策略分析',
      '精準目標價 & 停損價預測',
      '市場情緒深度解析',
      '無限制 AI 查詢',
    ],
    icon: <Brain className="size-5" />,
    ctaLabel: '升級 Pro — $799/月',
  },
  BACKTEST: {
    headline: '解鎖進階回測引擎',
    description: '用歷史數據驗證你的交易策略，找出最佳參數組合。',
    requiredTier: SubscriptionTier.BASIC,
    benefits: [
      '120 天歷史回測',
      'RSI、MACD、均線策略模板',
      '績效報告與風險指標',
    ],
    icon: <BarChart3 className="size-5" />,
    ctaLabel: '解鎖回測功能 — $199/月',
  },
  SCREENER_PRO: {
    headline: '解鎖智慧選股篩選器',
    description: '設定精確的技術條件，從市場中篩出符合你策略的標的。',
    requiredTier: SubscriptionTier.BASIC,
    benefits: [
      '多條件組合篩選',
      '即時技術指標篩選',
      '自訂警報推送',
    ],
    icon: <Target className="size-5" />,
    ctaLabel: '解鎖選股器 — $199/月',
  },
} satisfies Record<string, FeatureGateConfig>;

interface SubscriptionGateProps {
  children: React.ReactNode;
  /** Use a pre-built gate config or provide your own */
  gate: FeatureGateConfig | keyof typeof FEATURE_GATES;
  className?: string;
  /** If true, completely hides children instead of blurring them */
  hardBlock?: boolean;
}

/**
 * SubscriptionGate v2
 *
 * CRO improvements over v1:
 * - Context-aware headline and benefits (not generic "升級方案")
 * - Feature preview visible behind blur (Show, Don't Just Tell)
 * - Dismissible overlay with "Not now" escape hatch
 * - Direct CTA to the relevant plan, not just opening the generic modal
 * - Fixed access logic bug (FREE cannot access BASIC features)
 */
export default function SubscriptionGate({
  children,
  gate,
  className,
  hardBlock = false,
}: SubscriptionGateProps) {
  const { tier, openUpgradeModal } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  const config: FeatureGateConfig =
    typeof gate === 'string' ? FEATURE_GATES[gate] : gate;

  // Fixed access logic (v1 bug: FREE incorrectly passed BASIC checks)
  const tierRank: Record<SubscriptionTier, number> = {
    [SubscriptionTier.FREE]: 0,
    [SubscriptionTier.BASIC]: 1,
    [SubscriptionTier.PRO]: 2,
  };
  const hasAccess = tierRank[tier] >= tierRank[config.requiredTier];

  if (hasAccess) return <>{children}</>;

  // User dismissed the overlay this session — show a subtle "locked" banner instead
  if (dismissed) {
    return (
      <div className={cn('relative', className)}>
        <div className="filter blur-sm opacity-30 pointer-events-none select-none">
          {children}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="absolute inset-0 flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        >
          <Lock className="size-3.5" />
          <span>{config.headline} — 點擊查看方案</span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Blurred feature preview — "Show, Don't Just Tell" */}
      {!hardBlock && (
        <div className="filter blur-[3px] opacity-40 pointer-events-none select-none scale-[1.02]">
          {children}
        </div>
      )}

      {/* Paywall overlay */}
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center z-10 p-6 gap-4',
          hardBlock ? 'min-h-[240px]' : 'absolute inset-0 bg-black/60 backdrop-blur-[2px]',
        )}
      >
        {/* Dismiss button — Respect the No */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="稍後再說"
          className="absolute top-3 right-3 p-1.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors"
        >
          <X className="size-3.5" />
        </button>

        {/* Icon + Headline */}
        <div className="flex flex-col items-center gap-2">
          <div className="size-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
            {config.icon ?? <Lock className="size-5" />}
          </div>
          <h3 className="text-base font-bold text-white leading-tight">
            {config.headline}
          </h3>
          <p className="text-[13px] text-zinc-300 max-w-[260px] leading-snug">
            {config.description}
          </p>
        </div>

        {/* Benefits list */}
        <ul className="space-y-1.5 text-left w-full max-w-[280px]">
          {config.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2 text-[12px] text-zinc-200">
              <Sparkles className="size-3 text-sky-400 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={openUpgradeModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all shadow-lg shadow-sky-500/25 active:scale-95"
        >
          {config.ctaLabel ?? '查看升級方案'}
          <ChevronRight className="size-4" />
        </button>

        {/* Escape hatch */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          暫時不了，繼續使用免費版
        </button>
      </div>
    </div>
  );
}
