import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { safeCn } from '../utils/helpers';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';

const ChartWidget = React.lazy(() => import('./ChartWidget').catch(() => ({
  default: () => <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-xs">圖表載入失敗</div>,
})));

interface ChartSectionProps {
  symbol: string;
  model: string;
  focusMode: boolean;
  data: HistoricalData[];
}

export const ChartSection: React.FC<ChartSectionProps> = React.memo(({ data, focusMode }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={safeCn("liquid-glass rounded-2xl flex-1 h-full relative overflow-hidden transition-all", compact ? "p-2" : "p-4")}
    >
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-emerald-400 text-xs"><Loader2 className="animate-spin"/></div>}>
        <ChartWidget data={data} focusMode={focusMode} />
      </Suspense>
    </motion.div>
  );
});
