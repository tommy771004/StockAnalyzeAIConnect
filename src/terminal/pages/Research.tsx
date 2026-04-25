import React, { useMemo, useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { useResearchData } from '../hooks/useResearchData';
import { Loader2, Search, Cpu, Users, BarChart3, Info } from 'lucide-react';
import { formatPct, toneClass, formatNum } from '../ui/format';
import type { CandlePoint } from '../types';
import { PersonaSelector } from '../ui/PersonaSelector';
import { SecFilingsPanel } from '../ui/SecFilingsPanel';
import { CongressTradesPanel } from '../ui/CongressTradesPanel';
import { getFreeModels } from '../../services/aiService';

export function ResearchPage() {
  const [activeSymbol, setActiveSymbol] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [persona, setPersona] = useState('hermes');
  const [viewMode, setViewMode] = useState<'standard' | 'pro'>('standard');
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [timeRange, setTimeRange] = useState('1M');
  const { data, loading, error } = useResearchData(activeSymbol, timeRange);

  // Pick up symbol navigated from Dashboard "深入研究" button
  useEffect(() => {
    const pending = sessionStorage.getItem('research-symbol');
    if (pending) {
      setActiveSymbol(pending.toUpperCase());
      sessionStorage.removeItem('research-symbol');
    }
  }, []);

  // Fetch available free models on mount
  useEffect(() => {
    getFreeModels().then(models => {
      setAvailableModels(models);
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0].id);
      }
    });
  }, []);

  // Listen for global symbol-search events (from TopNav search bar and Screener page)
  useEffect(() => {
    const handler = (e: Event) => {
      const sym = (e as CustomEvent<string>).detail;
      if (sym) {
        setActiveSymbol(sym.toUpperCase());
        setSearchInput('');
      }
    };
    window.addEventListener('symbol-search', handler);
    return () => window.removeEventListener('symbol-search', handler);
  }, []);

  useEffect(() => {
    const fetchSummary = async () => {
      setAiLoading(true);
      try {
        const url = `/api/ai/summarize/${activeSymbol}?persona=${persona}${selectedModel ? `&model=${encodeURIComponent(selectedModel)}` : ''}`;
        const res = await fetch(url);
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
  }, [activeSymbol, persona, selectedModel]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveSymbol(searchInput.trim().toUpperCase());
      setSearchInput('');
    }
  };

  // Partial loading is handled by individual panels for a better UX.
  // We only show a skeleton if absolutely necessary, but here we'll let the layout render.

  if (error && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-(--color-term-muted)">
        <span className="text-sm">{error}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-xs border border-(--color-term-border) px-3 py-1 rounded hover:border-(--color-term-accent) hover:text-(--color-term-accent) transition-colors"
        >
          重新載入
        </button>
      </div>
    );
  }

  const quote = data?.quote;
  const history = data?.history || [];
  const tv = data?.tvOverview || {};
  const tvIndicators = data?.tvIndicators || {};
  const news = data?.tvNews || [];
  const chip = data?.wantGooChip;

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

          <div className="flex bg-(--color-term-surface) p-1 rounded border border-(--color-term-border)">
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={cn(
                'px-3 py-1 text-[11px] font-bold tracking-widest uppercase transition-colors rounded-sm',
                viewMode === 'standard' ? 'bg-(--color-term-accent) text-black' : 'text-(--color-term-muted) hover:text-(--color-term-text)'
              )}
            >
              標準視圖
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pro')}
              className={cn(
                'px-3 py-1 text-[11px] font-bold tracking-widest uppercase transition-colors rounded-sm',
                viewMode === 'pro' ? 'bg-(--color-term-accent) text-black' : 'text-(--color-term-muted) hover:text-(--color-term-text)'
              )}
            >
              Research Pro
            </button>
          </div>

          <PersonaSelector value={persona} onChange={setPersona} compact />
          
          <div className="flex items-center gap-2 bg-(--color-term-surface) px-3 py-1 rounded border border-(--color-term-border) h-8">
            <Cpu className="h-3.5 w-3.5 text-(--color-term-muted)" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-(--color-term-text) outline-none appearance-none cursor-pointer uppercase tracking-wider"
            >
              {availableModels.length === 0 ? (
                <option disabled>Loading...</option>
              ) : (
                availableModels.map(m => (
                  <option key={m.id} value={m.id} className="bg-(--color-term-panel)">
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {loading ? <Loader2 className="h-4 w-4 animate-spin text-(--color-term-accent)" /> : null}
        </header>

        <QuoteHeader symbol={activeSymbol} quote={quote} tv={tv} />
        
        {chip && (
          <div className="px-1">
            <ChipAnalysisPanel data={{ ...chip, symbol: activeSymbol }} />
          </div>
        )}

        {viewMode === 'standard' ? (
          <ChartPanel symbol={activeSymbol} history={history} range={timeRange} setRange={setTimeRange} />
        ) : (
          <div className="flex flex-col gap-3 min-h-0 overflow-auto">
            <SecFilingsPanel symbol={activeSymbol} />
            <CongressTradesPanel symbol={activeSymbol} />
          </div>
        )}
      </div>
      <aside className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-4">
        <AISummaryPanel 
          summary={aiSummary} 
          loading={aiLoading} 
          persona={persona} 
          modelName={availableModels.find(m => m.id === selectedModel)?.name}
        />
        {viewMode === 'standard' ? (
          <>
            <ValuationPanel tv={tv} />
            <ConsensusPanel tv={tv} tvIndicators={tvIndicators} />
            <RecentNewsPanel news={news} />
          </>
        ) : (
          <CongressTradesPanel /> // No symbol = show all recent trades for market context
        )}
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

import { useTranslation } from 'react-i18next';
import ChartWidget from '../../components/ChartWidget';

function ChartPanel({ symbol, history, range, setRange }: { symbol: string, history: any[], range: string, setRange: (r: string) => void }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('research.priceAction', '交互式圖表 (Price Action)')} collapsible className="flex-1 min-h-[450px]" bodyClassName="flex min-h-0 flex-col">
      <div className="relative flex-1 min-h-0">
        {history.length > 0 ? (
          <ChartWidget symbol={symbol} data={history} timeframe={range} onTimeframeChange={setRange} />
        ) : (
          <div className="flex h-full items-center justify-center text-(--color-term-muted)">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            {t('common.loading')}
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
    <Panel title="估值與重要指標" collapsible>
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

function ConsensusPanel({ tv, tvIndicators }: { tv: any; tvIndicators?: any }) {
  const hasData = tv?.recommendation_any != null && typeof tv?.recommendation_any_score === 'number';
  const rec = hasData ? tv.recommendation_any : 'N/A';
  const score = hasData ? tv.recommendation_any_score : 0; // -1 to 1

  const buy = rec.includes('BUY') ? 70 : rec === 'NEUTRAL' ? 20 : 10;
  const hold = rec === 'NEUTRAL' ? 60 : 20;
  const sell = rec.includes('SELL') ? 70 : 10;
  const total = buy + hold + sell;

  return (
    <Panel title="分析師共識 & 技術指標" collapsible>
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 p-4">
        <div className={cn("text-[26px] font-bold tracking-[0.2em]",
          !hasData ? 'text-zinc-500' :
            rec.includes('BUY') ? 'text-sky-400' :
              rec.includes('SELL') ? 'text-rose-400' :
                'text-amber-400')}>
          {hasData ? rec.replace('STRONG_', '').replace('_', ' ') : 'N/A'}
        </div>
        <div className="text-right text-[11px]">
          <div className="text-(--color-term-muted)">
            技術評分: <span className="text-(--color-term-text) tabular-nums">{hasData ? (score * 100).toFixed(0) : '---'}</span>
          </div>
          <div className="text-(--color-term-muted)">
            趨勢方向: <span className={cn("tabular-nums",
              !hasData ? 'text-zinc-500' :
                score > 0 ? 'text-sky-400' :
                  score < 0 ? 'text-rose-400' :
                    'text-amber-400')}>
              {!hasData ? '---' : score > 0 ? '看多' : score < 0 ? '看空' : '中立'}
            </span>
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
    <Panel title="標的相關新聞" collapsible className="flex-1 min-h-[300px]" bodyClassName="overflow-auto">
      {news.length === 0 ? <div className="p-10 text-center text-(--color-term-muted)">尚無新聞資料</div> : null}
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

function AISummaryPanel({ summary, loading, persona, modelName }: { summary: string; loading: boolean; persona: string; modelName?: string }) {
  const PERSONA_LABEL: Record<string, string> = {
    hermes: 'Terminal AI (通用)',
    buffett: '華倫·巴菲特視角',
    munger: '查理·芒格視角',
    graham: '班傑明·葛拉漢視角',
    lynch: '彼得·林區視角',
    soros: '喬治·索羅斯視角',
    dalio: '瑞·達利歐視角',
    simons: '吉姆·西蒙斯視角',
    cathie_wood: '凱西·伍德視角',
    congress_tracker: '國會交易分析',
    geopolitics: '地緣政治分析',
    risk_manager: '風險管理師視角',
  };

  return (
    <Panel title="AI 摘要與分析" collapsible bodyClassName="p-4 bg-sky-900/10 border-l-2 border-l-sky-400">
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
            <span className="text-xs text-sky-400/70 tracking-widest animate-pulse">正在以 {PERSONA_LABEL[persona] ?? persona} 分析...</span>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-zinc-200 italic whitespace-pre-wrap">
            {summary}
          </p>
        )}
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2 flex justify-between">
          <span>{PERSONA_LABEL[persona] ?? persona}</span>
          <span>{modelName || 'OpenRouter'}</span>
        </div>
      </div>
    </Panel>
  );
}
function ChipAnalysisPanel({ data }: { data: any }) {
  const items = [
    { label: '主力買賣超', value: data.mainPlayersNet, unit: '張', color: toneClass(data.mainPlayersNet) },
    { label: '外資買賣超', value: data.foreignNet, unit: '張', color: toneClass(data.foreignNet) },
    { label: '投信買賣超', value: data.trustNet, unit: '張', color: toneClass(data.trustNet) },
    { label: '自營商買賣超', value: data.dealerNet, unit: '張', color: toneClass(data.dealerNet) },
    { label: '5日集中度', value: data.concentration5d, unit: '%', color: toneClass(data.concentration5d) },
    { label: '20日集中度', value: data.concentration20d, unit: '%', color: toneClass(data.concentration20d) },
    { label: '400張大戶', value: data.holder400Pct, unit: '%', color: 'text-white' },
    { label: '1000張大戶', value: data.holder1000Pct, unit: '%', color: 'text-(--color-term-accent)' },
    { label: '外資持股比', value: data.foreignPct, unit: '%', color: 'text-white' },
    { label: '投信持股比', value: data.trustPct, unit: '%', color: 'text-white' },
  ];

  return (
    <Panel title="籌碼分析 (玩股網)" icon={<Users size={16} />} className="bg-(--color-term-panel)">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <span className="text-[10px] text-(--color-term-muted) uppercase tracking-tighter">{item.label}</span>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-black", item.color)}>
                {typeof item.value === 'number' ? formatNum(item.value, 0) : '---'}
              </span>
              <span className="text-[9px] text-(--color-term-muted)">{item.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-(--color-term-border) flex items-center justify-between text-[10px] text-(--color-term-muted)">
        <div className="flex items-center gap-2">
          <Info size={10} />
          <span>家數差: <span className={toneClass(-data.brokerDiff)}>{data.brokerDiff}</span> (正值代表籌碼分散)</span>
        </div>
        <a 
          href={`https://www.wantgoo.com/stock/${data.symbol}/major-investors/main-trend`} 
          target="_blank" 
          rel="noreferrer"
          className="hover:text-(--color-term-accent) transition-colors flex items-center gap-1"
        >
          查看詳細籌碼 <BarChart3 size={10} />
        </a>
      </div>
    </Panel>
  );
}
