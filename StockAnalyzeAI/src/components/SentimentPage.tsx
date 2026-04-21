/**
 * SentimentPage.tsx — 市場情緒儀表板
 *
 * 啟用了 aiService.ts 中兩個完全實作但從未被呼叫的函數：
 *   - analyzeSentiment() → 整體市場多空評分、VIX、恐慌貪婪
 *   - analyzeMTF()       → 個股多時框技術分析（1H / 1D / 1W）
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, Loader2, TrendingUp, TrendingDown,
  Minus, AlertCircle, Search,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  PolarAngleAxis,
} from 'recharts';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { analyzeSentiment, analyzeMTF, analyzeStock } from '../services/aiService';
import { motion } from 'motion/react';
import { SentimentData, MTFResult, AIAnalysisResult, HistoricalData } from '../types';
import { useSettings } from '../contexts/SettingsContext';

const MARKET_SYMBOLS = ['^GSPC','^IXIC','^VIX','BTC-USD','ETH-USD','^TNX','GC=F'];
const DEFAULT_MTF_SYM = '2330.TW';

interface Props { model: string; symbol?: string; }

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 65 ? '#34d399' : score >= 40 ? '#f59e0b' : '#fb7185';
  const data = [{ value: score, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-20">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <RadialBarChart cx="50%" cy="100%" innerRadius="60%" outerRadius="100%"
            startAngle={180} endAngle={0} data={data}>
            <PolarAngleAxis type="number" domain={[0,100]} tick={false}/>
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill:'rgba(255,255,255,0.05)' }}/>
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <div className="text-2xl font-black font-mono" style={{color}}>{score}</div>
        </div>
      </div>
      <div className="text-xs text-zinc-400 mt-1 text-center">{label}</div>
    </div>
  );
}

const statusIcon = (s: string) => {
  if (!s) return <Minus size={12} className="text-zinc-500"/>;
  const l = s.toLowerCase();
  if (l.includes('bull') || l.includes('偏多') || l.includes('樂觀')) return <TrendingUp size={12} className="text-emerald-400"/>;
  if (l.includes('bear') || l.includes('偏空') || l.includes('悲觀')) return <TrendingDown size={12} className="text-rose-400"/>;
  return <Minus size={12} className="text-zinc-500"/>;
};
const statusColor = (s: string) => {
  if (!s) return 'text-zinc-400';
  const l = s.toLowerCase();
  if (l.includes('bull') || l.includes('偏多') || l.includes('樂觀')) return 'text-emerald-400';
  if (l.includes('bear') || l.includes('偏空') || l.includes('悲觀')) return 'text-rose-400';
  return 'text-amber-400';
};
const indicStatus = (s: string) => {
  if (!s) return 'text-zinc-500';
  if (s === 'bullish') return 'text-emerald-400';
  if (s === 'bearish') return 'text-rose-400';
  return 'text-amber-400';
};
const indicLabel = (s: string) => {
  if (s === 'bullish') return '偏多';
  if (s === 'bearish') return '偏空';
  return '中性';
};

// ─────────────────────────────────────────────────────────────────────────────
export default function SentimentPage({ model, symbol: initSym }: Props) {
  const { settings } = useSettings();
  const [sentiment,    setSentiment]    = useState<SentimentData | null>(null);
  const [mtf,          setMtf]          = useState<MTFResult | null>(null);
  const [singleAI,     setSingleAI]     = useState<AIAnalysisResult | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [mtfLoading,   setMtfLoading]   = useState(false);
  const [mtfSym,       setMtfSym]       = useState(initSym ?? DEFAULT_MTF_SYM);
  const [mtfInput,     setMtfInput]     = useState(initSym ?? DEFAULT_MTF_SYM);
  const [error,        setError]        = useState('');
  const [lastUpdated,  setLastUpdated]  = useState('');

  const loadSentiment = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const quotes = await api.getBatchQuotes(MARKET_SYMBOLS);


      const result  = await analyzeSentiment(
  Array.isArray(quotes) ? quotes : [], 
  model, 
  typeof settings.systemInstruction === 'string' ? settings.systemInstruction : undefined
);
      if (result) { setSentiment(result); setLastUpdated(new Date().toLocaleTimeString('zh-TW')); }
      else setError('AI 分析失敗 — 請確認 API Key 已設定');
    } catch(e: unknown) { 
      const msg = e instanceof Error ? e.message : '載入失敗';
      setError(msg); 
    } finally { setLoading(false); }
  }, [model, settings.systemInstruction]);

  const loadMTF = useCallback(async (sym: string) => {
    if (!sym.trim()) return;
    setMtfLoading(true);
    try {
      const now = new Date();
      const getPastDateStr = (days: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
      };

      const [d1h, d1d, d1wk] = await Promise.all([
        api.getHistory(sym, {period1: getPastDateStr(30), interval:'1h'}).catch(e => { console.warn('[SentimentPage] getHistory 1h:', sym, e); return []; }),
        api.getHistory(sym, {period1: getPastDateStr(365), interval:'1d'}).catch(e => { console.warn('[SentimentPage] getHistory 1d:', sym, e); return []; }),
        api.getHistory(sym, {period1: getPastDateStr(365 * 3), interval:'1wk'}).catch(e => { console.warn('[SentimentPage] getHistory 1wk:', sym, e); return []; }),
      ]);
      const [mtfResult, singleResult] = await Promise.all([
        analyzeMTF(sym, (d1h??[]) as HistoricalData[], (d1d??[]) as HistoricalData[], (d1wk??[]) as HistoricalData[], model, settings.systemInstruction as string | undefined),
        analyzeStock(sym, {regularMarketPrice:0}, ((d1d??[]) as HistoricalData[]).slice(-30), model, settings.systemInstruction as string | undefined),

        analyzeMTF(sym, (d1h??[]) as HistoricalData[], (d1d??[]) as HistoricalData[], (d1wk??[]) as HistoricalData[], model, typeof settings.systemInstruction === 'string' ? settings.systemInstruction : undefined),
        analyzeStock(sym, {regularMarketPrice:0}, ((d1d??[]) as HistoricalData[]).slice(-30), model, typeof settings.systemInstruction === 'string' ? settings.systemInstruction : undefined),

      ]);
      setMtf(mtfResult);
      setSingleAI(singleResult);
    } catch(e: unknown) { 
      console.error('MTF error:', e); 
    } finally { setMtfLoading(false); }
  }, [model, settings.systemInstruction]);

  useEffect(() => {
    loadSentiment();
  }, [loadSentiment]);

  useEffect(() => {
    loadMTF(mtfSym);
  }, [mtfSym, loadMTF]);

  const handleSearch = () => {
    const s = mtfInput.trim().toUpperCase();
    if (s) { setMtfSym(s); }
  };

  const overallLabel = sentiment?.overall ?? '載入中';
  const sentScore    = sentiment?.score ?? 0;
  const keyDrivers: string[] = sentiment?.keyDrivers ?? [];
  const vix         = sentiment?.vixLevel ?? '—';
  const advice      = sentiment?.aiAdvice ?? '';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 overflow-auto pb-10"
    >

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <Activity size={16} className="text-emerald-400"/>
            市場情緒儀表板
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            AI 即時分析全球市場多空氣氛 + 個股多時框技術訊號
            {lastUpdated && <span className="ml-2 text-zinc-600">更新於 {lastUpdated}</span>}
          </p>
        </div>
        <button onClick={loadSentiment} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-color)] opacity-70 text-sm border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-colors">
          <RefreshCw size={13} className={loading?'animate-spin':''}/> 重新分析
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center gap-2 text-rose-400 text-sm shrink-0">
          <AlertCircle size={14}/> {error}
        </div>
      )}

      {/* ── Row 1: Gauge + Key drivers + VIX ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">

        {/* Sentiment gauge */}
        <div className="liquid-glass rounded-2xl p-5 flex flex-col items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={20} className="animate-spin text-emerald-400"/>
              <div className="text-xs text-zinc-500">AI 分析市場情緒中…</div>
            </div>
          ) : (
            <>
              <ScoreGauge score={sentScore} label="多空評分"/>
              <div className={cn('text-sm font-bold mt-2 flex items-center gap-1.5', statusColor(overallLabel))}>
                {statusIcon(overallLabel)}
                {overallLabel}
              </div>
              <div className="text-xs text-zinc-500 mt-1 text-center">
                {sentScore >= 65 ? '市場偏多，適合買進布局' : sentScore >= 40 ? '市場中性，謹慎觀望' : '市場偏空，注意風險'}
              </div>
            </>
          )}
        </div>

        {/* Macro indicators */}
        <div className="liquid-glass rounded-2xl p-4">
          <div className="text-xs font-bold text-white mb-3">總體指標</div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({length:4}).map((_,i)=>(
                <div key={i} className="h-4 bg-[var(--bg-color)] rounded animate-pulse"/>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {([
                ['恐慌指數 VIX',  vix, Number(vix)>25?'text-rose-400':Number(vix)>15?'text-amber-400':'text-emerald-400'],
                ['Put/Call 比率', sentiment?.putCallRatio??'—', 'text-white'],
                ['市場廣度',      sentiment?.marketBreadth??'—', 'text-white'],
                ['整體趨勢',      sentiment?.overall??'—',       statusColor(sentiment?.overall??'')],
              ] as [string, string | number, string][]).map(([l,v,cls])=>(
                <div key={l} className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">{l}</span>
                  <span className={cn('text-xs font-bold font-mono', cls)}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI advice + key drivers */}
        <div className="liquid-glass rounded-2xl p-4 flex flex-col">
          <div className="text-xs font-bold text-white mb-2">AI 市場解讀</div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-zinc-600"/>
            </div>
          ) : (
            <>
              <div className="text-xs text-[var(--text-color)] opacity-70 leading-relaxed mb-3 flex-1">{advice || '等待 AI 分析…'}</div>
              <div className="space-y-1 border-t border-[var(--border-color)] pt-2">
                <div className="label-meta font-bold text-zinc-500 mb-1">關鍵驅動因素</div>
                {keyDrivers.slice(0,3).map((d,i)=>(
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-400 label-meta font-bold mt-0.5 shrink-0">{i+1}.</span>
                    <span className="label-meta text-zinc-400 leading-relaxed">{d}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Row 2: MTF Analysis ── */}
      <div className="liquid-glass rounded-2xl p-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-bold text-white">多時框技術分析 (MTF)</div>
            <div className="text-xs text-zinc-500 mt-0.5">同時分析短 / 中 / 長期訊號，找出多時框共振點</div>
          </div>
          <div className="flex items-center gap-2">
            <input value={mtfInput} onChange={e=>setMtfInput(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==='Enter'&&handleSearch()}
              placeholder="輸入代碼…"
              className="bg-black/30 border border-[var(--border-color)] rounded-xl px-3 py-1.5 text-sm text-white font-bold focus:outline-none focus:border-emerald-500/40 w-32 uppercase placeholder:text-zinc-600 placeholder:normal-case"/>
            <button onClick={handleSearch} disabled={mtfLoading}
              className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
              {mtfLoading ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}
            </button>
          </div>
        </div>

        {mtfLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-zinc-500">
            <Loader2 size={16} className="animate-spin"/> AI 分析 {mtfSym} 多時框訊號中…
          </div>
        ) : mtf ? (
          <div>
            {/* MTF table */}
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-xs text-zinc-500">
                    <th className="pb-2 text-left font-medium w-40">指標</th>
                    <th className="pb-2 text-center font-medium">1H 短期</th>
                    <th className="pb-2 text-center font-medium">1D 中期</th>
                    <th className="pb-2 text-center font-medium">1W 長期</th>
                  </tr>
                </thead>
                <tbody>
                  {(mtf?.indicators ?? []).map((ind: { name: string, values: string[], statuses?: string[] }, i: number) => (
                    <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--card-bg)]">
                      <td className="py-2.5 text-xs text-zinc-400 font-semibold">{ind.name}</td>
                      {(ind.values ?? ['—','—','—']).map((v: string, j: number) => {
                        const s = (ind.statuses ?? [])[j] ?? 'neutral';
                        return (
                          <td key={j} className="py-2.5 text-center">
                            <span className={cn('inline-flex items-center gap-1 text-xs font-bold', indicStatus(s))}>
                              {s==='bullish'?<TrendingUp size={10}/>:s==='bearish'?<TrendingDown size={10}/>:<Minus size={10}/>}
                              {v || indicLabel(s)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Overall MTF synthesis */}
            <div className="flex items-start gap-4">
              <div className="flex-1 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-3">
                <div className="label-meta font-bold text-zinc-500 mb-1">AI 綜合研判</div>
                <div className="text-xs text-[var(--text-color)] opacity-70 leading-relaxed">{mtf.synthesis ?? '—'}</div>
              </div>
              <div className="shrink-0 flex flex-col items-center gap-1 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-3 min-w-[100px]">
                <div className="label-meta text-zinc-500 font-bold">整體評分</div>
                <div className={cn('text-3xl font-black font-mono', (mtf?.score ?? 0)>=65?'text-emerald-400':(mtf?.score ?? 0)>=40?'text-amber-400':'text-rose-400')}>
                  {mtf?.score ?? '—'}
                </div>
                <div className={cn('text-xs font-bold', statusColor(mtf?.overallTrend ?? ''))}>
                  {mtf?.overallTrend ?? '中性'}
                </div>
              </div>
              {singleAI && (
                <div className="shrink-0 flex flex-col items-center gap-1 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-3 min-w-[110px]">
                  <div className="label-meta text-zinc-500 font-bold">AI 建議</div>
                  <div className={cn('text-sm font-black',
                    singleAI.action?.includes('BUY')?'text-emerald-400':singleAI.action?.includes('SELL')?'text-rose-400':'text-amber-400')}>
                    {singleAI.action ?? '—'}
                  </div>
                  <div className="label-meta text-zinc-500">目標 {singleAI.targetPrice?.toFixed(2)?? '—'}</div>
                  <div className="label-meta text-zinc-500">停損 {singleAI.stopLoss?.toFixed(2) ?? '—'}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-zinc-600 text-sm gap-2">
            <Search size={16} className="opacity-40"/> 輸入股票代碼後按 Enter 或搜尋圖示
          </div>
        )}
      </div>

      {/* ── Row 3: Quick tips for beginners ── */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 shrink-0">
        <div className="text-sm font-bold text-amber-400 mb-2">💡 如何閱讀市場情緒？</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400">
          <div><span className="text-emerald-400 font-bold">多空評分 65+：</span> 市場整體樂觀，上漲動能強，適合尋找買點</div>
          <div><span className="text-amber-400 font-bold">多空評分 40-64：</span> 市場猶豫，謹慎操作，避免重倉</div>
          <div><span className="text-rose-400 font-bold">多空評分 39以下：</span> 市場恐慌，可能進一步下跌，考慮減碼或觀望</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400 mt-2">
          <div><span className="text-white font-bold">多時框共振：</span> 1H+1D+1W 全部偏多才是強烈買進訊號</div>
          <div><span className="text-white font-bold">VIX 恐慌指數：</span> 高於 25 代表市場恐慌，低於 15 代表過度樂觀</div>
          <div><span className="text-white font-bold">分析僅供參考：</span> AI 研判不構成投資建議，請自行評估風險</div>
        </div>
      </div>
    </motion.div>
  );
}
