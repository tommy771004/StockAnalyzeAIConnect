/**
 * src/components/AutoTrading/StrategyFlowBuilder.tsx
 * 最終進化版：具備多路徑分支與權重感知決策地圖
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Zap, ShieldAlert, ShoppingCart, Cpu, Activity, TrendingUp, Compass, Target, BarChart3, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { StrategyParams } from './types';

interface Props {
  params: StrategyParams;
  onChange: (params: StrategyParams) => void;
  activeHeat?: number;
}

export function StrategyFlowBuilder({ params, onChange, activeHeat = 0 }: Props) {
  const { t } = useTranslation();
  const updateParam = (key: keyof StrategyParams, value: any) => {
    onChange({ ...params, [key]: value });
  };

  const intensity = Math.min(100, Math.abs(activeHeat));
  const isFiring = intensity > 70;

  // 輔助組件：策略節點
  const StrategyNode = ({ title, weight, active, color = "cyan", icon: Icon }: any) => (
    <div className={cn(
      "relative p-3 rounded-lg border bg-black/80 backdrop-blur-xl transition-all duration-700 group/node",
      active ? `border-${color}-500/40 shadow-[0_0_15px_rgba(var(--${color}-rgb),0.1)]` : "border-white/5 opacity-40"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-1 rounded-sm", `bg-${color}-500/20`)}>
          <Icon className={cn("h-3.5 w-3.5", `text-${color}-400`)} />
        </div>
        <div className="text-[8px] font-mono text-white/40 uppercase">{t('autotrading.strategyFlow.weight', 'Weight')}: {(weight * 100).toFixed(0)}%</div>
      </div>
      <div className="text-[10px] font-bold text-white mb-2 uppercase tracking-tighter">{title}</div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
         <div 
           className={cn("h-full transition-all duration-1000", `bg-${color}-500`)} 
           style={{ width: `${weight * 100}%`, boxShadow: active ? `0 0 10px ${color}` : 'none' }} 
         />
      </div>
      {active && (
        <div className={cn("absolute -inset-1 rounded-lg animate-pulse -z-10 blur-sm", `bg-${color}-500/10`)} />
      )}
    </div>
  );

  return (
    <div className="p-8 bg-(--color-term-bg) rounded-sm border border-white/5 relative overflow-hidden group">
      {/* 動態背景雷達圖裝飾 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/[0.02] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-white/[0.02] rounded-full pointer-events-none" />

      <div className="relative z-10 space-y-6">
        
        {/* Step 1: Intelligence Hub */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center">
            <div className={cn(
              "px-6 py-3 rounded-full border backdrop-blur-md flex items-center gap-3 transition-all",
              params.enableMTF ? "border-blue-400 bg-blue-500/10 shadow-[0_0_15px_rgba(96,165,250,0.2)]" : "border-blue-500/30 bg-blue-500/5"
            )}>
              <Database className="h-4 w-4 text-blue-400" />
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white uppercase tracking-widest">{t('autotrading.strategyFlow.globalIntelligenceHub', 'Global Intelligence Hub')}</span>
                {params.enableMTF && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Layers className="h-2.5 w-2.5 text-blue-300" />
                    <span className="text-[8px] text-blue-300 font-mono uppercase">{t('autotrading.strategyFlow.mtfFilter', 'MTF Filter')}: {params.mtfTimeframe} / {params.mtfTrendIndicator}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <div className={cn("w-1 h-1 rounded-full bg-blue-400", params.enableMTF && "animate-ping")} />
                <div className="w-1 h-1 rounded-full bg-blue-400" />
              </div>
            </div>
            <div className="h-8 w-px bg-gradient-to-b from-blue-500/50 to-transparent shadow-[0_0_8px_blue]" />
          </div>
        </div>

        {/* Step 2: Multi-Strategy Matrix (Parallel Logic) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* 連接線裝飾 */}
          <div className="hidden md:block absolute top-[-20px] left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <StrategyNode 
            title={t('autotrading.strategy.names.rsiReversion', 'RSI Reversion')} 
            icon={TrendingUp}
            weight={params.RSI_REVERSION?.weight || 0.2} 
            active={intensity > 20}
            color="cyan"
          />
          <StrategyNode 
            title={t('autotrading.strategyFlow.bollingerBreak', 'Bollinger Break')} 
            icon={Compass}
            weight={params.BOLLINGER_BREAKOUT?.weight || 0.2} 
            active={intensity > 40}
            color="amber"
          />
          <StrategyNode 
            title={t('autotrading.strategy.names.macdMomentum', 'MACD Momentum')} 
            icon={Target}
            weight={params.MACD_CROSS?.weight || 0.2} 
            active={intensity > 60}
            color="indigo"
          />
        </div>

        {/* Step 3: Neural Consensus Engine */}
        <div className="flex flex-col items-center">
          <div className="h-8 w-px bg-white/10" />
          <div className={cn(
            "w-full max-w-sm p-6 rounded-lg border transition-all duration-1000",
            isFiring ? "border-violet-500 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,0.3)]" : "border-white/5 bg-black/40"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cpu className={cn("h-5 w-5", isFiring ? "text-violet-400 animate-spin" : "text-white/20")} />
                <span className="text-[11px] font-bold text-white uppercase tracking-widest">{t('autotrading.strategyFlow.neuralConsensusEngine', 'Neural Consensus Engine')}</span>
              </div>
              <div className="text-[10px] font-mono text-violet-400">{intensity}% {t('autotrading.strategyFlow.match', 'Match')}</div>
            </div>
            
            {/* AI Threshold Slider Slider */}
            <div className="space-y-3">
              <div className="flex justify-between text-[9px] text-white/40 uppercase">
                 <span>{t('autotrading.strategyFlow.confidenceThreshold', 'Confidence Threshold')}</span>
                 <span>{params.AI_LLM?.confidenceThreshold}%</span>
              </div>
              <input 
                type="range" min="50" max="95"
                value={params.AI_LLM?.confidenceThreshold ?? 75}
                onChange={(e) => updateParam('AI_LLM', { 
                  ...params.AI_LLM, 
                  confidenceThreshold: Number(e.target.value) 
                })}
                className="w-full accent-violet-500 h-1 bg-white/5 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Step 3.5: Risk-Based Sizing Engine */}
        <div className="flex flex-col items-center">
          <div className="h-8 w-px bg-white/10" />
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-full border transition-all",
            params.sizingMethod === 'risk_base' ? "border-violet-500/40 bg-violet-500/10" : "border-white/10 bg-white/5"
          )}>
             <BarChart3 className={cn("h-3 w-3", params.sizingMethod === 'risk_base' ? "text-violet-400" : "text-white/20")} />
             <span className={cn(
               "text-[9px] font-bold uppercase tracking-widest",
               params.sizingMethod === 'risk_base' ? "text-violet-300" : "text-white/40"
             )}>
               {t('autotrading.strategyFlow.positionSizing', 'Position Sizing')}: {params.sizingMethod === 'risk_base' ? `${t('autotrading.strategyFlow.risk', 'Risk')} ${params.riskPerTradePct || 1}%` : t('autotrading.strategyFlow.fixedMode', 'Fixed Mode')}
             </span>
          </div>
        </div>

        {/* Step 4: Final Execution */}
        <div className="flex flex-col items-center">
          <div className="h-8 w-px bg-white/10" />
          <div className={cn(
            "px-8 py-4 rounded border transition-all duration-500 flex items-center gap-4",
            isFiring ? "border-emerald-500 bg-emerald-500/20" : "border-white/5 bg-black/20"
          )}>
            <ShoppingCart className={cn("h-5 w-5", isFiring ? "text-emerald-400" : "text-white/10")} />
            <div className="text-[12px] font-bold text-white uppercase tracking-[0.2em]">
              {isFiring ? t('autotrading.strategyFlow.executionAuthorized', 'EXECUTION_AUTHORIZED') : t('autotrading.strategyFlow.waitingForAlpha', 'WAITING_FOR_ALPHA')}
            </div>
            <Zap className={cn("h-4 w-4", isFiring ? "text-emerald-400 animate-pulse" : "text-white/10")} />
          </div>
        </div>

      </div>

      {/* 底部裝飾與說明 */}
      <div className="mt-8 pt-8 border-t border-white/5 flex justify-center">
        <div className="flex gap-8 text-[9px] font-bold text-white/20 uppercase tracking-widest">
           <span>{t('autotrading.strategyFlow.alphaVersion', 'Alpha v3.0')}</span>
           <span>{t('autotrading.strategyFlow.parallelLogicExecution', 'Parallel Logic Execution')}</span>
           <span>{t('autotrading.strategyFlow.endToEndVisualized', 'End-to-End Visualized')}</span>
        </div>
      </div>
    </div>
  );
}
