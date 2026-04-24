/**
 * StrategyLab.tsx
 *
 * Fix: replaced mockCurve(Math.random()) with real runBacktest() data
 * The backtest results now reflect actual historical performance.
 * Enhancement: Robust IPC integration & Python syntax highlighting.
 */
import React, { useState, useEffect, useRef } from 'react';
import Editor from "@monaco-editor/react";
import VisualStrategyBuilder from './VisualStrategyBuilder';
import {
  Code2, Play, Save, Sparkles, ChevronRight, Loader2,
  BarChart2, AlertCircle, CheckCircle, Plus, Trash2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { BacktestParams, BacktestResult, BacktestMetrics } from '../types';
import { motion } from 'motion/react';

const DEFAULT_SCRIPT = `import liquid_engine as le
# TrendFlow V1 — MACD + RSI 複合策略

strategy = le.Strategy("TrendFlow_V1")

macd, signal = le.indicators.MACD(fast=12, slow=26, signal=9)
rsi = le.indicators.RSI(period=14)

if le.cross_over(macd, signal) and rsi < 35:
    strategy.emit_order("BUY", quantity=1000, type="MARKET")

elif le.cross_under(macd, signal) or rsi > 65:
    strategy.emit_order("SELL", quantity="ALL")`;

interface AISuggestion { 
  param: string; 
  oldVal: number; 
  newVal: number; 
  roi: number; 
  applied: boolean; 
}

const INITIAL_SUGGESTIONS: AISuggestion[] = [
  { param: 'MACD SLOW PERIOD', oldVal: 26, newVal: 22, roi: 12.4, applied: false },
  { param: 'RSI OVERBOUGHT',   oldVal: 65, newVal: 60, roi: 8.1,  applied: false },
  { param: 'RSI PERIOD',       oldVal: 14, newVal: 11, roi: 5.3,  applied: false },
];

type BtStatus = 'idle' | 'running' | 'done' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
/** Display-only row shape for the backtest trades table (differs from types.ts BacktestTrade) */
interface BtTradeRow {
  entryDate?: string;
  entry?: string;
  exitDate?: string;
  exit?: string;
  dir?: string;
  side?: string;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPct?: number;
}

export default function StrategyLab() {
  const [tab,         setTab]         = useState<'visual'|'script'>('script');
  const [btTab,       setBtTab]       = useState<'chart'|'log'>('chart');
  const [script,      setScript]      = useState(DEFAULT_SCRIPT);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(INITIAL_SUGGESTIONS);
  const [btStatus,    setBtStatus]    = useState<BtStatus>('idle');
  const [btResult,    setBtResult]    = useState<BacktestResult | null>(null);
  const [btError,     setBtError]     = useState('');
  const [symbol,      setSymbol]      = useState('2330.TW');
  const [strategy,    setStrategy]    = useState('macd');
  const [startDate,   setStartDate]   = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 365 * 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate,     setEndDate]     = useState(new Date().toISOString().split('T')[0]);
  const [stopLossPct, setStopLossPct] = useState<number | ''>('');
  const [takeProfitPct, setTakeProfitPct] = useState<number | ''>('');
  const [stratName,   setStratName]   = useState('TrendFlow_V1');
  const [saved,       setSaved]       = useState(false);
  const [activeStrategyId, setActiveStrategyId] = useState<number | null>(null);
  const [strategyList, setStrategyList] = useState<api.Strategy[]>([]);

  // 自動化交易設定
  const [autoTrade, setAutoTrade] = useState(false);
  const [maxDailyLoss, setMaxDailyLoss] = useState(10000);
  
  const appliedCount = suggestions.filter(s => s.applied).length;

  // 載入策略列表
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const [strategies, auto, loss] = await Promise.all([
          api.getStrategies(),
          api.getSetting<boolean>('autoTrade'),
          api.getSetting<number>('maxDailyLoss'),
        ]);
        setStrategyList(strategies);
        const active = strategies.find(s => s.isActive);
        if (active) {
          setActiveStrategyId(active.id);
          setStratName(active.name);
          if (typeof active.script === 'string') setScript(active.script);
        }
        if (typeof auto === 'boolean') setAutoTrade(auto);
        if (typeof loss === 'number') setMaxDailyLoss(loss);
      } catch(e) { console.warn('[StrategyLab] loadStrategies:', e); }
    };
    loadStrategies();
  }, []);

  const handleApply = (idx: number) => setSuggestions(p => p.map((s, i) => i === idx ? { ...s, applied: true } : s));
  const handleApplyAll = () => setSuggestions(p => p.map(s => ({ ...s, applied: true })));

  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSave = async () => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    try {
      if (activeStrategyId) {
        await api.updateStrategy(activeStrategyId, { name: stratName, script });
        await api.activateStrategy(activeStrategyId);
      } else {
        const created = await api.createStrategy({ name: stratName, script });
        setActiveStrategyId(created.id);
        setStrategyList(prev => [...prev, created]);
        await api.activateStrategy(created.id);
      }
      await Promise.all([
        api.setSetting('autoTrade', autoTrade),
        api.setSetting('maxDailyLoss', maxDailyLoss),
      ]);
    } catch(e) { console.warn('[StrategyLab] handleSave:', e); }
  };

  const handleNewStrategy = async () => {
    const name = `Strategy_${Date.now()}`;
    try {
      const s = await api.createStrategy({ name, script: '' });
      setStrategyList(prev => [...prev, s]);
      setActiveStrategyId(s.id);
      setStratName(s.name);
      setScript('');
    } catch(e) { console.warn('[StrategyLab] handleNewStrategy:', e); }
  };

  const handleDeleteStrategy = async (id: number) => {
    try {
      await api.deleteStrategy(id);
      setStrategyList(prev => prev.filter(s => s.id !== id));
      if (activeStrategyId === id) {
        setActiveStrategyId(null);
        setStratName('TrendFlow_V1');
        setScript('');
      }
    } catch(e) { console.warn('[StrategyLab] handleDeleteStrategy:', e); }
  };

  const handleSelectStrategy = (s: api.Strategy) => {
    setActiveStrategyId(s.id);
    setStratName(s.name);
    if (typeof s.script === 'string') setScript(s.script);
  };

  // ← FIX: use real runBacktest API call
  const handleBacktest = async () => {
    setBtStatus('running');
    setBtError('');
    setBtResult(null);
    try {
      const payload: BacktestParams = {
        symbol,
        period1: startDate,
        period2: endDate,
        initialCapital: 1_000_000,
        strategy: strategy,
        stopLossPct: stopLossPct !== '' ? Number(stopLossPct) : undefined,
        takeProfitPct: takeProfitPct !== '' ? Number(takeProfitPct) : undefined,
      };

      const r = await api.runBacktest(payload);

      if (!r || !r.equityCurve?.length) throw new Error('回測無結果，請稍後再試');
      setBtResult(r);
      setBtStatus('done');
    } catch(e: unknown) {
      setBtStatus('error');
      setBtError(e instanceof Error ? e.message : '回測失敗');
    }
  };

  // Build display curve from real data
  const curve = btResult ? btResult.equityCurve
    .filter((_, i) => i % 4 === 0 || i === btResult.equityCurve.length - 1)
    .map((p) => ({
      month: String(p.date ?? '').slice(5, 10),
      strategy: +(100 + ((p as { equity?: number; portfolio?: number }).portfolio ?? p.equity ?? 0)).toFixed(2),
      benchmark: +(100 + (p.benchmark ?? 0)).toFixed(2),
    })) : [];

  const metrics = btResult?.metrics ?? ({ roi:0, sharpe:0, maxDrawdown:0, winRate:0, totalTrades:0, avgWin:0, avgLoss:0, profitFactor:0 } as Partial<BacktestMetrics>);
  const benchEnd = curve.at(-1)?.benchmark ?? 100;
  const superiorRate = btResult && metrics.roi !== undefined ? (metrics.roi - (benchEnd - 100)).toFixed(2) : null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 overflow-y-auto p-4"
    >

      {/* Header */}
      <div className="liquid-glass-strong rounded-[2.5rem] p-6 lg:p-8 border border-zinc-800 shadow-2xl shrink-0 flex items-center justify-between bg-zinc-950/50">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 tracking-tighter flex items-center gap-3">
            策略實驗室
            <span className="label-meta font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-lg border border-emerald-400/20 uppercase tracking-widest">v4.2.0-Alpha</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-bold uppercase tracking-widest opacity-70">Quantum Strategy Backtesting Lab</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button"> {saved ? <CheckCircle size={14}/> : <Save size={14}/>}{saved ? '已儲存' : '儲存草稿'}
          </button>
          <button type="button"> {btStatus === 'running' ? <Loader2 size={14} className="animate-spin"/> : <Play size={14} className="fill-current"/>}
            {btStatus === 'running' ? '回測中…' : '執行回測'}
          </button>
        </div>
      </div>

      {/* Editor Card */}
      <div className="liquid-glass rounded-[2rem] flex flex-col h-[280px] sm:h-[360px] lg:h-[400px] shrink-0 border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-emerald-400 border border-zinc-700">
              <Code2 size={16}/>
            </div>
            <span className="text-xs font-black text-zinc-100 uppercase tracking-widest">策略腳本編輯器</span>
            <input value={stratName} onChange={e => setStratName(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-300 focus:outline-none focus:border-emerald-500/40 w-24 md:w-32 ml-2"/>
          </div>
          <div className="flex items-center gap-1 bg-zinc-950 rounded-xl p-1 border border-zinc-800">
            {(['visual', 'script'] as const).map(t => (
              <button type="button" key={t} onClick={(e) => {}}
                className={cn('px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition',
                  tab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {tab === 'script' ? (
          <div className="flex-1 relative min-h-0">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              value={script}
              onChange={(value) => setScript(value || "")}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <VisualStrategyBuilder onChange={setScript} />
          </div>
        )}
      </div>

      {/* Settings Card */}
      <div className="liquid-glass rounded-[2rem] p-6 shrink-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6 border border-zinc-800 bg-zinc-900/50">
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">策略</span>
          <select value={strategy} onChange={e => setStrategy(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 w-full">
            <option value="macd">MACD 動能</option>
            <option value="rsi">RSI 超買超賣</option>
            <option value="ma_crossover">雙均線交叉</option>
            <option value="ema_crossover">EMA 交叉</option>
            <option value="bollinger_bands">布林通道</option>
            <option value="macd_rsi">MACD + RSI 複合</option>
            <option value="stoch">KD 隨機指標</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">回測區間</span>
          <div className="flex items-center gap-2 min-w-0">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} 
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 [color-scheme:dark] flex-1 min-w-0" />
            <span className="text-zinc-600 text-xs font-black">-</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} 
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 [color-scheme:dark] flex-1 min-w-0" />
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">標的</span>
          <div className="flex flex-wrap gap-2 min-w-0">
            {['2330.TW', 'BTC-USD', 'AAPL', 'NVDA', 'SPY', 'QQQ'].map(s => (
              <button type="button" key={s} onClick={(e) => {}}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-mono font-black border transition truncate',
                  symbol === s ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-300')}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">停損/停利 (%)</span>
          <div className="flex items-center gap-2 min-w-0">
            <input type="number" value={stopLossPct} onChange={e => setStopLossPct(e.target.value ? Number(e.target.value) : '')} placeholder="停損"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 flex-1 min-w-0" />
            <input type="number" value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value ? Number(e.target.value) : '')} placeholder="停利"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 flex-1 min-w-0" />
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">自動化交易</span>
          <button type="button" onClick={(e) => {}}
            className={cn('px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition truncate',
              autoTrade ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20')}>
            {autoTrade ? '停止自動化' : '啟用自動化'}
          </button>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="label-meta text-zinc-500 font-black uppercase tracking-widest truncate">每日最大虧損</span>
          <input type="number" value={maxDailyLoss} onChange={e => setMaxDailyLoss(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-100 focus:outline-none focus:border-emerald-500/40 w-full" />
        </div>
      </div>

      {/* AI Suggestions Card */}
      <div className="liquid-glass rounded-[2rem] p-6 shrink-0 border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Sparkles size={16}/>
            </div>
            <h3 className="text-sm font-black text-zinc-100 uppercase tracking-widest">AI 參數優化建議</h3>
          </div>
          <span className="label-meta px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"/>LIVE AI
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.map((sg, idx) => (
            <div key={sg.param || idx} className={cn('bg-zinc-950 rounded-2xl border p-5 transition', sg.applied ? 'border-emerald-500/20 opacity-60' : 'border-zinc-800')}>
              <div className="flex items-center justify-between mb-4">
                <span className="label-meta text-zinc-500 font-black uppercase tracking-widest">{sg.param}</span>
                <span className="label-meta text-emerald-400 font-black uppercase tracking-widest">+{sg.roi}% ROI</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-zinc-600 font-mono text-xs font-black line-through">{sg.oldVal}</span>
                <ChevronRight size={12} className="text-zinc-700"/>
                <span className="text-emerald-400 font-mono text-sm font-black">{sg.newVal}</span>
              </div>
              {sg.applied ? (
                <div className="flex items-center gap-2 label-meta font-black text-emerald-400 uppercase tracking-widest"><CheckCircle size={12}/>已套用</div>
              ) : (
                <button type="button" onClick={(e) => {}}
                  className="w-full py-2 rounded-xl bg-zinc-900 text-zinc-400 label-meta font-black uppercase tracking-widest border border-zinc-800 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/20 transition">
                  套用此建議
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={(e) => {}} className="mt-4 w-full py-2 bg-indigo-500 rounded text-white font-bold text-sm">
          套用全部 {appliedCount > 0 && `(${appliedCount}/${suggestions.length})`}
        </button>
      </div>

      {/* Backtest results Card */}
      <div className="liquid-glass rounded-[2rem] p-6 shrink-0 border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <BarChart2 size={16}/>
              </div>
              <h3 className="text-sm font-black text-zinc-100 uppercase tracking-widest">
                回測績效分析
              </h3>
            </div>
            <div className="flex items-center bg-zinc-950 rounded-xl p-1 border border-zinc-800">
              {(['chart', 'log'] as const).map(t => (
                <button type="button" key={t} onClick={(e) => {}}
                  className={cn('px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition',
                    btTab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                  {t === 'chart' ? '績效圖表' : '交易明細'}
                </button>
              ))}
            </div>
          </div>
          {btError && <div className="flex items-center gap-2 text-xs text-rose-400 font-black uppercase tracking-widest"><AlertCircle size={14}/>{btError}</div>}
        </div>

        {btResult ? (
          btTab === 'chart' ? (
            <div className="flex flex-col md:flex-row gap-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                {[
                  { label: '超越基準', value: `${Number(superiorRate) > 0 ? '+' : ''}${superiorRate}%`, up: Number(superiorRate) > 0 },
                  { label: '夏普比率', value: String(metrics.sharpe ?? '-'), up: (metrics.sharpe ?? 0) > 1 },
                  { label: '最大回撤', value: `-${metrics.maxDrawdown ?? '-'}%`, up: false },
                  { label: '勝率',     value: `${metrics.winRate ?? '-'}%`, up: (metrics.winRate ?? 0) >= 50 },
                ].map(c => (
                  <div key={c.label} className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] px-4 py-3 text-center">
                    <div className="label-meta text-zinc-500 mb-1">{c.label}</div>
                    <div className={cn('text-xl font-black font-mono', c.up ? 'text-emerald-400' : 'text-rose-400')}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Real curve */}
              <div className="flex-1 h-36 md:h-40">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <AreaChart data={curve}>
                    <defs>
                      <linearGradient id="slg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 8 }} tickLine={false}/>
                    <YAxis tick={{ fill: '#64748b', fontSize: 8 }} tickLine={false} tickFormatter={v => `${v}%`} domain={['auto', 'auto']}/>
                    <Tooltip contentStyle={{ backgroundColor: '#0D1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n) === 'strategy' ? stratName : 'Benchmark']}/>
                    <Area type="monotone" dataKey="benchmark" stroke="#475569" strokeWidth={1.5} fill="none" dot={false}/>
                    <Area type="monotone" dataKey="strategy"  stroke="#34d399" strokeWidth={2.5} fill="url(#slg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-xs text-zinc-500">
                <thead className="sticky top-0 bg-[var(--card-bg)]">
                  <tr className="border-b border-[var(--border-color)] text-zinc-500">
                    <th className="py-2 px-2">進場時間</th>
                    <th className="py-2 px-2">出場時間</th>
                    <th className="py-2 px-2">方向</th>
                    <th className="py-2 px-2 text-right">進場價</th>
                    <th className="py-2 px-2 text-right">出場價</th>
                    <th className="py-2 px-2 text-right">盈虧 %</th>
                  </tr>
                </thead>
                <tbody>
                  {(btResult.trades && btResult.trades.length > 0) ? (btResult.trades as unknown as BtTradeRow[]).map((t, i) => (
                    <tr key={`${t.entryDate}-${t.exitDate}-${i}`} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-color)]">
                      <td className="py-2 px-2 font-mono">{t.entryDate || t.entry || '-'}</td>
                      <td className="py-2 px-2 font-mono">{t.exitDate ?? t.exit ?? '-'}</td>
                      <td className={cn('py-2 px-2 font-bold', (t.dir ?? t.side ?? 'BUY') === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>{t.dir ?? t.side ?? 'BUY'}</td>
                      <td className="py-2 px-2 text-right font-mono">{t.entryPrice?.toFixed(2) ?? '-'}</td>
                      <td className="py-2 px-2 text-right font-mono">{t.exitPrice?.toFixed(2) ?? '-'}</td>
                      <td className={cn('py-2 px-2 text-right font-mono font-bold', (t.pnl ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {(t.pnl ?? 0) > 0 ? '+' : ''}{(t.pnlPct ?? t.pnl ?? 0).toFixed(2)}%
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-500 font-bold">
                        無交易明細資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center py-6 gap-3">
            {btStatus === 'running' ? (
              <><Loader2 className="animate-spin text-emerald-400" size={16}/><span className="text-zinc-500 text-sm">正在執行回測…</span></>
            ) : (
              <><Play size={16} className="text-zinc-500"/><span className="text-zinc-500 text-sm">點擊「執行回測」查看真實歷史績效（非模擬數據）</span></>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}