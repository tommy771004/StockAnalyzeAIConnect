import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

export function NewsPage() {
  const { t } = useTranslation();
  const { news, loading } = useNewsFeed();
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (news.length > 0 && !activeId) {
      setActiveId(news[0].id || news[0].title);
    }
  }, [news, activeId]);

  if (loading && news.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" />
      </div>
    );
  }

  const activeItem = news.find(n => (n.id || n.title) === activeId) || news[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 pb-10">
      <div className="col-span-12 min-h-0 lg:col-span-5">
        <LiveFeed news={news} activeId={activeId} onSelect={setActiveId} t={t} />
      </div>
      <div className="col-span-12 min-h-0 lg:col-span-7">
        {activeItem ? (
          <ArticleReader item={activeItem} t={t} />
        ) : (
          <div className="flex h-full items-center justify-center text-(--color-term-muted)">
            {t('news.selectArticle', '請選擇一篇新聞')}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveFeed({
  news,
  activeId,
  onSelect,
  t
}: {
  news: any[];
  activeId: string;
  onSelect: (id: string) => void;
  t: any;
}) {
  return (
    <Panel
      title={t('news.liveFeed', '市場情報流')}
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-positive)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" />
          REAL-TIME
        </span>
      }
      className="h-full"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="flex-1 overflow-auto">
        {news.length === 0 ? <div className="py-20 text-center text-(--color-term-muted)">{t('news.noNews', '目前沒有新聞')}</div> : null}
        <ul className="divide-y divide-(--color-term-border)/40">
          {news.map((item) => {
            const itemId = item.id || item.title;
            const isActive = itemId === activeId;
            return (
              <li
                key={itemId}
                onClick={() => onSelect(itemId)}
                className={cn(
                  'cursor-pointer px-4 py-4 transition-colors',
                  isActive
                    ? 'border-l-2 border-l-(--color-term-accent) bg-white/5'
                    : 'hover:bg-white/5',
                )}
              >
                <div className="mb-2 flex items-center justify-between text-[11px] text-(--color-term-muted)">
                   <div className="flex gap-2">
                        <span className="font-bold text-sky-400">{item.source}</span>
                        <span>{new Date(item.published * 1000).toLocaleTimeString()}</span>
                   </div>
                   {isActive ? <ExternalLink className="h-3 w-3 text-(--color-term-accent)" /> : null}
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
  return (
    <Panel className="h-full" bodyClassName="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-4 py-2 text-[11px] text-(--color-term-muted)">
         <div className="flex items-center gap-4">
            <span className="font-bold text-(--color-term-accent)">{item.source}</span>
            <span>ID: {item.id || 'N/A'}</span>
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
      <div className="flex-1 overflow-auto p-5 pb-20">
        <h1 className="mb-5 text-[22px] leading-[1.4] font-bold text-(--color-term-text)">
          {item.title}
        </h1>
        <div className="mb-6 rounded-md border border-(--color-term-border) p-4 bg-(--color-term-surface)/40">
            <div className="mb-2 text-[10px] tracking-widest text-(--color-term-muted)">{t('news.aiSummary', 'AI 摘要與分析')}</div>
            <p className="text-[13.5px] leading-relaxed text-(--color-term-text)/90 italic">
               {t('news.summaryText', '這是一篇關於市場動態的即時報導，發佈於 {{time}}。點擊上方「原始來源」即可查看完整深度報導。', { time: new Date(item.published * 1000).toLocaleString() })}
            </p>
        </div>
      </div>
    </Panel>
  );
}


