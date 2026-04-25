import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlertRecord } from '../types/market';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { Loader2, Bell, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

export function AlertsPage() {
  const { t } = useTranslation();
  // Fix #6: typed state — AlertRecord[] instead of any[]
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState({ symbol: '', condition: 'above', target: '' });
  const [addError, setAddError] = useState('');
  // Inline delete confirmation (baseline-ui: AlertDialog for destructive actions)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Fix #3: useCallback so useEffect can safely list it as a dependency
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Alerts fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []); // no external deps — stable reference across renders

  // Fix #3: fetchAlerts is now stable (useCallback), safe to list as dep
  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlert.symbol || !newAlert.target) return;
    setAddError('');
    try {
      // Fix #10: check HTTP status — fetch only rejects on network failure,
      // not on 4xx/429/500. A rate-limited or validation error was silently ignored.
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newAlert.symbol.toUpperCase(),
          condition: newAlert.condition,
          target: Number(newAlert.target),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? t('alerts.addFailed'));
        return;
      }
      setNewAlert({ symbol: '', condition: 'above', target: '' });
      fetchAlerts();
    } catch {
      // Network-level failure (offline, DNS, etc.)
      setAddError(t('alerts.addFailed'));
    }
  };

  const confirmDelete = async () => {
    if (pendingDeleteId == null) return;
    setDeleteError('');
    try {
      // Fix #10: check HTTP status on DELETE too
      const res = await fetch(`/api/alerts/${pendingDeleteId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body?.error ?? t('alerts.deleteFailed'));
        return;
      }
      setPendingDeleteId(null);
      fetchAlerts();
    } catch {
      setDeleteError(t('alerts.deleteFailed'));
    }
  };

  // Loading skeleton (baseline-ui: structural skeletons for loading states)
  if (loading) return (
    <div className="grid grid-cols-12 gap-6 h-full min-h-0" aria-busy="true">
      <div className="col-span-12">
        <div className="h-8 w-64 bg-(--color-term-border)/40 rounded animate-pulse" />
        <div className="h-4 w-96 bg-(--color-term-border)/30 rounded animate-pulse mt-2" />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <div className="h-64 bg-(--color-term-border)/20 rounded animate-pulse" />
      </div>
      <div className="col-span-12 lg:col-span-8">
        <div className="h-64 bg-(--color-term-border)/20 rounded animate-pulse" />
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-12 gap-6 h-full min-h-0">
      <div className="col-span-12">
        <h1 className="text-2xl font-bold text-balance">{t('alerts.title')}</h1>
        <p className="text-sm text-(--color-term-muted) mt-1 text-pretty">{t('alerts.subtitle')}</p>
      </div>

      {/* Add Alert Form */}
      <div className="col-span-12 lg:col-span-4">
        <Panel title={t('alerts.add')} icon={<Plus className="h-4 w-4" aria-hidden="true" />} collapsible>
          <form onSubmit={handleAdd} className="p-4 space-y-4" noValidate>
            <div>
              <label
                htmlFor="alert-symbol"
                className="text-[10px] text-(--color-term-muted) uppercase block mb-1"
              >
                {t('alerts.symbolLabel')}
              </label>
              <input
                id="alert-symbol"
                value={newAlert.symbol}
                onChange={e => setNewAlert({ ...newAlert, symbol: e.target.value })}
                placeholder={t('alerts.symbolPlaceholder')}
                autoComplete="off"
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm"
              />
            </div>
            <div>
              <label
                htmlFor="alert-condition"
                className="text-[10px] text-(--color-term-muted) uppercase block mb-1"
              >
                {t('alerts.condition')}
              </label>
              <select
                id="alert-condition"
                value={newAlert.condition}
                onChange={e => setNewAlert({ ...newAlert, condition: e.target.value })}
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm appearance-none"
              >
                <option value="above">{t('alerts.above')}</option>
                <option value="below">{t('alerts.below')}</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="alert-target"
                className="text-[10px] text-(--color-term-muted) uppercase block mb-1"
              >
                {t('alerts.target')}
              </label>
              <input
                id="alert-target"
                type="number"
                step="0.01"
                min="0"
                value={newAlert.target}
                onChange={e => setNewAlert({ ...newAlert, target: e.target.value })}
                placeholder="150.00"
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm"
              />
            </div>

            {/* Inline form error — shown next to where the action happens */}
            {addError && (
              <p role="alert" className="flex items-center gap-1.5 text-[11px] text-rose-400">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                {addError}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 rounded-sm text-sm transition-opacity mt-2"
            >
              {t('alerts.submit')}
            </button>
          </form>
        </Panel>
      </div>

      {/* Alerts List */}
      <div className="col-span-12 lg:col-span-8 overflow-auto">
        <Panel
          title={t('alerts.active')}
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          className="h-full"
          bodyClassName="overflow-auto"
        >
          <table className="w-full text-sm">
            <thead className="bg-(--color-term-panel) sticky top-0 text-[10px] uppercase text-(--color-term-muted) border-b border-(--color-term-border)">
              <tr>
                <th className="px-4 py-3 text-left">{t('alerts.colSymbol')}</th>
                <th className="px-4 py-3 text-left">{t('alerts.colCondition')}</th>
                <th className="px-4 py-3 text-right tabular-nums">{t('alerts.colTarget')}</th>
                <th className="px-4 py-3 text-center">{t('alerts.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('alerts.colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-term-border)/40 text-[13px]">
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-(--color-term-muted)">
                    <div className="flex flex-col items-center gap-3">
                      <Bell className="size-8 opacity-30" aria-hidden="true" />
                      <span>{t('alerts.noAlerts')}</span>
                      {/* baseline-ui: empty state must have one clear next action */}
                      <button
                        type="button"
                        onClick={() => document.getElementById('alert-symbol')?.focus()}
                        className="text-[11px] text-sky-400 hover:underline"
                      >
                        + {t('alerts.add')}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {alerts.map(a => (
                <>
                  <tr key={a.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 font-bold truncate">{a.symbol}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {a.condition === 'above'
                          ? <TrendingUp className="size-3 text-sky-400" aria-hidden="true" />
                          : <TrendingDown className="size-3 text-rose-400" aria-hidden="true" />
                        }
                        <span className="text-zinc-300">
                          {a.condition === 'above' ? t('alerts.condAbove') : t('alerts.condBelow')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-sky-400 font-medium">
                      ${Number(a.target).toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {a.triggered ? (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20">
                          {t('alerts.triggered')}
                        </span>
                      ) : (
                        <span className="bg-sky-500/10 text-sky-400 text-[10px] px-2 py-0.5 rounded-full border border-sky-500/20">
                          {t('alerts.watching')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {/* baseline-ui: destructive action requires confirmation — toggle inline row */}
                      <button
                        type="button"
                        aria-label={t('alerts.delete')}
                        onClick={() => {
                          setPendingDeleteId(a.id === pendingDeleteId ? null : a.id);
                          setDeleteError('');
                        }}
                        className="text-zinc-600 hover:text-rose-400 transition-colors p-1"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>

                  {/* Inline confirmation row — only shown for the pending item */}
                  {pendingDeleteId === a.id && (
                    <tr key={`${a.id}-confirm`} className="bg-rose-950/20">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 text-[12px] text-rose-400">
                            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                            <span>{t('alerts.deleteConfirm', 'Delete alert for {{symbol}}?', { symbol: a.symbol })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {deleteError && (
                              <span role="alert" className="text-[11px] text-rose-400 mr-2">{deleteError}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="text-[11px] px-3 py-1 border border-(--color-term-border) text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={confirmDelete}
                              className="text-[11px] px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white font-bold transition-opacity"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
