import React, { useState, memo, useMemo } from 'react';
import { runBacktest, BacktestConfig } from '../services/backtestEngine';
import { BacktestResult, HistoricalData } from '../types';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { safeCn } from '../utils/helpers';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { Activity, Code, Settings2 } from 'lucide-react';
import { pushLog } from './TradeLogger';
import { STORAGE_KEYS } from '../utils/storage';

interface Props {
  history: HistoricalData[];
}

const BacktestPanelInner: React.FC<Props> = ({ history }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [prompt, setPrompt] = useState('當 RSI(14) 低於 30 且 MACD 黃金交叉時買入，RSI 高於 70 賣出');
  const [isRunning, setIsRunning] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const handleDynamicRun = async () => {
    if (!history || history.length === 0) return;
    setIsRunning(true);
    setGeneratedCode(null);
    pushLog('info', 'AGENT', `Starting Dynamic Backtest Generator...`);
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const res = await fetch('/api/agent/dynamic-strategy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          prompt, 
          historyData: history,
          openrouterKey: settings.openrouterKey || ''
        })
      });

      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setGeneratedCode(data.code);
      pushLog('success', 'AGENT', `Strategy Code Generated & VM Executed Successfully!`);

      // map numeric signals (1, -1, 0) to ('BUY', 'SELL', 'HOLD')
      const signalsRaw: number[] = data.signals;
      const mappedSignals = signalsRaw.map(v => v === 1 ? 'BUY' : v === -1 ? 'SELL' : 'HOLD') as ('BUY'|'SELL'|'HOLD')[];

      const config: BacktestConfig = {
        initialCapital: 100000,
        commissionRate: 0.001425,
        minimumCommission: 20,
        slippageRate: 0.001,
        taxRate: 0.003,
        positionSizing: 'all-in'
      };

      const backtestRes = runBacktest(history, mappedSignals, config);
      setResult(backtestRes);
    } catch (e: any) {
      pushLog('error', 'AGENT', `Dynamic Backtest Error: ${e.message}`);
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  };

  const equityData = useMemo(() => {
    if (!result || !result.equityCurve) return [];
    return result.equityCurve.map((d, i) => ({
       index: i,
       date: d.date,
       equity: d.equity
    }));
  }, [result]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={safeCn("flex flex-col h-full", compact ? "gap-2" : "gap-4")}
    >
      <div className="flex flex-col gap-2 pb-2 border-b border-white/10">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-2 text-indigo-400">
             <Activity size={16} />
             <span className="text-xs font-black tracking-widest uppercase">DYNAMIC AGENT</span>
           </div>
           <button type="button"> {isRunning ? 'GENERATING...' : 'GENERATE & RUN'}
           </button>
         </div>
         {/* Agent UI specific input for dynamic strategy */}
         <div className="relative">
           <input 
             className="w-full bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 py-1.5 pl-7 pr-2 focus:outline-none focus:border-indigo-500/50"
             value={prompt}
             onChange={e => setPrompt(e.target.value)}
             placeholder="輸入您想讓 AI 實作的策略邏輯…"
             onKeyDown={(e) => e.key === 'Enter' && handleDynamicRun()}
           />
           <Settings2 size={12} className="absolute left-2.5 top-2 text-zinc-500" />
         </div>
      </div>

      {!result ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-2 p-10">
          {isRunning ? (
            <Code size={32} className="animate-pulse text-indigo-500" />
          ) : (
            <Activity size={32} />
          )}
          <div className="text-xs font-medium uppercase tracking-widest text-center max-w-[200px]">
             {isRunning ? 'Agent Writing Code in Sandbox...' : 'Awaiting Strategy Context'}
          </div>
        </div>
      ) : (
        <>
          {/* Equity Curve Chart */}
          <div className="w-full h-[140px] mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#888' }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  formatter={(val: number) => [`NT$ ${val.toLocaleString()}`, 'Equity']}
                  labelFormatter={(label) => `Date: ${equityData[label]?.date || label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="equity" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* KPI Grid */}
          {result.metrics && (
             <div className="grid grid-cols-2 gap-2 mt-auto relative">
                {/* Code overlay button */}
                {generatedCode && (
                  <button type="button" onClick={(e) => {}}
                     className="absolute -top-6 right-0 text-[10px] text-zinc-400 hover:text-indigo-400 flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded"
                     title="View Code in DevTools Console"
                  >
                     <Code size={10} /> VIEW SOURCE
                  </button>
                )}
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Total Return</div>
                 <div className={safeCn("text-lg font-black tracking-tighter", result.metrics.roi > 0 ? "text-emerald-400" : "text-rose-400")} style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.roi > 0 ? '+' : ''}{result.metrics.roi.toFixed(1)}%
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Win Rate</div>
                 <div className="text-lg text-white font-black tracking-tighter" style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.winRate.toFixed(1)}% <span className="text-[10px] text-zinc-500 font-normal">({result.metrics.totalTrades} trades)</span>
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Max Drawdown</div>
                 <div className="text-sm text-rose-400 font-black tracking-tighter mt-1" style={{ fontFamily: 'var(--font-data)' }}>
                   -{result.metrics.maxDrawdown.toFixed(1)}%
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Sharpe Ratio</div>
                 <div className={safeCn("text-sm font-black tracking-tighter mt-1", result.metrics.sharpe > 1 ? "text-emerald-400" : "text-white")} style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.sharpe.toFixed(2)}
                 </div>
               </div>
             </div>
          )}
        </>
      )}
    </motion.div>
  );
};
export const BacktestPanel = memo(BacktestPanelInner);
