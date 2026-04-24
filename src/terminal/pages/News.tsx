import { useState } from 'react';
import { Bookmark, Printer, Share2, TrendingUp } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { newsFeed } from '../mockData';
import { cn } from '../../lib/utils';
import type { NewsFeedItem } from '../types';
import { formatPct, toneClass } from '../ui/format';

const TAG_STYLE: Record<string, string> = {
  neutral: 'bg-zinc-500/20 text-zinc-300 border-zinc-400/30',
  bullish: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40',
  bearish: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
  sector: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50',
};

export function NewsPage() {
  const [activeId, setActiveId] = useState<string>(newsFeed[0]?.id ?? '');
  const active = newsFeed.find((n) => n.id === activeId) ?? newsFeed[0]!;
  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      <div className="col-span-12 min-h-0 lg:col-span-5">
        <LiveFeed activeId={activeId} onSelect={setActiveId} />
      </div>
      <div className="col-span-12 min-h-0 lg:col-span-7">
        <ArticleReader item={active} />
      </div>
    </div>
  );
}

function LiveFeed({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="即時新聞"
      actions={
        <span className="flex items-center gap-1 text-[11px] tracking-widest text-(--color-term-negative)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-negative)" />
          LIVE
        </span>
      }
      className="h-full"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="flex flex-wrap gap-2 border-b border-(--color-term-border) px-3 py-2 text-[11px]">
        {['所有地區', '所有產業', '所有資產'].map((f) => (
          <button
            key={f}
            type="button"
            className="border border-(--color-term-border) bg-(--color-term-surface) px-2 py-1 text-(--color-term-muted) hover:text-(--color-term-text)"
          >
            {f}
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-auto">
        {newsFeed.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'cursor-pointer border-b border-(--color-term-border)/60 px-4 py-3 transition-colors',
                isActive
                  ? 'border-l-2 border-l-(--color-term-accent) bg-white/5'
                  : 'hover:bg-white/5',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-(--color-term-muted)">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isActive ? 'bg-(--color-term-accent)' : 'bg-(--color-term-muted)/70',
                    )}
                  />
                  {item.time}
                </span>
                <span className="tracking-widest text-(--color-term-muted)">{item.source}</span>
              </div>
              <p
                className={cn(
                  'mb-2 text-[12.5px] leading-snug',
                  isActive ? 'text-(--color-term-text)' : 'text-(--color-term-text)/90',
                )}
              >
                {item.title}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((t) => (
                  <span
                    key={t.label}
                    className={cn(
                      'border px-1.5 py-0.5 text-[10px] tracking-widest',
                      TAG_STYLE[t.tone],
                    )}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ArticleReader({ item }: { item: NewsFeedItem }) {
  return (
    <Panel className="h-full" bodyClassName="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-4 py-2 text-[11px] text-(--color-term-muted)">
        <div className="flex items-center gap-3">
          <button className="hover:text-(--color-term-text)" title="Share">
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button className="hover:text-(--color-term-text)" title="Bookmark">
            <Bookmark className="h-3.5 w-3.5" />
          </button>
          <button className="hover:text-(--color-term-text)" title="Print">
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="tracking-widest">ID: {item.referenceId}</span>
      </header>
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-3 flex items-center gap-3 text-[11px]">
          <span className="border border-(--color-term-accent) px-2 py-0.5 font-semibold tracking-widest text-(--color-term-accent)">
            {item.source}
          </span>
          <span className="text-(--color-term-muted)">{item.publishedUtc}</span>
        </div>
        <h1 className="mb-5 text-[18px] leading-snug font-semibold text-(--color-term-text)">
          {item.title}
        </h1>
        <ImpactAnalysis item={item} />
        <div className="space-y-4 text-[13px] leading-relaxed text-(--color-term-text)/90">
          {item.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {item.pullQuote && (
            <blockquote className="my-4 border-l-2 border-(--color-term-accent) bg-(--color-term-surface)/60 px-4 py-3 italic text-(--color-term-text)/80">
              <p className="mb-1">&ldquo;{item.pullQuote.text}&rdquo;</p>
              <footer className="text-[11px] text-(--color-term-muted) not-italic">
                — {item.pullQuote.attribution}
              </footer>
            </blockquote>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ImpactAnalysis({ item }: { item: NewsFeedItem }) {
  const sentimentTone =
    item.impact.sentiment === 'BULLISH'
      ? 'text-(--color-term-positive)'
      : item.impact.sentiment === 'BEARISH'
        ? 'text-(--color-term-negative)'
        : 'text-(--color-term-muted)';
  const sentimentLabel =
    item.impact.sentiment === 'BULLISH' ? '看多' : item.impact.sentiment === 'BEARISH' ? '看空' : '中性';
  return (
    <section className="mb-5 border border-(--color-term-border) bg-(--color-term-surface)/60">
      <div className="grid grid-cols-[auto_1fr] items-stretch">
        <div className="border-r border-(--color-term-border) p-3">
          <div className="mb-1 text-[10px] tracking-widest text-(--color-term-muted)">影響分析</div>
          <div className={`flex items-center gap-1.5 text-[14px] font-semibold ${sentimentTone}`}>
            <TrendingUp className="h-4 w-4" />
            {sentimentLabel} ({item.impact.sentiment})
          </div>
        </div>
        <div className="p-3">
          <div className="mb-2 text-[10px] tracking-widest text-(--color-term-muted)">
            相關標的 (TICKERS)
          </div>
          <div className="flex flex-wrap gap-2">
            {item.impact.tickers.map((t) => (
              <span
                key={t.symbol}
                className="flex items-center gap-1.5 border border-(--color-term-border) bg-(--color-term-panel) px-2 py-1 text-[11px]"
              >
                <span className="font-semibold tracking-wider text-(--color-term-text)">
                  {t.symbol}
                </span>
                <span className={`tabular-nums ${toneClass(t.changePct)}`}>
                  {formatPct(t.changePct)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
