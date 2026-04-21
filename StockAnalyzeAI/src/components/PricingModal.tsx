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
          className="relative w-full max-w-5xl bg-[var(--bg-color)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 md:p-8 text-center relative shrink-0 border-b border-[var(--border-color)]">
            <button 
              onClick={closeUpgradeModal}
              className="absolute top-6 right-6 p-2 rounded-full bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-zinc-500 hover:text-[var(--text-color)] transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-color)] mb-2 tracking-tight">
              解鎖 <span className="text-emerald-400">Quantum AI</span> 的完整潛力
            </h2>
            <p className="text-zinc-500 text-sm md:text-base max-w-xl mx-auto">
              選擇適合您的交易武器，透過頂尖 AI 模型掌握市場先機。
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Free Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col",
                tier === SubscriptionTier.FREE ? "bg-[var(--bg-color)] border-[var(--border-color)]" : "bg-[var(--card-bg)] border-[var(--border-color)]"
              )}>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-[var(--text-color)] mb-2">基礎版 (Free)</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[var(--text-color)]">$0</span>
                    <span className="text-zinc-500 text-sm">/ 月</span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-2">適合剛開始接觸量化交易的新手</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="即時市場報價與五檔" />
                  <FeatureItem text="基礎技術指標 (RSI, MACD)" />
                  <FeatureItem text="自選股與投資組合追蹤" />
                  <FeatureItem text="AI 分析功能" disabled />
                  <FeatureItem text="進階策略回測" disabled />
                </div>

                <button 
                  disabled={tier === SubscriptionTier.FREE}
                  onClick={() => handleSubscribe(SubscriptionTier.FREE)}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold transition-all",
                    tier === SubscriptionTier.FREE ? "bg-[var(--border-color)] text-[var(--text-color)] cursor-default" : "bg-[var(--bg-color)] text-[var(--text-color)] opacity-70 hover:bg-[var(--border-color)]"
                  )}
                >
                  {tier === SubscriptionTier.FREE ? '目前方案' : '降級至基礎版'}
                </button>
              </div>

              {/* Basic Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col",
                tier === SubscriptionTier.BASIC ? "bg-emerald-500/10 border-emerald-500/30" : "bg-[var(--card-bg)] border-[var(--border-color)] hover:border-emerald-500/20 transition-colors"
              )}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest">
                  最受歡迎
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-emerald-400 mb-2 flex items-center gap-2">
                    <Zap size={20} /> 簡易模型
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[var(--text-color)]">$199</span>
                    <span className="text-zinc-500 text-sm">/ 月</span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-2">解鎖 AI 趨勢評估與基本買賣建議</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="包含基礎版所有功能" />
                  <FeatureItem text="AI 趨勢評估 (Trend Assessment)" highlight />
                  <FeatureItem text="基本買賣訊號提示" highlight />
                  <FeatureItem text="每日 50 次 AI 查詢額度" />
                  <FeatureItem text="深入推理與目標價預測" disabled />
                </div>

                <button 
                  disabled={tier === SubscriptionTier.BASIC}
                  onClick={() => handleSubscribe(SubscriptionTier.BASIC)}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold transition-all",
                    tier === SubscriptionTier.BASIC 
                      ? "bg-emerald-500/20 text-emerald-400 cursor-default" 
                      : "bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                  )}
                >
                  {tier === SubscriptionTier.BASIC ? '目前方案' : '升級簡易模型'}
                </button>
              </div>

              {/* Pro Tier */}
              <div className={cn(
                "relative rounded-3xl p-6 border flex flex-col",
                tier === SubscriptionTier.PRO ? "bg-indigo-500/10 border-indigo-500/30" : "bg-[var(--card-bg)] border-[var(--border-color)] hover:border-indigo-500/20 transition-colors"
              )}>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-indigo-400 mb-2 flex items-center gap-2">
                    <BrainCircuit size={20} /> 深入分析模型
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[var(--text-color)]">$799</span>
                    <span className="text-zinc-500 text-sm">/ 月</span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-2">專為專業交易員打造的完整 AI 引擎</p>
                </div>
                
                <div className="flex-1 space-y-4 mb-8">
                  <FeatureItem text="包含簡易模型所有功能" />
                  <FeatureItem text="AI 交易策略分析與推理邏輯" highlight color="indigo" />
                  <FeatureItem text="精準目標價與停損價預測" highlight color="indigo" />
                  <FeatureItem text="市場情緒深度解析" highlight color="indigo" />
                  <FeatureItem text="無限制 AI 查詢額度" />
                </div>

                <button 
                  disabled={tier === SubscriptionTier.PRO}
                  onClick={() => handleSubscribe(SubscriptionTier.PRO)}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold transition-all",
                    tier === SubscriptionTier.PRO 
                      ? "bg-indigo-500/20 text-indigo-400 cursor-default" 
                      : "bg-indigo-500 text-[var(--text-color)] hover:bg-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                  )}
                >
                  {tier === SubscriptionTier.PRO ? '目前方案' : '升級深入分析'}
                </button>
              </div>

            </div>
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t border-[var(--border-color)] text-center shrink-0">
            <p className="text-xs text-zinc-500 flex items-center justify-center gap-1">
              <ShieldCheck size={14} /> 支援 iOS / Android 跨平台訂閱同步 (即將推出)
            </p>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}

function FeatureItem({ text, disabled = false, highlight = false, color = 'emerald' }: { text: string, disabled?: boolean, highlight?: boolean, color?: 'emerald' | 'indigo' }) {
  return (
    <div className={cn("flex items-start gap-3 text-sm", disabled ? "opacity-40" : "")}>
      {disabled ? (
        <X size={18} className="text-zinc-500 shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 size={18} className={cn("shrink-0 mt-0.5", highlight ? (color === 'indigo' ? 'text-indigo-400' : 'text-emerald-400') : "text-zinc-500")} />
      )}
      <span className={cn(highlight ? "text-[var(--text-color)] font-medium" : "text-[var(--text-color)] opacity-70")}>{text}</span>
    </div>
  );
}
