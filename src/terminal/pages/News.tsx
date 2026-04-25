import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../services/api';
import { useNewsFeed } from '../hooks/useNewsFeed';
import { Loader2, ExternalLink, Bookmark, Printer, Share2, TrendingUp } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { formatPct, toneClass } from '../ui/format';

const TAG_STYLE: Record<string, string> = {
  neutral: 'bg-zinc-500/20 text-zinc-300 border-zinc-400/30',
  bullish: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40',
  bearish: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
  sector: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50',
};

const CATEGORIES = ['焦點', '台股', '國際', '美股', '理財'];

export function NewsPage() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState('焦點');
  const { news, loading } = useNewsFeed(undefined, activeCategory);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (news.length > 0) {
      setActiveId(news[0].id || news[0].title);
    } else {
      setActiveId('');
    }
  }, [news]);

  const activeItem = news.find(n => (n.id || n.title) === activeId);

  return (
    <div className="flex flex-col h-full gap-3 pb-10">
      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 h-8 rounded-sm text-[11px] font-bold tracking-widest transition-all whitespace-nowrap",
              activeCategory === cat 
                ? "bg-(--color-term-accent) text-black" 
                : "bg-(--color-term-surface) text-(--color-term-muted) hover:text-(--color-term-text) border border-(--color-term-border)"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-12 gap-3">
        <div className="col-span-12 min-h-0 lg:col-span-5">
          <LiveFeed 
            news={news} 
            activeId={activeId} 
            onSelect={setActiveId} 
            t={t} 
            loading={loading}
          />
        </div>
        <div className="col-span-12 min-h-0 lg:col-span-7">
          {activeItem ? (
            <ArticleReader item={activeItem} t={t} />
          ) : (
            <div className="flex h-full items-center justify-center text-(--color-term-muted) border border-(--color-term-border) bg-(--color-term-surface)/20 rounded-sm">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                t('news.selectArticle', '請選擇一篇新聞')
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveFeed({
  news,
  activeId,
  onSelect,
  t,
  loading
}: {
  news: any[];
  activeId: string;
  onSelect: (id: string) => void;
  t: any;
  loading: boolean;
}) {
  return (
    <Panel
      title={t('news.liveFeed', '市場情報流')}
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-positive)">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-(--color-term-positive)", !loading && "animate-pulse")} />
          {loading ? 'FETCHING...' : 'REAL-TIME'}
        </span>
      }
      className="h-full"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="flex-1 overflow-auto scrollbar-thin">
        {loading && news.length === 0 ? (
          <div className="flex h-full items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-(--color-term-muted)" />
          </div>
        ) : news.length === 0 ? (
          <div className="py-20 text-center text-(--color-term-muted)">{t('news.noNews', '目前沒有新聞')}</div>
        ) : null}
        <ul className="divide-y divide-(--color-term-border)/40">
          {news.map((item) => {
            const itemId = item.id || item.title;
            const isActive = itemId === activeId;
            const publishTime = item.published ? new Date(item.published * 1000) : new Date();
            
            return (
              <li
                key={itemId}
                onClick={() => onSelect(itemId)}
                className={cn(
                  'cursor-pointer px-4 py-4 transition-colors',
                  isActive
                    ? 'border-l-2 border-l-(--color-term-accent) bg-(--color-term-accent)/5'
                    : 'hover:bg-white/5',
                )}
              >
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-tighter text-(--color-term-muted)">
                   <div className="flex gap-2 items-center">
                        <span className="font-bold text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded-sm">{item.source || item.publisher}</span>
                        <span>{publishTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   {isActive ? <TrendingUp className="h-3 w-3 text-(--color-term-accent)" /> : null}
                </div>
                <p className={cn('text-[13px] font-medium leading-relaxed', isActive ? 'text-(--color-term-accent)' : 'text-(--color-term-text)')}>
                  {item.title}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function ArticleReader({ item, t }: { item: any; t: any }) {
  const [summary, setSummary] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const runAnalysis = async () => {
      setAnalyzing(true);
      setSummary('');
      try {
        const res = await api.analyzeNews({
          title: item.title,
          articleId: item.id,
          content: item.summary
        });
        setSummary(res.text);
      } catch (err) {
        console.error('AI Analysis error:', err);
        setSummary('AI 摘要生成暫時不可用。');
      } finally {
        setAnalyzing(false);
      }
    };

    if (item) runAnalysis();
  }, [item]);

  const publishTime = item.published ? new Date(item.published * 1000) : new Date();

  return (
    <Panel className="h-full" bodyClassName="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-4 py-2 text-[11px] text-(--color-term-muted)">
         <div className="flex items-center gap-4">
            <span className="font-bold text-(--color-term-accent)">{item.source || item.publisher}</span>
            <span>{publishTime.toLocaleString()}</span>
         </div>
         <button 
           onClick={() => {
             const url = item.link || (item.storyPath ? `https://www.tradingview.com${item.storyPath}` : null);
             if (url) window.open(url, '_blank', 'noopener');
           }} 
           className="flex items-center gap-1 text-(--color-term-accent) hover:underline"
         >
            {t('news.source', '原始來源')} <ExternalLink className="h-3 w-3" />
         </button>
      </header>
      <div className="flex-1 overflow-auto p-6 pb-20 scrollbar-thin">
        <h1 className="mb-6 text-[24px] leading-[1.3] font-bold text-(--color-term-text) tracking-tight">
          {item.title}
        </h1>
        
        <div className="mb-8 rounded-sm border border-(--color-term-accent)/20 p-5 bg-(--color-term-accent)/5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-(--color-term-accent)/40" />
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-black tracking-[0.2em] text-(--color-term-accent) uppercase">
                {t('news.aiSummary', 'AI 摘要與分析')}
              </div>
              {analyzing && <Loader2 className="h-3 w-3 animate-spin text-(--color-term-accent)" />}
            </div>
            
            {analyzing ? (
              <div className="space-y-2">
                <div className="h-4 bg-white/5 animate-pulse rounded-sm w-full" />
                <div className="h-4 bg-white/5 animate-pulse rounded-sm w-[90%]" />
                <div className="h-4 bg-white/5 animate-pulse rounded-sm w-[95%]" />
              </div>
            ) : (
              <div className="text-[14px] leading-relaxed text-(--color-term-text)/90 font-sans whitespace-pre-wrap">
                 {summary || t('news.summaryText', '這是一篇關於市場動態的即時報導。點擊上方「原始來源」即可查看完整深度報導。')}
              </div>
            )}
        </div>

        {item.summary && (
          <div className="text-[15px] leading-loose text-(--color-term-text)/80 font-sans italic border-l-2 border-(--color-term-border) pl-4">
            {item.summary}
          </div>
        )}
      </div>
    </Panel>
  );
}


