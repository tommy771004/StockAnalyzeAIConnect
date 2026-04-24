import React from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as api from '../services/api';
import { analyzeStock, analyzeNewsSentiment } from '../services/aiService';
import { isTW } from '../utils/helpers';
import { _rsi, _macd, _sma } from '../utils/math';
import { Quote, HistoricalData, NewsItem, CalendarData, TWSEData, SentimentData, AIAnalysisResult, MTFTrendRecord } from '../types';

interface UseStockAnalysisProps {
  symbol: string;
  model: string;
  systemInstruction?: string;
  activeTab: 'news' | 'calendar' | 'mtf';
}

export function useStockAnalysis({ symbol, model, systemInstruction = '', activeTab }: UseStockAnalysisProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [hist, setHist] = useState<HistoricalData[]>([]);
  const [aiAns, setAiAns] = useState<AIAnalysisResult | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'analyzing' | 'error'>('idle');
  
  const [news, setNews] = useState<NewsItem[]>([]);
  const [cal, setCal] = useState<CalendarData>({});
  const [twse, setTwse] = useState<TWSEData | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [mtfData, setMtfData] = useState<MTFTrendRecord | null>(null);
  const [mtfStatus, setMtfStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [newsStatus, setNewsStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [dataState, setDataState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error', error?: string }>({ status: 'idle' });

  const mountedRef = useRef(true);
  const analyzedNewsRef = useRef<NewsItem[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSet = useCallback(<T,>(fn: React.Dispatch<React.SetStateAction<T>>) => (v: T) => {
    if (mountedRef.current) fn(v);
  }, []);

  const norm = useMemo(() => isTW(symbol) && !symbol.includes('.') ? `${symbol}.TW` : symbol, [symbol]);

  const [timeframe, setTimeframe] = useState('1Y');

  const loadData = useCallback(async (selectedTimeframe = timeframe) => {
    setDataState({ status: 'loading' });
    safeSet(setQuote)(null);
    safeSet(setHist)([]);
    safeSet(setAiAns)(null);
    safeSet(setTwse)(null);
    safeSet(setMtfData)(null);
    try {
      let period1 = "";
      let interval = "1d";
      const now = new Date();

      switch (selectedTimeframe) {
        case '1D':
          now.setDate(now.getDate() - 1);
          period1 = now.toISOString().split('T')[0];
          interval = '1m';
          break;
        case '5D':
          now.setDate(now.getDate() - 5);
          period1 = now.toISOString().split('T')[0];
          interval = '5m';
          break;
        case '1M':
          now.setMonth(now.getMonth() - 1);
          period1 = now.toISOString().split('T')[0];
          interval = '1h';
          break;
        case '6M':
          now.setMonth(now.getMonth() - 6);
          period1 = now.toISOString().split('T')[0];
          interval = '1d';
          break;
        case 'YTD':
          period1 = `${now.getFullYear()}-01-01`;
          interval = '1d';
          break;
        case '1Y':
        default:
          now.setFullYear(now.getFullYear() - 3); // Fetch 3 years for 1Y to have enough for indicators
          period1 = now.toISOString().split('T')[0];
          interval = '1d';
          break;
      }

      const [q, h] = await Promise.allSettled([
        api.getQuote(norm),
        api.getHistory(norm, { period1, interval }),
      ]);

      if (!mountedRef.current) return;

      if (q.status === 'fulfilled' && q.value) {
        safeSet(setQuote)(q.value);
      } else {
        setDataState({ status: 'error', error: `無法取得 ${symbol} 報價` });
        return;
      }

      if (h.status === 'fulfilled' && Array.isArray(h.value)) {
        const map = new Map<number, HistoricalData>();
        h.value.forEach(r => {
          if (!r?.date) return;
          const c = Number(r.close);
          if (!isFinite(c) || c <= 0) return;
          const ts = Math.floor(new Date(r.date).getTime() / 1000);
          if (!isFinite(ts)) return;
          map.set(ts, {
            date: r.date,
            open: Number(r.open ?? c) || c,
            high: Number(r.high ?? c) || c,
            low: Number(r.low ?? c) || c,
            close: c,
            volume: Number(r.volume) || 0
          });
        });
        const rows = Array.from(map.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        safeSet(setHist)(rows);
      }

      if (isTW(norm)) {
        api.getTWSEStock(norm.replace(/\.TW(O)?$/, '')).then(t => {
          if (mountedRef.current && t) safeSet(setTwse)(t);
        }).catch(() => { });
      }
      setDataState({ status: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '資料載入失敗';
      if (mountedRef.current) setDataState({ status: 'error', error: msg });
    }
  }, [norm, symbol, safeSet, timeframe]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const closes = useMemo(() => hist.map(d => d.close).filter(isFinite), [hist]);

  const indic = useMemo(() => {
    if (closes.length < 50) return null;
    try {
      const rsiVal = _rsi(closes);
      const macdVal = _macd(closes);
      const sma20Val = _sma(closes, 20);
      const sma50Val = _sma(closes, 50);

      // 綜合建議邏輯 (繁體中文)
      let score = 0;
      if (rsiVal < 30) score += 2; // 超賣
      if (rsiVal > 70) score -= 2; // 超買

      if (sma20Val && sma50Val && sma20Val > sma50Val) score += 1; // 黃金交叉
      if (sma20Val && sma50Val && sma20Val < sma50Val) score -= 1; // 死亡交叉

      if (macdVal && macdVal.histogram > 0) score += 1;
      if (macdVal && macdVal.histogram < 0) score -= 1;

      let rec = '觀望';
      if (score >= 3) rec = '強烈買進';
      else if (score >= 1) rec = '建議買進';
      else if (score <= -3) rec = '強烈賣出';
      else if (score <= -1) rec = '建議賣出';

      return { 
        rsi: rsiVal, 
        macd: macdVal, 
        sma20: sma20Val, 
        sma50: sma50Val,
        recommendation: rec,
        trend: score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral' as 'bullish' | 'bearish' | 'neutral',
        action: rec
      };
    } catch (e) {
      console.warn('[indicators]', e);
      return null;
    }
  }, [closes]);

  // ── AI Analysis ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quote || hist.length < 10) return;
    let cancelled = false;
    setAiStatus('analyzing');
    analyzeStock(symbol, quote, hist.slice(-30), model, systemInstruction)
      .then(r => {
        if (!cancelled && mountedRef.current) {
          safeSet(setAiAns)(r);
          setAiStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setAiStatus('error');
      });
    return () => { cancelled = true; };
  }, [symbol, model, systemInstruction, quote, hist, safeSet]);

  // ── News ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    setNewsStatus('loading');
    api.getNews(symbol)
      .then(d => {
        if (live) {
          safeSet(setNews)(Array.isArray(d) ? d : []);
          setNewsStatus('idle');
        }
      })
      .catch(() => {
        if (live) setNewsStatus('error');
      });
    return () => { live = false; };
  }, [symbol, safeSet]);

  // ── News Sentiment ────────────────────────────────────────────────────────
  useEffect(() => {
    if (news.length === 0) return;
    if (analyzedNewsRef.current === news) return;
    analyzedNewsRef.current = news;
    let cancelled = false;
    analyzeNewsSentiment(news).then(r => {
      if (!cancelled && mountedRef.current) setSentiment(r as SentimentData);
    });
    return () => { cancelled = true; };
  }, [activeTab, news, safeSet]);

  // ── Calendar ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    api.getCalendar(symbol)
      .then(d => { if (live) safeSet(setCal)(d ?? {}); })
      .catch(() => { if (live) safeSet(setCal)({}); });
    return () => { live = false; };
  }, [symbol, safeSet]);

  // ── MTF Analysis ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'mtf') return;
    if (mtfData) return;
    let cancelled = false;
    setMtfStatus('loading');
    (async () => {
      try {
        const d = new Date();
        d.setDate(d.getDate() - 365);
        const p1d = d.toISOString().split('T')[0];

        const mtf = await api.getMTF(norm, { period1: p1d });
        if (!cancelled && mountedRef.current) {
          safeSet(setMtfData)(mtf);
          setMtfStatus('idle');
        }
      } catch (e) {
        console.warn('[mtf]', e);
        if (!cancelled && mountedRef.current) setMtfStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, norm, mtfData, safeSet]);

  const result = useMemo(() => ({
    quote,
    hist,
    aiAns,
    aiStatus,
    indic,
    news,
    cal,
    twse,
    sentiment,
    mtfData,
    mtfStatus,
    newsStatus,
    dataState,
    loadData,
    norm,
    setTimeframe
  }), [
    quote, hist, aiAns, aiStatus, indic, news, cal, twse, sentiment, 
    mtfData, mtfStatus, newsStatus, dataState, loadData, norm, setTimeframe
  ]);

  return result;
}
