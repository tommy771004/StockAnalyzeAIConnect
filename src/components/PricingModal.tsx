import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Zap, BrainCircuit, ShieldCheck } from 'lucide-react';
import { useSubscription, SubscriptionTier } from '../contexts/SubscriptionContext';
import { cn } from '../lib/utils';

export default function PricingModal() {
  const { isUpgradeModalOpen, closeUpgradeModal, tier, setTier } = useSubscription();

 

  const handleSubscribe = (newTier: SubscriptionTier) => {
    setTier(newTier);
    closeUpgradeModal();
  };

  return (
    <AnimatePresence>
      {isUpgradeModalOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={closeUpgradeModal}
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl glass-card rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 md:p-8 text-center relative shrink-0 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
            <button type="button">
              <X size={20} />
            </button>
            <h2 className="text-2xl md:text-3xl font-black mb-2 tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
              解鎖 <span className="text-gradient-primary">Quantum AI</span> 的完整潛力
            </h2>
            <p className="text-xs md:text-sm max-w-xl mx-auto uppercase tracking-widest font-bold" style={{ color: 'var(--md-outline)' }}>
              選擇適合您的交易武器，透過頂尖 AI 模型掌握市場先機。
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Free Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col transition",
                tier === SubscriptionTier.FREE ? "bg-[var(--md-surface-container-high)] border-[var(--md-primary)]" : "bg-[var(--md-surface-container-low)] border-[var(--md-outline-variant)] hover:border-white/20"
              )}>
                <div className="mb-6">
                  <h3 className="text-xl font-black mb-2" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>基礎版 (Free)</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black font-mono tracking-tighter" style={{ color: 'var(--md-on-surface)' }}>$0</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--md-outline)' }}>/ 月</span>
                  </div>
                  <p className="text-xs font-medium mt-2" style={{ color: 'var(--md-outline)' }}>適合剛開始接觸量化交易的新手</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="即時市場報價與五檔" />
                  <FeatureItem text="基礎技術指標 (RSI, MACD)" />
                  <FeatureItem text="自選股與投資組合追蹤" />
                  <FeatureItem text="AI 分析功能" disabled />
                  <FeatureItem text="進階策略回測" disabled />
                </div>

                <button type="button" onClick={(e) => {}}
                  className={cn(
                    "w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition",
                    tier === SubscriptionTier.FREE ? "bg-[var(--md-surface-container-highest)] text-[var(--md-outline)] cursor-default" : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
                  )}
                >
                  {tier === SubscriptionTier.FREE ? '目前方案' : '降級至基礎版'}
                </button>
              </div>

              {/* Basic Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col transition",
                tier === SubscriptionTier.BASIC ? "bg-[var(--md-secondary-container)]/10 border-[var(--md-secondary)]" : "bg-[var(--md-surface-container-low)] border-[var(--md-outline-variant)] hover:border-white/20"
              )}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--md-secondary)] text-[var(--md-on-secondary)] text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em]">
                  最受歡迎
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-black mb-2 flex items-center gap-2" style={{ color: 'var(--md-secondary)', fontFamily: 'var(--font-heading)' }}>
                    <Zap size={20} /> 簡易模型
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black font-mono tracking-tighter" style={{ color: 'var(--md-on-surface)' }}>$199</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--md-outline)' }}>/ 月</span>
                  </div>
                  <p className="text-xs font-medium mt-2" style={{ color: 'var(--md-outline)' }}>解鎖 AI 趨勢評估與基本買賣建議</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="包含基礎版所有功能" />
                  <FeatureItem text="AI 趨勢評估 (Trend Assessment)" highlight color="secondary" />
                  <FeatureItem text="基本買賣訊號提示" highlight color="secondary" />
                  <FeatureItem text="每日 50 次 AI 查詢額度" />
                  <FeatureItem text="深入推理與目標價預測" disabled />
                </div>

                <button type="button" onClick={(e) => {}}
                  className={cn(
                    "w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition",
                    tier === SubscriptionTier.BASIC 
                      ? "bg-[var(--md-secondary-container)]/20 text-[var(--md-secondary)] cursor-default" 
                      : "bg-[var(--md-secondary)] text-[var(--md-on-secondary)] hover:brightness-110 shadow-lg"
                  )}
                >
                  {tier === SubscriptionTier.BASIC ? '目前方案' : '升級簡易模型'}
                </button>
              </div>

              {/* Pro Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col transition",
                tier === SubscriptionTier.PRO ? "bg-[var(--md-primary-container)]/10 border-[var(--md-primary)]" : "bg-[var(--md-surface-container-low)] border-[var(--md-outline-variant)] hover:border-white/20"
              )}>
                <div className="mb-6">
                  <h3 className="text-xl font-black mb-2 flex items-center gap-2" style={{ color: 'var(--md-primary)', fontFamily: 'var(--font-heading)' }}>
                    <BrainCircuit size={20} /> 深入分析模型
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black font-mono tracking-tighter" style={{ color: 'var(--md-on-surface)' }}>$799</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--md-outline)' }}>/ 月</span>
                  </div>
                  <p className="text-xs font-medium mt-2" style={{ color: 'var(--md-outline)' }}>專為專業交易員打造的完整 AI 引擎</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="包含簡易模型所有功能" />
                  <FeatureItem text="AI 交易策略分析與推理邏輯" highlight color="primary" />
                  <FeatureItem text="精準目標價與停損價預測" highlight color="primary" />
                  <FeatureItem text="市場情緒深度解析" highlight color="primary" />
                  <FeatureItem text="無限制 AI 查詢額度" />
                </div>

                <button type="button" onClick={(e) => {}}
                  className={cn(
                    "w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition",
                    tier === SubscriptionTier.PRO 
                      ? "bg-[var(--md-primary-container)]/20 text-[var(--md-primary)] cursor-default" 
                      : "bg-[var(--md-primary)] text-[var(--md-on-primary)] hover:brightness-110 shadow-lg"
                  )}
                >
                  {tier === SubscriptionTier.PRO ? '目前方案' : '升級深入分析'}
                </button>
              </div>

            </div>
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t text-center shrink-0" style={{ borderColor: 'var(--md-outline-variant)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2" style={{ color: 'var(--md-outline)' }}>
              <ShieldCheck size={14} /> 支援 iOS / Android 跨平台訂閱同步 (即將推出)
            </p>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}

function FeatureItem({ text, disabled = false, highlight = false, color = 'secondary' }: { text: string, disabled?: boolean, highlight?: boolean, color?: 'secondary' | 'primary' }) {
  return (
    <div className={cn("flex items-start gap-3 text-sm", disabled ? "opacity-40" : "")}>
      {disabled ? (
        <X size={18} className="text-zinc-500 shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 size={18} className={cn("shrink-0 mt-0.5", highlight ? (color === 'primary' ? 'text-[var(--md-primary)]' : 'text-[var(--md-secondary)]') : "text-zinc-500")} />
      )}
      <span className={cn(highlight ? "text-[var(--md-on-surface)] font-bold" : "text-[var(--md-on-surface)] opacity-70")}>{text}</span>
    </div>
  );
}
