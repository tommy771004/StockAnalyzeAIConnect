import React from 'react';
import { cn } from '../lib/utils';
import { Sparkles, Rss, Clock, ExternalLink } from 'lucide-react';
import { NewsItem, SentimentData } from '../types';

interface Props {
  news: NewsItem[];
  sentiment: SentimentData | null;
  newsStatus: 'idle' | 'loading' | 'error';
}

export const NewsSentimentBelowChart = React.memo(({ news, sentiment, newsStatus }: Props) => {
  if (newsStatus === 'loading') {
    return <div className="text-xs text-[var(--md-outline)] animate-pulse p-4 text-center w-full">正在獲取最新新聞與市場情緒…</div>;
  }
  if (newsStatus === 'error') {
    return <div className="text-xs text-[var(--color-up)] p-4 text-center w-full">無法取得最新新聞</div>;
  }
  if (news.length === 0) {
    return null;
  }

  // Parse overall sentiment color
  const overall = sentiment?.overall?.toLowerCase() || '';
  const isPositive = overall.includes('positive') || overall.includes('bullish') || overall.includes('看多') || overall.includes('正向');
  const isNegative = overall.includes('negative') || overall.includes('bearish') || overall.includes('看空') || overall.includes('負向');

  return (
    <div className="flex flex-col md:flex-row gap-3 w-full bg-black/40 lg:bg-transparent lg:border lg:border-[var(--md-outline-variant)] rounded-2xl p-3 shrink-0 min-h-[120px] mt-1 mb-1 lg:mb-0">
      {/* Sentiment Overview */}
      <div className="flex flex-col gap-2 md:w-1/3 shrink-0 border-b md:border-b-0 md:border-r border-[var(--md-outline-variant)] pb-4 md:pb-0 md:pr-4">
        <div className="flex items-center gap-1.5 font-bold text-sm" style={{ color: 'var(--md-primary)' }}>
          <Sparkles size={14} /> AI 綜合情緒分析
        </div>
        {!sentiment ? (
          <div className="text-xs text-[var(--md-outline)] animate-pulse mt-2">情緒分析中…</div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={cn("text-xl font-black font-data", isPositive ? 'text-price-down' : isNegative ? 'text-price-up' : 'text-[var(--md-on-surface)]')}>
                {sentiment.overall || '中立'}
              </span>
              <span className="text-xs text-[var(--md-outline)]">信心指數: {sentiment.score}/100</span>
            </div>
            <div className="text-xs leading-relaxed text-[var(--md-on-surface-variant)] mt-1 line-clamp-3">
              {sentiment.aiAdvice}
            </div>
          </>
        )}
      </div>

      {/* News Headlines */}
      <div className="flex flex-col gap-2 flex-1 min-w-0 overflow-y-auto max-h-[160px] custom-scrollbar pr-2">
        <div className="flex items-center gap-1.5 font-bold text-sm text-[var(--md-on-surface)] sticky top-0 z-10 pb-1" style={{ background: 'inherit' }}>
          <Rss size={14} className="text-[var(--md-outline)]" /> 最新新聞 (TradingView)
        </div>
        {news.slice(0, 5).map((item, idx) => {
          const dt = new Date(item.providerPublishTime * 1000);
          return (
            <a key={item.id || idx} href={item.link} target="_blank" rel="noreferrer" 
               className="group flex flex-col gap-0.5 rounded-xl p-2 transition-colors hover:bg-[var(--md-surface-container-high)] border border-transparent hover:border-[var(--md-outline-variant)]">
               <div className="font-medium text-xs leading-snug text-[var(--md-on-surface)] group-hover:text-[var(--md-primary)] transition-colors line-clamp-2">
                 {item.title}
               </div>
               <div className="flex items-center gap-2 text-[0.65rem] text-[var(--md-outline)]">
                 <span className="flex items-center gap-0.5"><Clock size={10} /> {dt.toLocaleDateString()} {dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                 <span>•</span>
                 <span>{item.publisher}</span>
                 <ExternalLink size={10} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
               </div>
            </a>
          );
        })}
      </div>
    </div>
  );
});
