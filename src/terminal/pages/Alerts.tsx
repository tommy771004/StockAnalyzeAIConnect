import { useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { Loader2, Bell, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

export function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState({ symbol: '', condition: 'above', target: '' });

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Alerts fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlert.symbol || !newAlert.target) return;
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newAlert.symbol.toUpperCase(),
          condition: newAlert.condition,
          target: Number(newAlert.target)
        })
      });
      setNewAlert({ symbol: '', condition: 'above', target: '' });
      fetchAlerts();
    } catch (err) {
      alert('新增失敗');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      alert('刪除失敗');
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" /></div>;

  return (
    <div className="grid grid-cols-12 gap-6 h-full min-h-0">
      <div className="col-span-12">
         <h1 className="text-2xl font-bold tracking-tight">預警通知中心 (Alerts)</h1>
         <p className="text-sm text-(--color-term-muted) mt-1">設定價格警報，系統將在達到目標值時即時推播。</p>
      </div>

      {/* Add Alert Form */}
      <div className="col-span-12 lg:col-span-4">
        <Panel title="新增預警" icon={<Plus className="h-4 w-4" />}>
          <form onSubmit={handleAdd} className="p-4 space-y-4">
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">標的代號 (Symbol)</label>
              <input 
                value={newAlert.symbol}
                onChange={e => setNewAlert({...newAlert, symbol: e.target.value})}
                placeholder="例如: AAPL 或 2330.TW"
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">觸發條件 (Condition)</label>
              <select 
                value={newAlert.condition}
                onChange={e => setNewAlert({...newAlert, condition: e.target.value})}
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm appearance-none"
              >
                <option value="above">價格高於 (Price Above)</option>
                <option value="below">價格低於 (Price Below)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">目標價格 (Target Price)</label>
              <input 
                type="number"
                step="0.01"
                value={newAlert.target}
                onChange={e => setNewAlert({...newAlert, target: e.target.value})}
                placeholder="150.00"
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 rounded-sm"
              />
            </div>
            <button className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 rounded-sm text-sm transition-colors mt-2">
               啟動預警機制
            </button>
          </form>
        </Panel>
      </div>

      {/* Alerts List */}
      <div className="col-span-12 lg:col-span-8 overflow-auto">
        <Panel title="進行中的預警" icon={<Bell className="h-4 w-4" />} className="h-full" bodyClassName="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-(--color-term-panel) sticky top-0 text-[10px] uppercase tracking-widest text-(--color-term-muted) border-b border-(--color-term-border)">
              <tr>
                <th className="px-4 py-3 text-left">標的</th>
                <th className="px-4 py-3 text-left">觸發條件</th>
                <th className="px-4 py-3 text-right">目標價</th>
                <th className="px-4 py-3 text-center">狀態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-term-border)/40 text-[13px]">
              {alerts.length === 0 && (
                <tr><td colSpan={5} className="py-20 text-center text-(--color-term-muted)">目前沒有設定任何預警</td></tr>
              )}
              {alerts.map(a => (
                <tr key={a.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4 font-bold tracking-widest">{a.symbol}</td>
                  <td className="px-4 py-4">
                     <div className="flex items-center gap-2">
                        {a.condition === 'above' ? <TrendingUp className="h-3 w-3 text-sky-400" /> : <TrendingDown className="h-3 w-3 text-rose-400" />}
                        <span className="text-zinc-300">{a.condition === 'above' ? '高於' : '低於'}</span>
                     </div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-sky-400 font-medium">${Number(a.target).toFixed(2)}</td>
                  <td className="px-4 py-4 text-center">
                     {a.triggered ? (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20">已觸發</span>
                     ) : (
                        <span className="bg-sky-500/10 text-sky-400 text-[10px] px-2 py-0.5 rounded-full border border-sky-500/20">追蹤中</span>
                     )}
                  </td>
                  <td className="px-4 py-4 text-right">
                     <button onClick={() => handleDelete(a.id)} className="text-zinc-600 hover:text-rose-400 transition-colors p-1">
                        <Trash2 className="h-4 w-4" />
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
