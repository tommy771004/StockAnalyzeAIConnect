import { useState, useEffect, memo } from 'react';
import { LineChart, Activity, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeSentiment as getAISentiment } from '../services/aiService';
import { SentimentData } from '../types';

function Sentiment({ model, symbol }: { model: string, symbol: string }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [marketData, setMarketData] = useState<unknown>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch(`/api/market-summary?symbol=${symbol}`);
        const data = await response.json();
        setMarketData(data);
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };
    fetchMarketData();
  }, [symbol]);

useEffect(() => {
    const analyzeSentiment = async () => {
      // 加上 Array.isArray 檢查，這樣 TS 就會 100% 確定傳進去的一定是陣列
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) return;
      
      setIsAnalyzing(true);
      try {
        const aiResult = await getAISentiment(Array.isArray(marketData) ? marketData : [], model);
        setSentiment(aiResult);
      } catch (error) {
        console.error('Failed to analyze sentiment:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };
    analyzeSentiment();
  }, [marketData, model]);

  return (
    <div className="h-full pb-10 flex flex-col gap-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-color)] flex items-center justify-center border border-[var(--border-color)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
          <LineChart className="w-6 h-6 text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.6)]" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white/90 drop-shadow-md">市場情緒 (Market Sentiment)</h2>
          <p className="text-base text-white/50">AI 綜合分析新聞、社群與總經數據</p>
        </div>
      </div>

      {isAnalyzing ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mb-4" />
          <p className="text-white/60 animate-pulse">AI 正在分析全球市場情緒...</p>
        </div>
      ) : sentiment ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Sentiment Score */}
          <div className="lg:col-span-2 bg-[var(--card-bg)] backdrop-blur-3xl border border-[var(--border-color)] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle 
                    cx="50" cy="50" r="40" fill="transparent" 
                    stroke={sentiment.score > 50 ? "#34d399" : "#fb7185"} 
                    strokeWidth="8" 
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - sentiment.score / 100)}`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-bold text-white/90">{sentiment.score}</span>
                  <span className="text-base text-white/50">/ 100</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white/80 mb-2">綜合情緒指標</h3>
                <div className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-4 font-medium text-lg",
                  sentiment.score > 50 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                )}>
                  {sentiment.score > 50 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {sentiment.overall}
                </div>
                <p className="text-white/70 text-lg leading-relaxed">
                  {sentiment.aiAdvice}
                </p>
              </div>
            </div>
          </div>

          {/* VIX & Indicators */}
          <div className="bg-[var(--card-bg)] backdrop-blur-3xl border border-[var(--border-color)] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-3xl p-6 relative overflow-hidden flex flex-col gap-4">
            <h3 className="text-xl font-semibold text-white/80 mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" /> 關鍵指標
            </h3>
            <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-4 flex justify-between items-center">
              <span className="text-white/70 text-lg">VIX 恐慌指數</span>
              <span className="text-2xl font-bold text-white/90">{sentiment.vixLevel}</span>
            </div>
            <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-4 flex justify-between items-center">
              <span className="text-white/70 text-lg">Put/Call Ratio</span>
              <span className="text-2xl font-bold text-white/90">{sentiment.putCallRatio || 'N/A'}</span>
            </div>
            <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-4 flex justify-between items-center">
              <span className="text-white/70 text-lg">市場寬度 (MMFI)</span>
              <span className="text-2xl font-bold text-white/90">{sentiment.marketBreadth || 'N/A'}</span>
            </div>
          </div>

          {/* Key Drivers */}
          <div className="lg:col-span-3 bg-[var(--card-bg)] backdrop-blur-3xl border border-[var(--border-color)] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-3xl p-6 relative overflow-hidden">
            <h3 className="text-xl font-semibold text-white/80 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-indigo-400" /> 主要驅動因素 (Key Drivers)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sentiment.keyDrivers?.map((driver: string, idx: number) => (
                <div key={idx} className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-4 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <p className="text-white/70 text-base">{driver}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(Sentiment);
