/**
 * BacktestPage.tsx — 回測引擎
 *
 * 修復:
 * 1. 圖表加 key={chartKey} 強制重新掛載，解決 Recharts SVG defs 快取問題
 * 2. 字體放大至適合閱讀的尺寸
 * 3. 全面繁體中文 + 新手投資說明
 * 4. 四種策略各有獨立邏輯說明與顏色
 */
import React, { useState, useRef } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Play, Download, Trophy, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Info, ChevronDown,
  Settings, Activity, ArrowDownRight, Target, FileText,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { runBacktest } from '../services/api';
import { pushLog } from './TradeLogger';
import { BacktestResult, BacktestMetrics } from '../types';
import { motion } from 'motion/react';
import { buildBacktestPdf } from '../utils/exportPdf';

// ── 策略定義 ──────────────────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id:     'ma_crossover' as const,
    label:  '均線交叉策略',
    en:     'MA Crossover',
    color:  '#34d399',
    bg:     'rgba(52,211,153,0.12)',
    type:   '趨勢跟蹤',
    desc:   '當短期均線（10日）向上穿越長期均線（30日）時買進，反之賣出。適合趨勢明顯的市場。',
    buyDesc:  'SMA10 由下往上穿越 SMA30（黃金交叉）→ 多方趨勢確立，買進',
    sellDesc: 'SMA10 由上往下穿越 SMA30（死亡交叉）→ 空方訊號，賣出',
    beginner: '💡 新手說明：均線是一段時間內價格的平均值。短期均線穿越長期均線代表近期買盤增強，是趨勢轉多的訊號。',
    suitable: '📈 適合行情：單邊趨勢（牛市或熊市）',
    avoid:    '⚠️ 不適合：震盪整理盤，容易產生假訊號',
  },
  {
    id:     'neural' as const,
    label:  '多因子AI策略',
    en:     'Neural Transfer',
    color:  '#818cf8',
    bg:     'rgba(129,140,248,0.12)',
    type:   'AI模型',
    desc:   '模擬機器學習模型，同時分析動量、成交量、波動度三個因子，综合評分後決策。',
    buyDesc:  'EMA8/EMA21 動量評分>0.3，且成交量放大，且 ATR 波動率>0.8%，三因子同時滿足才買進',
    sellDesc: 'EMA8/EMA21 動量評分轉負（-0.2以下），模型認為上漲動能消失，賣出',
    beginner: '💡 新手說明：AI策略同時看多個指標（動量+量能+波動），需要多個條件同時成立才下單，訊號較少但精準度較高。',
    suitable: '📈 適合行情：趨勢+量能配合的市場',
    avoid:    '⚠️ 不適合：低波動、無趨勢的市場',
  },
  {
    id:     'rsi' as const,
    label:  'RSI 超買超賣',
    en:     'RSI Mean Rev.',
    color:  '#f59e0b',
    bg:     'rgba(245,158,11,0.12)',
    type:   '均值回歸',
    desc:   'RSI（相對強弱指標）低於35時認為超賣，等待回升後買進；高於65時認為超買，等待回落後賣出。',
    buyDesc:  'RSI(14) 從 35 以下回升到 35 → 超賣結束，開始反彈，買進',
    sellDesc: 'RSI(14) 從 65 以上回落到 65 → 超買結束，開始回落，賣出',
    beginner: '💡 新手說明：RSI衡量「最近漲跌幅的強弱」，0~30代表超賣（可能反彈），70~100代表超買（可能下跌）。本策略等待反轉確認後才進場。',
    suitable: '📈 適合行情：區間震盪行情',
    avoid:    '⚠️ 不適合：單邊趨勢行情（容易抄底套牢）',
  },
  {
    id:     'macd' as const,
    label:  'MACD 動能策略',
    en:     'MACD Momentum',
    color:  '#f472b6',
    bg:     'rgba(244,114,182,0.12)',
    type:   '動量策略',
    desc:   'MACD柱狀圖（快慢線差值）由負轉正，且主線在零軸之上，確認多頭動能；柱狀圖轉負則賣出。',
    buyDesc:  'MACD 柱狀圖由負轉正（動能翻多），且 MACD 主線>0（在零軸上方），買進',
    sellDesc: 'MACD 柱狀圖由正轉負（動能翻空），賣出離場',
    beginner: '💡 新手說明：MACD用兩條不同速度的均線相減，代表市場「動能強弱」。柱狀圖由負轉正代表多頭力量開始超越空頭。',
    suitable: '📈 適合行情：趨勢轉折點、中期趨勢',
    avoid:    '⚠️ 不適合：快速震盪行情（MACD反應較慢）',
  },
] as const;
type StratId = typeof STRATEGIES[number]['id'];

const DEFAULT_SYMBOLS = ['AAPL','TSLA','NVDA','MSFT','BTC-USD','ETH-USD','2330.TW','SPY','QQQ'];

// ── 自訂 Tooltip ──────────────────────────────────────────────────────────────
const EquityTip = ({active,payload,label,color}: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; color?: string }) => {
  if (!active||!payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-sm shadow-xl min-w-[160px]" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', fontFamily: 'var(--font-data)' }}>
      <div className="mb-2 text-xs" style={{ color: 'var(--md-outline)' }}>{label}</div>
      {payload.map((p, idx) => (
        <div key={`${p.dataKey}-${idx}`} className="flex justify-between gap-4" style={{color:p.dataKey==='portfolio'?color:'#94a3b8'}}>
          <span>{p.dataKey==='portfolio'?'策略':'買進持有'}</span>
          <span className="font-bold">{(p.value>=0?'+':'')+Number(p.value).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
};
const DdTip = ({active,payload,label}: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active||!payload?.length) return null;
  return (
    <div className="rounded-xl p-2.5 text-xs shadow-xl" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', fontFamily: 'var(--font-data)' }}>
      <div className="mb-1" style={{ color: 'var(--md-outline)' }}>{label}</div>
      <div style={{ color: 'var(--color-up)' }}>最大回撤: -{Number(payload[0]?.value||0).toFixed(2)}%</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export default function BacktestPage({ initialSymbol }: { initialSymbol?: string } = {}) {
  const [symbolsList,  setSymbolsList]  = useState<string[]>(DEFAULT_SYMBOLS);
  const [symbol,       setSymbol]       = useState(initialSymbol ?? 'AAPL');
  const [period1,      setPeriod1]      = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [period2,      setPeriod2]      = useState(() => new Date().toISOString().split('T')[0]);
  const [capital,      setCapital]      = useState('1000000');
  const [strategy,     setStrategy]     = useState<StratId>('ma_crossover');
  type BtRunState = 'idle' | 'running' | 'comparing';
  const [runState,     setRunState]     = useState<BtRunState>('idle');
  const running   = runState === 'running';
  const comparing = runState === 'comparing';
  const [result,       setResult]       = useState<BacktestResult & { strategy: string } | null>(null);
  const [error,        setError]        = useState('');
  const [tradeSort,    setTradeSort]    = useState<'date'|'pnl'>('date');
  const [showDd,       setShowDd]       = useState(true);
  // ← KEY FIX: unique key forces chart remount on each new result
  const chartKeyRef = useRef(0);
  // Multi-strategy compare
  const [compareMode,    setCompareMode]    = useState(false);
  const [compareResults, setCompareResults] = useState<Record<string, BacktestResult & { strategy: string }>>({});

  const strat = STRATEGIES.find(s=>s.id===strategy) ?? STRATEGIES[0];

  const handleCompare = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('請輸入股票代碼'); return; }
    setRunState('comparing'); setError(''); setCompareResults({});
    const cap = parseInt(capital.replace(/,/g,''),10)||1_000_000;
    const results: Record<string, BacktestResult & { strategy: string }> = {};
    
    // Limit concurrency to 2
    for (let i = 0; i < STRATEGIES.length; i += 2) {
      const chunk = STRATEGIES.slice(i, i + 2);
      await Promise.all(chunk.map(async s => {
        try {
          const r = await runBacktest({symbol:sym, period1, period2:period2||undefined, initialCapital:cap, strategy:s.id});
          if (r?.metrics) results[s.id] = {...r, strategy:s.id};
        } catch(e) { console.warn('[BacktestPage] runBacktest strategy:', s.id, e); }
      }));
    }
    
    setCompareResults({ ...results });
    setCompareMode(true);
    setRunState('idle');
  };

  const handleRun = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('請輸入股票/加密貨幣代碼'); return; }
    if (new Date(period1) >= new Date(period2)) { setError('開始日期必須早於結束日期'); return; }
    if (!symbolsList.includes(sym)) setSymbolsList(p=>[sym,...p]);

    // ← increment key every run to force chart remount
    chartKeyRef.current += 1;

    setRunState('running'); setError(''); setResult(null);
    try {
      const cap = parseInt(capital.replace(/,/g,''),10) || 1_000_000;
      const r = await runBacktest({symbol:sym, strategy, initialCapital:cap, startDate:period1, endDate:period2||''});
      if (!r||typeof r!=='object') throw new Error('伺服器回傳格式錯誤');
      const safe = {
        ...r,
        equityCurve:  Array.isArray(r.equityCurve)?r.equityCurve:[],
        trades:       Array.isArray(r.trades)?r.trades:[],
        metrics:      r.metrics||{roi:0,sharpe:0,maxDrawdown:0,winRate:0,totalTrades:0,avgWin:0,avgLoss:0,profitFactor:0},
        strategy,   // record which strategy this result belongs to
      };
      if (safe.equityCurve.length===0) throw new Error('該時間區間內無足夠歷史資料，請擴大日期範圍（建議至少6個月）');
      setResult(safe);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : '回測執行失敗，請稍後再試');
    } finally {
      setRunState('idle');
    }
  };

  const exportCSV = () => {
    if (!result?.trades?.length) return;
    const header='進場日期,出場日期,進場價,出場價,股數,持有天數,損益%,損益金額,結果';
    const rows=result.trades.map((t)=>`${t.entryTime},${t.exitTime},${t.entryPrice},${t.exitPrice},${t.amount},${t.holdDays},${t.pnlPct}%,${t.pnl},${t.result==='WIN'?'獲利':'虧損'}`);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([[header,...rows].join('\n')],{type:'text/csv;charset=utf-8'}));
    a.download=`回測_${symbol}_${strat.en}_${period1}.csv`;
    a.click();
  };

  const metrics: BacktestMetrics = result?.metrics || { roi: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, avgWin: 0, avgLoss: 0, profitFactor: 0 };
  const equityData  = result?.equityCurve || [];
  const benchEnd    = equityData.at(-1)?.benchmark ?? 0;

  // Result strategy meta (use the strategy that was actually used for the result)
  const resultStrat = STRATEGIES.find(s=>s.id===result?.strategy) || strat;

  const tradesRaw = result?.trades || [];
  const trades = [...tradesRaw].sort((a,b)=>
    tradeSort==='pnl' ? (b.pnl ?? 0)-(a.pnl ?? 0) : new Date(b.exitTime ?? '').getTime()-new Date(a.exitTime ?? '').getTime()
  );

  let maxWinStreak=0,maxLossStreak=0,curW=0,curL=0;
  for(const t of tradesRaw.slice().reverse()){
    if(t.result==='WIN'){curW++;curL=0;maxWinStreak=Math.max(maxWinStreak,curW);}
    else{curL++;curW=0;maxLossStreak=Math.max(maxLossStreak,curL);}
  }

  const ddData = equityData
    .filter((_,i)=>i%3===0||i===equityData.length-1)
    .map((d)=>({date:String(d.date||'').slice(5), dd:d.drawdown??0}));

  // Chart key includes result strategy + roi to force remount on every new result
  const chartKey = `chart-${result?.strategy||'none'}-${result?.metrics?.roi??0}-${chartKeyRef.current}`;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-6 p-2 sm:p-4 overflow-y-auto custom-scrollbar relative"
    >


      {/* ── Header: Title & Controls ── */}
      <div className="glass-card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 md:gap-6 rounded-2xl md:rounded-[2.5rem] p-4 md:p-6 lg:p-8 shadow-2xl shrink-0 relative z-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />

        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--md-primary-container)' }}>
            <Play size={20} className="fill-current md:hidden" style={{ color: 'var(--md-on-primary)' }} />
            <Play size={28} className="fill-current hidden md:block" style={{ color: 'var(--md-on-primary)' }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-black tracking-tighter" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>回測引擎 <span className="text-[10px] md:text-sm font-bold ml-1 px-1.5 md:px-2 py-0.5 rounded-lg" style={{ color: 'var(--md-primary)', background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)' }}>V4.2</span></h1>
            <p className="label-meta font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1 truncate" style={{ color: 'var(--md-outline)' }}>Quantum Backtesting Lab</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full lg:w-auto">
          <div className="flex-1 min-w-[140px] lg:flex-none lg:min-w-[160px] relative">
            <input
              list="bt-symbols"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="代碼 (AAPL, 2330.TW)"
              className="relative w-full rounded-xl md:rounded-2xl px-3 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
              {...{} as object}
            />
            <datalist id="bt-symbols">{symbolsList.map(s=><option key={s} value={s}/>)}</datalist>
          </div>

          <div className="flex-1 min-w-[140px] lg:flex-none lg:min-w-[180px] relative">
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value as StratId)}
              className="relative w-full rounded-xl md:rounded-2xl px-3 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition appearance-none cursor-pointer" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
            >
              {STRATEGIES.map(s => <option key={`opt-${s.id}`} value={s.id} style={{ background: 'var(--md-surface-container)' }}>{s.label}</option>)}
            </select>
              <ChevronDown size={14} className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--md-outline)' }} />
          </div>

          <div className="flex items-center gap-2 md:gap-3 w-full lg:w-auto">
            <button type="button" onClick={() => setCompareMode(v => !v)}
              className={cn("flex-1 lg:flex-none px-4 py-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95", compareMode ? "bg-indigo-500 text-black shadow-lg shadow-indigo-500/20" : "bg-white/5 text-zinc-400 border border-white/10")}>
              {comparing ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
              比較績效 COMPARE
            </button>
            {result && (
              <button type="button" onClick={() => pushLog('info', 'SYSTEM', 'Exporting PDF report...')}
                className="flex-1 lg:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition flex items-center justify-center gap-2" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}
              >
                <Download size={16} /> 匯出 PDF
              </button>
            )}
            <button type="button" onClick={handleRun} disabled={running}
              className="flex-1 lg:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-indigo-500 text-black shadow-lg shadow-indigo-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50">
              {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-current" />}
              {running ? '執行中 COMPUTING...' : '開始回測 RUN'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 shrink-0 relative z-10">
        {/* Settings Card */}
        <div className="md:col-span-2 xl:col-span-1 glass-card rounded-2xl md:rounded-[2rem] p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
              <Settings size={18} />
            </div>
            <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.15em] md:tracking-[0.2em]" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>回測設定</h3>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2 md:space-y-3">
              <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>初始資金 (USD)</label>
              <div className="relative group">
                <input
                  type="text"
                  value={capital}
                  onChange={e => setCapital(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3 text-base md:text-sm font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-xs" style={{ color: 'var(--md-outline)' }}>$</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <div className="space-y-3">
                <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>開始日期</label>
                <input
                  type="date"
                  value={period1}
                  onChange={e => setPeriod1(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-base md:text-xs font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                />
              </div>
              <div className="space-y-2 md:space-y-3">
                <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>結束日期</label>
                <input
                  type="date"
                  value={period2}
                  onChange={e => setPeriod2(e.target.value)}
                  className="w-full rounded-xl md:rounded-2xl px-3 md:px-4 py-2.5 md:py-3 text-base md:text-xs font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                />
              </div>
            </div>
          </div>

          {/* Strategy Parameters Panel */}
          <div className="pt-6 space-y-4" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
            <label className="label-meta font-black uppercase tracking-widest ml-1" style={{ color: 'var(--md-outline)' }}>策略參數</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="label-meta" style={{ color: 'var(--md-outline)' }}>參數 A</label>
                <input type="number" defaultValue={10} className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }} />
              </div>
              <div className="space-y-2">
                <label className="label-meta" style={{ color: 'var(--md-outline)' }}>參數 B</label>
                <input type="number" defaultValue={30} className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Strategy explanation box */}
        <div className="glass-card md:col-span-2 xl:col-span-3 rounded-[2rem] p-6 lg:p-8 transition relative overflow-hidden shadow-xl" style={{ borderColor: strat.color + '40' }}>
          
          <div className="flex flex-col h-full relative z-10">
            <div className="flex flex-col md:flex-row items-start justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform duration-500" style={{backgroundColor: strat.bg, border: `1px solid ${strat.color}30`}}>
                  <Info size={28} style={{color: strat.color}} />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{strat.label}</h2>
                    <span className="label-meta px-3 py-1 rounded-full font-black uppercase tracking-widest" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: strat.color }}>{strat.type}</span>
                  </div>
                  <p className="text-sm font-medium max-w-2xl leading-relaxed" style={{ color: 'var(--md-outline)' }}>{strat.desc}</p>
                </div>
              </div>
              
              <div className="hidden md:flex flex-col items-end text-right">
                <span className="label-meta font-black uppercase tracking-widest mb-1" style={{ color: 'var(--md-outline)' }}>Strategy ID</span>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--md-on-surface-variant)' }}>{strat.en}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 flex-1">
              <div className="p-6 rounded-3xl transition duration-500" style={{ background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.15)' }}>
                <div className="label-meta font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-down)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-down)' }} />
                  買進訊號 (Entry)
                </div>
                <div className="text-sm leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{strat.buyDesc}</div>
              </div>
              <div className="p-6 rounded-3xl transition duration-500" style={{ background: 'rgba(255,77,79,0.04)', border: '1px solid rgba(255,77,79,0.15)' }}>
                <div className="label-meta font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-up)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-up)' }} />
                  賣出訊號 (Exit)
                </div>
                <div className="text-sm leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{strat.sellDesc}</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                <span>📈</span> {strat.suitable}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                <span>⚠️</span> {strat.avoid}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 shrink-0 flex items-start gap-3" style={{ background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)', color: 'var(--md-error)' }}>
          <AlertCircle size={18} className="shrink-0 mt-0.5"/>
          <div>
            <div className="font-bold mb-0.5">回測失敗</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* ══════════════════ 多策略比較結果 ══════════════════ */}
      {compareMode && Object.keys(compareResults).length > 0 && (
        <div className="shrink-0 glass-card rounded-[2.5rem] p-6 lg:p-10 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-50" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-lg">
                <Trophy size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>多策略績效矩陣</h3>
                <p className="label-meta font-black uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--md-outline)' }}>{symbol} · {period1} ～ {period2}</p>
              </div>
            </div>
            <button type="button" onClick={(e) => { setCompareMode(false); setCompareResults({}); }}
              className="text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl active:scale-95 transition" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}
            >
              關閉比較
            </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
            <table className="w-full text-sm mb-6 min-w-[800px]">
              <thead>
                <tr className="border-b label-meta font-black uppercase tracking-[0.2em]" style={{ borderColor: 'var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                  <th className="pb-6 text-left pl-4">策略名稱</th>
                  <th className="pb-6 text-right">總報酬率 (ROI)</th>
                  <th className="pb-6 text-right">夏普比率 (Sharpe)</th>
                  <th className="pb-6 text-right">最大回撤 (MDD)</th>
                  <th className="pb-6 text-right">勝率 (Win Rate)</th>
                  <th className="pb-6 text-right pr-4">交易次數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {STRATEGIES.map(s => {
                  const r = compareResults[s.id];
                  if (!r) return null;
                  const m = r.metrics;
                  const best = Object.values(compareResults).reduce((max: any, x: any) => (x.metrics?.roi ?? 0) > (max.metrics?.roi ?? 0) ? x : max, Object.values(compareResults)[0]);
                  const isBest = r === best;
                  return (
                    <tr key={s.id} className={cn('group transition duration-300', isBest ? '' : '')} style={isBest ? { background: 'rgba(128,131,255,0.05)' } : {}}>
                      <td className="py-6 pl-4 flex items-center gap-4">
                        <div className="w-2.5 h-10 rounded-full shadow-lg" style={{ backgroundColor: s.color }} />
                        <div>
                          <div className="font-black text-base tracking-tight" style={{ color: 'var(--md-on-surface)' }}>{s.label}</div>
                          {isBest && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ color: 'var(--md-primary)', background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)' }}>Top Performer</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-6 text-right font-mono font-black text-lg" style={{ color: (m?.roi ?? 0) >= 0 ? 'var(--color-down)' : 'var(--color-up)' }}>
                        {(m?.roi ?? 0) >= 0 ? '+' : ''}{m?.roi ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: (m?.sharpe ?? 0) >= 1 ? 'var(--color-down)' : (m?.sharpe ?? 0) >= 0 ? 'var(--md-tertiary)' : 'var(--color-up)' }}>
                        {m?.sharpe ?? 0}
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: 'var(--color-up)' }}>
                        -{m?.maxDrawdown ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: (m?.winRate ?? 0) >= 50 ? 'var(--color-down)' : 'var(--color-up)' }}>
                        {m?.winRate ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold pr-4" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {m?.totalTrades ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════ 結果 ══════════════════ */}
      {result ? (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {/* 結果標題列 */}
          <div className="glass-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
            
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                <Activity size={32} />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-2xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{resultStrat.label}</h3>
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>Strategy Report</span>
                </div>
                <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--md-outline)' }}>
                  <span style={{ color: 'var(--md-primary)' }}>{symbol}</span>
                  <span className="w-1 h-1 rounded-full" style={{ background: 'var(--md-outline-variant)' }} />
                  <span>{period1} ～ {period2}</span>
                </p>
              </div>
            </div>

              <div className="flex items-center gap-4 relative z-10 w-full sm:w-auto">
              <div className="flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl flex flex-col items-center sm:items-end justify-center" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--md-outline)' }}>Total Return</span>
                <span className="text-2xl md:text-3xl font-black tracking-tighter tabular-nums" style={{ color: metrics.roi >= 0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
                  {metrics.roi >= 0 ? '+' : ''}{metrics.roi}%
                </span>
              </div>
              <button type="button" onClick={() => pushLog('info', 'SYSTEM', 'Downloading full report CSV...')}
                className="p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors active:scale-90 shadow-xl">
                <Download size={24} />
              </button>
            </div>
          </div>

          {/* ── 圖表 + 指標 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 glass-card rounded-[2.5rem] p-8 shadow-2xl flex flex-col min-h-[500px] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />
              
              {/* Chart header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{backgroundColor:resultStrat.color}}/>
                    <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--md-on-surface)' }}>{resultStrat.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: 'var(--md-outline-variant)' }}/>
                    <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--md-outline)' }}>Buy &amp; Hold</span>
                  </div>
                </div>
                <button type="button" onClick={() => setShowDd(v => !v)}
                  className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] px-4 md:px-6 py-2 md:py-2.5 rounded-2xl transition active:scale-95 shadow-lg"
                  style={showDd ? { background: 'rgba(255,77,79,0.1)', color: 'var(--color-up)', border: '1px solid rgba(255,77,79,0.25)' } : { background: 'var(--md-surface-container-high)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                  {showDd ? 'Hide Drawdown' : 'Show Drawdown'}
                </button>
              </div>

              {/* ← KEY FIX: key forces full chart remount on each new backtest result */}
              <div key={chartKey} className="flex-1 flex flex-col min-h-0">
                {/* Equity curve */}
                <div className="flex-1 min-h-[280px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <AreaChart data={equityData} margin={{top:10,right:10,bottom:0,left:0}}>
                      <defs>
                        <linearGradient id={`gStrat_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={resultStrat.color} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={resultStrat.color} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id={`gBench_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="date" tick={{fill:'#64748b',fontSize:10,fontWeight:'bold'}} tickLine={false} axisLine={false}
                        tickFormatter={v=>String(v).slice(2,10).replace(/-/g,'/')}
                        interval={Math.max(1,Math.floor(equityData.length/6))}/>
                      <YAxis tick={{fill:'#64748b',fontSize:10,fontWeight:'bold'}} tickLine={false} axisLine={false}
                        tickFormatter={v=>`${v>=0?'+':''}${v}%`} domain={['auto', 'auto']}/>
                      <Tooltip content={<EquityTip color={resultStrat.color}/>}/>
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3"/>
                      <Area type="monotone" dataKey="benchmark" name="benchmark" stroke="#64748b" strokeWidth={2} strokeOpacity={0.5} fill={`url(#gBench_${chartKey})`} dot={false} animationDuration={1500} connectNulls={true} />
                      <Area type="monotone" dataKey="portfolio" name="portfolio" stroke={resultStrat.color} strokeWidth={4} fillOpacity={1} fill={`url(#gStrat_${chartKey})`} dot={false} animationDuration={2000} connectNulls={true} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Drawdown sub-chart */}
                {showDd && ddData.length>0 && (
                  <div className="mt-6 pt-6 animate-in slide-in-from-top-4 duration-500" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--color-up)' }}>
                      <Info size={12}/> Drawdown Analysis (Risk Exposure)
                    </div>
                    <div className="h-20">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <AreaChart data={ddData} margin={{top:0,right:10,bottom:0,left:0}}>
                          <defs>
                            <linearGradient id={`gDD_${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#fb7185" stopOpacity={0.5}/>
                              <stop offset="95%" stopColor="#fb7185" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" hide/>
                          <YAxis hide domain={[0,'auto']} reversed/>
                          <Tooltip content={<DdTip/>}/>
                          <Area type="monotone" dataKey="dd" stroke="#fb7185" strokeWidth={2}
                            fill={`url(#gDD_${chartKey})`} dot={false} animationDuration={1000}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 績效指標欄 */}
            <div className="lg:col-span-1 flex flex-col gap-5">
              {[
                {
                  label:'總報酬率 (ROI)',
                  value:`${metrics.roi>=0?'+':''}${metrics.roi}%`,
                  sub:`基準：${benchEnd>=0?'+':''}${benchEnd.toFixed(1)}%`,
                  up:metrics.roi>=0,
                  icon: <TrendingUp size={20} />,
                  color: metrics.roi >= 0 ? 'emerald' : 'rose'
                },
                {
                  label:'夏普比率 (Sharpe)',
                  value:Number(metrics.sharpe).toFixed(2),
                  sub:metrics.sharpe>1?'Excellent Risk/Reward':metrics.sharpe>0?'Moderate Performance':'High Risk Exposure',
                  up:metrics.sharpe>1,
                  icon: <Activity size={20} />,
                  color: metrics.sharpe > 1 ? 'emerald' : metrics.sharpe > 0 ? 'amber' : 'rose'
                },
                {
                  label:'最大回撤 (MDD)',
                  value:`-${metrics.maxDrawdown}%`,
                  sub:`Peak-to-Trough Decline`,
                  up:false,
                  icon: <ArrowDownRight size={20} />,
                  color: 'rose'
                },
                {
                  label:'勝率 (Win Rate)',
                  score:metrics.winRate,
                  value:`${metrics.winRate}%`,
                  sub:`${tradesRaw.filter((t)=>t.result==='WIN').length}W / ${tradesRaw.filter((t)=>t.result==='LOSS').length}L`,
                  up:metrics.winRate>=50,
                  icon: <Target size={20} />,
                  color: metrics.winRate >= 50 ? 'emerald' : 'amber'
                },
              ].map((c, idx)=>{
                const metricColor = c.color === 'emerald' ? 'var(--color-down)' : c.color === 'rose' ? 'var(--color-up)' : 'var(--md-tertiary)';
                const iconBg = c.color === 'emerald' ? 'rgba(82,196,26,0.1)' : c.color === 'rose' ? 'rgba(255,77,79,0.1)' : 'rgba(255,183,131,0.1)';
                const iconBorder = c.color === 'emerald' ? 'rgba(82,196,26,0.25)' : c.color === 'rose' ? 'rgba(255,77,79,0.25)' : 'rgba(255,183,131,0.25)';
                return (
                <div key={`stat-card-${idx}`} className="glass-card rounded-[2rem] p-6 relative overflow-hidden transition duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] mb-3 relative z-10" style={{ color: 'var(--md-outline)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: iconBg, border: `1px solid ${iconBorder}`, color: metricColor }}>
                      {c.icon}
                    </div>
                    {c.label}
                  </div>
                  <div className="text-3xl font-black mb-1 tracking-tight tabular-nums relative z-10" style={{ color: metricColor, fontFamily: 'var(--font-data)' }}>
                    {c.value}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest relative z-10" style={{ color: 'var(--md-outline)' }}>{c.sub}</div>
                </div>
                );
              })}

              {/* 額外指標小表格 */}
              <div className="liquid-glass rounded-[2rem] p-8 border border-white/10 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-500/20 to-transparent" />
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Settings size={14} className="text-slate-400" /> 進階績效矩陣
                </div>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  {[
                    ['獲利因子',    `${metrics.profitFactor?.toFixed(2)??'—'}`],
                    ['平均獲利',    metrics.avgWin!=null?`+${metrics.avgWin}%`:'—'],
                    ['平均虧損',    metrics.avgLoss!=null?`${metrics.avgLoss}%`:'—'],
                    ['最長連勝',    `${maxWinStreak}筆`],
                    ['最長連敗',    `${maxLossStreak}筆`],
                    ['策略評級',    metrics.roi>50?'🏆 卓越':metrics.roi>20?'✅ 良好':'📊 普通'],
                  ].map(([k,v], idx)=>(
                    <div key={`metric-${idx}`} className="space-y-1.5 group">
                      <div className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em] group-hover:text-slate-400 transition-colors">{k}</div>
                      <div className="text-sm font-black text-white tracking-tight">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* ── 策略說明 + 成交記錄 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 glass-card rounded-[2rem] p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />
              <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(128,131,255,0.1)', border: '1px solid rgba(128,131,255,0.25)', color: 'var(--md-primary)' }}>
                  <Info size={16} />
                </div>
                策略邏輯回顧
              </h3>
              <div className="space-y-6">
                <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.12)' }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-down)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-down)' }} />
                    買進觸發
                  </div>
                  <div className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{resultStrat.buyDesc}</div>
                </div>
                <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(255,77,79,0.04)', border: '1px solid rgba(255,77,79,0.12)' }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-up)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-up)' }} />
                    賣出觸發
                  </div>
                  <div className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{resultStrat.sellDesc}</div>
                </div>
                <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.12)' }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--md-tertiary)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--md-tertiary)' }} />
                    專家筆記
                  </div>
                  <div className="text-xs leading-relaxed font-medium italic opacity-80" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {resultStrat.beginner.replace('💡 新手說明：','')}
                  </div>
                </div>
              </div>
            </div>

            {/* 成交記錄表格 */}
            <div className="xl:col-span-3 glass-card rounded-[2.5rem] p-8 shadow-2xl flex flex-col min-h-[500px] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-outline-variant)] to-transparent opacity-40" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                    <FileText size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
                      成交明細 
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>Total {tradesRaw.length} Trades</span>
                    </h3>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg" style={{ color: 'var(--color-down)', background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.25)' }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-down)' }} /> {tradesRaw.filter((t)=>t.result==='WIN').length} Wins
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg" style={{ color: 'var(--color-up)', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)' }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400" /> {tradesRaw.filter((t)=>t.result==='LOSS').length} Losses
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="flex-1 sm:flex-none flex bg-white/5 rounded-2xl p-1.5 border border-white/10 shadow-inner">
                    {(['date','pnl'] as const).map(s=>(
                      <button key={s} type="button" onClick={() => setTradeSort(s)}
                        className="flex-1 sm:flex-none text-[9px] md:text-[10px] font-black uppercase tracking-widest px-4 md:px-6 py-2 rounded-xl transition duration-300 active:scale-95"
                          style={tradeSort===s ? { background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', border: '1px solid var(--md-outline-variant)' } : { color: 'var(--md-outline)' }}>
                        {s==='date'?'Time':'PnL'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => pushLog('info', 'SYSTEM', 'Exporting trade history...')} className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors active:scale-90">
                    <Download size={16}/>
                  </button>
                </div>
              </div>

              <div className="flex-1">
                {/* Mobile: Horizontal scrollable cards */}
                <div className="flex md:hidden gap-3 pb-4 overflow-x-auto">
                  {trades.map((t, i) => (
                    <div key={`mobile-trade-${t.entryTime}-${i}`} className="min-w-[200px] glass-card rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold" style={{ color: 'var(--md-on-surface)' }}>{t.entryTime}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={(t.pnlPct ?? 0) >= 0 ? { background: 'rgba(82,196,26,0.15)', color: 'var(--color-down)' } : { background: 'rgba(255,77,79,0.15)', color: 'var(--color-up)' }}>
                          {(t.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(t.pnlPct ?? 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--md-outline)' }}>PnL: {Number(t.pnl).toLocaleString()}</div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--md-outline)' }}>進場</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.entryPrice).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--md-outline)' }}>出場</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.exitPrice).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: Table */}
                <div className="hidden md:block overflow-x-auto custom-scrollbar">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead className="sticky top-0 backdrop-blur-md z-10" style={{ background: 'var(--md-surface-container)' }}>
                      <tr className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--md-outline)', borderBottom: '1px solid var(--md-outline-variant)' }}>
                        <th className="pb-4 text-left">Entry Date</th>
                        <th className="pb-4 text-left">Exit Date</th>
                        <th className="pb-4 text-right">Entry</th>
                        <th className="pb-4 text-right">Exit</th>
                        <th className="pb-4 text-right">Size</th>
                        <th className="pb-4 text-right">Hold</th>
                        <th className="pb-4 text-right">ROI%</th>
                        <th className="pb-4 text-right">PnL</th>
                        <th className="pb-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--md-outline-variant)' }}>
                      {trades.map((t,i) => (
                        <tr key={`desktop-trade-${t.entryTime}-${i}`} className="group transition-colors">
                          <td className="py-4 font-mono text-xs" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{t.entryTime}</td>
                          <td className="py-4 font-mono text-xs" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{t.exitTime}</td>
                          <td className="py-4 font-mono text-xs text-right font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.entryPrice).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                          <td className="py-4 font-mono text-xs text-right font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.exitPrice).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                          <td className="py-4 font-mono text-xs text-right" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{Number(t.amount).toLocaleString()}</td>
                          <td className="py-4 font-mono text-xs text-right" style={{ color: 'var(--md-outline)', fontFamily: 'var(--font-data)' }}>{t.holdDays}d</td>
                          <td className="py-4 font-mono font-black text-sm text-right" style={{ color: (t.pnlPct ?? 0)>=0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
                            {(t.pnlPct ?? 0)>=0?'+':''}{Number(t.pnlPct ?? 0).toFixed(2)}%
                          </td>
                          <td className="py-4 font-mono font-black text-sm text-right" style={{ color: (t.pnl ?? 0)>=0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
                            {(t.pnl ?? 0)>=0?'+':''}{Number(t.pnl ?? 0).toLocaleString(undefined,{maximumFractionDigits:0})}
                          </td>
                          <td className="py-4 text-center">
                            {t.result==='WIN'
                              ? <span className="inline-flex items-center gap-1 text-[0.55rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: 'var(--color-down)', background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.25)' }}>
                                  <TrendingUp size={10}/> Profit
                                </span>
                              : <span className="inline-flex items-center gap-1 text-[0.55rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: 'var(--color-up)', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)' }}>
                                  <TrendingDown size={10}/> Loss
                                </span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !running && (
        /* 空白狀態 */
        <div className="flex-1 flex flex-col items-center justify-center gap-12 py-20 animate-in fade-in zoom-in-95 duration-1000">
          <div className="text-center space-y-6 max-w-2xl px-6">
            <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto relative" style={{ background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.25)' }}>
              <Play style={{ color: 'var(--md-primary)' }} className="relative z-10" size={40} fill="currentColor" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>準備好驗證你的交易策略了嗎？</h3>
              <p className="font-medium leading-relaxed" style={{ color: 'var(--md-outline)' }}>
                回測引擎允許你使用歷史市場數據來模擬交易表現。雖然過去的績效不保證未來結果，但它是優化策略、建立信心的關鍵步驟。
              </p>
            </div>
          </div>

          {/* Strategy preview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-5xl px-6">
            {STRATEGIES.map((s, idx)=>(
              <button key={`strat-btn-${idx}`} type="button" onClick={(e) => {}}
                  className="p-6 rounded-[2rem] text-left transition hover:scale-[1.03] active:scale-95 relative overflow-hidden"
                style={strategy===s.id
                  ? { background: 'rgba(128,131,255,0.12)', border: `1px solid ${s.color}40` }
                  : { background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-3 h-3 rounded-full mb-4" style={{backgroundColor:s.color}}/>
                <div className="text-base font-black mb-2" style={{ color: 'var(--md-on-surface)' }}>{s.label}</div>
                <div className="text-xs leading-relaxed font-medium line-clamp-3" style={{ color: 'var(--md-outline)' }}>{s.desc}</div>
                <div className="label-meta mt-4 font-black uppercase tracking-widest" style={{color:s.color}}>{s.type}</div>
              </button>
            ))}
          </div>

          <div className="rounded-3xl p-6 max-w-2xl w-full mx-6" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.15)' }}>
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest mb-3" style={{ color: 'var(--md-tertiary)' }}>
              <AlertCircle size={18} /> 投資風險免責聲明
            </div>
            <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-outline)' }}>
              本工具提供的回測結果僅供學術研究與策略開發參考。市場環境瞬息萬變，歷史數據無法完全預測未來走勢。所有交易決策應由投資者自行評估，本平台不承擔任何因使用本工具而產生的投資損失。
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
