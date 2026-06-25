import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Condition {
  id: string;
  indicator: string;
  operator: string;
  value: string;
}

const INDICATOR_VAR_MAP: Record<string, string> = {
  MACD: 'macd',
  MACD_Signal: 'signal',
  RSI: 'rsi',
  MA_Fast: 'ma_fast',
  MA_Slow: 'ma_slow',
  Bollinger_Upper: 'bb_upper',
  Bollinger_Lower: 'bb_lower',
};

const INDICATORS = Object.keys(INDICATOR_VAR_MAP);
const OPERATORS = ['>', '<', '==', 'cross_over', 'cross_under'];

const INDICATOR_SETUP: Record<string, string> = {
  MACD: 'macd, signal = le.indicators.MACD()',
  MACD_Signal: 'macd, signal = le.indicators.MACD()',
  RSI: 'rsi = le.indicators.RSI()',
  MA_Fast: 'ma_fast = le.indicators.MA(period=20)',
  MA_Slow: 'ma_slow = le.indicators.MA(period=50)',
  Bollinger_Upper: 'bb_upper, bb_lower = le.indicators.Bollinger()',
  Bollinger_Lower: 'bb_upper, bb_lower = le.indicators.Bollinger()',
};

export default function VisualStrategyBuilder({ onChange }: { onChange: (script: string) => void }) {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: '1', indicator: 'MACD', operator: 'cross_over', value: 'MACD_Signal' }
  ]);

  const generateScript = (conds: Condition[]) => {
    // 收集所有被左側或右側使用到的指標
    const usedKeys = new Set<string>();
    conds.forEach(c => {
      if (INDICATOR_SETUP[c.indicator]) usedKeys.add(c.indicator);
      if (INDICATOR_SETUP[c.value]) usedKeys.add(c.value);
    });
    
    const indicatorLines = Array.from(usedKeys)
      .map(i => INDICATOR_SETUP[i])
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe
      .join('\n');

    const condString = conds.map(c => {
      const leftVar = INDICATOR_VAR_MAP[c.indicator] || c.indicator;
      const rightVar = INDICATOR_VAR_MAP[c.value] || c.value;

      if (c.operator === 'cross_over' || c.operator === 'cross_under') {
        return `le.${c.operator}(${leftVar}, ${rightVar})`;
      }
      return `${leftVar} ${c.operator} ${rightVar}`;
    }).join(' and ');

    const logicCode = condString 
      ? `if ${condString}:\n    strategy.emit_order("BUY", quantity=1000, type="MARKET")` 
      : 'pass';

    return (
      `import liquid_engine as le\n\nstrategy = le.Strategy("VisualStrategy")\n\n` +
      `# Indicators\n${indicatorLines}\n\n` +
      `# Logic\n${logicCode}\n`
    );
  };


  const generatedScript = useMemo(() => generateScript(conditions), [conditions]);

  useEffect(() => {
    onChange(generatedScript);
  }, [generatedScript, onChange]);

  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addCondition = () => {
    setConditions([...conditions, { id: Date.now().toString(), indicator: 'RSI', operator: '<', value: '30' }]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="p-4 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">進場條件</h3>
        <button type="button" onClick={addCondition}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition">
          <Plus size={12}/> 新增條件
        </button>
      </div>
      
      <div className="flex flex-col gap-2">
        {conditions.map((c) => (
          <div key={c.id} className="flex items-center gap-2 bg-[var(--bg-color)] p-2 rounded-lg border border-[var(--border-color)]">
            <select aria-label="技術指標" value={c.indicator} onChange={(e) => updateCondition(c.id, 'indicator', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20">
              {INDICATORS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <select aria-label="條件運算子" value={c.operator} onChange={(e) => updateCondition(c.id, 'operator', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20">
              {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input aria-label="條件數值或指標" type="text" value={c.value} onChange={(e) => updateCondition(c.id, 'value', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 w-20" placeholder="數值/指標" />
            <button type="button" onClick={() => removeCondition(c.id)} aria-label="移除條件" disabled={conditions.length <= 1}
              className="ml-auto text-zinc-600 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition">
              <Trash2 size={12}/>
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
