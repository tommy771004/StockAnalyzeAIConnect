import React, { useState, memo } from 'react';
import { runBacktest, BacktestConfig } from '../services/backtestEngine';
import { BacktestResult, HistoricalData } from '../types';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { safeCn } from '../utils/helpers';

interface Props {
  history: HistoricalData[];
}

const BacktestPanelInner: React.FC<Props> = ({ history }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [result, setResult] = useState<BacktestResult | null>(null);

  const handleRun = () => {
    const shortPeriod = 50;
    const longPeriod = 200;
    const signals: ('BUY' | 'SELL' | 'HOLD')[] = [];
    let position = 0;

    for (let i = 0; i < history.length; i++) {
      if (i < longPeriod) {
        signals.push('HOLD');
        continue;
      }
      const shortSMA = history.slice(i - shortPeriod, i).reduce((a, b) => a + (Number(b?.close) || 0), 0) / shortPeriod;
      const longSMA = history.slice(i - longPeriod, i).reduce((a, b) => a + (Number(b?.close) || 0), 0) / longPeriod;
      if (!isFinite(shortSMA) || !isFinite(longSMA)) { signals.push('HOLD'); continue; }

      if (position === 0 && shortSMA > longSMA) {
        signals.push('BUY');
        position = 1;
      } else if (position === 1 && shortSMA < longSMA) {
        signals.push('SELL');
        position = 0;
      } else {
        signals.push('HOLD');
      }
    }

    const config: BacktestConfig = {
      initialCapital: 100000,
      commissionRate: 0.001425,
      minimumCommission: 20,
      slippageRate: 0.001,
      taxRate: 0.003,
      positionSizing: 'all-in'
    };

    const res = runBacktest(history as HistoricalData[], signals, config);
    setResult(res);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={safeCn("liquid-glass rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)]", compact ? "p-2" : "p-4")}
    >
      <h3 className={safeCn("font-bold text-[var(--text-color)]", compact ? "text-sm mb-2" : "text-base mb-4")}>SMA 交叉回測 (50/200)</h3>
      <button 
        onClick={handleRun}
        className={safeCn("w-full bg-emerald-500/10 text-emerald-400 rounded-lg font-bold border border-emerald-500/20 hover:bg-emerald-500/20 transition-all", compact ? "py-1.5 text-xs" : "py-2.5 text-sm")}
      >
        執行回測
      </button>
      {result && (
        <div className={safeCn("text-[var(--text-color)] opacity-70", compact ? "mt-2 space-y-1 text-xs" : "mt-4 space-y-2 text-sm")}>
          <div className="flex justify-between"><span>總報酬:</span> <span className="text-[var(--text-color)]">{result.totalReturn.toFixed(2)}%</span></div>
          <div className="flex justify-between"><span>最大回撤:</span> <span className="text-[var(--text-color)]">{result.maxDrawdown.toFixed(2)}%</span></div>
          <div className="flex justify-between"><span>交易次數:</span> <span className="text-[var(--text-color)]">{result.totalTrades}</span></div>
        </div>
      )}
    </motion.div>
  );
};
export const BacktestPanel = memo(BacktestPanelInner);
