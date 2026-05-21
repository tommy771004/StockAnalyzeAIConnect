import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { useResearchData } from '../hooks/useResearchData';
import { Loader2, Cpu, Users, BarChart3, Info } from 'lucide-react';
import { formatPct, toneClass, formatNum } from '../ui/format';
import type { CandlePoint } from '../types';
import { PersonaSelector } from '../ui/PersonaSelector';
import { SecFilingsPanel } from '../ui/SecFilingsPanel';
import { CongressTradesPanel } from '../ui/CongressTradesPanel';
import { InsiderTradesPanel } from '../ui/InsiderTradesPanel';
import { SmartMoney13FPanel } from '../ui/SmartMoney13FPanel';
import { SmartMoneyRecentEventsPanel } from '../ui/SmartMoneyRecentEventsPanel';
import { DataStatusBadge, type DataMode } from '../ui/DataStatusBadge';
import { getFreeModels } from '../../services/aiService';
import { StockSymbolAutocomplete } from '../../components/common/StockSymbolAutocomplete';
import * as api from '../../services/api';
import { isTaiwanTradingHours } from '../../services/cache';
import ChartWidget from '../../components/ChartWidget';

export function ResearchPage() {
  const { t } = useTranslation();
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
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [researchUpdatedAt, setResearchUpdatedAt] = useState<string | null>(null);

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
          setAiSummary(json.error || t('research.aiServiceError', 'AI 服務錯誤 (HTTP {{status}})', { status: res.status }));
        } else {
          setAiSummary(json.text || t('research.aiNoSummary', '無法生成摘要'));
        }
      } catch (err) {
        setAiSummary(t('research.aiConnectionError', 'AI 服務暫時無法連線，請檢查網路或稍後再試'));
      } finally {
        setAiLoading(false);
      }
    };
    if (activeSymbol) fetchSummary();
  }, [activeSymbol, persona, selectedModel, t]);

  useEffect(() => {
    if (data) setResearchUpdatedAt(new Date().toISOString());
  }, [data]);

  // Live quote polling: when 1D is selected during Taiwan market hours, poll every 2 s
  // and patch the last history candle so the chart reflects the real-time price.
  useEffect(() => {
    setLivePrice(null);
    if (timeRange !== '1D') return;
    const poll = async () => {
      if (!isTaiwanTradingHours()) return;
      try {
        const quotes = await api.getBatchQuotes([activeSymbol]);
        const p: number | undefined = quotes[0]?.regularMarketPrice;
        if (p && p > 0) {
          setLivePrice(p);
          setResearchUpdatedAt(new Date().toISOString());
        }
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, 2_000);
    return () => clearInterval(timer);
  }, [activeSymbol, timeRange]);

  // Must be declared before liveHistory useMemo to avoid TDZ — data may be null on first render.
  const history = data?.history ?? [];

  const liveHistory = useMemo(() => {
    if (!livePrice || !history.length) return history;
    const last = history[history.length - 1];
    return [
      ...history.slice(0, -1),
      {
        ...last,
        close: livePrice,
        high: typeof last.high === 'number' ? Math.max(last.high, livePrice) : livePrice,
        low: typeof last.low === 'number' && last.low > 0 ? Math.min(last.low, livePrice) : livePrice,
      },
    ];
  }, [history, livePrice]);

  if (error && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-(--color-term-muted)">
        <span className="text-sm">{error}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="focus-ring text-xs border border-(--color-term-border) px-3 py-1 rounded hover:border-(--color-term-accent) hover:text-(--color-term-accent) motion-safe:transition-colors"
        >
          {t('research.reload', '重新載入')}
        </button>
      </div>
    );
  }

  const quote = data?.quote;
  const tv = data?.tvOverview || {};
  const tvIndicators = data?.tvIndicators || {};
  const news = data?.tvNews || [];
  const chip = data?.wantGooChip;
  const hasResearchPayload = !!quote || history.length > 0 || news.length > 0;
  const researchDataMode: DataMode = livePrice
    ? 'LIVE'
    : hasResearchPayload
      ? 'DELAYED'
      : 'MOCK';

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3 overflow-auto pb-10">
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-8">
        <header className="flex flex-wrap items-center gap-2 border border-(--color-term-border) bg-(--color-term-panel) px-4 py-3">
          <div className="relative flex-1 min-w-[160px]">
            <StockSymbolAutocomplete
              value={searchInput}
              onValueChange={setSearchInput}
              onSymbolSubmit={(nextSymbol) => {
                if (!nextSymbol) return;
                setActiveSymbol(nextSymbol.toUpperCase());
                setSearchInput('');
              }}
              placeholder={t('research.searchPlaceholder', '搜尋代號 (如: AAPL, 2330)...')}
              showSearchIcon
              inputClassName="h-9 w-full rounded-sm border border-(--color-term-border) bg-(--color-term-surface) pl-10 pr-4 text-sm focus:border-(--color-term-accent) focus:outline-none"
            />
          </div>

          <div className="flex bg-(--color-term-surface) p-1 rounded border border-(--color-term-border)">
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={cn(
                'focus-ring px-3 py-1 text-[11px] font-bold tracking-widest uppercase motion-safe:transition-colors rounded-sm',
                viewMode === 'standard' ? 'bg-(--color-term-accent) text-black' : 'text-(--color-term-muted) hover:text-(--color-term-text)'
              )}
            >
              {t('research.viewStandard', '標準視圖')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pro')}
              className={cn(
                'focus-ring px-3 py-1 text-[11px] font-bold tracking-widest uppercase motion-safe:transition-colors rounded-sm',
                viewMode === 'pro' ? 'bg-(--color-term-accent) text-black' : 'text-(--color-term-muted) hover:text-(--color-term-text)'
              )}
            >
              {t('research.viewPro', 'Research Pro')}
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
                  <option disabled>{t('research.modelsLoading', 'Loading...')}</option>
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
          <DataStatusBadge mode={researchDataMode} lastUpdated={researchUpdatedAt} />
        </header>

        <QuoteHeader symbol={activeSymbol} quote={quote} tv={tv} />
        
        {chip && (
          <div className="px-1">
            <ChipAnalysisPanel data={{ ...chip, symbol: activeSymbol }} />
          </div>
        )}

        {viewMode === 'standard' ? (
          <ChartPanel
            symbol={activeSymbol}
            history={liveHistory}
            range={timeRange}
            setRange={setTimeRange}
            dataMode={researchDataMode}
            lastUpdated={researchUpdatedAt}
          />
        ) : (
          <div className="flex flex-col gap-3 min-h-0 overflow-auto">
            <SecFilingsPanel symbol={activeSymbol} />
            <InsiderTradesPanel symbol={activeSymbol} />
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
        <SmartMoneyRecentEventsPanel symbol={activeSymbol} />
        {viewMode === 'standard' ? (
          <>
            <ValuationPanel tv={tv} />
            <ConsensusPanel tv={tv} tvIndicators={tvIndicators} />
            <RecentNewsPanel news={news} />
          </>
        ) : (
          <>
            <SmartMoney13FPanel />
            <CongressTradesPanel />
          </>
        )}
      </aside>
    </div>
  );
}

function QuoteHeader({ symbol, quote, tv }: { symbol: string; quote: any; tv: any }) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const price = quote?.regularMarketPrice || tv?.close || 0;
  const change = quote?.regularMarketChange || 0;
  const changePct = quote?.regularMarketChangePercent || 0;
  const notAvailable = t('research.notAvailable', '---');

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
        <StatBlock label={t('research.dayRangeStat', 'H/L (DAY)')} value={`${quote?.regularMarketDayHigh?.toFixed(2) || notAvailable} - ${quote?.regularMarketDayLow?.toFixed(2) || notAvailable}`} />
        <StatBlock label={t('research.volumeStat', 'VOLUME')} value={quote?.regularMarketVolume?.toLocaleString(numberLocale) || notAvailable} />
        <StatBlock label={t('research.exchangeStat', 'EXCHANGE')} value={quote?.fullExchangeName || tv?.exchange || notAvailable} />
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

function ChartPanel({
  symbol,
  history,
  range,
  setRange,
  dataMode,
  lastUpdated,
}: {
  symbol: string;
  history: any[];
  range: string;
  setRange: (r: string) => void;
  dataMode: DataMode;
  lastUpdated: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('research.priceAction', '交互式圖表 (Price Action)')}
      collapsible
      className="flex-1 min-h-[450px]"
      bodyClassName="flex min-h-0 flex-col"
      actions={<DataStatusBadge mode={dataMode} lastUpdated={lastUpdated} />}
    >
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
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const notAvailable = t('research.notAvailable', '---');
  const rows: Array<[string, string]> = [
    [t('research.marketCap', '市值 (Market Cap)'), tv?.market_cap_calc?.toLocaleString(numberLocale) || notAvailable],
    [t('research.peRatio', '市盈率 (P/E Ratio)'), tv?.pe_ratio?.toFixed(2) || notAvailable],
    [t('research.epsTtm', '每股盈餘 (EPS TTM)'), tv?.eps_ttm?.toFixed(2) || notAvailable],
    [t('research.prevClose', '昨收 (Prev Close)'), tv?.prev_close?.toFixed(2) || notAvailable],
    [t('research.institutional', '持股比例 (Institutional)'), tv?.institutional_holders_pct != null ? `${tv.institutional_holders_pct.toFixed(1)}%` : notAvailable],
  ];
  return (
    <Panel title={t('research.valuationTitle', '估值與重要指標')} collapsible>
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
  const { t } = useTranslation();
  const hasData = tv?.recommendation_any != null && typeof tv?.recommendation_any_score === 'number';
  const recommendation = hasData ? String(tv.recommendation_any) : null;
  const recommendationLabel = !recommendation
    ? t('research.notAvailableShort', 'N/A')
    : recommendation === 'STRONG_BUY'
      ? t('research.consensusStrongBuy', 'Strong Buy')
      : recommendation === 'BUY'
        ? t('research.consensusBuy', 'Buy')
        : recommendation === 'NEUTRAL'
          ? t('research.consensusNeutral', 'Neutral')
          : recommendation === 'SELL'
            ? t('research.consensusSell', 'Sell')
            : recommendation === 'STRONG_SELL'
              ? t('research.consensusStrongSell', 'Strong Sell')
              : recommendation.replace(/_/g, ' ');
  const score = hasData ? tv.recommendation_any_score : 0; // -1 to 1
  const scoreDisplay = hasData ? (score * 100).toFixed(0) : t('research.notAvailable', '---');
  const trendDisplay = !hasData
    ? t('research.notAvailable', '---')
    : score > 0
      ? t('research.trendBullish', '看多')
      : score < 0
        ? t('research.trendBearish', '看空')
        : t('research.trendNeutral', '中立');

  const buy = recommendation?.includes('BUY') ? 70 : recommendation === 'NEUTRAL' ? 20 : 10;
  const hold = recommendation === 'NEUTRAL' ? 60 : 20;
  const sell = recommendation?.includes('SELL') ? 70 : 10;
  const total = buy + hold + sell;

  return (
    <Panel title={t('research.consensusTitle', '分析師共識 & 技術指標')} collapsible>
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 p-4">
        <div className={cn("text-[26px] font-bold tracking-[0.2em]",
          !hasData ? 'text-zinc-500' :
            recommendation?.includes('BUY') ? 'text-sky-400' :
              recommendation?.includes('SELL') ? 'text-rose-400' :
                'text-amber-400')}>
          {recommendationLabel}
        </div>
        <div className="text-right text-[11px]">
          <div className="text-(--color-term-muted)">
            {t('research.techScore', '技術評分')}: <span className="text-(--color-term-text) tabular-nums">{scoreDisplay}</span>
          </div>
          <div className="text-(--color-term-muted)">
            {t('research.trendDirection', '趨勢方向')}: <span className={cn("tabular-nums",
              !hasData ? 'text-zinc-500' :
                score > 0 ? 'text-sky-400' :
                  score < 0 ? 'text-rose-400' :
                    'text-amber-400')}>
              {trendDisplay}
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
          <span>{t('research.consensusBuyTech', 'Buy (Tech)')}</span>
          <span>{t('research.consensusNeutral', 'Neutral')}</span>
          <span>{t('research.consensusSell', 'Sell')}</span>
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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  return (
    <Panel title={t('research.newsPanelTitle', '標的相關新聞')} collapsible className="flex-1 min-h-[300px]" bodyClassName="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
      {news.length === 0 ? <div className="p-10 text-center text-(--color-term-muted)">{t('research.newsEmpty', '尚無新聞資料')}</div> : null}
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
                <span className="group-hover/item:text-sky-400 transition-colors">{n.source || n.publisher || t('research.newsSourceFallback', 'MARKET')}</span>
                <span>{n.published ? new Date(n.published * 1000).toLocaleDateString(dateLocale, { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' }) : (n.time || '')}</span>
              </div>
              <p className="text-[12.5px] leading-snug text-(--color-term-text) font-medium group-hover/item:text-(--color-term-accent) transition-colors break-words text-pretty">
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
  const { t } = useTranslation();
  const personaLabel = t(`research.persona.${persona}`, persona);

  return (
    <Panel title={t('research.aiPanelTitle', 'AI 摘要與分析')} collapsible bodyClassName="p-4 bg-sky-900/10 border-l-2 border-l-sky-400 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent max-h-[400px] lg:max-h-none">
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
            <span className="text-xs text-sky-400/70 tracking-widest animate-pulse">{t('research.aiAnalyzing', '正在以 {{persona}} 分析...', { persona: personaLabel })}</span>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-zinc-100 font-sans whitespace-pre-wrap tracking-wide break-words text-pretty">
            {summary}
          </p>
        )}
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2 flex justify-between">
          <span>{personaLabel}</span>
          <span>{modelName || 'OpenRouter'}</span>
        </div>
      </div>
    </Panel>
  );
}
function ChipAnalysisPanel({ data }: { data: any }) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const items = [
    { label: t('research.chipMainPlayersNet', '主力買賣超'), value: data.mainPlayersNet, unit: t('research.lotUnit', '張'), color: toneClass(data.mainPlayersNet) },
    { label: t('research.chipForeignNet', '外資買賣超'), value: data.foreignNet, unit: t('research.lotUnit', '張'), color: toneClass(data.foreignNet) },
    { label: t('research.chipTrustNet', '投信買賣超'), value: data.trustNet, unit: t('research.lotUnit', '張'), color: toneClass(data.trustNet) },
    { label: t('research.chipDealerNet', '自營商買賣超'), value: data.dealerNet, unit: t('research.lotUnit', '張'), color: toneClass(data.dealerNet) },
    { label: t('research.chipConcentration5d', '5日集中度'), value: data.concentration5d, unit: '%', color: toneClass(data.concentration5d) },
    { label: t('research.chipConcentration20d', '20日集中度'), value: data.concentration20d, unit: '%', color: toneClass(data.concentration20d) },
    { label: t('research.chipHolder400', '400張大戶'), value: data.holder400Pct, unit: '%', color: 'text-white' },
    { label: t('research.chipHolder1000', '1000張大戶'), value: data.holder1000Pct, unit: '%', color: 'text-(--color-term-accent)' },
    { label: t('research.chipForeignPct', '外資持股比'), value: data.foreignPct, unit: '%', color: 'text-white' },
    { label: t('research.chipTrustPct', '投信持股比'), value: data.trustPct, unit: '%', color: 'text-white' },
  ];

  return (
    <Panel title={t('research.chipTitle', '籌碼分析 (玩股網)')} icon={<Users size={16} />} className="bg-(--color-term-panel)" bodyClassName="p-4 flex flex-col gap-4 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent min-h-0">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <span className="text-[10px] text-(--color-term-muted) uppercase tracking-tighter">{item.label}</span>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-black", item.color)}>
                {typeof item.value === 'number' ? formatNum(item.value, 0, numberLocale) : t('research.notAvailable', '---')}
              </span>
              <span className="text-[9px] text-(--color-term-muted)">{item.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-(--color-term-border) flex items-center justify-between text-[10px] text-(--color-term-muted)">
        <div className="flex items-center gap-2">
          <Info size={10} />
          <span>{t('research.chipBrokerDiff', '家數差')}: <span className={toneClass(-data.brokerDiff)}>{data.brokerDiff}</span> ({t('research.chipBrokerDiffHint', '正值代表籌碼分散')})</span>
        </div>
        <a 
          href={`https://www.wantgoo.com/stock/${data.symbol}/major-investors/main-trend`} 
          target="_blank" 
          rel="noreferrer"
          className="hover:text-(--color-term-accent) transition-colors flex items-center gap-1"
        >
          {t('research.chipDetails', '查看詳細籌碼')} <BarChart3 size={10} />
        </a>
      </div>
    </Panel>
  );
}
