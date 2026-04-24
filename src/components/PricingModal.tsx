import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, CheckCircle2, Zap, BrainCircuit, ShieldCheck,
  TrendingUp, Users, Star, Sparkles,
} from 'lucide-react';
import { useSubscription, SubscriptionTier } from '../contexts/SubscriptionContext';
import { CheckoutButton } from './CheckoutButton';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Plan → ECPay planId mapping ────────────────────────────────────────────

const PLAN_ID_MAP: Record<string, Record<string, string>> = {
  [SubscriptionTier.BASIC]: { monthly: 'basic_monthly', annual: 'basic_annual' },
  [SubscriptionTier.PRO]:   { monthly: 'pro_monthly',   annual: 'pro_annual'  },
};

type BillingCycle = 'monthly' | 'annual';

// ─── Social Proof Data ────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: '用了 Basic 方案後，我的選股勝率提升了 23%。AI 的趨勢判斷非常精準。',
    author: '陳先生',
    role: '個人投資者，台灣',
    tier: SubscriptionTier.BASIC,
  },
  {
    quote: 'Pro 的推理邏輯讓我真正理解 AI 為什麼買這檔。交易更有信心了。',
    author: 'Michael C.',
    role: '專業交易員，新加坡',
    tier: SubscriptionTier.PRO,
  },
];

// ─── Plan Definitions ─────────────────────────────────────────────────────────

interface Plan {
  tier: SubscriptionTier;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  tagline: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  accentVar: string;
  features: Array<{ text: string; highlight?: boolean; disabled?: boolean }>;
  ctaLabel: (isCurrent: boolean) => string;
}

const PLANS: Plan[] = [
  {
    tier: SubscriptionTier.FREE,
    name: '基礎版',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    tagline: '適合剛開始接觸量化交易',
    icon: <TrendingUp size={18} />,
    accentVar: 'text-zinc-400',
    features: [
      { text: '即時市場報價與跑馬燈' },
      { text: '基礎技術指標 RSI、MACD' },
      { text: '自選股與投資組合追蹤' },
      { text: 'AI 分析功能', disabled: true },
      { text: '策略回測引擎', disabled: true },
      { text: '選股篩選器', disabled: true },
    ],
    ctaLabel: (isCurrent) => isCurrent ? '目前方案' : '降級至基礎版',
  },
  {
    tier: SubscriptionTier.BASIC,
    name: '簡易模型',
    monthlyPrice: 199,
    annualMonthlyPrice: 159,
    tagline: '最受歡迎 — 解鎖 AI 核心能力',
    badge: '最受歡迎',
    badgeColor: 'bg-amber-400 text-amber-950',
    icon: <Zap size={18} />,
    accentVar: 'text-amber-400',
    features: [
      { text: '包含基礎版所有功能' },
      { text: 'AI 趨勢評估 (Bull / Bear)', highlight: true },
      { text: '基本買賣訊號提示', highlight: true },
      { text: '每日 50 次 AI 查詢額度', highlight: true },
      { text: '策略回測引擎 (120 天)', highlight: true },
      { text: '深入推理與目標價預測', disabled: true },
    ],
    ctaLabel: (isCurrent) => isCurrent ? '目前方案' : '升級至簡易模型',
  },
  {
    tier: SubscriptionTier.PRO,
    name: '深入分析模型',
    monthlyPrice: 799,
    annualMonthlyPrice: 639,
    tagline: '為專業交易員而生的完整 AI 引擎',
    badge: 'Pro',
    badgeColor: 'bg-sky-500 text-white',
    icon: <BrainCircuit size={18} />,
    accentVar: 'text-sky-400',
    features: [
      { text: '包含簡易模型所有功能' },
      { text: 'AI 完整推理邏輯與策略', highlight: true },
      { text: '精準目標價 & 停損預測', highlight: true },
      { text: '市場情緒深度解析', highlight: true },
      { text: '無限制 AI 查詢', highlight: true },
      { text: '優先客服支援', highlight: true },
    ],
    ctaLabel: (isCurrent) => isCurrent ? '目前方案' : '升級至 Pro',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingModal() {
  const { isUpgradeModalOpen, closeUpgradeModal, tier, setTier } = useSubscription();
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  // Annual savings display
  const annualSavingsPct = 20;

  return (
    <AnimatePresence>
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
            onClick={closeUpgradeModal}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeUpgradeModal}
              aria-label="關閉"
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="px-6 pt-8 pb-5 text-center border-b border-white/5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-bold tracking-widest uppercase mb-4">
                <Sparkles size={11} />
                升級方案
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-1.5">
                解鎖 <span className="text-sky-400">Quantum AI</span> 的完整潛力
              </h2>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                選擇適合您交易風格的方案，透過頂尖 AI 掌握市場先機
              </p>

              {/* Billing toggle */}
              <div className="inline-flex items-center gap-1 mt-5 p-1 rounded-xl bg-white/5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setBilling('monthly')}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all',
                    billing === 'monthly'
                      ? 'bg-white text-zinc-900 shadow'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  月付
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('annual')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all',
                    billing === 'annual'
                      ? 'bg-white text-zinc-900 shadow'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  年付
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-black',
                    billing === 'annual' ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400',
                  )}>
                    省 {annualSavingsPct}%
                  </span>
                </button>
              </div>
            </div>

            {/* Plans grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan) => {
                  const isCurrent = tier === plan.tier;
                  const price = billing === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice;
                  const isLoading = activating === plan.tier;
                  const isUpgrade = !isCurrent && plan.monthlyPrice > 0;

                  return (
                    <div
                      key={plan.tier}
                      className={cn(
                        'relative rounded-xl p-5 border flex flex-col transition-all duration-200',
                        isCurrent
                          ? 'border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/20'
                          : isUpgrade
                          ? 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                          : 'border-white/5 bg-white/[0.02]',
                      )}
                    >
                      {/* Badge */}
                      {plan.badge && (
                        <span className={cn(
                          'absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black px-3 py-0.5 rounded-full uppercase tracking-[0.15em]',
                          plan.badgeColor,
                        )}>
                          {plan.badge}
                        </span>
                      )}

                      {/* Plan header */}
                      <div className="mb-4">
                        <div className={cn('flex items-center gap-2 mb-2 font-bold', plan.accentVar)}>
                          {plan.icon}
                          <span className="text-sm">{plan.name}</span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-3xl font-black text-white tabular-nums">
                            ${price.toLocaleString()}
                          </span>
                          {price > 0 && (
                            <span className="text-[11px] text-zinc-500 font-medium">/ 月</span>
                          )}
                        </div>
                        {billing === 'annual' && price > 0 && (
                          <p className="text-[11px] text-emerald-400 font-bold">
                            年付 ${(price * 12).toLocaleString()} — 省 ${((plan.monthlyPrice - price) * 12).toLocaleString()}/年
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-500 mt-1">{plan.tagline}</p>
                      </div>

                      {/* Features */}
                      <ul className="flex-1 space-y-2.5 mb-5">
                        {plan.features.map((f) => (
                          <li
                            key={f.text}
                            className={cn(
                              'flex items-start gap-2 text-[12px]',
                              f.disabled ? 'opacity-30' : '',
                            )}
                          >
                            <CheckCircle2
                              size={14}
                              className={cn(
                                'shrink-0 mt-0.5',
                                f.disabled ? 'text-zinc-600' : f.highlight ? plan.accentVar : 'text-zinc-500',
                              )}
                            />
                            <span className={cn(
                              f.highlight ? 'text-white font-medium' : 'text-zinc-400',
                            )}>
                              {f.text}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA — Free plan: simple downgrade; Paid plans: ECPay checkout */}
                      {isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2.5 rounded-xl text-[13px] font-bold bg-white/5 text-zinc-500 cursor-default border border-white/5"
                        >
                          {plan.ctaLabel(true)}
                        </button>
                      ) : plan.tier === SubscriptionTier.FREE ? (
                        <button
                          type="button"
                          onClick={() => { setTier(SubscriptionTier.FREE); closeUpgradeModal(); }}
                          className="w-full py-2.5 rounded-xl text-[13px] font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-all active:scale-[0.98]"
                        >
                          {plan.ctaLabel(false)}
                        </button>
                      ) : (
                        <CheckoutButton
                          planId={
                            (PLAN_ID_MAP[plan.tier]?.[billing] ?? 'basic_monthly') as Parameters<typeof CheckoutButton>[0]['planId']
                          }
                          label={plan.ctaLabel(false)}
                          variant={plan.tier === SubscriptionTier.PRO ? 'sky' : 'amber'}
                          block
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Social proof */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {TESTIMONIALS.map((t) => (
                  <div key={t.author} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex mb-2">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={11} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-[12px] text-zinc-300 leading-relaxed mb-2">"{t.quote}"</p>
                    <p className="text-[11px] text-zinc-500">
                      <span className="text-zinc-300 font-medium">{t.author}</span> · {t.role}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-[11px] text-zinc-600 flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-zinc-500" />
                隨時取消 · 無隱藏費用 · SSL 加密結帳
              </p>
              <p className="text-[11px] text-zinc-600 flex items-center gap-1.5">
                <Users size={12} className="text-zinc-500" />
                已有 2,400+ 交易員使用
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
