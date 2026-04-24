import React, { useState, useEffect } from 'react';
import { Bell, Plus, X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { Alert } from '../types';

interface AlertsProps {
  symbol: string;
}

export const Alerts: React.FC<AlertsProps> = React.memo(({ symbol }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [adding, setAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number|null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAlerts().then((data) => {
      if (Array.isArray(data)) setAlerts(data);
    }).catch(e => { console.warn('[Alerts] getAlerts:', e); });
  }, [symbol]);

  const addAlert = async () => {
    if (!target) return;
    const numTarget = Number(target);
    if (isNaN(numTarget) || numTarget <= 0) { setError('請輸入有效的正數價格'); return; }
    setError('');
    try {
      const newAlert = await api.addAlert({ symbol, condition, target: numTarget });
      setAlerts(prev => [...prev, newAlert]);
      setAdding(false);
      setTarget('');
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : '新增警示失敗';
      setError(msg); 
    }
  };

  const deleteAlert = async (id: number) => {
    try {
      await api.deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : '刪除警示失敗';
      setError(msg); 
    }
    finally { setDeleteConfirmId(null); }
  };

  return (
    <div className={cn("bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)] shrink-0", compact ? "p-2" : "p-3")}>
      <div className={cn("flex items-center justify-between", compact ? "mb-1" : "mb-2")}>
        <span className={cn("font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1", compact ? "label-meta" : "text-xs")}>
          <Bell size={compact ? 10 : 12} aria-hidden="true" /> 警示設定
        </span>
        <button type="button" onClick={() => { setAdding(v => !v); setError(''); }}
          aria-label={adding ? '取消新增警示' : '新增警示'}
          aria-expanded={adding}
          className="text-emerald-400 hover:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
        >
          {adding ? <X size={compact ? 12 : 14} aria-hidden="true" /> : <Plus size={compact ? 12 : 14} aria-hidden="true" />}
        </button>
      </div>

      {/* Vercel web-design-guidelines: aria-live="polite" for async error updates */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className={cn("flex items-center gap-1.5 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg", compact ? "p-1.5 text-xs mb-1" : "p-2 text-sm mb-2")}
        >
          <AlertCircle size={compact ? 10 : 12} aria-hidden="true" /> {error}
          <button type="button" onClick={() => setError('')} aria-label="關閉錯誤訊息" className="ml-auto"><X size={compact ? 10 : 12} aria-hidden="true" /></button>
        </div>
      )}

      {adding && (
        <div className={cn("space-y-2", compact ? "mb-2" : "mb-3")}>
          <div className="flex gap-2">
            <select aria-label="價格條件" value={condition} onChange={e => setCondition(e.target.value as 'above' | 'below')} className={cn("bg-black/30 border border-white/8 rounded-lg px-2 py-1 text-[var(--text-color)]", compact ? "text-xs" : "text-sm")}>
              <option value="above">高於</option>
              <option value="below">低於</option>
            </select>
            <input aria-label="目標價格" type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="價格" className={cn("flex-1 bg-black/30 border border-white/8 rounded-lg px-2 py-1 text-[var(--text-color)] font-mono", compact ? "text-xs" : "text-sm")} />
          </div>
          <button type="button" onClick={addAlert} disabled={!target} className={cn("w-full rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-500/25 transition-colors", compact ? "py-1 text-xs" : "py-1.5 text-sm")}>新增警示</button>
        </div>
      )}

      <div className={cn(compact ? "space-y-1" : "space-y-2")}>
        {alerts.filter(a => a.symbol === symbol).map(a => (
          <div key={a.id} className={cn("flex items-center justify-between rounded-lg bg-[var(--card-bg)] text-[var(--text-color)]", compact ? "p-2 text-xs" : "p-3 text-sm")}>
            <span>{a.condition === 'above' ? '↑' : '↓'} {a.target}</span>
            {deleteConfirmId === a.id ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => deleteAlert(a.id)} aria-label="確認刪除警示" className="text-rose-400 hover:text-rose-300">
                  <AlertCircle size={compact ? 12 : 14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setDeleteConfirmId(null)} aria-label="取消刪除" className="text-zinc-500 hover:text-[var(--text-color)] opacity-70">
                  <X size={compact ? 12 : 14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirmId(a.id)} aria-label={`刪除 ${a.symbol} 警示`} className="text-zinc-500 hover:text-rose-400"><X size={compact ? 12 : 14} aria-hidden="true" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
