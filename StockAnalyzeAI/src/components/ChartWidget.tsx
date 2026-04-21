import { useEffect, useRef, useState, useMemo } from 'react';
import { Settings, Check, ChevronDown } from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, ISeriesApi, Time, LineWidth, LogicalRange, MouseEventParams
} from 'lightweight-charts';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';
import { calcEMA, calcRSISeries as calcRSI, calcMACDSeries as calcMACD, calcBBSeries as calcBB } from '../utils/math';

// 內建 safeCn，防止 import { cn } 失敗導致黑屏
function safeCn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface Props { 
  data: HistoricalData[]; 
  focusMode?: boolean;
}
type Indicator = 'EMA1' | 'EMA2' | 'BB' | 'Volume';
type SubPanel  = 'none' | 'RSI' | 'MACD';

const SUB_H = 120;
const VALID_SUBPANELS: SubPanel[] = ['none', 'RSI', 'MACD'];

export default function ChartWidget({ data: history, focusMode = false }: Props) {
  const mainRef  = useRef<HTMLDivElement>(null);
  const volRef   = useRef<HTMLDivElement>(null);
  const subRef   = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volChartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  const [ema1Period, setEma1Period] = useState(() => {
    try { return Number(localStorage.getItem('chart_ema1')) || 20; } catch { return 20; }
  });
  const [ema2Period, setEma2Period] = useState(() => {
    try { return Number(localStorage.getItem('chart_ema2')) || 50; } catch { return 50; }
  });

  const [indics,  setIndics]  = useState<Set<Indicator>>(() => {
    try { 
      const s = localStorage.getItem('chart_indicators'); 
      if (s) {
        const parsed = JSON.parse(s);
        const mapped = parsed.map((i: string) => i === 'EMA20' ? 'EMA1' : i === 'EMA50' ? 'EMA2' : i);
        return new Set<Indicator>(mapped);
      }
      return new Set(['EMA1', 'Volume']); 
    }
    catch { return new Set(['EMA1', 'Volume']); }
  });
  const [subPanel, setSubPanel] = useState<SubPanel>(() => {
    try {
      const v = localStorage.getItem('chart_subpanel');
      return VALID_SUBPANELS.includes(v as SubPanel) ? (v as SubPanel) : 'RSI';
    }
    catch { return 'RSI'; }
  });

  const closes = useMemo(() => history?.map(r => Number(r.close)) ?? [], [history]);
  const ema1Data = useMemo(() => calcEMA(closes, ema1Period), [closes, ema1Period]);
  const ema2Data = useMemo(() => calcEMA(closes, ema2Period), [closes, ema2Period]);
  const rsiIndicatorData = useMemo(() => calcRSI(closes), [closes]);
  const macdData = useMemo(() => calcMACD(closes), [closes]);
  const bbData = useMemo(() => calcBB(closes), [closes]);

  const toggleIndic = (i: Indicator) => setIndics(prev => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    try { localStorage.setItem('chart_indicators', JSON.stringify([...n])); } catch (e) { console.error(e); }
    return n;
  });
  const setEmaPersist = (which: 1 | 2, val: number) => {
    const v = Math.max(1, Math.min(200, val));
    if (which === 1) {
      setEma1Period(v);
      try { localStorage.setItem('chart_ema1', v.toString()); } catch (e) { console.error(e); }
    } else {
      setEma2Period(v);
      try { localStorage.setItem('chart_ema2', v.toString()); } catch (e) { console.error(e); }
    }
  };

  const setSubPanelPersist = (p: SubPanel) => {
    setSubPanel(p);
    try { localStorage.setItem('chart_subpanel', p); } catch (e) { console.error(e); }
  };

  const { settings } = useSettings();
  const isLight = settings.theme === 'light';

  useEffect(() => {
    if (!mainRef.current || !history?.length) return;

    chartRef.current?.remove();
    subChartRef.current?.remove();
    volChartRef.current?.remove();

    const textColor = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)';
    const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    const crosshairColor = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
    const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)';

    const baseOpts = {
      layout:     { background: { type: ColorType.Solid, color: 'transparent' }, textColor, fontSize: focusMode ? 14 : 12 },
      grid:       { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair:  { mode: CrosshairMode.Normal, vertLine: { width: 1 as LineWidth, color: crosshairColor, style: 1 }, horzLine: { width: 1 as LineWidth, color: crosshairColor, style: 1 } },
      rightPriceScale: { 
        borderColor: borderColor, 
        scaleMargins: { top: 0.1, bottom: 0.1 } 
      },
      timeScale:       { borderColor: borderColor, timeVisible: true },
    };

    const chart = createChart(mainRef.current, { 
      ...baseOpts, 
      width: mainRef.current.clientWidth, 
      height: mainRef.current.clientHeight 
    });
    chartRef.current = chart;

    // 🚨 終極修復：絕對嚴謹的時間排序與去重，使用 Unix Seconds 徹底防止 Lightweight charts 崩潰！
    const uniqueMap = new Map<number, { time: Time, open: number, high: number, low: number, close: number, volume: number }>();
    history.forEach((d: HistoricalData) => {
      try {
        if (!d || !d.date) return;
        const t = new Date(d.date).getTime();
        if (isNaN(t)) return;
        
        const timeVal = Math.floor(t / 1000) as Time; 
        const close = Number(d.close);
        if (isNaN(close) || close <= 0) return;

        uniqueMap.set(timeVal as number, { 
          time: timeVal, 
          open: Number(d.open ?? close) || close, 
          high: Number(d.high ?? close) || close, 
          low: Number(d.low ?? close) || close, 
          close: close, 
          volume: Number(d.volume) || 0 
        });
      } catch (e) { console.error(e); }
    });

    const rows = Array.from(uniqueMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    if (!rows.length) return;

    const times  = rows.map(r => r.time);

    // 修正：使用 addCandlestickSeries
    const candles = chart.addCandlestickSeries({
      upColor: '#34d399', downColor: '#fb7185', borderVisible: false,
      wickUpColor: '#34d399', wickDownColor: '#fb7185',
    });
    candles.setData(rows);
    chart.timeScale().fitContent();

    let volSeries: ISeriesApi<'Histogram'> | null = null;
    if (indics.has('Volume') && volRef.current) {
      const volChart = createChart(volRef.current, {
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: false },
        rightPriceScale: { borderColor: borderColor, scaleMargins: { top: 0.1, bottom: 0 } },
      });
      volChartRef.current = volChart;
      
      volSeries = volChart.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'right' });
      volSeries.setData(rows.map(r => ({ time: r.time, value: r.volume, color: r.close >= r.open ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)' })));
    }

    if (indics.has('EMA1')) {
      // 修正：使用 addLineSeries
      const ema1Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      ema1Series.setData(times.map((t, i) => ({ time: t, value: ema1Data[i] })));
    }

    if (indics.has('EMA2')) {
      // 修正：使用 addLineSeries
      const ema2Series = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      ema2Series.setData(times.map((t, i) => ({ time: t, value: ema2Data[i] })));
    }

    if (indics.has('BB')) {
      const bbOpts = { lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false };
      // 修正：使用 addLineSeries
      const upper = chart.addLineSeries({ ...bbOpts, color: 'rgba(99,102,241,0.6)' });
      const lower = chart.addLineSeries({ ...bbOpts, color: 'rgba(99,102,241,0.6)' });
      const mid   = chart.addLineSeries({ ...bbOpts, color: 'rgba(99,102,241,0.3)', lineStyle: 2 });
      const valid = bbData.map((b: { upper: number, mid: number, lower: number } | null, i: number) => b ? { time: times[i], upper: b.upper, mid: b.mid, lower: b.lower } : null).filter(Boolean) as { time: Time, upper: number, mid: number, lower: number }[];
      upper.setData(valid.map(d => ({ time: d.time, value: d.upper })));
      lower.setData(valid.map(d => ({ time: d.time, value: d.lower })));
      mid.setData(valid.map(d => ({ time: d.time, value: d.mid })));
    }

    let primarySubSeries: ISeriesApi<'Line'> | null = null;

    if (subPanel !== 'none' && subRef.current) {
      const sub = createChart(subRef.current, {
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: false },
        rightPriceScale: { borderColor: borderColor, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      subChartRef.current = sub;

      if (subPanel === 'RSI') {
        const rsiLine = sub.addLineSeries({ color: '#38bdf8', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false });
        rsiLine.setData(times.map((t, i) => ({ time: t, value: rsiIndicatorData[i] })));
        const ob = sub.addLineSeries({ color: 'rgba(251,113,133,0.4)', lineWidth: 1 as LineWidth, lineStyle: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const os = sub.addLineSeries({ color: 'rgba(52,211,153,0.4)',  lineWidth: 1 as LineWidth, lineStyle: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        ob.setData(times.map(t => ({ time: t, value: 70 })));
        os.setData(times.map(t => ({ time: t, value: 30 })));
        primarySubSeries = rsiLine;
      } else if (subPanel === 'MACD') {
        const macdLine = sub.addLineSeries({ color: '#34d399', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const sigLine  = sub.addLineSeries({ color: '#fb923c', lineWidth: 1 as LineWidth,   crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const histBar  = sub.addHistogramSeries({ color: '#6366f1', priceScaleId: 'right' });
        macdLine.setData(times.map((t, i) => ({ time: t, value: macdData[i].macd })));
        sigLine.setData( times.map((t, i) => ({ time: t, value: macdData[i].signal })));
        histBar.setData( times.map((t, i) => ({ time: t, value: macdData[i].hist, color: macdData[i].hist >= 0 ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)' })));
        primarySubSeries = macdLine;
      }
    }

    const syncTimeScale = (range: LogicalRange | null, source: IChartApi) => {
      if (!range) return;
      if (source !== chartRef.current && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range);
      if (source !== volChartRef.current && volChartRef.current) volChartRef.current.timeScale().setVisibleLogicalRange(range);
      if (source !== subChartRef.current && subChartRef.current) subChartRef.current.timeScale().setVisibleLogicalRange(range);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, chart));
    if (volChartRef.current) volChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, volChartRef.current!));
    if (subChartRef.current) subChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, subChartRef.current!));

    const last = rows[rows.length - 1];
    const timeToIndex = new Map(rows.map((r, i) => [r.time, i]));

    const setLeg = (r: typeof last) => {
      if (!r) return;
      const o = document.getElementById('legend-open');
      const h = document.getElementById('legend-high');
      const l = document.getElementById('legend-low');
      const c = document.getElementById('legend-close');
      const v = document.getElementById('legend-vol');
      const e20 = document.getElementById('legend-ema20');
      const e50 = document.getElementById('legend-ema50');
      const rsi = document.getElementById('legend-rsi');
      const macd = document.getElementById('legend-macd');
      const macdSig = document.getElementById('legend-macd-sig');
      const macdHist = document.getElementById('legend-macd-hist');

      if (o) o.textContent = r.open.toFixed(2);
      if (h) h.textContent = r.high.toFixed(2);
      if (l) l.textContent = r.low.toFixed(2);
      if (c) {
        c.textContent = r.close.toFixed(2);
        c.className = r.close >= r.open ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';
      }
      if (v) v.textContent = Math.round(r.volume).toLocaleString();
      
      const idx = rows.indexOf(r);
      if (e20) e20.textContent = idx >= 0 && !isNaN(ema1Data[idx]) ? ema1Data[idx].toFixed(2) : '-';
      if (e50) e50.textContent = idx >= 0 && !isNaN(ema2Data[idx]) ? ema2Data[idx].toFixed(2) : '-';
      if (rsi) rsi.textContent = idx >= 0 && !isNaN(rsiIndicatorData[idx]) ? rsiIndicatorData[idx].toFixed(1) : '-';
      if (macd && macdData[idx]) macd.textContent = !isNaN(macdData[idx].macd) ? macdData[idx].macd.toFixed(2) : '-';
      if (macdSig && macdData[idx]) macdSig.textContent = !isNaN(macdData[idx].signal) ? macdData[idx].signal.toFixed(2) : '-';
      if (macdHist && macdData[idx]) macdHist.textContent = !isNaN(macdData[idx].hist) ? macdData[idx].hist.toFixed(2) : '-';
    };

    // Initial legend update
    setTimeout(() => setLeg(last), 0);

    const updateLegendFromTime = (time: Time) => {
      const idx = timeToIndex.get(time);
      if (idx !== undefined) {
        setLeg(rows[idx]);
      }
    };

    const syncCrosshair = (p: MouseEventParams, sourceChart: IChartApi) => {
      if (p.time !== undefined) {
        updateLegendFromTime(p.time);
        const idx = timeToIndex.get(p.time as Time);
        
        // Sync to main chart
        if (sourceChart !== chartRef.current && chartRef.current && candles) {
          const price = idx !== undefined ? rows[idx].close : 0;
          chartRef.current.setCrosshairPosition(price, p.time as Time, candles);
        }
        
        // Sync to volume chart
        if (sourceChart !== volChartRef.current && volChartRef.current && volSeries) {
          const price = idx !== undefined ? rows[idx].volume : 0;
          volChartRef.current.setCrosshairPosition(price, p.time as Time, volSeries);
        }
        
        // Sync to sub chart
        if (sourceChart !== subChartRef.current && subChartRef.current && primarySubSeries) {
          let price = 0;
          if (idx !== undefined) {
            if (subPanel === 'RSI') price = rsiIndicatorData[idx];
            else if (subPanel === 'MACD') price = macdData[idx].macd;
          }
          subChartRef.current.setCrosshairPosition(price, p.time as Time, primarySubSeries);
        }
      } else {
        setLeg(last);
        if (sourceChart !== chartRef.current && chartRef.current) chartRef.current.clearCrosshairPosition();
        if (sourceChart !== volChartRef.current && volChartRef.current) volChartRef.current.clearCrosshairPosition();
        if (sourceChart !== subChartRef.current && subChartRef.current) subChartRef.current.clearCrosshairPosition();
      }
    };

    chart.subscribeCrosshairMove(p => syncCrosshair(p, chart));
    if (volChartRef.current) volChartRef.current.subscribeCrosshairMove(p => syncCrosshair(p, volChartRef.current!));
    if (subChartRef.current) subChartRef.current.subscribeCrosshairMove(p => syncCrosshair(p, subChartRef.current!));

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resize = () => {
      // Direct update for better performance
      if (mainRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
      }
      if (subRef.current && subChartRef.current) {
        subChartRef.current.applyOptions({ width: subRef.current.clientWidth, height: subRef.current.clientHeight });
      }
      if (volRef.current && volChartRef.current) {
        volChartRef.current.applyOptions({ width: volRef.current.clientWidth, height: volRef.current.clientHeight });
      }
    };

    const ro = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 100);
    });
    if (mainRef.current) ro.observe(mainRef.current);
    if (subRef.current) ro.observe(subRef.current);
    if (volRef.current) ro.observe(volRef.current);

    resize();

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      ro.disconnect();
      chart.remove();
      subChartRef.current?.remove();
      volChartRef.current?.remove();
      chartRef.current = null; subChartRef.current = null; volChartRef.current = null;
    };
  }, [history, indics, subPanel, ema1Period, ema2Period, isLight, ema1Data, ema2Data, rsiIndicatorData, macdData, bbData, focusMode]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      {/* Top Bar for Controls and Legend */}
      <div className="flex flex-col gap-2 p-2 shrink-0 z-20 bg-[var(--bg-color)] border-b border-[var(--border-color)] relative">
        {/* Controls */}
        <div className="flex items-center gap-2 pb-1 relative" ref={settingsRef}>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={safeCn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all",
              showSettings ? "bg-[var(--border-color)] text-[var(--text-color)]" : "text-[var(--text-color)] opacity-70 hover:opacity-100 hover:bg-[var(--border-color)]"
            )}
          >
            <Settings className="w-4 h-4" />
            <span>指標設定</span>
            <ChevronDown className={safeCn("w-3 h-3 transition-transform", showSettings && "rotate-180")} />
          </button>

          {/* Dropdown Menu */}
          {showSettings && (
            <div className="absolute top-full left-2 mt-1 w-64 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-2xl p-3 z-[60] flex flex-col gap-4">
              {/* Main Overlays */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-[var(--text-color)] opacity-50 uppercase tracking-wider">主圖疊加</div>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={safeCn("w-4 h-4 rounded border flex items-center justify-center transition-colors", indics.has('EMA1') ? "bg-amber-500 border-amber-500" : "border-[var(--border-color)] group-hover:border-[var(--text-color)]")}>
                    {indics.has('EMA1') && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={indics.has('EMA1')} onChange={() => toggleIndic('EMA1')} />
                  <span className="text-sm text-[var(--text-color)] flex-1">EMA 1</span>
                  <input 
                    type="number" 
                    value={ema1Period}
                    onChange={(e) => setEmaPersist(1, parseInt(e.target.value) || 20)}
                    className="w-14 bg-[var(--bg-color)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-center text-amber-400 focus:outline-none focus:border-amber-500/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={safeCn("w-4 h-4 rounded border flex items-center justify-center transition-colors", indics.has('EMA2') ? "bg-violet-500 border-violet-500" : "border-[var(--border-color)] group-hover:border-[var(--text-color)]")}>
                    {indics.has('EMA2') && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={indics.has('EMA2')} onChange={() => toggleIndic('EMA2')} />
                  <span className="text-sm text-[var(--text-color)] flex-1">EMA 2</span>
                  <input 
                    type="number" 
                    value={ema2Period}
                    onChange={(e) => setEmaPersist(2, parseInt(e.target.value) || 50)}
                    className="w-14 bg-[var(--bg-color)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-center text-violet-400 focus:outline-none focus:border-violet-500/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={safeCn("w-4 h-4 rounded border flex items-center justify-center transition-colors", indics.has('BB') ? "bg-indigo-500 border-indigo-500" : "border-[var(--border-color)] group-hover:border-[var(--text-color)]")}>
                    {indics.has('BB') && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={indics.has('BB')} onChange={() => toggleIndic('BB')} />
                  <span className="text-sm text-[var(--text-color)]">Bollinger Bands</span>
                </label>
              </div>

              <div className="h-px bg-[var(--border-color)]" />

              {/* Sub Panels */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-[var(--text-color)] opacity-50 uppercase tracking-wider">副圖指標</div>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={safeCn("w-4 h-4 rounded border flex items-center justify-center transition-colors", indics.has('Volume') ? "bg-emerald-500 border-emerald-500" : "border-[var(--border-color)] group-hover:border-[var(--text-color)]")}>
                    {indics.has('Volume') && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={indics.has('Volume')} onChange={() => toggleIndic('Volume')} />
                  <span className="text-sm text-[var(--text-color)]">Volume</span>
                </label>

                <div className="flex items-center gap-2 mt-1 bg-[var(--bg-color)] p-1 rounded-lg">
                  {(['none','RSI','MACD'] as SubPanel[]).map(p => (
                    <button key={p} onClick={() => setSubPanelPersist(p)}
                      className={safeCn('flex-1 px-2 py-1 rounded-md text-xs font-bold transition-all',
                        subPanel===p ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-color)] opacity-50 hover:opacity-100 hover:bg-[var(--border-color)]')}>
                      {p==='none'?'無':p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar text-xs sm:text-sm font-mono pointer-events-none pb-1">
          <div className="flex items-center gap-1 text-[var(--text-color)] opacity-70"><span>O</span><span id="legend-open" className="font-bold opacity-100">-</span></div>
          <div className="flex items-center gap-1 text-[var(--text-color)] opacity-70"><span>H</span><span id="legend-high" className="font-bold opacity-100">-</span></div>
          <div className="flex items-center gap-1 text-[var(--text-color)] opacity-70"><span>L</span><span id="legend-low" className="font-bold opacity-100">-</span></div>
          <div className="flex items-center gap-1 text-[var(--text-color)] opacity-70"><span>C</span><span id="legend-close" className="font-bold opacity-100">-</span></div>
          
          {indics.has('Volume') && <div className="flex items-center gap-1 text-indigo-400/70"><span>Vol</span><span id="legend-vol" className="text-indigo-300">-</span></div>}
          {indics.has('EMA1') && <div className="flex items-center gap-1 text-amber-400/70"><span>EMA{ema1Period}</span><span id="legend-ema20" className="text-amber-300">-</span></div>}
          {indics.has('EMA2') && <div className="flex items-center gap-1 text-violet-400/70"><span>EMA{ema2Period}</span><span id="legend-ema50" className="text-violet-300">-</span></div>}
          {subPanel==='RSI' && <div className="flex items-center gap-1 font-bold text-sky-400"><span>RSI</span><span id="legend-rsi">-</span></div>}
          {subPanel==='MACD' && (
            <div className="flex items-center gap-2 font-bold text-xs">
              <span className="text-sky-400">MACD <span id="legend-macd">-</span></span>
              <span className="text-amber-400">Sig <span id="legend-macd-sig">-</span></span>
              <span className="text-[var(--text-color)] opacity-70">Hist <span id="legend-macd-hist">-</span></span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <div ref={mainRef} className="absolute inset-0" />
      </div>

      {indics.has('Volume') && (
        <div className="shrink-0 border-t border-[var(--border-color)] relative" style={{ height: SUB_H }}>
          <span className="absolute top-1 left-1.5 text-xs text-[var(--text-color)] opacity-50 font-bold z-10 pointer-events-none">Volume</span>
          <div ref={volRef} className="w-full h-full" />
        </div>
      )}

      {subPanel !== 'none' && (
        <div className="shrink-0 border-t border-[var(--border-color)] relative" style={{ height: SUB_H }}>
          <span className="absolute top-1 left-1.5 text-xs text-[var(--text-color)] opacity-50 font-bold z-10 pointer-events-none">{subPanel}</span>
          <div ref={subRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}