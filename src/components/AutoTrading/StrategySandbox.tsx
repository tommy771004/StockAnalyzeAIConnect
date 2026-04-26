/**
 * src/components/AutoTrading/StrategySandbox.tsx
 * 策略沙盒實驗室：管理影子策略與進行 A/B 測試
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Copy, ArrowUpCircle, Trash2, Zap, Sliders, Search, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentConfig, StrategyParams } from './types';

interface Props {
  config: Partial<AgentConfig>;
  onUpdateShadow: (name: string, patch: Partial<AgentConfig>) => void;
  onPromote: (params: StrategyParams) => void;
  onDelete: (name: string) => void;
}

export function StrategySandbox({ config, onUpdateShadow, onPromote, onDelete }: Props) {
  const { t } = useTranslation();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResult, setResearchResult] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const safeParams = config.params ?? {};
  const safeSymbols = config.symbols ?? [];
  const shadowConfigs = config.shadowConfigs ?? {};

  const cloneCurrent = () => {
    const name = `Sandbox_${Math.floor(Math.random() * 1000)}`;
    onUpdateShadow(name, { params: JSON.parse(JSON.stringify(safeParams)), symbols: safeSymbols });
  };

  const handleResearch = async () => {
    if (!researchQuery) return;
    setIsSearching(true);
    setResearchResult('');
    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: researchQuery })
      });
      const data = await res.json();
      if (data && data.text) {
        setResearchResult(data.text);
      }
    } catch (e) {
      console.error(e);
      setResearchResult(t('autotrading.sandbox.researchError'));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Research Assistant */}
      <div className="bg-white/5 border border-white/10 rounded-sm p-4">
        <div className="flex items-center gap-3 mb-3">
          <Search className="h-4 w-4 text-cyan-400" />
          <div className="text-[11px] font-bold text-white uppercase">{t('autotrading.sandbox.researchTitle')}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-1.5 text-[11px] text-white outline-none"
            placeholder={t('autotrading.sandbox.researchPlaceholder')}
            value={researchQuery}
            onChange={e => setResearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearch()}
          />
          <button
            onClick={handleResearch}
            disabled={isSearching}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-[10px] font-bold flex items-center transition-all"
          >
            {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : t('autotrading.sandbox.search')}
          </button>
        </div>
        {researchResult && (
           <div className="mt-3 p-3 bg-black/30 border border-white/5 rounded text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
             {researchResult}
           </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-sm">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-cyan-400 animate-pulse" />
          <div>
            <div className="text-[11px] font-bold text-white uppercase tracking-widest">{t('autotrading.sandbox.title')}</div>
            <div className="text-[9px] text-cyan-400/70">{t('autotrading.sandbox.desc')}</div>
          </div>
        </div>
        <button
          onClick={cloneCurrent}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded text-[10px] font-bold flex items-center gap-2 transition-all"
        >
          <Copy className="h-3.5 w-3.5" /> {t('autotrading.sandbox.clone')}
        </button>
      </div>

      {/* Sandbox List */}
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(shadowConfigs).map(([name, shadow]) => (
          <div key={name} className="bg-black/40 border border-white/5 rounded-sm p-4 hover:border-cyan-500/30 transition-colors group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[12px] font-mono font-bold text-white uppercase">{name}</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-white/5 text-white/40">{t('autotrading.sandbox.shadowMode')}</span>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                   onClick={() => shadow.params && onPromote(shadow.params)}
                   className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded" title={t('autotrading.sandbox.promote')}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                </button>
                <button 
                   onClick={() => onDelete(name)}
                   className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded" title={t('autotrading.sandbox.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Params Preview/Editor */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-[8px] text-white/30 uppercase">RSI Period</div>
                <div className="text-[12px] font-mono text-cyan-300">{shadow.params?.RSI_REVERSION?.period || '--'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[8px] text-white/30 uppercase">Stop Loss</div>
                <div className="text-[12px] font-mono text-rose-300">{shadow.params?.stopLossPct}%</div>
              </div>
              <div className="space-y-1">
                <div className="text-[8px] text-white/30 uppercase">Take Profit</div>
                <div className="text-[12px] font-mono text-emerald-300">{shadow.params?.takeProfitPct}%</div>
              </div>
              <div className="space-y-1">
                <div className="text-[8px] text-white/30 uppercase">AI Threshold</div>
                <div className="text-[12px] font-mono text-violet-300">{shadow.params?.AI_LLM?.confidenceThreshold}%</div>
              </div>
            </div>

            {/* Status & Quick Actions */}
            <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-4">
              {editingName === name && (
                <div className="grid grid-cols-2 gap-4 bg-white/2 p-3 rounded border border-white/5 animate-in slide-in-from-top-2">
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-white/30 uppercase">RSI Period</label>
                    <input 
                      type="number" 
                      value={shadow.params?.RSI_REVERSION?.period ?? 14} 
                      onChange={(e) => onUpdateShadow(name, { 
                        params: { 
                          ...shadow.params, 
                          RSI_REVERSION: { ...shadow.params?.RSI_REVERSION, period: Number(e.target.value) } 
                        } 
                      })}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-white/30 uppercase">Stop Loss (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={shadow.params?.stopLossPct ?? 5} 
                      onChange={(e) => onUpdateShadow(name, { params: { ...shadow.params, stopLossPct: Number(e.target.value) } })}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none"
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                     <Zap className="h-3 w-3 text-cyan-400" />
                     <span className="text-[10px] text-white/60">{t('autotrading.sandbox.observing')}</span>
                  </div>
                </div>
                <button 
                  className="text-[10px] text-cyan-400 flex items-center gap-1 hover:underline"
                  onClick={() => setEditingName(editingName === name ? null : name)}
                >
                  <Sliders className="h-3 w-3" /> {editingName === name ? t('autotrading.sandbox.closeSettings') : t('autotrading.sandbox.modifyParams')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {(Object.keys(shadowConfigs).length === 0) && (
          <div className="h-[150px] border border-dashed border-white/5 rounded-sm flex flex-col items-center justify-center opacity-30">
             <FlaskConical className="h-6 w-6 mb-2" />
             <div className="text-[10px] uppercase tracking-widest">{t('autotrading.sandbox.empty')}</div>
             <div className="text-[8px] mt-1 text-center max-w-[200px]">{t('autotrading.sandbox.emptyDesc')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
