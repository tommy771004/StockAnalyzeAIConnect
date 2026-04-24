import { useMemo, useState } from 'react';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { aaplCandles, aaplMacd, aaplRecentNews } from '../mockData';
import type { CandlePoint } from '../types';
import { formatPct, toneClass } from '../ui/format';

export function ResearchPage() {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1M');
  const [overlay, setOverlay] = useState<'MA' | 'MACD'>('MA');

  const candles = aaplCandles;
  const price = candles[candles.length - 1]?.close ?? 185.92;
  const change = 2.41;

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-8">
        <QuoteHeader price={price} change={change} />
        <ChartPanel range={range} onRange={setRange} overlay={overlay} onOverlay={setOverlay} candles={candles} />
        <MacdPanel />
      </div>
      <aside className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-4">
        <ValuationPanel />
        <ConsensusPanel />
        <SentimentPanel />
        <RecentNewsPanel />
      </aside>
    </div>
  );
}

function QuoteHeader({ price, change }: { price: number; change: number }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 border border-(--color-term-border) bg-(--color-term-panel) px-5 py-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[18px] font-bold tracking-widest text-(--color-term-accent)">
          AAPL
        </span>
        <span className="border border-(--color-term-border) px-2 py-0.5 text-[10px] tracking-widest text-(--color-term-muted)">
          APPLE INC.
        </span>
        <span className="border border-(--color-term-border) px-2 py-0.5 text-[10px] tracking-widest text-(--color-term-muted)">
          NASDAQ
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-6 tabular-nums">
        <div>
          <div className="text-3xl font-semibold text-(--color-term-text)">{price.toFixed(2)}</div>
          <div className={`text-[12px] ${toneClass(change)}`}>
            {`+${change.toFixed(2)} (${formatPct((change / (price - change)) * 100)})`}
          </div>
        </div>
        <StatBlock label="BID" value="185.90 x 400" />
        <StatBlock label="ASK" value="185.95 x 1200" />
        <StatBlock label="VOL" value="42.5M" />
        <StatBlock label="DAY RANGE" value="183.12 - 186.20" />
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
  range,
  onRange,
  overlay,
  onOverlay,
  candles,
}: {
  range: '1D' | '1W' | '1M' | '3M' | '1Y';
  onRange: (r: '1D' | '1W' | '1M' | '3M' | '1Y') => void;
  overlay: 'MA' | 'MACD';
  onOverlay: (o: 'MA' | 'MACD') => void;
  candles: CandlePoint[];
}) {
  return (
    <Panel className="flex-1 min-h-[280px]" bodyClassName="flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-(--color-term-border) px-3 py-2">
        <div className="flex items-center gap-1">
          {(['1D', '1W', '1M', '3M', '1Y'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRange(r)}
              className={cn(
                'h-6 min-w-9 px-1.5 text-[10px] tracking-widest',
                range === r
                  ? 'border border-(--color-term-accent) text-(--color-term-accent)'
                  : 'text-(--color-term-muted) hover:text-(--color-term-text)',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['MA', 'MACD'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onOverlay(o)}
              className={cn(
                'h-6 min-w-12 px-2 text-[10px] tracking-widest',
                overlay === o
                  ? 'border border-(--color-term-border-strong) bg-white/5 text-(--color-term-text)'
                  : 'border border-(--color-term-border) text-(--color-term-muted)',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </header>
      <div className="absolute z-10 m-3 flex flex-col gap-0.5 text-[11px]">
        <span className="text-(--color-term-accent) tabular-nums">MA(50) 178.42</span>
        <span className="text-sky-300 tabular-nums">MA(200) 165.30</span>
      </div>
      <div className="relative flex-1 min-h-0">
        <CandleChart candles={candles} />
      </div>
    </Panel>
  );
}

function CandleChart({ candles }: { candles: CandlePoint[] }) {
  const { minLow, maxHigh } = useMemo(() => {
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    return { minLow: Math.min(...lows) - 1, maxHigh: Math.max(...highs) + 1 };
  }, [candles]);
  const W = 900;
  const H = 360;
  const range = maxHigh - minLow;
  const step = W / candles.length;
  const bw = step * 0.55;

  const ma50 = rollingAvg(candles.map((c) => c.close), 50);
  const ma200 = rollingAvg(candles.map((c) => c.close), 200);

  function y(v: number) {
    return H - ((v - minLow) / range) * H;
  }

  return (
    <svg className="h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.2, 0.4, 0.6, 0.8].map((p) => (
        <line key={p} x1="0" x2={W} y1={p * H} y2={p * H} stroke="rgba(255,255,255,0.05)" />
      ))}
      {candles.map((c, i) => {
        const x = i * step + step / 2;
        const isUp = c.close >= c.open;
        const color = isUp ? '#22d3ee' : '#f87171';
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
            <rect
              x={x - bw / 2}
              y={y(Math.max(c.open, c.close))}
              width={bw}
              height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
              fill={color}
              opacity={isUp ? 0.9 : 0.85}
            />
          </g>
        );
      })}
      <LinePath values={ma50} y={y} step={step} stroke="#f59e0b" />
      <LinePath values={ma200} y={y} step={step} stroke="#60a5fa" />
    </svg>
  );
}

function LinePath({
  values,
  y,
  step,
  stroke,
}: {
  values: Array<number | null>;
  y: (v: number) => number;
  step: number;
  stroke: string;
}) {
  const pts: string[] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const x = i * step + step / 2;
    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y(v).toFixed(1)}`);
  });
  if (pts.length === 0) return null;
  return <path d={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.3} strokeDasharray="3 2" />;
}

function rollingAvg(values: number[], window: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= window) sum -= values[i - window]!;
    if (i >= window - 1) out.push(sum / window);
    else out.push(values[i]!); // show rough trend for short series
  }
  return out;
}

function MacdPanel() {
  return (
    <Panel title="MACD (12, 26, 9)" className="h-[120px]" bodyClassName="relative">
      <svg className="h-full w-full" viewBox="0 0 900 120" preserveAspectRatio="none">
        {aaplMacd.map((m, i) => {
          const w = 900 / aaplMacd.length;
          const x = i * w + w * 0.25;
          const bw = w * 0.5;
          const h = Math.abs(m.hist) * 40;
          const y = m.hist >= 0 ? 60 - h : 60;
          const color = m.hist >= 0 ? '#22d3ee' : '#f87171';
          return <rect key={i} x={x} y={y} width={bw} height={h} fill={color} opacity={0.7} />;
        })}
        <line x1="0" x2="900" y1="60" y2="60" stroke="rgba(255,255,255,0.1)" />
      </svg>
    </Panel>
  );
}

function ValuationPanel() {
  const rows: Array<[string, string]> = [
    ['市值 (Market Cap)', '2.85T'],
    ['市盈率 (P/E Ratio)', '29.45'],
    ['每股盈餘 (EPS TTM)', '6.31'],
    ['股息殖利率 (Div Yield)', '0.52%'],
    ['Beta (5Y Monthly)', '1.28'],
  ];
  return (
    <Panel title="估值指標 (Valuation)">
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

function ConsensusPanel() {
  const buy = 28;
  const hold = 12;
  const sell = 4;
  const total = buy + hold + sell;
  return (
    <Panel title="分析師共識 (Consensus)">
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 p-4">
        <div className="text-[32px] font-bold tracking-[0.2em] text-(--color-term-accent)">
          買入
        </div>
        <div className="text-right text-[11px]">
          <div className="text-(--color-term-muted)">
            目標價: <span className="text-(--color-term-text) tabular-nums">205.50</span>
          </div>
          <div className="text-(--color-term-muted)">
            上漲空間:{' '}
            <span className="text-(--color-term-positive) tabular-nums">+10.5%</span>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="flex h-2 overflow-hidden bg-(--color-term-border)">
          <div className="bg-sky-300" style={{ width: `${(buy / total) * 100}%` }} />
          <div className="bg-amber-300" style={{ width: `${(hold / total) * 100}%` }} />
          <div className="bg-rose-300" style={{ width: `${(sell / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-(--color-term-muted)">
          <span>Buy ({buy})</span>
          <span>Hold ({hold})</span>
          <span>Sell ({sell})</span>
        </div>
      </div>
    </Panel>
  );
}

function SentimentPanel() {
  return (
    <Panel title="情緒分析 (Sentiment)">
      <div className="divide-y divide-(--color-term-border)/60">
        <SentimentRow
          label="新聞情緒 (News)"
          tone="bullish"
          rating="看多 (BULLISH)"
          detail="近期新品發表及供應鏈穩定消息推升市場樂觀情緒。"
        />
        <SentimentRow
          label="社群熱度 (Social)"
          tone="neutral"
          rating="中性 (NEUTRAL)"
          detail="討論量維持均值，主要聚焦於下季財報預測。"
        />
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

function RecentNewsPanel() {
  return (
    <Panel title="最新動態 (Recent News)" className="flex-1 min-h-[200px]">
      <ul className="divide-y divide-(--color-term-border)/60">
        {aaplRecentNews.map((n) => (
          <li key={n.title} className="px-4 py-3">
            <div className="mb-1 text-[10px] tracking-widest text-(--color-term-muted)">
              {n.time}
            </div>
            <p className="text-[12.5px] leading-snug text-(--color-term-text)">{n.title}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
