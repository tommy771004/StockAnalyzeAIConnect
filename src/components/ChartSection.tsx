import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { safeCn } from '../utils/helpers';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';

const ChartWidget = React.lazy(() => import('./ChartWidget').catch((err: any) => {
  console.error('Failed to lazy-load ChartWidget:', err);
  return {
    default: () => <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-xs">圖表載入失敗</div>,
  };
}));

interface ChartSectionProps {
  symbol: string;
  model: string;
  focusMode: boolean;
  data: HistoricalData[];
  timeframe?: string;
  onTimeframeChange?: (timeframe: string) => void;
}

export const ChartSection: React.FC<ChartSectionProps> = React.memo(({ data, focusMode, symbol, timeframe, onTimeframeChange }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={safeCn(
        "liquid-glass no-swipe flex-1 relative overflow-hidden transition flex flex-col", 
        focusMode ? "rounded-none p-0" : compact ? "rounded-2xl p-1" : "rounded-2xl p-2 sm:p-4"
      )}
    >
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-emerald-400 text-xs"><Loader2 className="animate-spin"/></div>}>
        <ChartWidget symbol={symbol} data={data} focusMode={focusMode} timeframe={timeframe} onTimeframeChange={onTimeframeChange} />
      </Suspense>
    </motion.div>
  );
});
