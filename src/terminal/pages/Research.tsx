import React, { useMemo, useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { useResearchData } from '../hooks/useResearchData';
import { Loader2, Search } from 'lucide-react';
import { formatPct, toneClass } from '../ui/format';
import type { CandlePoint } from '../types';

export function ResearchPage() {
  const [activeSymbol, setActiveSymbol] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const { data, loading } = useResearchData(activeSymbol);

  useEffect(() => {
    const fetchSummary = async () => {
      setAiLoading(true);
      try {
        const res = await fetch(`/api/ai/summarize/${activeSymbol}`);
        const json = await res.json();
        if (!res.ok) {
          setAiSummary(json.error || `AI 服務錯誤 (HTTP ${res.status})`);
        } else {
          setAiSummary(json.text || '無法生成摘要');
        }
      } catch (err) {
        setAiSummary('AI 服務暫時無法連線，請檢查網路或稍後再試');
      } finally {
        setAiLoading(false);
      }
    };
    if (activeSymbol) fetchSummary();
  }, [activeSymbol]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveSymbol(searchInput.trim().toUpperCase());
      setSearchInput('');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" />
      </div>
    );
  }

  const quote = data?.quote;
  const history = data?.history || [];
  const tv = data?.tvOverview || {};
  const tvIndicators = data?.tvIndicators || {};
  const news = data?.tvNews || [];

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 overflow-auto pb-10">
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-8">
        <header className="flex items-center gap-4 border border-(--color-term-border) bg-(--color-term-panel) px-4 py-3">
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-term-muted)" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜尋代號 (如: AAPL, 2330)..."
              className="h-9 w-full rounded-sm border border-(--color-term-border) bg-(--color-term-surface) pl-10 pr-4 text-sm focus:border-(--color-term-accent) focus:outline-none"
            />
          </form>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-(--color-term-accent)" />}
        </header>

        <QuoteHeader symbol={activeSymbol} quote={quote} tv={tv} />
        <ChartPanel symbol={activeSymbol} history={history} />
      </div>
      <aside className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-4">
        <AISummaryPanel summary={aiSummary} loading={aiLoading} />
        <ValuationPanel tv={tv} />
        <ConsensusPanel tv={tv} tvIndicators={tvIndicators} />
        <RecentNewsPanel news={news} />
      </aside>
    </div>
  );
}

function QuoteHeader({ symbol, quote, tv }: { symbol: string; quote: any; tv: any }) {
  const price = quote?.regularMarketPrice || tv?.close || 0;
  const change = quote?.regularMarketChange || 0;
  const changePct = quote?.regularMarketChangePercent || 0;

  return (
    <section className="flex flex-wrap items-end justify-between gap-4 border border-(--color-term-border) bg-(--color-term-panel) px-5 py-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[20px] font-bold tracking-widest text-(--color-term-accent)">
          {symbol}
        </span>
        <span className="text-[12px] text-(--color-term-text)">
          {quote?.longName || tv?.description || symbol}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-6 tabular-nums">
        <div>
          <div className="text-3xl font-semibold text-(--color-term-text)">{price.toFixed(2)}</div>
          <div className={cn("text-[12px]", toneClass(changePct))}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({formatPct(changePct)})
          </div>
        </div>
        <StatBlock label="H/L (DAY)" value={`${quote?.regularMarketDayHigh?.toFixed(2) || '---'} - ${quote?.regularMarketDayLow?.toFixed(2) || '---'}`} />
        <StatBlock label="VOLUME" value={quote?.regularMarketVolume?.toLocaleString() || '---'} />
        <StatBlock label="EXCHANGE" value={quote?.fullExchangeName || tv?.exchange || '---'} />
      </div>
    </section>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] tracking-widest text-(--color-term-muted)">{label}</div>
      <div className="text-[13px] text-(--color-term-text)">{value}</div>
    </div>
  );
}

import ChartWidget from '../../components/ChartWidget';

function ChartPanel({ symbol, history }: { symbol: string, history: any[] }) {
  const [range, setRange] = useState('1M');
  return (
    <Panel title="交互式圖表 (Price Action)" className="flex-1 min-h-[450px]" bodyClassName="flex min-h-0 flex-col">
      <div className="relative flex-1 min-h-0">
        {history.length > 0 ? (
          <ChartWidget symbol={symbol} data={history} onTimeframeChange={setRange} />
        ) : (
          <div className="flex h-full items-center justify-center text-(--color-term-muted)">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            正在載入 K 線數據...
          </div>
        )}
      </div>
    </Panel>
  );
}



function ValuationPanel({ tv }: { tv: any }) {
  const rows: Array<[string, string]> = [
    ['市值 (Market Cap)', tv?.market_cap_calc?.toLocaleString() || '---'],
    ['市盈率 (P/E Ratio)', tv?.pe_ratio?.toFixed(2) || '---'],
    ['每股盈餘 (EPS TTM)', tv?.eps_ttm?.toFixed(2) || '---'],
    ['昨收 (Prev Close)', tv?.prev_close?.toFixed(2) || '---'],
    ['持股比例 (Institutional)', tv?.institutional_holders_pct != null ? `${tv.institutional_holders_pct.toFixed(1)}%` : '---'],
  ];
  return (
    <Panel title="估值與重要指標">
      <ul className="divide-y divide-(--color-term-border)/60">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between px-4 py-2 text-[12px]">
            <span className="text-(--color-term-muted)">{k}</span>
            <span className="font-semibold tabular-nums text-(--color-term-text)">{v}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function normalizeRecommendation(score: number): 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' {
  if (score > 0.5) return 'STRONG_BUY';
  if (score > 0.1) return 'BUY';
  if (score < -0.5) return 'STRONG_SELL';
  if (score < -0.1) return 'SELL';
  return 'NEUTRAL';
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ConsensusPanel({ tv, tvIndicators }: { tv: any; tvIndicators: Record<string, unknown> }) {
  const overviewScore = toNum(tv?.recommendation_any_score);
  const indicatorScore = toNum(tvIndicators?.['Recommend.All']);
  const score = overviewScore ?? indicatorScore ?? 0; // -1 to 1
  const recRaw = (tv?.recommendation_any as string | undefined) ?? normalizeRecommendation(score);
  const rec = String(recRaw).replace(/\s+/g, '_').toUpperCase();
  
  const buy = rec.includes('BUY') ? 70 : rec === 'NEUTRAL' ? 20 : 10;
  const hold = rec === 'NEUTRAL' ? 60 : 20;
  const sell = rec.includes('SELL') ? 70 : 10;
  const total = buy + hold + sell;

  const hasData = overviewScore != null || indicatorScore != null;

  return (
    <Panel title="分析師共識 & 技術指標">
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 p-4">
        <div className={cn("text-[26px] font-bold tracking-[0.2em]", rec.includes('BUY') ? 'text-sky-400' : rec.includes('SELL') ? 'text-rose-400' : 'text-amber-400')}>
          {rec.replace('STRONG_', '').replace('_', ' ')}
        </div>
        <div className="text-right text-[11px]">
          <div className="text-(--color-term-muted)">
            技術評分: <span className="text-(--color-term-text) tabular-nums">{(score * 100).toFixed(0)}</span>
          </div>
          <div className="text-(--color-term-muted)">
             趨勢方向: <span className={cn("tabular-nums", score >= 0 ? 'text-sky-400' : 'text-rose-400')}>{score >= 0 ? '看多' : '看空'}</span>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="flex h-2 overflow-hidden bg-(--color-term-border) rounded-full">
          {!hasData ? (
             <div className="w-full bg-zinc-800" />
          ) : (
            <>
              <div className="bg-sky-400" style={{ width: `${(buy / total) * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${(hold / total) * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${(sell / total) * 100}%` }} />
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-(--color-term-muted)">
          <span>BUY (TECH)</span>
          <span>NEUTRAL</span>
          <span>SELL</span>
        </div>
      </div>
    </Panel>
  );
}



function SentimentRow({
  label,
  rating,
  detail,
  tone,
}: {
  label: string;
  rating: string;
  detail: string;
  tone: 'bullish' | 'bearish' | 'neutral';
}) {
  const toneCls =
    tone === 'bullish'
      ? 'text-(--color-term-positive)'
      : tone === 'bearish'
        ? 'text-(--color-term-negative)'
        : 'text-(--color-term-accent)';
  return (
    <div className="px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] tracking-widest text-(--color-term-muted)">{label}</span>
        <span className={`text-[11px] font-semibold ${toneCls}`}>{rating}</span>
      </div>
      <p className="text-[12px] leading-snug text-(--color-term-text)/80">{detail}</p>
    </div>
  );
}

function RecentNewsPanel({ news }: { news: any[] }) {
  return (
    <Panel title="標的相關新聞" className="flex-1 min-h-[300px]" bodyClassName="overflow-auto">
      {news.length === 0 && <div className="p-10 text-center text-(--color-term-muted)">尚無新聞資料</div>}
      <ul className="divide-y divide-(--color-term-border)/60">
        {news.slice(0, 10).map((n) => {
          const url = n.link || (n.storyPath ? `https://www.tradingview.com${n.storyPath}` : null);
          return (
            <li 
              key={n.id || n.title} 
              className={cn(
                "px-4 py-3 transition-colors",
                url ? "hover:bg-white/5 cursor-pointer group/item" : "opacity-80"
              )}
              onClick={() => url && window.open(url, '_blank', 'noopener')}
            >
              <div className="mb-1 text-[10px] tracking-widest text-(--color-term-muted) flex justify-between">
                <span className="group-hover/item:text-sky-400 transition-colors">{n.source || n.publisher || 'MARKET'}</span>
                <span>{n.published ? new Date(n.published * 1000).toLocaleDateString() : (n.time || '')}</span>
              </div>
              <p className="text-[12.5px] leading-snug text-(--color-term-text) font-medium group-hover/item:text-(--color-term-accent) transition-colors">
                {n.title}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function AISummaryPanel({ summary, loading }: { summary: string, loading: boolean }) {
  return (
    <Panel title="AI 摘要與分析" bodyClassName="p-4 bg-sky-900/10 border-l-2 border-l-sky-400">
       <div className="flex flex-col gap-3">
          {loading ? (
             <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                <span className="text-xs text-sky-400/70 tracking-widest animate-pulse">HERMES 正在分析市場數據...</span>
             </div>
          ) : (
             <p className="text-[13px] leading-relaxed text-zinc-200 italic whitespace-pre-wrap">
                {summary}
             </p>
          )}
          <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2">
             Generated by Hermes Llama-3.3 (Experimental)
          </div>
       </div>
    </Panel>
  );
}
