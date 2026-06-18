/**
 * src/components/AutoTrading/StrategyTab.tsx
 * 策略分頁組件：切換視覺化與列表視圖，並整合優化面板
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapIcon, List, Settings2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { StrategyFlowBuilder } from './StrategyFlowBuilder';
import { StrategySelector } from './StrategySelector';
import { OptimizationPanel } from './OptimizationPanel';
import type { StrategyType, StrategyParams } from './types';

interface Props {
  strategies: StrategyType[];
  params: StrategyParams;
  onStrategiesChange: (s: StrategyType[]) => void;
  onParamsChange: (p: StrategyParams) => void;
  isRunning: boolean;
  activeHeat?: number;
  tradingHours?: { start: string; end: string };
  onTradingHoursChange?: (hours: { start: string; end: string }) => void;
}

export function StrategyTab({ strategies, params, onStrategiesChange, onParamsChange, isRunning, activeHeat, tradingHours, onTradingHoursChange }: Props) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* View Toggle */}
      <div className="flex justify-between items-center bg-black/40 p-1.5 rounded border border-white/5">
        <div className="flex items-center gap-2 px-2">
           <Settings2 className="h-3 w-3 text-white/20" aria-hidden="true" />
           <span className="text-[9px] font-bold text-(--color-term-muted) uppercase tracking-widest">{t('autotrading.strategy.tacticalConfig')}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            aria-label={t('autotrading.strategy.showMap', 'Show strategy map')}
            aria-pressed={viewMode === 'map'}
            className={cn("focus-ring p-1.5 rounded motion-safe:transition-colors", viewMode === 'map' ? "bg-violet-500 text-white shadow-lg" : "text-white/50 hover:text-white")}
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label={t('autotrading.strategy.showList', 'Show strategy list')}
            aria-pressed={viewMode === 'list'}
            className={cn("focus-ring p-1.5 rounded motion-safe:transition-colors", viewMode === 'list' ? "bg-violet-500 text-white shadow-lg" : "text-white/50 hover:text-white")}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Strategy View */}
      {viewMode === 'map' ? (
        <StrategyFlowBuilder params={params} onChange={onParamsChange} activeHeat={activeHeat} />
      ) : (
        <StrategySelector 
          selected={strategies} 
          params={params} 
          onChange={(s, p) => { onStrategiesChange(s); onParamsChange(p); }} 
          disabled={isRunning}
          tradingHours={tradingHours}
          onTradingHoursChange={onTradingHoursChange}
        />
      )}

      {/* Global Optimization */}
      <div className="pt-6 border-t border-white/5">
        <OptimizationPanel symbol="GLOBAL" onApply={onParamsChange} />
      </div>
    </div>
  );
}
