/**
 * src/components/AutoTrading/OptimizationPanel.tsx
 * 自動優化面板：顯示進化提案並允許用戶應用新參數
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight, Check, X, RefreshCw, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

interface Props {
  symbol: string;
  onApply: (params: any) => void;
}

export function OptimizationPanel({ symbol, onApply }: Props) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [proposal, setProposal] = useState<any>(null);

  const startScan = async () => {
    setScanning(true);
    setProposal(null);
    try {
      const data = await api.optimizeAutotrading({ symbol, period: 90 });
      if (data.ok && data.proposal) {
        setProposal(data.proposal);
      } else {
        alert(t('autotrading.optimizer.noNeed', '目前的參數已經是該標的最佳配置，無需優化。'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-violet-600/10 border border-violet-500/30 p-4 rounded-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-violet-400 animate-pulse" />
          <div>
            <div className="text-[11px] font-bold text-white uppercase tracking-wider">{t('autotrading.optimizer.title', 'Auto-Optimizer')}</div>
            <div className="text-[9px] text-violet-400/70 italic">{t('autotrading.optimizer.hint', '尋找能讓 {{symbol}} 獲利更高的參數組合', { symbol })}</div>
          </div>
        </div>
        <button
          onClick={startScan}
          disabled={scanning}
          className={cn(
            "px-4 py-1.5 rounded text-[10px] font-bold transition-all flex items-center gap-2",
            scanning ? "bg-white/5 text-white/20" : "bg-violet-600 text-white hover:bg-violet-500"
          )}
        >
          {scanning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {scanning ? t('autotrading.optimizer.scanning', 'SCANNING...') : t('autotrading.optimizer.scanForEvolution', 'SCAN FOR EVOLUTION')}
        </button>
      </div>

      {proposal ? (
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-sm p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-400 uppercase">{t('autotrading.optimizer.proposalFound', '進化提案發現！預期提升 {{pct}}% ROI', { pct: proposal.improvementPct })}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-2 bg-black/40 rounded border border-white/5">
              <div className="text-[8px] text-white/30 uppercase mb-2">{t('autotrading.optimizer.currentConfig', '目前配置')}</div>
              <div className="text-[10px] text-white/60 space-y-1 font-mono">
                <div>{t('autotrading.optimizer.field.rsi', 'RSI')}: {proposal.originalParams.RSI_REVERSION?.period}</div>
                <div>{t('autotrading.optimizer.field.stopLoss', 'Stop Loss')}: {proposal.originalParams.stopLossPct}%</div>
                <div>{t('autotrading.optimizer.field.takeProfit', 'Take Profit')}: {proposal.originalParams.takeProfitPct}%</div>
              </div>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20 relative overflow-hidden">
               <div className="absolute -right-2 -bottom-2 opacity-5">
                 <ArrowRight className="h-12 w-12 text-emerald-400" />
               </div>
              <div className="text-[8px] text-emerald-400/50 uppercase mb-2">{t('autotrading.optimizer.suggestedConfig', '建議配置')}</div>
              <div className="text-[10px] text-emerald-300 space-y-1 font-mono">
                <div>{t('autotrading.optimizer.field.rsi', 'RSI')}: <span className="font-bold underline">{proposal.betterParams.RSI_REVERSION?.period}</span></div>
                <div>{t('autotrading.optimizer.field.stopLoss', 'Stop Loss')}: <span className="font-bold underline">{proposal.betterParams.stopLossPct}%</span></div>
                <div>{t('autotrading.optimizer.field.takeProfit', 'Take Profit')}: <span className="font-bold underline">{proposal.betterParams.takeProfitPct}%</span></div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-white/50 bg-black/20 p-2 rounded italic">
            " {proposal.reason} "
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onApply(proposal.betterParams)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-2 rounded flex items-center justify-center gap-2"
            >
              <Check className="h-3 w-3" /> {t('autotrading.optimizer.applyNow', '立即套用進化參數')}
            </button>
            <button
              onClick={() => setProposal(null)}
              className="px-4 bg-white/5 hover:bg-white/10 text-white/50 text-[10px] py-2 rounded"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : !scanning && (
        <div className="h-[200px] flex flex-col items-center justify-center border border-dashed border-white/5 rounded-sm opacity-20">
           <Sparkles className="h-6 w-6 mb-2" />
           <div className="text-[10px]">{t('autotrading.optimizer.scanPrompt', '點擊上方按鈕開始進行參數優化掃描')}</div>
        </div>
      )}
    </div>
  );
}
