import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, Play, Trophy, Zap, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { runBacktest, optimizeBacktest } from '../services/api';
import { pushLog } from './TradeLogger';
import type { BacktestMetrics, BacktestResult, OptimizationProposal } from '../types';
import type { StrategyParams } from './AutoTrading/types';
import {
  DEFAULT_STRATEGY_PARAMS,
  setStrategyParamValue,
} from './AutoTrading/strategyParamSchema';
import {
  BACKTEST_STRATEGIES as STRATEGIES,
  DEFAULT_BACKTEST_METRICS,
  DEFAULT_BACKTEST_SYMBOLS,
  normalizeBacktestResult,
} from '../utils/backtest';
import { buildBacktestPdf } from '../utils/exportPdf';
import { BacktestHeaderSection } from './backtest/BacktestHeaderSection';
import { BacktestChartSection } from './backtest/BacktestChartSection';
import { BacktestTradesSection } from './backtest/BacktestTradesSection';
import { PriceForecastPanel } from './backtest/PriceForecastPanel';
import { normalizeSymbolInput, searchStockSymbols } from '../utils/stockSymbolLookup';

type StratId = typeof STRATEGIES[number]['id'];
type BtRunState = 'idle' | 'running' | 'comparing';

export default function BacktestPage({ initialSymbol }: { initialSymbol?: string } = {}) {
  const [symbolsList, setSymbolsList] = useState<string[]>([...DEFAULT_BACKTEST_SYMBOLS]);
  const [symbol, setSymbol] = useState(initialSymbol ?? 'AAPL');
  const [period1, setPeriod1] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [period2, setPeriod2] = useState(() => new Date().toISOString().split('T')[0]);
  const [capital, setCapital] = useState('1000000');
  const [strategy, setStrategy] = useState<StratId>('ma_crossover');
  const [runState, setRunState] = useState<BtRunState>('idle');
  const [result, setResult] = useState<(BacktestResult & { strategy: string }) | null>(null);
  const [error, setError] = useState('');
  const [tradeSort, setTradeSort] = useState<'date' | 'pnl'>('date');
  const [showDd, setShowDd] = useState(true);
  const chartKeyRef = useRef(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareResults, setCompareResults] = useState<Record<string, BacktestResult & { strategy: string }>>({});
  const [strategyParams, setStrategyParams] = useState<StrategyParams>(() => ({ ...DEFAULT_STRATEGY_PARAMS }));
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProposal, setOptimizeProposal] = useState<OptimizationProposal | null | 'none'>(null);

  const running = runState === 'running';
  const comparing = runState === 'comparing';
  const currentStrategy = STRATEGIES.find(s => s.id === strategy) ?? STRATEGIES[0];
  const cap = parseInt(capital.replace(/,/g, ''), 10) || 1_000_000;
  const strategyParamPack = useMemo(() => JSON.stringify(strategyParams), [strategyParams]);

  const handleStrategyParamChange = (path: string, value: number) => {
    setStrategyParams(prev => setStrategyParamValue(prev, path, value));
  };

  const resolveInputSymbol = async (): Promise<string> => {
    const raw = symbol.trim();
    if (!raw) return '';

    const tickerLike = /^[A-Za-z0-9.\-:=/]+$/.test(raw);
    if (tickerLike) return normalizeSymbolInput(raw);

    try {
      const fuzzy = await searchStockSymbols(raw, 1);
      if (fuzzy[0]?.symbol) return normalizeSymbolInput(fuzzy[0].symbol);
    } catch {
      // ignore and fall back to normalized raw value
    }
    return normalizeSymbolInput(raw);
  };

  const handleCompare = async () => {
    const sym = await resolveInputSymbol();
    if (!sym) { setError('請輸入股票代碼'); return; }
    if (sym !== symbol) setSymbol(sym);
    if (new Date(period1) >= new Date(period2)) { setError('開始日期必須早於結束日期'); return; }
    setRunState('comparing');
    setError('');
    setCompareResults({});
    const results: Record<string, BacktestResult & { strategy: string }> = {};

    for (let i = 0; i < STRATEGIES.length; i += 2) {
      const chunk = STRATEGIES.slice(i, i + 2);
      await Promise.all(chunk.map(async s => {
        try {
          const r = await runBacktest({
            symbol: sym,
            period1,
            period2: period2 || undefined,
            initialCapital: cap,
            strategy: s.id,
            paramPack: strategyParamPack,
          });
          results[s.id] = normalizeBacktestResult(r, s.id);
        } catch (e) {
          console.warn('[BacktestPage] runBacktest strategy:', s.id, e);
        }
      }));
    }

    setCompareResults({ ...results });
    setCompareMode(true);
    setRunState('idle');
  };

  const handleRun = async () => {
    const sym = await resolveInputSymbol();
    if (!sym) { setError('請輸入股票/加密貨幣代碼'); return; }
    if (sym !== symbol) setSymbol(sym);
    if (new Date(period1) >= new Date(period2)) { setError('開始日期必須早於結束日期'); return; }
    if (!symbolsList.includes(sym)) setSymbolsList(p => [sym, ...p]);

    chartKeyRef.current += 1;
    setRunState('running');
    setError('');
    setResult(null);
    try {
      const r = await runBacktest({
        symbol: sym,
        strategy,
        initialCapital: cap,
        period1,
        period2: period2 || undefined,
        paramPack: strategyParamPack,
      });
      if (!r || typeof r !== 'object') throw new Error('伺服器回傳格式錯誤');
      const safe = normalizeBacktestResult(r, strategy);
      if (safe.equityCurve.length === 0) throw new Error('該時間區間內無足夠歷史資料，請擴大日期範圍（建議至少6個月）');
      setResult(safe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '回測執行失敗，請稍後再試');
    } finally {
      setRunState('idle');
    }
  };

  const exportCSV = () => {
    if (!result?.trades?.length) return;
    const header = '進場日期,出場日期,進場價,出場價,股數,持有天數,損益%,損益金額,結果';
    const rows = result.trades.map((t) => `${t.entryTime},${t.exitTime},${t.entryPrice},${t.exitPrice},${t.amount},${t.holdDays},${t.pnlPct}%,${t.pnl},${t.result === 'WIN' ? '獲利' : '虧損'}`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `回測_${symbol}_${currentStrategy.en}_${period1}.csv`;
    a.click();
  };

  const exportPDF = async () => {
    if (!result) return;
    pushLog('info', 'SYSTEM', 'Exporting PDF report...');
    await buildBacktestPdf({
      symbol,
      strategy: result.strategy,
      period1,
      period2,
      metrics: result.metrics,
      trades: result.trades,
      params: strategyParams,
    });
  };

  const handleToggleCompare = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompareResults({});
      return;
    }
    void handleCompare();
  };

  const handleOptimize = async () => {
    if (!result) return;
    setOptimizing(true);
    setOptimizeProposal(null);
    try {
      const res = await optimizeBacktest({ symbol, strategy, initialCapital: cap, period1, period2: period2 || undefined, paramPack: strategyParamPack });
      setOptimizeProposal(res.proposal ?? 'none');
    } catch {
      setOptimizeProposal('none');
    } finally {
      setOptimizing(false);
    }
  };

  const metrics: BacktestMetrics = result?.metrics || DEFAULT_BACKTEST_METRICS;
  const equityData = result?.equityCurve || [];
  const benchEnd = equityData.at(-1)?.benchmark ?? 0;
  const resultStrat = STRATEGIES.find(s => s.id === result?.strategy) || currentStrategy;
  const tradesRaw = result?.trades || [];
  const trades = [...tradesRaw].sort((a, b) =>
    tradeSort === 'pnl'
      ? (b.pnl ?? 0) - (a.pnl ?? 0)
      : new Date(b.exitTime ?? '').getTime() - new Date(a.exitTime ?? '').getTime(),
  );

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let curW = 0;
  let curL = 0;
  for (const t of tradesRaw.slice().reverse()) {
    if (t.result === 'WIN') {
      curW += 1;
      curL = 0;
      maxWinStreak = Math.max(maxWinStreak, curW);
    } else {
      curL += 1;
      curW = 0;
      maxLossStreak = Math.max(maxLossStreak, curL);
    }
  }

  const ddData = equityData
    .filter((_, i) => i % 3 === 0 || i === equityData.length - 1)
    .map((d) => ({ date: String(d.date || '').slice(5), dd: d.drawdown ?? 0 }));

  const chartKey = `chart-${result?.strategy || 'none'}-${result?.metrics?.roi ?? 0}-${chartKeyRef.current}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-6 p-2 sm:p-4 overflow-y-auto custom-scrollbar relative"
    >
      <BacktestHeaderSection
        strategies={STRATEGIES}
        strategy={strategy}
        currentStrategy={currentStrategy}
        symbolsList={symbolsList}
        symbol={symbol}
        onSymbolChange={setSymbol}
        onStrategyChange={setStrategy}
        compareMode={compareMode}
        comparing={comparing}
        resultExists={!!result}
        onToggleCompare={handleToggleCompare}
        onExportPDF={() => void exportPDF()}
        onRun={handleRun}
        running={running}
        capital={capital}
        onCapitalChange={setCapital}
        period1={period1}
        period2={period2}
        onPeriod1Change={setPeriod1}
        onPeriod2Change={setPeriod2}
        strategyParams={strategyParams}
        onStrategyParamChange={handleStrategyParamChange}
      />

      {error && (
        <div className="rounded-xl p-4 shrink-0 flex items-start gap-3" style={{ background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)', color: 'var(--md-error)' }}>
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-0.5">回測失敗</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {compareMode && Object.keys(compareResults).length > 0 && (
        <div className="shrink-0 glass-card rounded-[2.5rem] p-6 lg:p-10 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-50" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-lg">
                <Trophy size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>多策略績效矩陣</h3>
                <p className="label-meta font-black uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--md-outline)' }}>{symbol} · {period1} ～ {period2}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setCompareMode(false); setCompareResults({}); }}
              className="text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl active:scale-95 transition" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
              關閉比較
            </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
            <table className="w-full text-sm mb-6 min-w-[1040px]">
              <thead>
                <tr className="border-b label-meta font-black uppercase tracking-[0.2em]" style={{ borderColor: 'var(--md-outline-variant)', color: 'var(--md-outline)' }}>
                  <th className="pb-6 text-left pl-4">策略名稱</th>
                  <th className="pb-6 text-right">總報酬率 (ROI)</th>
                  <th className="pb-6 text-right">夏普比率 (Sharpe)</th>
                  <th className="pb-6 text-right">最大回撤 (MDD)</th>
                  <th className="pb-6 text-right">勝率 (Win Rate)</th>
                  <th className="pb-6 text-right">平均盈%</th>
                  <th className="pb-6 text-right">平均虧%</th>
                  <th className="pb-6 text-right">獲利因子 (PF)</th>
                  <th className="pb-6 text-right pr-4">交易次數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {STRATEGIES.map(s => {
                  const r = compareResults[s.id];
                  if (!r) return null;
                  const m = r.metrics;
                  const best = Object.values(compareResults).reduce((max: any, x: any) => (x.metrics?.roi ?? 0) > (max.metrics?.roi ?? 0) ? x : max, Object.values(compareResults)[0]);
                  const isBest = r === best;
                  return (
                    <tr key={s.id} className={cn('group transition duration-300')} style={isBest ? { background: 'rgba(128,131,255,0.05)' } : {}}>
                      <td className="py-6 pl-4 flex items-center gap-4">
                        <div className="w-2.5 h-10 rounded-full shadow-lg" style={{ backgroundColor: s.color }} />
                        <div>
                          <div className="font-black text-base tracking-tight" style={{ color: 'var(--md-on-surface)' }}>{s.label}</div>
                          {isBest && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ color: 'var(--md-primary)', background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)' }}>Top Performer</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-6 text-right font-mono font-black text-lg" style={{ color: (m?.roi ?? 0) >= 0 ? 'var(--color-down)' : 'var(--color-up)' }}>
                        {(m?.roi ?? 0) >= 0 ? '+' : ''}{m?.roi ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: (m?.sharpe ?? 0) >= 1 ? 'var(--color-down)' : (m?.sharpe ?? 0) >= 0 ? 'var(--md-tertiary)' : 'var(--color-up)' }}>
                        {m?.sharpe ?? 0}
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: 'var(--color-up)' }}>
                        -{m?.maxDrawdown ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: (m?.winRate ?? 0) >= 50 ? 'var(--color-down)' : 'var(--color-up)' }}>
                        {m?.winRate ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: 'var(--color-down)' }}>
                        +{m?.avgWin ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: 'var(--color-up)' }}>
                        -{m?.avgLoss ?? 0}%
                      </td>
                      <td className="py-6 text-right font-mono font-bold text-base" style={{ color: (m?.profitFactor ?? 0) >= 1.5 ? 'var(--color-down)' : (m?.profitFactor ?? 0) >= 1 ? 'var(--md-tertiary)' : 'var(--color-up)' }}>
                        {m?.profitFactor ?? 0}
                      </td>
                      <td className="py-6 text-right font-mono font-bold pr-4" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {m?.totalTrades ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result ? (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {/* Regime badge + Optimize button row */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            {result.regime && (() => {
              const regimeCfg = {
                bull:     { icon: <TrendingUp size={13} />, label: '多頭行情', bg: 'rgba(82,196,26,0.08)', border: 'rgba(82,196,26,0.25)', color: 'var(--color-down)' },
                bear:     { icon: <TrendingDown size={13} />, label: '空頭行情', bg: 'rgba(255,77,79,0.08)', border: 'rgba(255,77,79,0.25)', color: 'var(--color-up)' },
                sideways: { icon: <Minus size={13} />, label: '震盪整理', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b' },
              }[result.regime];
              return (
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest"
                  style={{ background: regimeCfg.bg, border: `1px solid ${regimeCfg.border}`, color: regimeCfg.color }}>
                  {regimeCfg.icon}
                  <span>市場狀態：{regimeCfg.label}</span>
                </div>
              );
            })()}
            <button type="button" onClick={() => void handleOptimize()} disabled={optimizing}
              className="flex items-center gap-2 px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition active:scale-95 disabled:opacity-50"
              style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.25)', color: 'var(--md-primary)' }}>
              <Zap size={13} />
              {optimizing ? '優化中…' : '自動優化參數'}
            </button>
          </div>

          {/* Optimization result panel */}
          {optimizeProposal && optimizeProposal !== 'none' && (
            <div className="glass-card rounded-[2.5rem] p-6 shadow-xl animate-in fade-in slide-in-from-top-2 duration-500 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-50" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)', color: 'var(--md-primary)' }}>
                    <Zap size={18} />
                  </div>
                  <div>
                    <div className="font-black tracking-tight" style={{ color: 'var(--md-on-surface)' }}>找到更優參數</div>
                    <div className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-down)' }}>
                      ROI 預計改善 +{optimizeProposal.improvementPct}%，風險評分 {optimizeProposal.riskAdjustedScore}
                    </div>
                  </div>
                </div>
                <button type="button"
                  onClick={() => { setStrategyParams(optimizeProposal.betterParams as StrategyParams); setOptimizeProposal(null); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition active:scale-95"
                  style={{ background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.3)', color: 'var(--color-down)' }}>
                  <CheckCircle size={13} />
                  套用參數
                </button>
              </div>
              <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--md-outline)' }}>{optimizeProposal.reason}</p>
            </div>
          )}
          {optimizeProposal === 'none' && (
            <div className="rounded-2xl px-5 py-3 text-xs font-bold animate-in fade-in duration-300"
              style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)', color: 'var(--md-outline)' }}>
              已掃描 5 組變異參數，當前配置已是最佳，無明顯改善空間。
            </div>
          )}

          <BacktestChartSection
            resultStrat={resultStrat}
            metrics={metrics}
            symbol={symbol}
            period1={period1}
            period2={period2}
            onExportCSV={exportCSV}
            showDd={showDd}
            onToggleDd={() => setShowDd(v => !v)}
            chartKey={chartKey}
            equityData={equityData}
            ddData={ddData}
            benchEnd={benchEnd}
            tradesRaw={tradesRaw}
            maxWinStreak={maxWinStreak}
            maxLossStreak={maxLossStreak}
          />
          <BacktestTradesSection
            resultStrat={resultStrat}
            tradesRaw={tradesRaw}
            trades={trades}
            tradeSort={tradeSort}
            onTradeSortChange={setTradeSort}
            onExportCSV={exportCSV}
          />
          {result.forecast && (
            <PriceForecastPanel symbol={symbol} forecast={result.forecast} />
          )}
        </div>
      ) : running ? (
        strategy === 'neural' && (
          <PriceForecastPanel symbol={symbol} loading />
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 py-20 animate-in fade-in zoom-in-95 duration-1000">
          <div className="text-center space-y-6 max-w-2xl px-6">
            <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto relative" style={{ background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.25)' }}>
              <Play style={{ color: 'var(--md-primary)' }} className="relative z-10" size={40} fill="currentColor" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>準備好驗證你的交易策略了嗎？</h3>
              <p className="font-medium leading-relaxed" style={{ color: 'var(--md-outline)' }}>
                回測引擎允許你使用歷史市場數據來模擬交易表現。雖然過去的績效不保證未來結果，但它是優化策略、建立信心的關鍵步驟。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-5xl px-6">
            {STRATEGIES.map((s, idx) => (
              <button key={`strat-btn-${idx}`} type="button" onClick={() => setStrategy(s.id)}
                className="p-6 rounded-[2rem] text-left transition hover:scale-[1.03] active:scale-95 relative overflow-hidden"
                style={strategy === s.id
                  ? { background: 'rgba(128,131,255,0.12)', border: `1px solid ${s.color}40` }
                  : { background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-3 h-3 rounded-full mb-4" style={{ backgroundColor: s.color }} />
                <div className="text-base font-black mb-2" style={{ color: 'var(--md-on-surface)' }}>{s.label}</div>
                <div className="text-xs leading-relaxed font-medium line-clamp-3" style={{ color: 'var(--md-outline)' }}>{s.desc}</div>
                <div className="label-meta mt-4 font-black uppercase tracking-widest" style={{ color: s.color }}>{s.type}</div>
              </button>
            ))}
          </div>

          <div className="rounded-3xl p-6 max-w-2xl w-full mx-6" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.15)' }}>
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest mb-3" style={{ color: 'var(--md-tertiary)' }}>
              <AlertCircle size={18} /> 投資風險免責聲明
            </div>
            <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-outline)' }}>
              本工具提供的回測結果僅供學術研究與策略開發參考。市場環境瞬息萬變，歷史數據無法完全預測未來走勢。所有交易決策應由投資者自行評估，本平台不承擔任何因使用本工具而產生的投資損失。
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
