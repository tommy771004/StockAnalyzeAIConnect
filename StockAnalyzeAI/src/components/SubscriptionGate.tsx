import { Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSubscription, SubscriptionTier } from '../contexts/SubscriptionContext';

interface SubscriptionGateProps {
  children: React.ReactNode;
  requiredTier?: SubscriptionTier;
  className?: string;
}

export default function SubscriptionGate({ 
  children, 
  requiredTier = SubscriptionTier.FREE,
  className 
}: SubscriptionGateProps) {
  const { tier, openUpgradeModal } = useSubscription();

  // Determine if user has access
  const hasAccess = 
    tier === SubscriptionTier.PRO || 
    (tier === SubscriptionTier.FREE && requiredTier !== SubscriptionTier.PRO) ||
    requiredTier === SubscriptionTier.FREE;

  if (hasAccess) return <>{children}</>;

  return (
    <div className={cn("relative overflow-hidden rounded-3xl", className)}>
      <div className="filter blur-sm opacity-50 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10 p-6 text-center">
        <Lock className="w-12 h-12 text-white mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">
          {requiredTier === SubscriptionTier.PRO ? '解鎖深入分析模型' : '解鎖 AI 分析功能'}
        </h3>
        <p className="text-white/80 mb-6">
          {requiredTier === SubscriptionTier.PRO 
            ? '升級至 Pro 方案即可查看完整 AI 交易策略與推理邏輯' 
            : '訂閱即可查看即時 AI 趨勢評估與基本買賣建議'}
        </p>
        <button 
          onClick={openUpgradeModal}
          className="px-6 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all shadow-lg hover:scale-105 active:scale-95"
        >
          立即升級方案
        </button>
      </div>
    </div>
  );
}
