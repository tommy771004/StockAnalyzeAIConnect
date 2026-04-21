/**
 * TradeJournal.tsx
 *
 * Fix 1: Removed <form> tag — all handlers use onClick/onKeyDown
 * Fix 2: Added inline edit functionality (pencil icon)
 * Fix 3: Larger text, Chinese labels, better empty state
 * New: Monthly PnL summary bar chart
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import {
  History, Download, Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Loader2, AlertCircle, Edit2, Check, X, TrendingUp, TrendingDown, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { cn } from '../lib/utils';
import { getTrades, addTrade, updateTrade, deleteTrade } from '../services/api';
import { motion } from 'motion/react';
import { Trade } from '../types';
import Decimal from 'decimal.js';

const BLANK = {
  date: new Date().toISOString().split('T')[0],
  ticker: '', action: '做多 (Buy)', entry: '', exit: '', qty: '', notes: '',
};

// Monthly PnL aggregation
function buildMonthlyPnL(trades: Trade[]) {
  const map = new Map<string, number>();
  trades.forEach(t => {
    const m = t.date?.slice(0, 7) ?? ''; // YYYY-MM
    if (m) map.set(m, (map.get(m) ?? 0) + (t.pnl ?? 0));
  });
  return Array.from(map.entries())
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(-12) // last 12 months
    .map(([month, pnl]) => ({ month: month.slice(5), pnl: +pnl.toFixed(0) }));
}

// Daily PnL heatmap data builder
function buildDailyPnL(trades: Trade[]): Record<string, number> {
  const map: Record<string, number> = {};
  trades.forEach(t => {
    const d = t.date?.slice(0, 10);
    if (d) map[d] = (map[d] ?? 0) + (t.pnl ?? 0);
  });
  return map;
}

function getHeatmapMonths(dailyMap: Record<string, number>): string[] {
  const days = Object.keys(dailyMap);
  if (!days.length) return [];
  const months = new Set(days.map(d => d.slice(0, 7)));
  return [...months].sort().slice(-6); // last 6 months
}

interface MonthTipProps { active?: boolean; payload?: { value: number }[]; label?: string; }
const MonthTip = ({ active, payload, label }: MonthTipProps) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-[var(--card-bg)] border border-white/10 rounded-xl p-2.5 text-xs font-mono shadow-xl">
      <div className="text-zinc-500 mb-1">{label} 月</div>
      <div className={v >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
        {v >= 0 ? '+' : ''}{Number(v).toLocaleString()}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function TradeJournal() {
  const [trades,   setTrades]   = useState<Trade[]>([]);
  type JournalStatus = 'idle' | 'loading' | 'saving';
  const [status,   setStatus]   = useState<JournalStatus>('loading');
  const loading = status === 'loading';
  const saving  = status === 'saving';
  const [error,    setError]    = useState<string | null>(null);
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState<number|null>(null);
  const [form,     setForm]     = useState({ ...BLANK });
  const [editBuf,  setEditBuf]  = useState<Partial<Trade>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number|null>(null);
  const [err,      setErr]      = useState('');
  const [sortCol,  setSortCol]  = useState<'date'|'pnl'>('date');
  const [chartView, setChartView] = useState<'bar'|'heatmap'>('bar');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      const d = await getTrades();
      setTrades(Array.isArray(d)?d:[]);
    } catch(e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '連線異常');
    } finally {
      setStatus('idle');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const pullState = usePullToRefresh(containerRef, { onRefresh: load });

  // ── Add new trade ─────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const entryNum = Number(form.entry);
    const exitNum  = Number(form.exit);
    const qtyNum   = Number(form.qty);
    if (!form.ticker || !form.entry || !form.exit || !form.qty) {
      setErr('請填入代碼、進場價、出場價、數量'); return;
    }
    if (!isFinite(entryNum) || entryNum <= 0 || !isFinite(exitNum) || exitNum <= 0 || !isFinite(qtyNum) || qtyNum <= 0) {
      setErr('進場價、出場價、數量必須為有效正數'); return;
    }
    setStatus('saving'); setErr('');
    try {
      const actionStr = form.action || '';
      const isBuy = actionStr.includes('Buy') || actionStr.includes('做多');
      const pnl = new Decimal(exitNum).minus(entryNum).times(qtyNum).times(isBuy ? 1 : -1).toNumber();
      const t = await addTrade({
        date: form.date, ticker: form.ticker.toUpperCase(), action: form.action,
        entry: entryNum, exit: exitNum, qty: qtyNum,
        notes: form.notes, pnl: +pnl.toFixed(2), status: pnl >= 0 ? 'Win' : 'Loss',
      });
      setTrades(p => [t, ...p]);
      setAdding(false); setForm({ ...BLANK });
    } catch(e: unknown) { setErr(e instanceof Error ? e.message : '新增失敗'); }
    finally { setStatus('idle'); }
  };

  // ── Save inline edit ──────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (editId === null) return;
    setStatus('saving');
    try {
      const orig = trades.find(t => t.id === editId)!;
      const merged = { ...orig, ...editBuf };
      // Recalculate PnL
      const actionStr = merged.action || '';
      const isBuy = actionStr.includes('Buy') || actionStr.includes('做多');
      merged.pnl = +((merged.exit - merged.entry) * merged.qty * (isBuy ? 1 : -1)).toFixed(2);
      merged.status = merged.pnl >= 0 ? 'Win' : 'Loss';
      await updateTrade(merged);
      setTrades(p => p.map(t => t.id === editId ? merged : t));
      setEditId(null); setEditBuf({});
    } catch(e: unknown) { setErr(e instanceof Error ? e.message : '更新失敗'); }
    finally { setStatus('idle'); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTrade(id); setTrades(p => p.filter(t => t.id !== id)); }
    catch(e: unknown) { setErr(e instanceof Error ? e.message : '刪除失敗'); }
    finally { setDeleteConfirmId(null); }
  };

  const exportCSV = () => {
    const rows = ['日期,代碼,方向,進場,出場,數量,損益,備註',
      ...trades.map(t => `${t.date},${t.ticker},${t.action},${t.entry},${t.exit},${t.qty},${t.pnl},"${t.notes??''}"`)];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}));
    a.download = '交易日誌.csv'; a.click();
  };

  const fld = (k: string, v: string)         => setForm(p => ({ ...p, [k]: v }));
  const efld = (k: string, v: string | number) => setEditBuf(p => ({ ...p, [k]: v }));

  const wins    = trades.filter(t => t.pnl > 0);
  const netPnL  = trades.reduce((s,t) => s + (t.pnl ?? 0), 0);
  const winRate = trades.length > 0 ? ((wins.length/trades.length)*100).toFixed(1) : '0.0';
  const gross   = wins.reduce((s,t) => s+(t.pnl??0), 0);
  const grossL  = Math.abs(trades.filter(t=>(t.pnl??0)<0).reduce((s,t)=>s+(t.pnl??0),0));
  const pf      = grossL > 0 ? (gross/grossL).toFixed(2) : gross > 0 ? '∞' : '0.00';
  const monthlyPnL = buildMonthlyPnL(trades);

  const sorted = [...trades].sort((a,b) =>
    sortCol === 'pnl'
      ? (isFinite(b.pnl ?? NaN) ? (b.pnl ?? 0) : 0) - (isFinite(a.pnl ?? NaN) ? (a.pnl ?? 0) : 0)
      : (b.date ?? '').localeCompare(a.date ?? '')
  );

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 pb-10 overflow-auto"
    >
      <PullToRefreshIndicator state={pullState} />

      {/* ── KPI ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 shrink-0">
        {[
          { label:'勝率',          value:`${winRate}%`, sub:`${wins.length} 勝 / ${trades.length - wins.length} 敗`, up:parseFloat(winRate)>=50,
            tip:'獲利交易 ÷ 總交易次數' },
          { label:'累計損益',      value:`${netPnL>=0?'+':''}$${netPnL.toLocaleString(undefined,{maximumFractionDigits:0})}`, sub:'所有已實現損益加總', up:netPnL>=0,
            tip:'正數=賺錢，負數=虧損' },
          { label:'獲利因子 (PF)', value:pf, sub:`獲利金額 ÷ 虧損金額`, up:parseFloat(pf)>=1,
            tip:'>1 代表整體策略有正期望值' },
        ].map(c => (
          <div key={c.label} className="liquid-glass-strong rounded-2xl sm:rounded-[2rem] p-5 sm:p-6 border border-zinc-800 bg-zinc-900/50 shadow-xl">
            <div className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">{c.label}</div>
            <div className={cn('text-2xl sm:text-3xl font-black mb-2 tracking-tighter', c.up?'text-zinc-100':'text-rose-400')}>{c.value}</div>
            <div className="flex items-center gap-2 text-sm">
              {c.up ? <ArrowUpRight size={16} className="text-emerald-400"/> : <ArrowDownRight size={16} className="text-rose-400"/>}
              <span className="text-zinc-400 font-bold text-xs sm:text-sm">{c.sub}</span>
            </div>
            <div className="text-xs text-zinc-600 mt-3 italic font-bold hidden sm:block">{c.tip}</div>
          </div>
        ))}
      </div>

      {/* ── Monthly PnL Chart / Heatmap ── */}
      {(monthlyPnL.length > 1 || Object.keys(buildDailyPnL(trades)).length > 0) && (
        <div className="liquid-glass-strong rounded-[2rem] p-6 shrink-0 border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm font-black text-zinc-100 uppercase tracking-widest">損益分析</div>
            <div className="flex gap-1 bg-zinc-950 rounded-xl p-1 border border-zinc-800 text-xs font-black uppercase tracking-widest">
              {(['bar','heatmap'] as const).map(v=>(
                <button key={v} onClick={()=>setChartView(v)}
                  className={cn('px-4 py-2 rounded-lg transition-all', chartView===v?'bg-zinc-800 text-zinc-100':'text-zinc-500 hover:text-zinc-300')}>
                  {v==='bar'?'月柱狀圖':'日熱力圖'}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-zinc-500 font-bold mb-6 uppercase tracking-widest">
            {chartView==='bar'?'每月已實現損益總和（最近 12 個月）':'每日損益熱力圖（最近 6 個月）'}
          </div>

          {chartView === 'bar' ? (
            <div style={{height:180}}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <BarChart data={monthlyPnL} margin={{top:0,right:0,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>
                  <XAxis dataKey="month" tick={{fill:'#71717a',fontSize:10, fontWeight: 700}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fill:'#71717a',fontSize:10, fontWeight: 700}} tickLine={false} axisLine={false} tickFormatter={v=>`${v>=0?'+':''}${(v/1000).toFixed(0)}K`}/>
                  <Tooltip content={<MonthTip/>}/>
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)"/>
                  <Bar dataKey="pnl" radius={[6,6,0,0]} isAnimationActive={false}>
                    {monthlyPnL.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#34d399' : '#fb7185'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* Heatmap view */
            <div>
              {(() => {
                const dailyMap = buildDailyPnL(trades);
                const months = getHeatmapMonths(dailyMap);
                if (!months.length) return <div className="text-zinc-600 text-xs text-center py-4 font-bold">新增交易後顯示熱力圖</div>;
                return (
                  <div className="space-y-6">
                    {months.map(month => {
                      const [y, m] = month.split('-').map(Number);
                      const daysInMonth = new Date(y, m, 0).getDate();
                      const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
                      return (
                        <div key={month}>
                          <div className="text-xs font-black text-zinc-400 mb-3 uppercase tracking-widest">{y} 年 {m} 月</div>
                          <div className="grid grid-cols-7 gap-1" style={{gridAutoRows:'24px'}}>
                            {['日','一','二','三','四','五','六'].map(d=>(
                              <div key={d} className="text-xs text-zinc-600 text-center font-black">{d}</div>
                            ))}
                            {/* Empty cells for first week offset */}
                            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
                            {Array.from({length:daysInMonth}).map((_,i)=>{
                              const day = String(i+1).padStart(2,'0');
                              const key = `${month}-${day}`;
                              const pnl = dailyMap[key];
                              const hasTrade = pnl !== undefined;
                              const intensity = hasTrade ? Math.min(1, Math.abs(pnl) / 50000) : 0;
                              const bg = !hasTrade
                                ? 'rgba(255,255,255,0.03)'
                                : pnl > 0
                                ? `rgba(52,211,153,${0.15 + intensity * 0.7})`
                                : `rgba(251,113,133,${0.15 + intensity * 0.7})`;
                              return (
                                <div key={key} title={hasTrade ? `${key}: ${pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}` : key}
                                  className="rounded-lg cursor-default"
                                  style={{backgroundColor: bg, border: hasTrade ? '1px solid rgba(255,255,255,0.08)' : 'none'}}>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-4 text-xs font-black text-zinc-500 pt-2 uppercase tracking-widest">
                      <span>損益熱力圖</span>
                      <div className="flex items-center gap-1.5">
                        {[0.2,0.4,0.6,0.85].map((op,i)=>(
                          <div key={i} className="w-4 h-4 rounded-md" style={{backgroundColor:`rgba(52,211,153,${op})`}}/>
                        ))}
                        <span>獲利</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[0.2,0.4,0.6,0.85].map((op,i)=>(
                          <div key={i} className="w-4 h-4 rounded-md" style={{backgroundColor:`rgba(251,113,133,${op})`}}/>
                        ))}
                        <span>虧損</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-2xl p-4 shrink-0 font-bold">
          <AlertCircle size={16}/> {err}
          <button onClick={() => setErr('')} className="ml-auto"><X size={14}/></button>
        </div>
      )}

      {/* ── Trade table ── */}
      <div className="liquid-glass-strong rounded-[2rem] p-6 flex flex-col flex-1 min-h-0 border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <History size={16}/>
            </div>
            <h2 className="text-sm font-black text-zinc-100 uppercase tracking-widest">交易日誌</h2>
            <span className="text-xs text-zinc-500 font-bold">（{trades.length} 筆）</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort controls */}
            <div className="flex gap-1 text-xs font-black uppercase tracking-widest">
              <span className="text-zinc-500 px-2 py-2">排序：</span>
              {(['date','pnl'] as const).map(s => (
                <button key={s} onClick={() => setSortCol(s)}
                  className={cn('px-4 py-2 rounded-xl border transition-all',
                    sortCol===s?'bg-zinc-800 text-zinc-100 border-zinc-700':'text-zinc-500 border-zinc-800 hover:bg-zinc-900')}>
                  {s==='date'?'日期':'損益'}
                </button>
              ))}
            </div>
            <button onClick={() => { setAdding(v=>!v); setErr(''); }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all">
              <Plus size={14}/> 新增交易
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all">
              <Download size={14}/> 匯出CSV
            </button>
          </div>
        </div>

        {/* ── Add form (no <form> tag) ── */}
        {adding && (
          <div className="mb-6 p-6 rounded-3xl bg-zinc-950 border border-zinc-800 shrink-0">
            <div className="text-base font-black text-zinc-100 mb-5 uppercase tracking-widest">📝 新增交易記錄</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              {([
                ['date',   '交易日期',    'date'],
                ['ticker', '代碼 (e.g. AAPL)', 'text'],
                ['qty',    '數量（股/張）', 'number'],
                ['entry',  '進場價',      'number'],
                ['exit',   '出場價',      'number'],
                ['notes',  '備註（選填）',  'text'],
              ] as [keyof typeof form, string, string][]).map(([k,ph,t]) => (
                <div key={k}>
                  <div className="text-xs text-zinc-500 mb-2 font-black uppercase tracking-widest">{ph}</div>
                  <input type={t} placeholder={ph}
                    value={form[k]}
                    onChange={e => fld(k, e.target.value)}
                    onKeyDown={e => e.key==='Enter' && k==='notes' && handleAdd()}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-base focus:outline-none focus:border-emerald-500/50 transition-all"/>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="text-xs text-zinc-500 font-black uppercase tracking-widest">方向：</div>
              {['做多 (Buy)', '做空 (Sell)'].map(a => (
                <button key={a} onClick={() => fld('action', a)}
                  className={cn('px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest border transition-all',
                    form.action===a
                      ? a.includes('Buy') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                          : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800')}>
                  {a.includes('Buy') ? '📈 做多' : '📉 做空'}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={handleAdd} disabled={saving}
                className="px-8 py-3 rounded-xl bg-emerald-500/10 text-emerald-300 text-sm font-black uppercase tracking-widest border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 flex items-center gap-2 transition-all">
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} 儲存
              </button>
              <button onClick={() => { setAdding(false); setErr(''); }}
                className="px-8 py-3 rounded-xl bg-zinc-900 text-zinc-400 text-sm font-black uppercase tracking-widest border border-zinc-800 hover:bg-zinc-800 transition-all">
                取消
              </button>
              <div className="text-sm text-zinc-600 flex items-center ml-4 font-black uppercase tracking-widest">
                損益會根據進出場價自動計算
              </div>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="overflow-auto flex-1 min-h-0">
          {error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-zinc-100 font-bold">連線異常</h3>
              <p className="text-zinc-400 text-sm max-w-xs">{error}</p>
              <button 
                onClick={load}
                className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                重新整理
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-indigo-400" size={20}/>
            </div>
          ) : trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div className="text-3xl">📒</div>
              <p className="text-zinc-500 text-sm font-semibold">還沒有交易記錄</p>
              <p className="text-zinc-500 text-xs">記錄每筆交易，追蹤自己的進步</p>
              <button onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 text-sm border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
                <Plus size={12}/> 新增第一筆
              </button>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-[var(--card-bg)] z-10">
                <tr className="text-zinc-500 border-b border-[var(--border-color)] text-sm">
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium">代碼</th>
                  <th className="pb-2 font-medium">方向</th>
                  <th className="pb-2 font-medium text-right">進場價</th>
                  <th className="pb-2 font-medium text-right">出場價</th>
                  <th className="pb-2 font-medium text-right">數量</th>
                  <th className="pb-2 font-medium text-right">損益</th>
                  <th className="pb-2 font-medium">狀態</th>
                  <th className="pb-2 font-medium">備註</th>
                  <th className="pb-2"/>
                </tr>
              </thead>
              <tbody>
                {sorted.map(t => {
                  const editing = editId === t.id;
                  return (
                    <tr key={t.id} className={cn('border-b border-[var(--border-color)] hover:bg-[var(--bg-color)] group transition-colors', editing && 'bg-indigo-500/5')}>

                      {editing ? (
                        // ── Inline edit row ──────────────────────────────────
                        <>
                          <td className="py-2">
                            <input type="date" value={editBuf.date??t.date} onChange={e=>efld('date',e.target.value)}
                              className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-indigo-500/50 w-32"/>
                          </td>
                          <td className="py-2">
                            <input type="text" value={editBuf.ticker??t.ticker} onChange={e=>efld('ticker',e.target.value.toUpperCase())}
                              className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-xs font-bold w-20 focus:outline-none"/>
                          </td>
                          <td className="py-2">
                            <select value={editBuf.action??t.action} onChange={e=>efld('action',e.target.value)}
                              className="bg-black/30 border border-white/10 rounded px-1 py-1 text-white text-xs focus:outline-none">
                              <option value="做多 (Buy)">做多</option>
                              <option value="做空 (Sell)">做空</option>
                            </select>
                          </td>
                          <td className="py-2 text-right">
                            <input type="number" step="0.01" value={editBuf.entry??t.entry} onChange={e=>efld('entry',Number(e.target.value))}
                              className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-xs font-mono w-20 text-right focus:outline-none"/>
                          </td>
                          <td className="py-2 text-right">
                            <input type="number" step="0.01" value={editBuf.exit??t.exit} onChange={e=>efld('exit',Number(e.target.value))}
                              className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-xs font-mono w-20 text-right focus:outline-none"/>
                          </td>
                          <td className="py-2 text-right">
                            <input type="number" value={editBuf.qty??t.qty} onChange={e=>efld('qty',Number(e.target.value))}
                              className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-xs font-mono w-20 text-right focus:outline-none"/>
                          </td>
                          <td className="py-2 text-right text-zinc-500 font-mono text-xs">自動計算</td>
                          <td/><td/>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button onClick={handleSaveEdit} disabled={saving}
                                className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                                {saving ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>}
                              </button>
                              <button onClick={() => { setEditId(null); setEditBuf({}); }}
                                className="p-1.5 rounded bg-[var(--bg-color)] text-zinc-500 hover:bg-[var(--border-color)] transition-colors">
                                <X size={11}/>
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // ── Display row ──────────────────────────────────────
                        <>
                          <td className="py-2.5 text-zinc-500 text-sm">{t.date}</td>
                          <td className="py-2.5 font-bold text-white text-base">{t.ticker}</td>
                          <td className="py-2.5">
                            <span className={cn('px-2 py-0.5 rounded-lg text-sm font-bold border',
                              (t.action || '').includes('Buy') || (t.action || '').includes('做多')
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/20')}>
                              {(t.action || '').includes('Buy') || (t.action || '').includes('做多') ? '📈 多' : '📉 空'}
                            </span>
                          </td>
                          <td className="py-2.5 text-[var(--text-color)] opacity-70 font-mono text-right text-sm">{Number(t.entry).toFixed(2)}</td>
                          <td className="py-2.5 text-[var(--text-color)] opacity-70 font-mono text-right text-sm">{Number(t.exit).toFixed(2)}</td>
                          <td className="py-2.5 text-[var(--text-color)] opacity-70 text-right text-sm">{Number(t.qty).toLocaleString()}</td>
                          <td className={cn('py-2.5 font-mono font-bold text-right text-sm', t.pnl>=0?'text-emerald-400':'text-rose-400')}>
                            {t.pnl>=0?'+':''}{Number(t.pnl).toLocaleString(undefined,{maximumFractionDigits:0})}
                          </td>
                          <td className="py-2.5">
                            <span className={cn('px-2 py-0.5 rounded text-sm font-bold flex items-center gap-1 w-fit',
                              t.pnl>=0?'bg-emerald-500/10 text-emerald-400':'bg-rose-500/10 text-rose-400')}>
                              {t.pnl>=0?<TrendingUp size={12}/>:<TrendingDown size={12}/>}
                              {t.pnl>=0?'獲利':'虧損'}
                            </span>
                          </td>
                          <td className="py-2.5 text-zinc-500 text-sm max-w-[120px] truncate" title={t.notes}>{t.notes}</td>
                          <td className="py-2.5">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditId(t.id); setEditBuf({}); }}
                                className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors">
                                <Edit2 size={11}/>
                              </button>
                              {deleteConfirmId === t.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleDelete(t.id)}
                                    className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors text-xs font-bold"
                                    title="確認刪除">
                                    <Check size={11}/>
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-1 rounded bg-[var(--bg-color)] text-zinc-500 hover:bg-[var(--border-color)] transition-colors text-xs"
                                    title="取消">
                                    <X size={11}/>
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setDeleteConfirmId(t.id)}
                                  className="p-1.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors">
                                  <Trash2 size={11}/>
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  );
}