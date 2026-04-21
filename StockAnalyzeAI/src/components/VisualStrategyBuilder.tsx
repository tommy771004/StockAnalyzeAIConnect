import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Condition {
  id: string;
  indicator: string;
  operator: string;
  value: string;
}

const INDICATORS = ['MACD', 'RSI', 'MA_Fast', 'MA_Slow', 'Bollinger_Upper', 'Bollinger_Lower'];
const OPERATORS = ['>', '<', '==', 'cross_over', 'cross_under'];

export default function VisualStrategyBuilder({ onChange }: { onChange: (script: string) => void }) {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: '1', indicator: 'MACD', operator: 'cross_over', value: 'Signal' }
  ]);

  const generateScript = (conds: Condition[]) => {
    let script = `import liquid_engine as le\n\nstrategy = le.Strategy("VisualStrategy")\n\n`;
    
    // Define indicators (simplified mapping)
    script += `# Indicators\nmacd, signal = le.indicators.MACD()\n`;
    script += `rsi = le.indicators.RSI()\n`;
    script += `ma_fast = le.indicators.MA(period=20)\n\n`;

    // Build conditions
    const condString = conds.map(c => {
      if (c.operator === 'cross_over' || c.operator === 'cross_under') {
        return `le.${c.operator}(${c.indicator.toLowerCase()}, ${c.value.toLowerCase()})`;
      }
      return `${c.indicator.toLowerCase()} ${c.operator} ${c.value}`;
    }).join(' and ');

    script += `# Logic\nif ${condString}:\n    strategy.emit_order("BUY", quantity=1000, type="MARKET")\n`;
    
    return script;
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
        <button onClick={addCondition} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
          <Plus size={12}/> 新增條件
        </button>
      </div>
      
      <div className="flex flex-col gap-2">
        {conditions.map((c) => (
          <div key={c.id} className="flex items-center gap-2 bg-[var(--bg-color)] p-2 rounded-lg border border-[var(--border-color)]">
            <select aria-label="技術指標" value={c.indicator} onChange={(e) => updateCondition(c.id, 'indicator', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none">
              {INDICATORS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <select aria-label="條件運算子" value={c.operator} onChange={(e) => updateCondition(c.id, 'operator', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none">
              {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input aria-label="條件數值或指標" type="text" value={c.value} onChange={(e) => updateCondition(c.id, 'value', e.target.value)} className="bg-transparent text-xs text-zinc-300 focus:outline-none w-20" placeholder="數值/指標" />
            <button onClick={() => removeCondition(c.id)} className="ml-auto text-zinc-600 hover:text-rose-400">
              <Trash2 size={12}/>
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
