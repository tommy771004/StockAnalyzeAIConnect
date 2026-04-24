/**
 * src/terminal/ui/SecFilingsPanel.tsx
 *
 * SEC EDGAR 申報面板
 * 顯示最近 10-K/10-Q/8-K 申報列表 + 財務摘要
 */

import React, { useEffect, useState } from 'react';
import { Panel } from './Panel';
import { Loader2, ExternalLink, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FinancialSummary {
  period:       string;
  revenue:      string;
  netIncome:    string;
  eps:          string;
  assets:       string;
  equity:       string;
  rawNetIncome: number | null;
}

interface EdgarFiling {
  form:        string;
  filingDate:  string;
  description: string;
  url:         string;
}

interface EdgarData {
  company: {
    name:    string;
    cik:     string;
    ticker:  string;
    sicDesc: string;
    stateInc: string;
    secUrl:  string;
  };
  financials: FinancialSummary | null;
  filings:    EdgarFiling[];
}

interface Props {
  symbol: string;
}

const FORM_COLOR: Record<string, string> = {
  '10-K':  'text-sky-400  border-sky-400/30  bg-sky-400/10',
  '10-Q':  'text-violet-400 border-violet-400/30 bg-violet-400/10',
  '8-K':   'text-amber-400 border-amber-400/30 bg-amber-400/10',
  'DEF 14A': 'text-zinc-400 border-zinc-400/30 bg-zinc-400/10',
  '4':     'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
};

export function SecFilingsPanel({ symbol }: Props) {
  const [data, setData]       = useState<EdgarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/research/edgar/${symbol}`)
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as EdgarData;
      })
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [symbol]);

  return (
    <Panel
      title={`SEC EDGAR — ${symbol}`}
      className="min-h-[300px]"
      bodyClassName="flex flex-col"
    >
      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-(--color-term-muted) text-[12px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在從 SEC 載入申報資料...</span>
        </div>
      )}

      {error && (
        <div className="p-4 text-[12px] text-rose-400">{error}</div>
      )}

      {data && (
        <div className="flex flex-col gap-0">
          {/* Company header */}
          <div className="border-b border-(--color-term-border) px-4 py-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-(--color-term-text)">{data.company.name}</div>
              <div className="text-[10px] text-(--color-term-muted) mt-0.5">
                CIK: {data.company.cik} · {data.company.sicDesc} · {data.company.stateInc}
              </div>
            </div>
            <a
              href={data.company.secUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-[10px] text-(--color-term-accent) hover:underline mt-0.5"
            >
              SEC <ExternalLink size={10} />
            </a>
          </div>

          {/* Financial summary */}
          {data.financials && (
            <div className="border-b border-(--color-term-border) px-4 py-3">
              <div className="text-[10px] tracking-widest text-(--color-term-muted) mb-2">
                年報財務摘要 (FY {data.financials.period})
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {([
                  ['營收', data.financials.revenue],
                  ['淨利', data.financials.netIncome],
                  ['EPS',  data.financials.eps],
                  ['資產', data.financials.assets],
                  ['淨值', data.financials.equity],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[11px] text-(--color-term-muted)">{label}</span>
                    <span className={cn(
                      'text-[12px] font-semibold tabular-nums',
                      label === '淨利' && data.financials!.rawNetIncome != null
                        ? data.financials!.rawNetIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        : 'text-(--color-term-text)',
                    )}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filings list */}
          <ul className="divide-y divide-(--color-term-border)/60 overflow-auto" style={{ maxHeight: '280px' }}>
            {data.filings.length === 0 && (
              <li className="px-4 py-6 text-center text-[12px] text-(--color-term-muted)">
                尚無近期申報
              </li>
            )}
            {data.filings.map((f, i) => {
              const colorClass = FORM_COLOR[f.form] ?? FORM_COLOR['8-K']!;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                  <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest', colorClass)}>
                    {f.form}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-(--color-term-text) truncate">
                      {f.description || f.form}
                    </div>
                    <div className="text-[10px] text-(--color-term-muted)">{f.filingDate}</div>
                  </div>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-(--color-term-muted) hover:text-(--color-term-accent) transition-colors"
                    title="開啟申報文件"
                  >
                    <FileText size={14} />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
