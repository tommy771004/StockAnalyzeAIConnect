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
  const [indic, setIndic] = useState<{ rsi: number, macd: { MACD: number; signal: number; histogram: number; } | null, sma20: number | null } | null>(null);
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

  // ── Load quote + history ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setDataState({ status: 'loading' });
    safeSet(setQuote)(null);
    safeSet(setHist)([]);
    safeSet(setIndic)(null);
    safeSet(setAiAns)(null);
    safeSet(setTwse)(null);
    safeSet(setMtfData)(null);
    try {
      const threeYearsAgo = new Date();
      threeYearsAgo.setDate(threeYearsAgo.getDate() - 365 * 3);
      const period1 = threeYearsAgo.toISOString().split('T')[0];

      const [q, h] = await Promise.allSettled([
        api.getQuote(norm),
        api.getHistory(norm, { period1 }),
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
  }, [norm, symbol, safeSet]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Indicators ────────────────────────────────────────────────────────────
  const closes = useMemo(() => hist.map(d => d.close).filter(isFinite), [hist]);

  const computedIndic = useMemo(() => {
    if (closes.length < 20) return null;
    try {
      return { rsi: _rsi(closes), macd: _macd(closes), sma20: _sma(closes, 20) };
    } catch (e) {
      console.warn('[indicators]', e);
      return null;
    }
  }, [closes]);

  useEffect(() => {
    setIndic(computedIndic);
  }, [computedIndic]);

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
    if (activeTab !== 'news' || news.length === 0) return;
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

  return {
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
    norm
  };
}
