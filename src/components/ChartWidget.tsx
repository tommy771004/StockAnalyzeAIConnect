import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createChart, IChartApi, ISeriesApi, ColorType, Time, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';
import { cn as safeCn } from '../lib/utils';
import { Loader2, Settings2, BarChart3, TrendingUp, Activity, Plus, Maximize2, Layers } from 'lucide-react';
import { calcSMA, calcRSI, calcMACD } from '../lib/indicators';
import type { TickData } from '../workers/socket.worker';

interface Props {
  symbol?: string;
  data?: HistoricalData[];
  timeframe?: string;
  /**
   * When true, ChartWidget creates a socket.worker.ts Worker and subscribes to
   * live TICK_UPDATE messages.  Ticks update the chart directly via series.update()
   * on mainSeriesRef — no React state is touched (Rule: Frontend Performance §2).
   */
  liveMode?: boolean;
  focusMode?: boolean;
  onTimeframeChange?: (timeframe: string) => void;
}

type ChartType = 'candle' | 'line' | 'area';

function resolveWsUrl(): string | null {
  const configuredWs = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (configuredWs) return configuredWs;

  const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (apiBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl, window.location.origin);
      apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const normalizedPath = apiUrl.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
      apiUrl.pathname = `${normalizedPath}/ws`.replace(/\/{2,}/g, '/');
      return apiUrl.toString();
    } catch {
      // Ignore invalid env URL and continue fallback checks.
    }
  }

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalHost) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/ws`;
  }

  return null;
}

function resolveApiBaseUrl(): string | undefined {
  const configuredApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!configuredApi) return undefined;
  try {
    const url = new URL(configuredApi, window.location.origin);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

const ChartWidget: React.FC<Props> = ({ symbol = "AAPL", data = [], liveMode = false, focusMode = false, timeframe: timeframeProp, onTimeframeChange }) => {
  const { t } = useTranslation();
  const [internalTimeframe, setInternalTimeframe] = useState("1D");
  const timeframe = timeframeProp || internalTimeframe;
  const setTimeframe = (t: string) => {
    setInternalTimeframe(t);
    if (onTimeframeChange) onTimeframeChange(t);
  };
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const dataRef = useRef<any[]>([]);
  const indicRef = useRef<{rsi: number[], macd: any[]}>({rsi: [], macd: []});
  const logicalRangeRef = useRef<any>(null);
  const prevChartTypeRef = useRef<ChartType | null>(null);
  // Worker ref — never triggers re-render; lives in the background thread
  const workerRef = useRef<Worker | null>(null);
  
  const { settings } = useSettings();
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [showSMA, setShowSMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  
  const [hoverData, setHoverData] = useState<any>(null);

  const isDark = settings.theme !== 'light';

  // Memoized data processing for performance
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(d => {
        const timestamp = new Date(d.date).getTime();
        return {
          time: (timestamp / 1000) as Time,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          value: Number(d.volume || 0),
          color: Number(d.close) >= Number(d.open) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        };
      });
  }, [data]);

  // Handle initial view and data state
  const isInitializedRef = useRef(false);
  
  useEffect(() => {
    const closes = processedData.map(d => d.close);
    indicRef.current = {
      rsi: calcRSI(closes, 14),
      macd: calcMACD(closes)
    };
  }, [processedData]);

  // Reset initialization when symbol changes
  useEffect(() => {
    isInitializedRef.current = false;
    logicalRangeRef.current = null;
  }, [symbol, timeframe]);

  /**
   * Live-mode Worker integration (Rule: Frontend Performance §2 "Golden Rule")
   * - Worker is created once and subscribes to the current symbol.
   * - Incoming TICK_UPDATE messages call series.update() directly via useRef.
   * - No useState / Zustand — zero re-renders on tick.
   */
  useEffect(() => {
    if (!liveMode) return;

    const wsUrl = resolveWsUrl();
    const apiBaseUrl = resolveApiBaseUrl();
    if (!wsUrl) {
      console.info('[ChartWidget] No WS endpoint configured; worker will use HTTP polling fallback.');
    }
    const worker = new Worker(new URL('../workers/socket.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.postMessage({ type: 'CONNECT', wsUrl: wsUrl ?? undefined, apiBaseUrl });
    worker.postMessage({ type: 'SUBSCRIBE', symbol });

    worker.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as { type: string; symbol: string; data: TickData };
      if (msg.type !== 'TICK_UPDATE' || msg.symbol !== symbol) return;
      if (!mainSeriesRef.current) return;

      const tick = msg.data;
      mainSeriesRef.current.update({
        time: Math.floor(tick.timestamp / 1000) as Time,
        open:  tick.price,
        high:  tick.price,
        low:   tick.price,
        close: tick.price,
      });
    });

    return () => {
      worker.postMessage({ type: 'UNSUBSCRIBE', symbol });
      worker.postMessage({ type: 'DISCONNECT' });
      worker.terminate();
      workerRef.current = null;
    };
  }, [liveMode, symbol]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const bgColor = isDark ? (focusMode ? '#131722' : 'transparent') : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    // Cleanup previous chart if it exists
    if (chartRef.current) {
      chartRef.current.remove();
    }
    // Reset so the data effect re-applies the initial range on next render
    isInitializedRef.current = false;
    logicalRangeRef.current = null;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: 12, // Increased for readability
        fontFamily: 'Inter, var(--font-heading), sans-serif',
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: 1,
        vertLine: { 
          labelBackgroundColor: '#6366f1',
          width: 1,
          style: 3, // Dashed
        },
        horzLine: { 
          labelBackgroundColor: '#6366f1',
          width: 1,
          style: 3, // Dashed
        },
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        barSpacing: 12,
        minBarSpacing: 1,
tickMarkFormatter: (time: number) => {
  const date = new Date(time * 1000);
  if (["1D", "5D", "1W"].includes(timeframe)) {
    return date.toLocaleTimeString("zh-TW", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Taipei"
    });
  } else {
    return date.toLocaleDateString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Taipei"
    });
  }
},
},
      rightPriceScale: {
        borderColor: gridColor,
        autoScale: true,
        alignLabels: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      localization: {
        locale: 'zh-Hant-TW',
        dateFormat: 'yyyy/MM/dd',
       
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });
    
    chartRef.current = chart;

    // Add Main Series
    let series: ISeriesApi<any>;
    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
    } else if (chartType === 'area') {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#6366f1',
        topColor: 'rgba(99, 102, 241, 0.4)',
        bottomColor: 'rgba(99, 102, 241, 0)',
        lineWidth: 2,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: '#6366f1',
        lineWidth: 2,
      });
    }
    mainSeriesRef.current = series;

    // Add Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Add SMA
    const smaSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    smaSeriesRef.current = smaSeries;

    // Preserve logical range when chart is recreated
    // Crosshair move handler
    chart.subscribeCrosshairMove(param => {
      if (
        !param ||
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setHoverData(null);
      } else {
        const timeVal = param.time;
        
        // Safety check for series availability
        if (!mainSeriesRef.current || !volumeSeriesRef.current || !smaSeriesRef.current) return;

        const mainData = param.seriesData.get(mainSeriesRef.current!) as any;
        const volData = param.seriesData.get(volumeSeriesRef.current!) as any;
        const smaVal = param.seriesData.get(smaSeriesRef.current!) as any;

        // Use ref-based data to avoid stale closures
        const localData = dataRef.current;
        const localIndic = indicRef.current;
        const dataIndex = localData.findIndex(d => d.time === timeVal);

        if (dataIndex === -1) {
          setHoverData(null);
          return;
        }

        const currentItem = localData[dataIndex];
        const timestamp = typeof timeVal === 'number' ? timeVal * 1000 : new Date(timeVal as string).getTime();
        const fullDate = new Date(timestamp).toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        setHoverData({
          time: fullDate,
          open: mainData?.open ?? currentItem?.open ?? 0,
          high: mainData?.high ?? currentItem?.high ?? 0,
          low: mainData?.low ?? currentItem?.low ?? 0,
          close: mainData?.close ?? mainData?.value ?? currentItem?.close ?? 0,
          volume: volData?.value ?? currentItem?.value ?? 0,
          sma: smaVal?.value ?? null,
          rsi: localIndic.rsi?.[dataIndex] ?? null,
          macd: localIndic.macd?.[dataIndex]?.histogram ?? null,
        });
      }
    });

    // Resize handler using ResizeObserver
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length > 0 && chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [isDark, focusMode]); // Removed chartType from here to prevent full chart reset

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          if (["1D", "5D", "1W"].includes(timeframe)) {
            return date.toLocaleTimeString("zh-TW", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Taipei"
            });
          } else {
            return date.toLocaleDateString("zh-TW", {
              month: "2-digit",
              day: "2-digit",
              timeZone: "Asia/Taipei"
            });
          }
        }
      }
    });
  }, [timeframe]);

  // Data & Series update effect - Separated from Chart creation to preserve state
  useEffect(() => {
    if (!chartRef.current || !processedData.length) return;

    const chart = chartRef.current;

    // 1. Handle Series Creation - only re-create when chart type changes
    const chartTypeChanged = prevChartTypeRef.current !== null && prevChartTypeRef.current !== chartType;
    prevChartTypeRef.current = chartType;
    try {
      if (!mainSeriesRef.current || chartTypeChanged) {
        if (mainSeriesRef.current && chartTypeChanged) {
          // Save viewport before removing series
          logicalRangeRef.current = chart.timeScale().getVisibleLogicalRange();
          chart.removeSeries(mainSeriesRef.current);
        }
        if (chartType === 'candle') {
          mainSeriesRef.current = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
          });
        } else if (chartType === 'area') {
          mainSeriesRef.current = chart.addSeries(AreaSeries, {
            lineColor: '#6366f1',
            topColor: 'rgba(99, 102, 241, 0.4)',
            bottomColor: 'rgba(99, 102, 241, 0)',
            lineWidth: 3,
          });
        } else {
          mainSeriesRef.current = chart.addSeries(LineSeries, {
            color: '#6366f1',
            lineWidth: 3,
          });
        }
      }

      // 2. Refresh Data
      const uniqueData = Array.from(new Map(processedData.map(item => [item.time, item])).values());
      
      // Main series
      if (chartType === 'candle') {
        const candleData = uniqueData.map(d => ({
          time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
        }));
        mainSeriesRef.current.setData(candleData);
      } else {
        const lineData = uniqueData.map(d => ({
          time: d.time, value: d.close
        }));
        mainSeriesRef.current.setData(lineData);
      }

      // Volume
      if (showVolume && volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(uniqueData.map(d => ({
          time: d.time, value: d.value, color: d.color
        })));
      } else if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData([]);
      }

      // SMA (20)
      if (showSMA && smaSeriesRef.current) {
        const closes = uniqueData.map(d => d.close);
        const smaValues = calcSMA(closes, 20);
        const smaData = uniqueData
          .map((d, i) => ({ time: d.time, value: smaValues[i] }))
          .filter(v => v.value !== null) as { time: Time, value: number }[];
        smaSeriesRef.current.setData(smaData);
      } else if (smaSeriesRef.current) {
        smaSeriesRef.current.setData([]);
      }

      // 3. Handle viewport
      if (!isInitializedRef.current) {
        // First load: show all data (minimum zoom level)
        chart.timeScale().fitContent();
        isInitializedRef.current = true;
      } else if (chartTypeChanged && logicalRangeRef.current) {
        // Restore saved viewport only when switching chart type
        chart.timeScale().setVisibleLogicalRange(logicalRangeRef.current);
        logicalRangeRef.current = null;
      }
      // Normal data refresh: setData() preserves existing viewport automatically
      
      dataRef.current = uniqueData;
    } catch (err) {
      console.warn("Failed to update chart series or data", err);
    }
  }, [processedData, chartType, showSMA, showVolume, isDark, symbol]);

  return (
    <div className={safeCn(
      "w-full h-full flex flex-col overflow-hidden relative",
      focusMode && "bg-[#131722]"
    )}>
      {/* Top Toolbar - Stock Analysis Style */}
      <div className="flex flex-nowrap items-center justify-between px-2 py-1 border-b border-zinc-200/30 dark:border-zinc-800/30 bg-zinc-50/20 dark:bg-zinc-900/20 z-20 overflow-x-auto no-scrollbar gap-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-max">
          {/* Chart Types */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setChartType('candle')}
              className={safeCn("p-2 rounded-md transition-all active:scale-95", chartType === 'candle' ? "bg-indigo-500/20 text-indigo-400" : "text-zinc-500 hover:bg-white/5")}
              title={t('chart.candle', 'K線圖')}
            >
              <BarChart3 size={18} />
            </button>
            <button 
              onClick={() => setChartType('area')}
              className={safeCn("p-2 rounded-md transition-all active:scale-95", chartType === 'area' ? "bg-indigo-500/20 text-indigo-400" : "text-zinc-500 hover:bg-white/5")}
              title={t('chart.area', '面積圖')}
            >
              <TrendingUp size={18} />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-300/30 dark:bg-zinc-700/30 mx-2" />

          {/* Indicators */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSMA(!showSMA)}
              className={safeCn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all border shrink-0",
                showSMA 
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                  : "border-zinc-200/30 dark:border-zinc-800/30 text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
              )}
            >
              SMA(20)
            </button>
            <button 
              onClick={() => setShowVolume(!showVolume)}
              className={safeCn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all border shrink-0",
                showVolume 
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
                  : "border-zinc-200/30 dark:border-zinc-800/30 text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
              )}
            >
              交易量
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
                logicalRangeRef.current = chartRef.current.timeScale().getVisibleLogicalRange();
              }
            }}
            className="p-1.5 text-zinc-500 hover:text-indigo-500 hover:bg-white/5 rounded-md transition-all" 
            title={t('chart.fitContent', '縮放至完整數據')}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-white/5 dark:bg-black/10">
        {/* Floating Timeframe Group - Integrated into Chart with Zero-Clutter Transparency */}
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1 p-0.5 pointer-events-auto bg-zinc-950/20 backdrop-blur-sm rounded-lg">
          {['1D', '5D', '1W', '1M', '6M', 'YTD', '1Y'].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTimeframe(t);
                onTimeframeChange?.(t);
              }}
              className={safeCn(
                "px-2 py-1 text-[11px] font-bold transition-all text-center leading-none h-6 min-w-[28px] flex items-center justify-center rounded-md",
                timeframe === t 
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-105" 
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {(!data || data.length === 0) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <span className="text-[10px] font-black text-zinc-500 max-w-[200px] text-center uppercase tracking-[0.2em]">
              {t('chart.loading', '正在獲取市場行情...')}
            </span>
          </div>
        )}
        <div 
          ref={chartContainerRef}
          className="w-full h-full absolute inset-0"
        />
        
        {/* Floating Tooltip - High Interaction */}
        {hoverData && (
          <div className="absolute top-3 left-3 z-40 bg-zinc-950/85 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-2xl pointer-events-none flex flex-col gap-1.5 min-w-[160px] shadow-indigo-500/10">
             <div className="text-[11px] text-zinc-400 font-bold mb-1 border-b border-white/10 pb-1.5 uppercase tracking-wide flex justify-between items-center">
               <span>{t('chart.replay', '行情回放')}</span>
               <span className="font-mono text-[10px] opacity-70">{hoverData.time}</span>
             </div>
             <div className="grid grid-cols-2 gap-x-4 gap-y-1">
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-zinc-500 font-bold">{t('chart.open', '開')}:</span>
                 <span className="text-[11px] font-mono font-bold text-zinc-100">{Number(hoverData.open ?? 0).toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-zinc-500 font-bold">{t('chart.high', '高')}:</span>
                 <span className="text-[11px] font-mono font-bold text-emerald-400">{Number(hoverData.high ?? 0).toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-zinc-500 font-bold">{t('chart.low', '低')}:</span>
                 <span className="text-[11px] font-mono font-bold text-rose-400">{Number(hoverData.low ?? 0).toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-zinc-500 font-bold">{t('chart.close', '收')}:</span>
                 <span className="text-[11px] font-mono font-bold text-zinc-100">{Number(hoverData.close ?? 0).toFixed(2)}</span>
               </div>
             </div>
             <div className="flex justify-between items-center mt-1 border-t border-white/10 pt-1.5">
               <span className="text-[10px] text-zinc-500 font-bold uppercase">{t('chart.volBase', '成交量')}:</span>
               <span className="text-[11px] font-mono font-bold text-zinc-300">{(Number(hoverData.volume ?? 0) / 1000).toLocaleString('zh-TW', { maximumFractionDigits: 1 })}K</span>
             </div>
             {hoverData.sma !== undefined && hoverData.sma !== null && (
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-amber-500 font-bold uppercase">SMA:</span>
                 <span className="text-[11px] font-mono font-bold text-amber-400">{Number(hoverData.sma).toFixed(2)}</span>
               </div>
             )}
             {hoverData.rsi !== undefined && hoverData.rsi !== null && (
               <div className="flex justify-between items-center">
                 <span className="text-[10px] text-indigo-400 font-bold uppercase">RSI:</span>
                 <span className="text-[11px] font-mono font-bold text-indigo-300">{Number(hoverData.rsi).toFixed(2)}</span>
               </div>
             )}
             {hoverData.macd !== undefined && hoverData.macd !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">MACD:</span>
                  <span className={safeCn("text-[11px] font-mono font-bold", Number(hoverData.macd) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {Number(hoverData.macd).toFixed(2)}
                  </span>
                </div>
             )}
          </div>
        )}

        {/* Floating Timeframe Badge (Minimalized) */}
        {!focusMode && data.length > 0 && (
          <div className="absolute top-3 left-3 z-10 pointer-events-none select-none flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/30 uppercase tracking-tighter backdrop-blur-md">
              {timeframe}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartWidget;
