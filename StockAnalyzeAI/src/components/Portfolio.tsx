/**
 * Portfolio.tsx
 *
 * Fix: onGoBacktest prop wired (App.tsx now passes it)
 * Fix: onGoJournal prop — "新增交易" button navigates to Journal pre-filled
 * Fix: initialCapital settable by user (no hardcoded value)
 * New: Alpha vs benchmark display in equity curve
 * New: "送回測" and "新增交易" action buttons per position row
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
  BarChart, Bar,
  type TooltipProps,
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, Plus, Trash2, Wallet,
  Edit2, Check, X, AlertCircle, BarChart2, BookOpen, Settings2, Download,
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import CardStack from './CardStack';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { buildPortfolioPdf } from '../utils/exportPdf';
import { Position, Trade, HistoricalData } from '../types';
import Decimal from 'decimal.js';

const COLORS = ['#34d399','#60a5fa','#f472b6','#fbbf24','#a78bfa','#94a3b8','#fb923c','#38bdf8'];

interface Props {
  onGoBacktest?: (sym:string) => void;
  onGoJournal?:  (sym?:string) => void;
}

type PortfolioStatus = 'loading' | 'refreshing' | 'idle' | 'error';

// Build equity curve from trades
function buildEquityCurve(trades:Trade[], start:number, benchCloses:Pick<HistoricalData,'date'|'close'>[]=[]) {
  if (!trades.length) return [];
  const sorted=[...trades]
    .filter(t => t && typeof t === 'object')
    .sort((a,b)=>(a.date??'').localeCompare(b.date??''));
  let eq=start;
  const bMap=new Map(benchCloses.map(r=>[String(r.date??'').slice(0,10),Number(r.close)]));
  const firstDate=sorted[0]?.date?.slice(0,10)??'';
  const benchKeys=[...bMap.keys()].sort();
  const startKey=benchKeys.find(k=>k>=firstDate)??benchKeys[0]??'';
  const bStart=bMap.get(startKey)??0;
  return sorted.map(t=>{
    const pnl = Number(t.pnl) || 0;
    if (!isFinite(pnl)) return null;
    eq+=pnl;
    const d=t.date?.slice(0,10)??'';
    const bClose=bMap.get(d);
    const benchVal=bStart>0&&bClose&&isFinite(bClose) ? Math.round(start*(bClose/bStart)) : undefined;
    return {date:d, value:Math.round(eq), benchmark:benchVal};
  }).filter(Boolean) as {date:string; value:number; benchmark?:number}[];
}

function normalizeDate(d: string | number | null | undefined): string {
  if (!d) return '';
  if (typeof d==='string') return d.slice(0,10);
  try { return new Date(d).toISOString().slice(0,10); } catch { return ''; }
}
const EquityTip=(props: TooltipProps<number, string>)=>{
  const { active, payload, label } = props as { active?: boolean; payload?: { dataKey: string; value?: number }[]; label?: string };
  if(!active||!payload?.length) return null;
  const portPayload=payload.find((p)=>p.dataKey==='value');
  const benchPayload=payload.find((p)=>p.dataKey==='benchmark');
  const alpha=portPayload&&benchPayload?((portPayload.value??0)-(benchPayload.value??0)):null;

  return (
    <div className="bg-[var(--card-bg)] border border-white/10 rounded-xl p-2.5 text-xs font-mono shadow-xl min-w-[160px]">
      <div className="text-slate-400 mb-1.5">{label}</div>
      {portPayload?.value !== undefined && <div className="text-emerald-400">策略: ${Number(portPayload.value).toLocaleString()}</div>}
      {benchPayload?.value !== undefined && <div className="text-slate-400">基準: ${Number(benchPayload.value).toLocaleString()}</div>}
      {alpha !== null && (
        <div className={alpha >= 0 ? 'text-emerald-300' : 'text-rose-400'} style={{ marginTop: 4 }}>
          Alpha: {alpha >= 0 ? '+' : ''}{alpha.toLocaleString()}
        </div>
      )}
    </div>
  );
};

// ── Memoized chart sub-components ──────────────────────────────────────────

const AllocationPieChart = memo(({ alloc, totalMV, compact }: { alloc: { name: string; value: number; color: string }[]; totalMV: number; compact: boolean }) => (
  <div className={cn("liquid-glass rounded-2xl flex flex-col min-h-[260px] bg-[var(--card-bg)] border-[var(--border-color)]", compact ? "p-2" : "p-4")}>
    <h3 className={cn("font-bold text-[var(--text-color)] mb-1", compact ? "text-xs" : "text-xs")}>資產配置圓餅圖</h3>
    <div className={cn("text-[var(--text-color)] opacity-50 mb-2", compact ? "label-meta" : "text-xs")}>各持倉占總市值比例</div>
    <div className="flex-1 flex items-center gap-4">
      <div className="flex-1 h-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <PieChart>
            <Pie data={alloc} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2} dataKey="value" stroke="none">
              {alloc.map((e,i)=><Cell key={i} fill={e.color}/>)}
            </Pie>

            <Tooltip 
  contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: 8, fontSize: '12px' }} 
  formatter={(v: number | string | readonly (number | string)[] | undefined) => {
    // 為了滿足 TS，我們處理 v 可能是陣列的情況
    const val = Array.isArray(v) ? v[0] : v;
    return [`NT$${Number(val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, '市值'];
  }}/>
</PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-24 sm:w-32 md:w-40 space-y-1.5 overflow-y-auto max-h-full custom-scrollbar pr-1">
        {alloc.map((d,i)=>(
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:d.color}}/><span className={cn("text-[var(--text-color)] opacity-70 truncate w-16", compact ? "label-meta" : "text-xs")}>{d.name}</span></div>
            <span className={cn("text-[var(--text-color)] opacity-50 font-mono", compact ? "label-meta" : "text-xs")}>{totalMV>0?((d.value/totalMV)*100).toFixed(1):'0.0'}%</span>
          </div>
        ))}
      </div>
    </div>
  </div>
));
AllocationPieChart.displayName = 'AllocationPieChart';

const PnLBarChartPanel = memo(({ pnlData, compact }: { pnlData: { name: string; pnl: number; color: string }[]; compact: boolean }) => (
  <div className={cn("liquid-glass rounded-2xl flex flex-col min-h-[260px] bg-[var(--card-bg)] border-[var(--border-color)]", compact ? "p-2" : "p-4")}>
    <h3 className={cn("font-bold text-[var(--text-color)] mb-1", compact ? "text-xs" : "text-xs")}>各資產未實現損益</h3>
    <div className={cn("text-[var(--text-color)] opacity-50 mb-2", compact ? "label-meta" : "text-xs")}>持倉標的盈虧分佈</div>
    <div className="flex-1">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <BarChart data={pnlData} layout="vertical" margin={{top:0,right:0,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false}/>
          <XAxis type="number" tick={{fill:'var(--text-color)',opacity:0.5,fontSize: compact ? 8 : 9}} tickLine={false} axisLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/>
          <YAxis dataKey="name" type="category" tick={{fill:'var(--text-color)',opacity:0.7,fontSize: compact ? 8 : 9}} tickLine={false} axisLine={false} width={compact ? 50 : 60}/>

          <Tooltip cursor={{fill:'var(--border-color)'}} contentStyle={{backgroundColor:'var(--card-bg)',borderColor:'var(--border-color)',borderRadius:8, fontSize: '12px'}} formatter={(v)=>[`$${Number(v).toLocaleString()}`,'損益']}/>
          <ReferenceLine x={0} stroke="var(--border-color)"/>
          <Tooltip 
  cursor={{ fill: 'var(--border-color)' }} 
  contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: 8, fontSize: '12px' }} 
  formatter={(v: number | string | readonly (number | string)[] | undefined) => {
    const val = Array.isArray(v) ? v[0] : v;
    return [`$${Number(val || 0).toLocaleString()}`, '損益'];
  }}
/>
<ReferenceLine x={0} stroke="var(--border-color)"/>

          <Bar dataKey="pnl">
            {pnlData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
));
PnLBarChartPanel.displayName = 'PnLBarChartPanel';

// ─────────────────────────────────────────────────────────────────────────────
export default function Portfolio({onGoBacktest,onGoJournal}:Props) {
  const { settings } = useSettings();
  const compact = Boolean(settings.compactMode);
  const [positions,  setPos]          = useState<Position[]>([]);
  const [trades,     setTrades]       = useState<Trade[]>([]);
  const [usdtwd,     setUsdtwd]       = useState(32.5); // fallback, fetched dynamically
  const [status,     setStatus]       = useState<PortfolioStatus>('loading');
  const [editIdx,    setEditIdx]      = useState<number|null>(null);
  const [editBuf,    setEditBuf]      = useState<Partial<Position>>({});
  const [showAdd,    setShowAdd]      = useState(false);
  const [newPos,     setNewPos]       = useState({symbol:'',name:'',shares:'',avgCost:'',currency:'USD'});
  const [saveErr,    setSaveErr]      = useState('');
  const [initCap,    setInitCap]      = useState<number|null>(null);  // user-settable
  const [showCapSet, setShowCapSet]   = useState(false);
  const [capInput,   setCapInput]     = useState('');
  const [benchmark,  setBenchmark]    = useState<HistoricalData[]>([]);  // SPY/0050 daily closes
  const benchSym = 'SPY';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pullState = usePullToRefresh(containerRef, { onRefresh: () => fetchAll(true) });

  const fetchAll = useCallback(async(quiet=false)=>{
    setStatus(quiet ? 'refreshing' : 'loading');
    try {
      const [posData,tradeData,fxRate]=await Promise.all([
        api.getPositions(),
        api.getTrades(),
        api.getForexRate('USDTWD=X'),
      ]);
      const pos=Array.isArray(posData.positions)?posData.positions:[];
      const rate = fxRate > 0 ? fxRate : (posData.usdtwd > 0 ? posData.usdtwd : 32.5);
      setPos(pos); setUsdtwd(rate);
      setTrades(Array.isArray(tradeData)?tradeData:[]);
      // Auto-set initial capital to total cost if not set by user
      setInitCap(prev => {
        if(prev===null&&pos.length){
          const totalCost=pos.reduce((s:number,p:Position)=>{
            const cost=new Decimal(p.avgCost).times(p.shares).times(p.currency==='TWD'?1:rate).toNumber();
            return s+(isFinite(cost)?cost:0);
          },0);
          return Math.round(totalCost)||1_000_000;
        }
        return prev;
      });
      setStatus('idle');
    } catch(e){
      console.error(e);
      setStatus('error');
    }
  },[]);

  useEffect(()=>{fetchAll();},[fetchAll]);

  // Fetch benchmark (SPY or 0050.TW) for Alpha calculation
  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      try {
        const threeYearsAgo = new Date();
        threeYearsAgo.setDate(threeYearsAgo.getDate() - 365 * 3);
        const period1 = threeYearsAgo.toISOString().split('T')[0];

        const hist = await api.getHistory(benchSym, {period1,interval:'1d'});
        if(!cancelled && Array.isArray(hist) && hist.length>1){
          const closes=hist.filter(r=>r?.close&&isFinite(Number(r.close)));
          setBenchmark(closes);
        }
      } catch { /**/ }
    })();
    return () => { cancelled = true; };
  },[benchSym]);

  // Derived
  const safeRate   = usdtwd > 0 ? usdtwd : 32.5; // guard against zero/NaN
  const totalMV   = positions.reduce((s,p)=>s+(p.marketValueTWD??p.marketValue??0),0);
  const totalCost = positions.reduce((s,p)=>{
    const cost=new Decimal(p.avgCost).times(p.shares).times(p.currency==='TWD'?1:safeRate).toNumber();
    return s+(isFinite(cost)?cost:0);
  },0);
  const totalPnL  = new Decimal(totalMV).minus(totalCost).toNumber();
  const totalPct  = totalCost>0?new Decimal(totalPnL).div(totalCost).times(100).toNumber():0;
  const today     = new Date().toISOString().slice(0,10);
  const todayPnL  = trades.filter(t=>normalizeDate(t.date)===today).reduce((s,t)=>s+(t.pnl??0),0);
  const wins      = trades.filter(t=>(t.pnl??0)>0);
  const winRate   = trades.length>0?((wins.length/trades.length)*100).toFixed(1):'0.0';
  const startCap  = initCap??1_000_000;
  const equityCurve = buildEquityCurve(trades, startCap, benchmark);
  
  // Calculate Max Drawdown
  const maxDD = useMemo(() => {
    let peak = startCap;
    let dd = 0;
    for (const point of equityCurve) {
      if (point.value > peak) peak = point.value;
      const cur = peak > 0 ? (peak - point.value) / peak : 0;
      if (cur > dd) dd = cur;
    }
    return dd;
  }, [equityCurve, startCap]);

  const alloc = useMemo(() => positions.map((p,i)=>({name:p.symbol,value:p.marketValueTWD??p.marketValue??0,color:COLORS[i%COLORS.length]})), [positions]);
  const pnlData = useMemo(() => positions.map((p)=>({name:p.symbol, pnl:Math.round(p.pnl??0), color:(p.pnl??0)>=0?'#34d399':'#fb7185'})).sort((a,b)=>b.pnl-a.pnl), [positions]);

  // Save helpers
  const persist=async(updated:Position[])=>{
    setSaveErr('');
    try { await api.setPositions(updated.map(p=>({symbol:p.symbol,name:p.name,shares:p.shares,avgCost:p.avgCost,currency:p.currency}))); }
    catch(e: unknown){setSaveErr(e instanceof Error ? e.message : '儲存失敗');}
  };
  const handleAdd=async()=>{
    const sharesNum = Number(newPos.shares);
    const avgCostNum = Number(newPos.avgCost);
    if(!newPos.symbol||!newPos.shares||!newPos.avgCost){setSaveErr('請填入代碼、股數、均價');return;}
    if(!isFinite(sharesNum)||sharesNum<=0||!isFinite(avgCostNum)||avgCostNum<=0){setSaveErr('股數與均價必須為有效正數');return;}
    const pos:Position={symbol:newPos.symbol.toUpperCase(),name:newPos.name||newPos.symbol.toUpperCase(),shares:sharesNum,avgCost:avgCostNum,currency:newPos.currency};
    const updated=[...positions,pos];
    await persist(updated); setShowAdd(false); setNewPos({symbol:'',name:'',shares:'',avgCost:'',currency:'USD'}); await fetchAll(true);
  };
  const handleDelete=async(idx:number)=>{ const u=positions.filter((_,i)=>i!==idx); await persist(u); await fetchAll(true); };
  const handleSaveEdit=async()=>{
    if(editIdx===null) return;
    const updated=positions.map((p,i)=>i===editIdx?{...p,...editBuf}:p);
    await persist(updated); setEditIdx(null); fetchAll(true);
  };

  const applyCapital=()=>{
    const v=parseInt(capInput.replace(/[,，]/g,''),10);
    if(v>0){setInitCap(v);setShowCapSet(false);}
    else setSaveErr('請輸入有效數字');
  };

  if(status === 'loading') return <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 text-emerald-400 animate-spin"/></div>;
  if(status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">連線異常</h2>
        <p className="text-zinc-400 mb-6 max-w-md">無法取得投資組合資料，請檢查網路連線或稍後再試。</p>
        <button 
          onClick={() => fetchAll()}
          className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          重新整理
        </button>
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 pb-10 overflow-auto"
    >
      <PullToRefreshIndicator state={pullState} />
      {saveErr&&<div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl p-3 shrink-0"><AlertCircle size={13}/>{saveErr}<button onClick={()=>setSaveErr('')} className="ml-auto"><X size={11}/></button></div>}

      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 shrink-0">
        <button
          onClick={() => buildPortfolioPdf(positions, trades, { totalValue: totalMV, totalPnl: totalPnL, totalPnlPct: totalPct, winRate: Number(winRate) })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all active:scale-95"
        >
          <Download size={13} /> 匯出 PDF
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {[
          {label:'總持倉市值 (TWD)',value:`NT$${(totalMV/10000).toFixed(1)}萬`,sub:`匯率 ${usdtwd.toFixed(1)}`,up:true,tip:'所有持倉的當前市場總值（台幣）'},
          {label:'未實現損益',value:`${totalPnL>=0?'+':''}NT$${Math.abs(totalPnL/10000).toFixed(1)}萬`,sub:`${totalPct>=0?'+':''}${totalPct.toFixed(2)}%`,up:totalPnL>=0,tip:'現值 − 成本，正數=帳面獲利'},
          {label:'今日已實現損益',value:`${todayPnL>=0?'+':''}$${todayPnL.toLocaleString(undefined,{maximumFractionDigits:0})}`,sub:today,up:todayPnL>=0,tip:'今天在交易日誌中記錄的損益合計'},
          {label:'最大回撤 (MDD)',value:`${(maxDD*100).toFixed(1)}%`,sub:`歷史最大帳面虧損`,up:maxDD<0.2,tip:'歷史淨值從高點回落的最大幅度'},
        ].map(c=>(
          <div key={c.label} className={cn("liquid-glass rounded-3xl border border-[var(--border-color)] shadow-lg bg-[var(--card-bg)]", compact ? "p-3" : "p-6")}>
            <div className={cn("font-bold text-[var(--text-color)] opacity-50 uppercase tracking-widest mb-2", compact ? "label-meta" : "text-xs")}>{c.label}</div>
            <div className={cn('font-black mb-1 font-mono', compact ? "text-lg" : "text-2xl", c.up?'text-[var(--text-color)]':'text-rose-500')}>{c.value}</div>
            <div className={cn("flex items-center gap-1.5 font-medium", compact ? "label-meta" : "text-xs")}>
              {c.up?<TrendingUp size={compact ? 10 : 12} className="text-emerald-500"/>:<TrendingDown size={compact ? 10 : 12} className="text-rose-500"/>}
              <span className="text-[var(--text-color)] opacity-60">{c.sub}</span>
            </div>
            <div className={cn("text-[var(--text-color)] opacity-40 mt-3 font-medium", compact ? "label-meta" : "text-xs")}>{c.tip}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0" style={{minHeight:260}}>
        <AllocationPieChart alloc={alloc} totalMV={totalMV} compact={compact} />
        <PnLBarChartPanel pnlData={pnlData} compact={compact} />

        <div className={cn("liquid-glass rounded-2xl flex flex-col min-h-[260px] bg-[var(--card-bg)] border-[var(--border-color)]", compact ? "p-2" : "p-4")}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className={cn("font-bold text-[var(--text-color)]", compact ? "text-xs" : "text-xs")}>損益曲線</h3>
              <div className={cn("text-[var(--text-color)] opacity-50", compact ? "label-meta" : "text-xs")}>基於交易日誌的已實現損益累積</div>
            </div>
            <button onClick={()=>{setCapInput(String(startCap));setShowCapSet(v=>!v);}}
              className={cn("flex items-center gap-1 text-[var(--text-color)] opacity-50 hover:opacity-100 px-2 py-1 bg-[var(--bg-color)] rounded-lg border border-[var(--border-color)] transition-colors", compact ? "label-meta" : "text-xs")}>
              <Settings2 size={compact ? 8 : 9}/> 初始資金
            </button>
          </div>
          {showCapSet&&(
            <div className="flex items-center gap-2 mb-2">
              <input aria-label="初始資金" type="number" value={capInput} onChange={e=>setCapInput(e.target.value)} placeholder="初始資金"
                className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-color)] text-xs font-mono focus:outline-none focus:border-emerald-500/50"/>
              <button onClick={applyCapital} className="px-2 py-1 bg-emerald-950 text-emerald-400 text-xs rounded-lg border border-emerald-900/50">套用</button>
              <button onClick={()=>setShowCapSet(false)} className="px-2 py-1 bg-[var(--border-color)] text-[var(--text-color)] opacity-60 text-xs rounded-lg border border-[var(--border-color)]">取消</button>
            </div>
          )}
          {equityCurve.length>1?(
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                  <ReferenceLine y={startCap} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3"/>
                  <XAxis dataKey="date" tick={{fill:'#71717a',fontSize: compact ? 8 : 9}} tickLine={false} interval="preserveStartEnd" tickFormatter={v=>v.slice(5)}/>
                  <YAxis tick={{fill:'#71717a',fontSize: compact ? 8 : 9}} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/>
                  <Tooltip content={<EquityTip/>}/>
                  {benchmark.length>0&&<Area type="monotone" dataKey="benchmark" name={`${benchSym} 基準`} stroke="#52525b" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2"/>}
                  <Area type="monotone" dataKey="value" name="策略淨值" stroke="#10b981" strokeWidth={2} fill="url(#eg)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ):(
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-xs gap-2">
              <BarChart2 size={20} className="opacity-40"/>
              在交易日誌中新增交易後顯示損益曲線
            </div>
          )}
        </div>
      </div>

      {/* Positions table */}
      <div className="liquid-glass rounded-2xl p-4 flex flex-col flex-1 bg-[var(--card-bg)] border border-[var(--border-color)]">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h3 className={cn("font-bold text-[var(--text-color)]", compact ? "text-sm" : "text-base")}>持倉明細</h3>
            <div className="text-sm text-[var(--text-color)] opacity-50 mt-0.5">即時報價 · 每次刷新重新取得</div>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>fetchAll(true)} disabled={status==='refreshing'}
              className={cn("flex items-center gap-1 rounded-xl bg-[var(--border-color)] text-[var(--text-color)] opacity-70 border border-[var(--border-color)] hover:opacity-100 transition-colors", compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm")}>
              <RefreshCw size={compact ? 12 : 14} className={status==='refreshing'?'animate-spin':''}/> 刷新
            </button>
            <button onClick={()=>{setShowAdd(v=>!v);setSaveErr('');}}
              className={cn("flex items-center gap-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors", compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm")}>
              <Plus size={compact ? 12 : 14}/> 新增持倉
            </button>
          </div>
        </div>

        {showAdd&&(
          <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 p-3 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] shrink-0">
            {([['代碼','symbol','text'],['名稱','name','text'],['股數','shares','number'],['均價','avgCost','number'],['幣別','currency','text']] as [string, keyof typeof newPos, string][]).map(([ph,k,t])=>(
              <div key={k}>
                <div className="text-sm text-[var(--text-color)] opacity-50 mb-1">{ph}</div>
                <input aria-label={ph} type={t} placeholder={ph}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[var(--text-color)] text-sm focus:outline-none focus:border-emerald-500/50"
                  value={newPos[k]} onChange={e=>setNewPos(p=>({...p,[k]:e.target.value}))}/>
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <div className="text-sm text-[var(--text-color)] opacity-50 mb-1">操作</div>
              <div className="flex gap-1">
                <button onClick={handleAdd} className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-sm border border-emerald-500/30 hover:bg-emerald-500/30 font-semibold">✓</button>
                <button onClick={()=>{setShowAdd(false);setSaveErr('');}} className="flex-1 py-1.5 rounded-lg bg-[var(--border-color)] text-[var(--text-color)] opacity-60 text-sm border border-[var(--border-color)]">✕</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1">
          {/* Mobile: Horizontal Card Slider */}
          <div className="md:hidden pb-4">
            {positions.length > 0 ? (
              <CardStack
                items={positions.map((p, i) => ({ ...p, id: p.symbol + i }))}
                renderCard={(p) => (
                  <div className="w-full h-full bg-[var(--card-bg)] rounded-xl p-5 border border-[var(--border-color)] shadow-lg space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <span className="text-xl font-bold text-[var(--text-color)] block">{p.symbol}</span>
                          <span className="text-sm text-[var(--text-color)] opacity-50">{p.shortName ?? p.name}</span>
                        </div>
                        <span className={cn('text-sm px-3 py-1.5 rounded-full font-bold', (p.pnlPercent ?? 0) >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                          {(p.pnlPercent ?? 0) >= 0 ? '+' : ''}{(p.pnlPercent ?? 0).toFixed(2)}%
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-base">
                        <div className="flex flex-col">
                          <span className="text-[var(--text-color)] opacity-50 text-xs mb-1">現價</span>
                          <span className="font-mono font-bold text-[var(--text-color)]">{p.currentPrice?.toFixed(2) ?? '---'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[var(--text-color)] opacity-50 text-xs mb-1">損益</span>
                          <span className={cn('font-mono font-bold', (p.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                            {(p.pnl ?? 0) >= 0 ? '+' : ''}{Math.round(p.pnl ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[var(--text-color)] opacity-50 text-xs mb-1">股數</span>
                          <span className="font-mono font-bold text-[var(--text-color)]">{p.shares.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[var(--text-color)] opacity-50 text-xs mb-1">均價</span>
                          <span className="font-mono font-bold text-[var(--text-color)]">{p.avgCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="w-full h-2 bg-[var(--border-color)] rounded-full overflow-hidden mt-4">
                      <div 
                        className={cn("h-full", (p.pnl ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500')} 
                        style={{ width: `${Math.min(Math.abs(p.pnlPercent ?? 0) * 2, 100)}%` }} 
                      />
                    </div>
                  </div>
                )}
              />
            ) : (
              <div className="text-center py-12 px-4">
                <Wallet size={32} className="mx-auto mb-3 text-zinc-700" />
                <div className="text-zinc-400 font-bold mb-1">尚無持倉資料</div>
                <div className="text-zinc-600 text-xs mb-4">點擊「新增持倉」開始追蹤投資組合</div>
                <button onClick={()=>setShowAdd(true)} className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 hover:bg-emerald-500/30">
                  <Plus size={12} className="inline mr-1" /> 新增第一筆持倉
                </button>
              </div>
            )}
          </div>
          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-[var(--text-color)] opacity-50 border-b border-[var(--border-color)] text-xs">
                {['代碼 / 名稱','股數','均價','現價','市值 (TWD)','幣別','未實現損益','漲跌幅','操作'].map((h,i)=>(
                  <th key={i} className={cn('pb-2.5 font-medium',i>=5?'text-right':'')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-500 text-sm">尚無持倉，請點擊上方「新增持倉」按鈕</td></tr>
              )}
              {positions.map((p,idx)=>(
                <tr key={p.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 group transition-colors">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center label-meta font-bold text-zinc-100 shrink-0">{p.symbol.charAt(0)}</div>
                      <div>
                        <div className="font-bold text-zinc-100 text-xs">{p.symbol}</div>
                        <div className="text-[0.55rem] text-zinc-500">{p.shortName??p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 font-mono text-zinc-300">
                    {editIdx===idx?<input aria-label="持股數量" type="number" className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs w-16" value={editBuf.shares??p.shares} onChange={e=>setEditBuf(b=>({...b,shares:Number(e.target.value)}))}/>:p.shares.toLocaleString()}
                  </td>
                  <td className="py-3 font-mono text-zinc-300">
                    {editIdx===idx?<input aria-label="平均成本" type="number" step="0.01" className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-100 text-xs w-20" value={editBuf.avgCost??p.avgCost} onChange={e=>setEditBuf(b=>({...b,avgCost:Number(e.target.value)}))}/>:p.avgCost.toFixed(2)}
                  </td>
                  <td className="py-3 font-mono text-zinc-100">{p.currentPrice!=null?p.currentPrice.toFixed(2):<Loader2 className="w-3 h-3 animate-spin text-zinc-600 inline"/>}</td>
                  <td className="py-3 font-mono text-zinc-100 text-right">${Math.round(p.marketValueTWD??p.marketValue??0).toLocaleString()}</td>
                  <td className="py-3 text-right">
                    <span className={cn('px-1.5 py-0.5 rounded text-[0.55rem] font-bold',p.currency==='TWD'?'bg-emerald-500/10 text-emerald-400':'bg-blue-500/10 text-blue-400')}>{p.currency}</span>
                  </td>
                  <td className={cn('py-3 font-mono font-bold text-right',(p.pnl??0)>=0?'text-emerald-400':'text-rose-400')}>
                    {(p.pnl??0)>=0?'+':''}{Math.round(p.pnl??0).toLocaleString()}
                  </td>
                  <td className="py-3 text-right">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[0.55rem] font-mono font-bold',(p.pnlPercent??0)>=0?'bg-emerald-500/10 text-emerald-400':'bg-rose-500/10 text-rose-400')}>
                      {(p.pnlPercent??0)>=0?'+':''}{(p.pnlPercent??0).toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {editIdx===idx?(
                        <><button onClick={handleSaveEdit} className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={10}/></button>
                          <button onClick={()=>setEditIdx(null)} className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700"><X size={10}/></button></>
                      ):(
                        <>
                          {/* 送回測 button */}
                          {onGoBacktest&&(
                            <button onClick={()=>onGoBacktest(p.symbol)} title="回測此標的"
                              className="p-1.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                              <BarChart2 size={10}/>
                            </button>
                          )}
                          {/* 新增交易記錄 */}
                          {onGoJournal&&(
                            <button onClick={()=>onGoJournal(p.symbol)} title="前往交易日誌"
                              className="p-1.5 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                              <BookOpen size={10}/>
                            </button>
                          )}
                          <button onClick={()=>{setEditIdx(idx);setEditBuf({});}} className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700"><Edit2 size={10}/></button>
                          <button onClick={()=>handleDelete(idx)} className="p-1.5 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"><Trash2 size={10}/></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {positions.length===0&&(
                <tr><td colSpan={9} className="py-10 text-center text-zinc-600 text-sm">
                  點擊「新增持倉」開始追蹤股票
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
