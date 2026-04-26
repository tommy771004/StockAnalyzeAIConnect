/**
 * src/components/AutoTrading/CopyTradingPanel.tsx
 * 終極版：具備影子跟單與階梯延遲顯示的管理面板
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Ghost, Zap, Clock, ShieldCheck, Target, ArrowRightLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

interface FollowerAccount {
  id: string;
  name: string;
  multiplier: number;
  enabled: boolean;
  mode: 'live' | 'shadow';
  delay: number;
  balance: number;
}

export function CopyTradingPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [followers, setFollowers] = useState<FollowerAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchFollowers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAutotradingFollowers();
      if (!data.ok) throw new Error(data.message ?? t('autotrading.copyTrading.fetchFailed', '無法載入跟單帳戶'));
      setFollowers((data.followers ?? []) as FollowerAccount[]);
    } catch (e) {
      setFollowers([]);
      setError((e as Error).message || t('autotrading.copyTrading.fetchFailed', '無法載入跟單帳戶'));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchFollowers();
  }, []);

  if (loading) return (
    <div className="h-40 flex items-center justify-center">
      <div className="text-[10px] text-white/20 animate-pulse font-mono">{t('autotrading.copyTrading.retrievingFollowers', 'RETRIEVING_FOLLOWERS...')}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 border border-rose-500/30 bg-rose-500/10 rounded-sm flex items-center justify-between gap-3">
          <div className="text-[10px] text-rose-300">{error}</div>
          <button
            type="button"
            onClick={fetchFollowers}
            className="px-2 py-1 text-[9px] border border-rose-400/40 text-rose-200 rounded hover:bg-rose-500/20"
          >
            {t('autotrading.copyTrading.retry', '重試')}
          </button>
        </div>
      )}

      {/* 系統拓撲圖裝飾 */}
      <div className="bg-black/20 border border-white/5 p-4 rounded-sm flex items-center justify-center gap-8 py-6">
         <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500 flex items-center justify-center bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
               <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <span className="text-[9px] font-bold text-white uppercase tracking-widest">{t('autotrading.copyTrading.masterEngine', 'Master Engine')}</span>
         </div>
         <ArrowRightLeft className="h-4 w-4 text-white/10" />
         <div className="flex gap-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-75" />
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse delay-150" />
         </div>
         <ArrowRightLeft className="h-4 w-4 text-white/10" />
         <div className="text-[9px] font-bold text-white/40 uppercase">{t('autotrading.copyTrading.followerNetwork', 'Follower Network')}</div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {followers.length === 0 && !error && (
          <div className="p-4 text-[10px] text-(--color-term-muted) text-center border border-(--color-term-border) rounded-sm">
            {t('autotrading.copyTrading.empty', '目前沒有可用的跟單帳戶')}
          </div>
        )}
        {followers.map((acc) => (
          <div key={acc.id} className={cn(
            "group bg-black/40 border rounded-sm p-4 transition-all duration-500",
            acc.mode === 'shadow' ? "border-indigo-500/20" : "border-white/5 hover:border-emerald-500/30"
          )}>
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                 <div className={cn(
                   "w-12 h-12 rounded flex flex-col items-center justify-center transition-all duration-700",
                   acc.mode === 'shadow' ? "bg-indigo-500/10 text-indigo-400" : "bg-emerald-500/10 text-emerald-400"
                 )}>
                    {acc.mode === 'shadow' ? <Ghost className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                    <span className="text-[7px] mt-1 font-bold">
                      {acc.mode === 'shadow'
                        ? t('autotrading.copyTrading.mode.shadow', 'SHADOW')
                        : t('autotrading.copyTrading.mode.live', 'LIVE')}
                    </span>
                 </div>
                 <div>
                    <div className="text-[14px] font-bold text-white group-hover:text-cyan-300 transition-colors">{acc.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                       <Clock className="h-3 w-3 text-white/20" />
                       <span className="text-[9px] text-white/40 uppercase">
                         {t('autotrading.copyTrading.staggeredDelay', 'Staggered Delay')}: {acc.delay > 0 ? `${acc.delay}ms` : t('autotrading.copyTrading.random', 'RANDOM')}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-8">
                 <div className="text-right">
                    <div className="text-[8px] text-white/30 uppercase">{t('autotrading.copyTrading.multiplier', 'Multiplier')}</div>
                    <div className="text-[16px] font-mono font-bold text-cyan-400">{acc.multiplier}x</div>
                 </div>
                 
                 <div className="text-right">
                    <div className="text-[8px] text-white/30 uppercase">{t('autotrading.copyTrading.status', 'Status')}</div>
                    <div className={cn("text-[10px] font-bold uppercase", acc.enabled ? "text-emerald-400" : "text-white/20")}>
                       {acc.enabled ? t('autotrading.copyTrading.streaming', 'Streaming') : t('autotrading.copyTrading.offline', 'Offline')}
                    </div>
                 </div>

                 <button className={cn(
                   "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                   acc.enabled ? "bg-emerald-500/20 text-emerald-400 shadow-lg" : "bg-white/5 text-white/20"
                 )}>
                    <Target className="h-5 w-5" />
                 </button>
              </div>
            </div>

            {/* 進階功能列 */}
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                     <ShieldCheck className="h-3 w-3 text-cyan-400/50" />
                     <span className="text-[9px] text-white/40 uppercase">{t('autotrading.copyTrading.autoStoploss', 'Auto-Stoploss')}: </span>
                     <span className="text-[9px] font-mono text-cyan-400">-3.5%</span>
                  </div>
                  {acc.mode === 'shadow' && (
                    <div className="bg-indigo-500/10 text-indigo-400 text-[8px] px-2 py-0.5 rounded-full border border-indigo-500/20 animate-pulse">
                      {t('autotrading.copyTrading.testingPhaseNoExecution', 'TESTING_PHASE: NO_REAL_EXECUTION')}
                    </div>
                  )}
               </div>
               <div className="text-[9px] font-mono text-white/20">{t('autotrading.copyTrading.balancePrefix', 'BAL')}: ${acc.balance.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-white/5 rounded border border-white/5">
         <div className="text-[10px] text-cyan-400 font-bold mb-1 uppercase flex items-center gap-2">
            <Zap className="h-3 w-3" /> {t('autotrading.copyTrading.staggeredEntryTitle', '階梯入場技術啟動中')}
         </div>
         <div className="text-[9px] text-white/40 leading-relaxed">
            {t('autotrading.copyTrading.staggeredEntryDesc', '系統會自動為各帳戶分配微秒級的隨機延遲，以確保訂單分佈在不同的微小價差區間，最大程度減少集體交易對市場造成的負面衝擊。')}
         </div>
      </div>
    </div>
  );
}
