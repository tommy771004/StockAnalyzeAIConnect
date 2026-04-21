import { useState, useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Clock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeMTF } from '../services/aiService';
import { useSettings } from '../contexts/SettingsContext';
import type { HistoricalData, MTFResult } from '../types';

const timeframes = ['1 小時 (1H)', '日線 (1D)', '週線 (1W)'];

interface MTFData {
  data1h: HistoricalData[];
  data1d: HistoricalData[];
  data1wk: HistoricalData[];
}

export default function MultiTimeframe({ model, symbol }: { model: string, symbol: string }) {
  const { settings } = useSettings();
  const [analysis, setAnalysis] = useState<MTFResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [data, setData] = useState<MTFData | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const period1_1h = thirtyDaysAgo.toISOString().split('T')[0];

        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        const period1_1d = oneYearAgo.toISOString().split('T')[0];

        const threeYearsAgo = new Date();
        threeYearsAgo.setDate(threeYearsAgo.getDate() - 365 * 3);
        const period1_1wk = threeYearsAgo.toISOString().split('T')[0];

        // Fetch data for 1h, 1d, 1wk
        const [res1h, res1d, res1wk] = await Promise.all([
          fetch(`/api/stock/${symbol}/history?interval=1h&period1=${period1_1h}`),
          fetch(`/api/stock/${symbol}/history?interval=1d&period1=${period1_1d}`),
          fetch(`/api/stock/${symbol}/history?interval=1wk&period1=${period1_1wk}`)
        ]);

        if (!res1h.ok || !res1d.ok || !res1wk.ok) throw new Error('API response not ok');

        const data1h = await res1h.json();
        const data1d = await res1d.json();
        const data1wk = await res1wk.json();

        if (!cancelled && mountedRef.current) {
          setData({ data1h, data1d, data1wk });
          setFetchError(null);
        }
      } catch (error) {
        console.error("Error fetching MTF data:", error);
        if (!cancelled && mountedRef.current) setFetchError(error instanceof Error ? error.message : '資料載入失敗');
      } finally {
        if (!cancelled && mountedRef.current) setIsLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    const runAnalysis = async () => {
      if (!data) return;
      try {
        if (mountedRef.current) setIsLoading(true);
        const result = await analyzeMTF(symbol, data.data1h, data.data1d, data.data1wk, model, String(settings.systemInstruction || ''));
        if (!cancelled && mountedRef.current) setAnalysis(result);
      } catch (error) {
        console.error("Error analyzing MTF data:", error);
        if (!cancelled && mountedRef.current) setFetchError(error instanceof Error ? error.message : 'AI 分析失敗');
      } finally {
        if (!cancelled && mountedRef.current) setIsLoading(false);
      }
    };

    runAnalysis();
    return () => { cancelled = true; };
  }, [data, model, symbol, settings.systemInstruction]);

  return (
    <div className="h-full pb-10 flex flex-col gap-6">
      <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-3xl p-8 relative overflow-hidden flex-1">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-8 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/[0.1] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
            <Clock className="w-6 h-6 text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.6)]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white/90 drop-shadow-md">多時區分析矩陣 (MTF Matrix)</h2>
            <p className="text-sm text-white/50">跨週期趨勢共振掃描，尋找高勝率交易機會</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 relative z-10">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-white/60">AI 正在進行多時區共振分析...</p>
          </div>
        ) : analysis ? (
          <>
            <div className="overflow-x-auto relative z-10">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-4 border-b border-white/[0.08] text-white/50 font-medium w-1/4">指標 (Indicator)</th>
                    {timeframes.map((tf, i) => (
                      <th key={i} className="p-4 border-b border-white/[0.08] text-white/70 font-semibold text-center w-1/4">{tf}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.indicators.map((ind, i: number) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 text-white/80 font-medium">{ind.name}</td>
                      {ind.values.map((val: string, j: number) => {
                        const status = (ind.statuses?.[j] ?? val) as 'bullish' | 'bearish' | 'neutral';
                        return (
                          <td key={j} className="p-4 text-center">
                            <StatusBadge value={val} status={status} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl relative z-10 backdrop-blur-md">
              <h4 className="text-indigo-300 font-semibold mb-2 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                AI 綜合評估 (AI Synthesis)
              </h4>
              <p className="text-white/80 text-sm leading-relaxed">
                {analysis.synthesis}
                <br /><br />
                整體共振分數：
                <strong className={cn(
                  "ml-1",
                  analysis.score >= 70 ? "text-emerald-400" : analysis.score <= 30 ? "text-rose-400" : "text-amber-400"
                )}>
                  {analysis.score}/100 ({analysis.overallTrend})
                </strong>
              </p>
            </div>
          </>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3 relative z-10">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <p className="text-rose-400 font-semibold">載入失敗</p>
            <p className="text-white/40 text-sm text-center max-w-xs">{fetchError}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 relative z-10">
            <p className="text-white/60">無法載入分析結果</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ value, status }: { value: string, status: 'bullish' | 'bearish' | 'neutral' }) {
  if (value === 'bullish') return <div className="mx-auto inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400"><TrendingUp className="w-4 h-4" /></div>;
  if (value === 'bearish') return <div className="mx-auto inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/20 text-rose-400"><TrendingDown className="w-4 h-4" /></div>;
  if (value === 'neutral') return <div className="mx-auto inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400"><Minus className="w-4 h-4" /></div>;

  return (
    <span className={cn(
      "px-3 py-1.5 rounded-xl text-sm font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]",
      status === 'bullish' && "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
      status === 'bearish' && "bg-rose-500/10 text-rose-300 border border-rose-500/20",
      status === 'neutral' && "bg-amber-500/10 text-amber-300 border border-amber-500/20"
    )}>
      {value}
    </span>
  );
}
