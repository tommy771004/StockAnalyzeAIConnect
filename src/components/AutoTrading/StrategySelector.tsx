/**
 * src/components/AutoTrading/StrategySelector.tsx
 * 策略選擇與參數配置 UI (升級版：支援權重與追蹤止損)
 */
import React from 'react';
import { Target, ShieldCheck, Clock, BarChart3, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { StrategyType, StrategyParams } from './types';
import { STRATEGY_LABELS } from './types';

interface Props {
  selected: StrategyType[];
  params: StrategyParams;
  onChange: (strategies: StrategyType[], params: StrategyParams) => void;
  disabled?: boolean;
}

export function StrategySelector({ selected, params, onChange, disabled }: Props) {
  const toggleStrategy = (s: StrategyType) => {
    const nextSelected = selected.includes(s) 
      ? selected.filter(x => x !== s) 
      : [...selected, s];
    
    // Redistribute weights to sum to 1.0
    const nextParams = { ...params };
    if (nextSelected.length > 0) {
      const equalWeight = 1 / nextSelected.length;
      nextSelected.forEach(type => {
        (nextParams as any)[type] = {
          ...((nextParams as any)[type] || {}),
          weight: Number(equalWeight.toFixed(2))
        };
      });
    }
    
    onChange(nextSelected, nextParams);
  };

  const updateParam = (path: string, val: any) => {
    const next = { ...params };
    const parts = path.split('.');
    if (parts.length === 1) {
      (next as any)[parts[0]] = val;
    } else {
      const parent = { ...((next as any)[parts[0]] || {}) };
      parent[parts[1]] = val;
      (next as any)[parts[0]] = parent;
    }
    onChange(selected, next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Target className="h-3 w-3 text-violet-400" />
        <span className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">
          AI Strategies & Weights
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(STRATEGY_LABELS) as StrategyType[]).map(s => {
          const isActive = selected.includes(s);
          const weight = (params as any)[s]?.weight ?? 0.5;
          
          return (
            <div 
              key={s} 
              className={cn(
                "border rounded-sm overflow-hidden transition-all",
                isActive ? "border-violet-500/40 bg-violet-500/5" : "border-(--color-term-border) bg-white/2"
              )}
            >
              <div className="flex items-center gap-3 p-2.5">
                <button
                  type="button"
                  onClick={() => toggleStrategy(s)}
                  disabled={disabled}
                  className="flex-1 text-left flex items-start gap-3 hover:bg-white/3 transition-colors disabled:opacity-50"
                >
                  <div className={cn(
                    "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5",
                    isActive ? "border-violet-400 bg-violet-400 text-black" : "border-(--color-term-muted)"
                  )}>
                    {isActive && <div className="h-1.5 w-1.5 bg-black rounded-full" />}
                  </div>
                  <div>
                    <div className={cn("text-[11px] font-bold", isActive ? "text-violet-300" : "text-(--color-term-text)")}>
                      {STRATEGY_LABELS[s].name}
                    </div>
                    <div className="text-[9px] text-(--color-term-muted) mt-0.5">{STRATEGY_LABELS[s].desc}</div>
                  </div>
                </button>

                {isActive && (
                  <div className="flex flex-col items-end gap-1">
                    <label className="text-[7px] text-violet-400/70 uppercase">Weight</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0" 
                      max="1" 
                      value={weight} 
                      onChange={e => updateParam(`${s}.weight`, Number(e.target.value))}
                      className="w-12 bg-black/40 border border-violet-500/20 rounded px-1 py-0.5 text-[10px] text-violet-300 font-mono text-center" 
                    />
                  </div>
                )}
              </div>

              {isActive && (
                <div className="px-3 pb-3 pt-1 border-t border-violet-500/10 grid grid-cols-3 gap-2 bg-black/20">
                  {s === 'RSI_REVERSION' && (
                    <>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Period</label>
                        <input type="number" value={(params as any).RSI_REVERSION?.period ?? 14} onChange={e => updateParam('RSI_REVERSION.period', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Oversold</label>
                        <input type="number" value={(params as any).RSI_REVERSION?.oversold ?? 30} onChange={e => updateParam('RSI_REVERSION.oversold', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Overbought</label>
                        <input type="number" value={(params as any).RSI_REVERSION?.overbought ?? 70} onChange={e => updateParam('RSI_REVERSION.overbought', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                    </>
                  )}
                  {s === 'BOLLINGER_BREAKOUT' && (
                    <>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Period</label>
                        <input type="number" value={(params as any).BOLLINGER_BREAKOUT?.period ?? 20} onChange={e => updateParam('BOLLINGER_BREAKOUT.period', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">StdDev</label>
                        <input type="number" step="0.1" value={(params as any).BOLLINGER_BREAKOUT?.stdDev ?? 2} onChange={e => updateParam('BOLLINGER_BREAKOUT.stdDev', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                    </>
                  )}
                  {s === 'MACD_CROSS' && (
                    <>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Fast</label>
                        <input type="number" value={(params as any).MACD_CROSS?.fast ?? 12} onChange={e => updateParam('MACD_CROSS.fast', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Slow</label>
                        <input type="number" value={(params as any).MACD_CROSS?.slow ?? 26} onChange={e => updateParam('MACD_CROSS.slow', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-violet-400/50 uppercase">Signal</label>
                        <input type="number" value={(params as any).MACD_CROSS?.signal ?? 9} onChange={e => updateParam('MACD_CROSS.signal', Number(e.target.value))} className="w-full bg-transparent border-b border-violet-500/20 text-[10px] text-white font-mono" />
                      </div>
                    </>
                  )}
                  {s === 'AI_LLM' && (
                    <div className="col-span-3">
                      <label className="text-[8px] text-violet-400/50 uppercase">Min Confidence Threshold</label>
                      <input 
                        type="range" 
                        min="50" 
                        max="95" 
                        value={params.AI_LLM?.confidenceThreshold ?? 65} 
                        onChange={e => updateParam('AI_LLM.confidenceThreshold', Number(e.target.value))}
                        className="w-full h-1 bg-violet-500/20 rounded-lg appearance-none cursor-pointer accent-violet-500"
                      />
                      <div className="flex justify-between text-[8px] text-violet-400/40 mt-1 font-mono">
                        <span>LOOSE (50%)</span>
                        <span className="text-violet-300 font-bold">{params.AI_LLM?.confidenceThreshold ?? 65}%</span>
                        <span>STRICT (95%)</span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-violet-500/10 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-violet-300">Explainable AI (進場理由)</span>
                          <span className="text-[7px] text-violet-400/50 uppercase italic">Show alpha reasoning in logs</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateParam('enableReasoning', !params.enableReasoning)}
                          className={cn(
                            "w-8 h-4 rounded-full transition-all relative border",
                            params.enableReasoning ? "bg-violet-500 border-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "bg-white/5 border-white/10"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                            params.enableReasoning ? "right-0.5 bg-white shadow-sm" : "left-0.5 bg-white/20"
                          )} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Position Sizing - New Dynamic Section */}
      <div className="p-3 border border-violet-500/20 bg-violet-500/5 rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3 text-violet-400" />
            <span className="text-[9px] font-bold tracking-widest text-violet-400 uppercase">Position Sizing (動態倉位)</span>
          </div>
          <div className="flex bg-black/40 p-0.5 rounded border border-white/5">
            <button
              onClick={() => updateParam('sizingMethod', 'fixed')}
              className={cn(
                "px-2 py-0.5 text-[8px] rounded-sm transition-all",
                (params.sizingMethod || 'fixed') === 'fixed' ? "bg-violet-500 text-white shadow-lg" : "text-white/40 hover:text-white/70"
              )}
            >
              FIXED
            </button>
            <button
              onClick={() => updateParam('sizingMethod', 'risk_base')}
              className={cn(
                "px-2 py-0.5 text-[8px] rounded-sm transition-all",
                params.sizingMethod === 'risk_base' ? "bg-violet-500 text-white shadow-lg" : "text-white/40 hover:text-white/70"
              )}
            >
              RISK-BASED
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(params.sizingMethod || 'fixed') === 'fixed' ? (
            <div className="col-span-2">
              <label className="text-[7px] text-violet-400/50 uppercase block mb-1">Max Allocation Per Trade</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={params.maxAllocationPerTrade || 100000} 
                  onChange={e => updateParam('maxAllocationPerTrade', Number(e.target.value))} 
                  className="flex-1 bg-black/40 border border-violet-500/20 rounded px-2 py-1 text-[10px] text-white font-mono" 
                />
                <span className="text-[9px] text-violet-400/60">TWD</span>
              </div>
              <p className="text-[7px] text-white/30 mt-1 italic">使用固定金額進行每一筆交易下單。</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[7px] text-violet-400/50 uppercase block mb-1">Risk Per Trade (%)</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={params.riskPerTradePct || 1.0} 
                    onChange={e => updateParam('riskPerTradePct', Number(e.target.value))} 
                    className="w-full bg-black/40 border border-violet-500/20 rounded px-2 py-1 text-[10px] text-white font-mono" 
                  />
                  <span className="text-[9px] text-violet-400/60">%</span>
                </div>
                <p className="text-[6px] text-white/30 mt-1">單筆預期損失佔總資產百分比。</p>
              </div>
              <div>
                <label className="text-[7px] text-violet-400/50 uppercase block mb-1">Max Position Size (%)</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    value={params.maxPositionPct || 20} 
                    onChange={e => updateParam('maxPositionPct', Number(e.target.value))} 
                    className="w-full bg-black/40 border border-violet-500/20 rounded px-2 py-1 text-[10px] text-white font-mono" 
                  />
                  <span className="text-[9px] text-violet-400/60">%</span>
                </div>
                <p className="text-[6px] text-white/30 mt-1">單筆最大持倉上限，避免集中風險。</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Multi-Timeframe Filter - New Section */}
      <div className="p-3 border border-blue-500/20 bg-blue-500/5 rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className={cn("h-3 w-3", params.enableMTF ? "text-blue-400" : "text-white/20")} />
            <span className={cn("text-[9px] font-bold tracking-widest uppercase", params.enableMTF ? "text-blue-400" : "text-white/20")}>
              MTF Filter (多時區趨勢過濾)
            </span>
          </div>
          <button
            onClick={() => updateParam('enableMTF', !params.enableMTF)}
            className={cn(
              "px-2 py-0.5 text-[8px] rounded-sm transition-all border",
              params.enableMTF 
                ? "bg-blue-500/20 border-blue-500/50 text-blue-300" 
                : "bg-white/5 border-white/10 text-white/30"
            )}
          >
            {params.enableMTF ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {params.enableMTF && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
            <div>
              <label className="text-[7px] text-blue-400/50 uppercase block mb-1">Filter Timeframe</label>
              <select 
                value={params.mtfTimeframe || '1h'} 
                onChange={e => updateParam('mtfTimeframe', e.target.value)}
                className="w-full bg-black/40 border border-blue-500/20 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-blue-500/50"
              >
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
              </select>
            </div>
            <div>
              <label className="text-[7px] text-blue-400/50 uppercase block mb-1">Trend Indicator</label>
              <select 
                value={params.mtfTrendIndicator || 'EMA200'} 
                onChange={e => updateParam('mtfTrendIndicator', e.target.value)}
                className="w-full bg-black/40 border border-blue-500/20 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-blue-500/50"
              >
                <option value="EMA200">EMA 200 (Long Term)</option>
                <option value="EMA50">EMA 50 (Mid Term)</option>
                <option value="MACD">MACD Baseline</option>
                <option value="PRICE_ACTION">Higher High/Low</option>
              </select>
            </div>
            <div className="col-span-2">
              <p className="text-[7px] text-blue-300/40 italic">
                ※ 僅在大時區趨勢與交易方向一致時才執行下單，有效過濾震盪與假突破。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Risk Management */}
      <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span className="text-[9px] font-bold tracking-widest text-emerald-400 uppercase">Risk & Exit Control</span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[7px] text-emerald-400/50 uppercase block mb-1">Stop Loss</label>
            <div className="flex items-center gap-1">
              <input type="number" step="0.1" value={params.stopLossPct} onChange={e => updateParam('stopLossPct', Number(e.target.value))} className="w-full bg-black/40 border border-emerald-500/20 rounded px-1.5 py-1 text-[10px] text-white font-mono" />
              <span className="text-[8px] text-emerald-400/60">%</span>
            </div>
          </div>
          <div>
            <label className="text-[7px] text-emerald-400/50 uppercase block mb-1">Take Profit</label>
            <div className="flex items-center gap-1">
              <input type="number" step="0.1" value={params.takeProfitPct} onChange={e => updateParam('takeProfitPct', Number(e.target.value))} className="w-full bg-black/40 border border-emerald-500/20 rounded px-1.5 py-1 text-[10px] text-white font-mono" />
              <span className="text-[8px] text-emerald-400/60">%</span>
            </div>
          </div>
          <div>
            <label className="text-[7px] text-amber-400/70 uppercase block mb-1 italic">Trailing Stop</label>
            <div className="flex items-center gap-1">
              <input type="number" step="0.1" value={params.trailingStopPct ?? 3} onChange={e => updateParam('trailingStopPct', Number(e.target.value))} className="w-full bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-1 text-[10px] text-amber-200 font-mono" />
              <span className="text-[8px] text-amber-400/60">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trading Window */}
      <div className="p-3 border border-blue-500/20 bg-blue-500/5 rounded-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-blue-400" />
          <span className="text-[9px] font-bold tracking-widest text-blue-400 uppercase">Active Hours</span>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="text" 
            placeholder="09:00" 
            value="09:00" 
            readOnly
            className="w-12 bg-transparent text-[10px] text-blue-300 font-mono text-center border-b border-blue-500/30" 
          />
          <span className="text-[8px] text-blue-500/50">TO</span>
          <input 
            type="text" 
            placeholder="13:30" 
            value="13:30" 
            readOnly
            className="w-12 bg-transparent text-[10px] text-blue-300 font-mono text-center border-b border-blue-500/30" 
          />
        </div>
      </div>
    </div>
  );
}
