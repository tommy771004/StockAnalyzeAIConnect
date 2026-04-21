import { z } from 'zod';
import Decimal from 'decimal.js';
import * as api from './api';
import { Quote, HistoricalData, AIAnalysisResult, MTFResult, SentimentData, TradingStrategy, NewsItem } from '../types';

import { GoogleGenAI, Type } from '@google/genai';

// ── Settings helpers ──────────────────────────────────────────────────────────
function getSettings() {
  try { return JSON.parse(localStorage.getItem('llm_trader_settings') ?? '{}'); } catch { return {}; }
}
const getGeminiKey = async (): Promise<string> => {
  // Use platform provided GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Fallbacks
  try {
    const v = await api.getSetting<string>('openrouterKey');
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  } catch(e) { console.warn('[aiService] getSetting openrouterKey:', e); }
  const s = getSettings();
  return s.openrouterKey?.trim() || s.openaiKey?.trim() || (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) || '';
};
const getOllamaBase = async (): Promise<string> => {
  try {
    const v = await api.getSetting<string>('ollamaBaseUrl');
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  } catch(e) { console.warn('[aiService] getSetting ollamaBaseUrl:', e); }
  const s = getSettings();
  return s.ollamaBaseUrl?.trim() || 'http://localhost:11434';
};
const isOllamaModel = (m: string) => m.startsWith('ollama/');
const isTW = (ticker: string) =>
  ticker.endsWith('.TW') || ticker.endsWith('.TWO') || /^\d{4}(\.TW)?$/.test(ticker);

// ── Ollama call ───────────────────────────────────────────────────────────────
async function callOllama(prompt: string, model: string, jsonMode: boolean = true): Promise<string> {
  const base      = await getOllamaBase();
  const modelName = model.replace('ollama/', '');
  const res = await fetch(`${base}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:  modelName,
      prompt: jsonMode ? `Respond ONLY with a JSON object (no markdown, no explanation).\n\n${prompt}` : prompt,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`Ollama ${res.status}`), { status: res.status });
  const data = await res.json();
  const text = data?.response;
  if (typeof text !== 'string') throw new Error('Ollama response missing text content');
  return text;
}

// ── OpenRouter call ───────────────────────────────────────────────────────────
async function callOpenRouter(prompt: string, model: string, jsonMode: boolean = true): Promise<string> {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw Object.assign(new Error('MISSING_API_KEY'), { code: 'MISSING_API_KEY' });
  
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: jsonMode ? { responseMimeType: "application/json" } : undefined,
  });

  if (!response.text) throw new Error('Gemini response missing text content');
  return response.text;
}

// ── Router: Ollama vs OpenRouter ──────────────────────────────────────────────
async function callAI(prompt: string, model: string, jsonMode: boolean = true): Promise<string> {
  return isOllamaModel(model) ? callOllama(prompt, model, jsonMode) : callOpenRouter(prompt, model, jsonMode);
}

// ── Error response factories ──────────────────────────────────────────────────
const errAnalysis = (price: number, msg: string): AIAnalysisResult => ({
  action: 'NEUTRAL', reasoning: msg,
  targetPrice: new Decimal(price).times(1.05).toNumber(),
  stopLoss:    new Decimal(price).times(0.95).toNumber(), trend: 'neutral',
});
const MTF_NEUTRAL = (msg: string): MTFResult => ({
  indicators: [
    { name: '趨勢 (Trend)',   values: ['-', '-', '-'], statuses: ['neutral', 'neutral', 'neutral'] },
    { name: 'RSI (14)',       values: ['-', '-', '-'], statuses: ['neutral', 'neutral', 'neutral'] },
    { name: 'MACD',          values: ['-', '-', '-'], statuses: ['neutral', 'neutral', 'neutral'] },
    { name: 'KD (9,3,3)',     values: ['-', '-', '-'], statuses: ['neutral', 'neutral', 'neutral'] },
    { name: '型態 (Pattern)', values: ['-', '-', '-'], statuses: ['neutral', 'neutral', 'neutral'] },
  ],
  synthesis: msg, score: 50, overallTrend: '中性',
});
const SENT_NEUTRAL = (vix: string, msg: string): SentimentData => ({
  overall: '中立 (Neutral)', score: 50, vixLevel: vix,
  putCallRatio: 'N/A', marketBreadth: 'N/A',
  keyDrivers: [msg], aiAdvice: msg,
});

function classifyError(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  const st   = Number((err as { status?: number | string })?.status ?? 0);
  const msg  = String((err as { message?: string })?.message ?? '');
  if (code === 'MISSING_API_KEY') return 'missing';
  if (st === 401 || msg.includes('401')) return 'unauth';
  if (st === 429 || st === 402 || /quota|credit|RESOURCE_EXHAUSTED/i.test(msg)) return 'quota';
  return 'unknown';
}

function parseJSON<T>(raw: string, schema: z.ZodSchema<T>): T {
  // Strip possible markdown fences
  const clean = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  let json: unknown;
  try {
    json = JSON.parse(clean);
  } catch {
    // Try to extract first JSON object from response
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        json = JSON.parse(match[0]);
      } catch {
        throw new Error('AI 回傳格式無效，無法解析 JSON');
      }
    } else {
      throw new Error('AI 回傳格式無效，無法解析 JSON');
    }
  }
  return schema.parse(json);
}

// ── Validators (Zod Schemas) ──────────────────────────────────────────────────
const AIAnalysisSchema = z.object({
  action: z.enum(['STRONG BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG SELL']).default('NEUTRAL'),
  reasoning: z.string().default('分析失敗'),
  targetPrice: z.number().catch(100),
  stopLoss: z.number().catch(90),
  trend: z.enum(['bullish', 'bearish', 'neutral']).default('neutral'),
});

const MTFIndicatorSchema = z.object({
  name: z.string().default('Unknown'),
  values: z.array(z.string()).length(3).default(['-', '-', '-']),
  statuses: z.array(z.enum(['bullish', 'bearish', 'neutral'])).length(3).default(['neutral', 'neutral', 'neutral']),
});

const MTFResultSchema = z.object({
  indicators: z.array(MTFIndicatorSchema).min(1).max(10).default([]),
  synthesis: z.string().default(''),
  score: z.number().min(0).max(100).default(50),
  overallTrend: z.string().default('中性'),
});

const TradingStrategySchema = z.object({
  strategy: z.string().default('分析失敗'),
  entry: z.string().default('N/A'),
  exit: z.string().default('N/A'),
  riskLevel: z.enum(['low', 'medium', 'high', 'N/A']).default('medium'),
  confidence: z.number().min(0).max(100).default(0),
});

const SentimentDataSchema = z.object({
  overall: z.string().default('中立 (Neutral)'),
  score: z.number().min(0).max(100).default(50),
  vixLevel: z.string().default('N/A'),
  putCallRatio: z.string().default('N/A'),
  marketBreadth: z.string().default('N/A'),
  keyDrivers: z.array(z.string()).default([]),
  aiAdvice: z.string().default(''),
});


// ═══════════════════════════════════════════════════════════════════════════════
//  analyzeStock
// ═══════════════════════════════════════════════════════════════════════════════
function buildStockAnalysisPrompt(
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  systemInstruction: string
): string {
  const recent = historicalData.slice(-30);
  const price = quoteData?.regularMarketPrice ?? 100;
  const market = isTW(ticker) ? '台灣股市（半導體、電子）' : '美國股市（納斯達克）';
  const currency = quoteData?.currency ?? (isTW(ticker) ? 'TWD' : 'USD');
  return `${systemInstruction ? systemInstruction + '\n\n' : ''}You are an expert AI stock trader specialising in ${market}.
Analyse ${ticker} and provide a trading recommendation.

Quote (${currency}): Price=${price}, Change=${quoteData?.regularMarketChange?.toFixed(2)}, ChangePercent=${quoteData?.regularMarketChangePercent?.toFixed(2)}%,
Volume=${quoteData?.regularMarketVolume}, 52wHigh=${quoteData?.fiftyTwoWeekHigh}, 52wLow=${quoteData?.fiftyTwoWeekLow},
PE=${quoteData?.trailingPE ?? 'N/A'}, MarketCap=${quoteData?.marketCap ?? 'N/A'}

Last 30 close prices: ${recent.map((d) => d.close?.toFixed(2) ?? 'N/A').join(', ')}

Respond ONLY with JSON:
{"action":"STRONG BUY|BUY|NEUTRAL|SELL|STRONG SELL","reasoning":"Traditional Chinese detailed analysis","targetPrice":number,"stopLoss":number,"trend":"bullish|bearish|neutral"}`;
}

function parseAndValidateStockAnalysis(raw: string): AIAnalysisResult | null {
  try {
    return parseJSON(raw, AIAnalysisSchema);
  } catch (e) {
    console.error('parseAndValidateStockAnalysis error:', e);
    return null;
  }
}

export async function analyzeStock(
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  model = 'openai/gpt-4o-mini',
  systemInstruction = ''
): Promise<AIAnalysisResult | null> {
  try {
    if (!Array.isArray(historicalData)) return null;
    const prompt = buildStockAnalysisPrompt(ticker, quoteData, historicalData, systemInstruction);
    const raw = await callAI(prompt, model);
    const parsed = parseAndValidateStockAnalysis(raw);
    if (!parsed) return errAnalysis(quoteData?.regularMarketPrice ?? 100, 'AI 回傳格式不符，已套用預設值');
    return parsed;
  } catch (err: unknown) {
    const price = quoteData?.regularMarketPrice ?? 100;
    const kind = classifyError(err);
    if (kind === 'missing') return errAnalysis(price, '⚠️ OpenRouter API Key 未設定。請至「系統設定」輸入 Key，或勾選 Ollama 本地模式。');
    if (kind === 'unauth') return errAnalysis(price, '⚠️ API Key 無效（401 Unauthorized）。');
    if (kind === 'quota') return errAnalysis(price, '⚠️ AI 服務達配額限制，請稍後再試。');
    console.error('analyzeStock:', err);
    return errAnalysis(price, 'AI 回傳格式不符，已套用預設值');
  }
}

function buildChatPrompt(
  query: string,
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  systemInstruction: string
): string {
  const recent   = historicalData.slice(-30);
  const price    = quoteData?.regularMarketPrice ?? 100;
  const market   = isTW(ticker) ? '台灣股市（半導體、電子）' : '美國股市（納斯達克）';
  const currency = quoteData?.currency ?? (isTW(ticker) ? 'TWD' : 'USD');

  return `${systemInstruction ? systemInstruction + '\n\n' : ''}You are an expert AI stock trader specialising in ${market}.
The user is asking a question about ${ticker}.

Quote (${currency}): Price=${price}, Change=${quoteData?.regularMarketChange?.toFixed(2)}, ChangePercent=${quoteData?.regularMarketChangePercent?.toFixed(2)}%,
Volume=${quoteData?.regularMarketVolume}, 52wHigh=${quoteData?.fiftyTwoWeekHigh}, 52wLow=${quoteData?.fiftyTwoWeekLow},
PE=${quoteData?.trailingPE ?? 'N/A'}, MarketCap=${quoteData?.marketCap ?? 'N/A'}

Last 30 close prices: ${recent.map((d) => d.close?.toFixed(2) ?? 'N/A').join(', ')}

User Question: ${query}

Respond in Traditional Chinese. Provide a concise, insightful, and professional answer. Do not use JSON.`;
}

export async function chatWithAI(
  query: string,
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  model = 'openai/gpt-4o-mini',
  systemInstruction = ''
) {
  try {
    if (!Array.isArray(historicalData)) return null;
    const prompt = buildChatPrompt(query, ticker, quoteData, historicalData, systemInstruction);
    const raw = await callAI(prompt, model, false);
    return raw;
  } catch (err: unknown) {
    const kind  = classifyError(err);
    if (kind === 'missing') return '⚠️ OpenRouter API Key 未設定。請至「系統設定」輸入 Key，或勾選 Ollama 本地模式。';
    if (kind === 'unauth')  return '⚠️ API Key 無效（401 Unauthorized）。';
    if (kind === 'quota')   return '⚠️ AI 服務達配額限制，請稍後再試。';
    console.error('chatWithAI:', err);
    return '分析失敗，請稍後再試';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  analyzeMTF
// ═══════════════════════════════════════════════════════════════════════════════
function buildMTFPrompt(
  ticker: string,
  data1h: HistoricalData[],
  data1d: HistoricalData[],
  data1wk: HistoricalData[],
  systemInstruction: string
): string {
  const fmt = (arr: HistoricalData[]) => arr.slice(-10).map(d => d.close?.toFixed(2) ?? 'N/A').join(', ');
  return `${systemInstruction ? systemInstruction + '\n\n' : ''}Multi-timeframe analysis for ${ticker}.
1H closes (last 10): ${fmt(data1h)}
1D closes (last 10): ${fmt(data1d)}
1W closes (last 10): ${fmt(data1wk)}

JSON: {"indicators":[{"name":"Chinese+English","values":["1H","1D","1W"],"statuses":["bullish|bearish|neutral","...","..."]}],"synthesis":"Traditional Chinese","score":0-100,"overallTrend":"偏多|偏空|中性"}
Provide exactly 5 indicators.`;
}

export async function analyzeMTF(
  ticker: string, data1h: HistoricalData[], data1d: HistoricalData[], data1wk: HistoricalData[],
  model = 'openai/gpt-4o-mini',
  systemInstruction = ''
): Promise<MTFResult | null> {
  try {
    if (!Array.isArray(data1h) || !Array.isArray(data1d) || !Array.isArray(data1wk)) return null;
    const prompt = buildMTFPrompt(ticker, data1h, data1d, data1wk, systemInstruction);
    const raw = await callAI(prompt, model);
    return parseJSON(raw, MTFResultSchema);
  } catch (err: unknown) {
    const kind = classifyError(err);
    if (kind === 'missing') return MTF_NEUTRAL('⚠️ API Key 未設定。');
    if (kind === 'unauth')  return MTF_NEUTRAL('⚠️ API Key 無效（401）。');
    if (kind === 'quota')   return MTF_NEUTRAL('⚠️ 配額限制，請稍後再試。');
    console.error('analyzeMTF:', err);
    return MTF_NEUTRAL('AI 回傳格式不符，已套用預設值');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  analyzeSentiment
// ═══════════════════════════════════════════════════════════════════════════════
function buildTradingStrategyPrompt(
  ticker: string,
  aiAnalysis: AIAnalysisResult,
  mtfAnalysis: MTFResult,
  systemInstruction: string
): string {
  return `${systemInstruction ? systemInstruction + '\n\n' : ''}Create a trading strategy for ${ticker} based on the following analysis:
AI Analysis: ${JSON.stringify(aiAnalysis)}
MTF Analysis: ${JSON.stringify(mtfAnalysis)}

Respond ONLY with JSON:
{"strategy":"Traditional Chinese detailed strategy","entry":"price range","exit":"price range","riskLevel":"low|medium|high","confidence":0-100}`;
}

export async function getTradingStrategy(
  ticker: string,
  aiAnalysis: AIAnalysisResult,
  mtfAnalysis: MTFResult,
  model = 'openai/gpt-4o-mini',
  systemInstruction = ''
): Promise<TradingStrategy> {
  try {
    const prompt = buildTradingStrategyPrompt(ticker, aiAnalysis, mtfAnalysis, systemInstruction);
    const raw = await callAI(prompt, model);
    return parseJSON(raw, TradingStrategySchema);
  } catch (err: unknown) {
    console.error('getTradingStrategy:', err);
    return { strategy: '分析失敗，請稍後再試', entry: 'N/A', exit: 'N/A', riskLevel: 'N/A', confidence: 0 };
  }
}

function buildSentimentPrompt(marketData: Partial<Quote>[], systemInstruction: string): string {
  // 使用 Array.isArray 來做最嚴格的把關
  const safeMarketData = Array.isArray(marketData) ? marketData : [];
  
  const summary = safeMarketData.map((q) => ({
    symbol: q?.symbol, 
    price: q?.regularMarketPrice,
    change: q?.regularMarketChangePercent?.toFixed(2),
  }));

  return `${systemInstruction ? systemInstruction + '\n\n' : ''}Macroeconomist sentiment analysis. Market: ${JSON.stringify(summary)}
JSON: {"overall":"樂觀 (Bullish)|悲觀 (Bearish)|中立 (Neutral)","score":0-100,"vixLevel":"string","putCallRatio":"string","marketBreadth":"string","keyDrivers":["Traditional Chinese x3"],"aiAdvice":"Traditional Chinese"}`;
}

export async function analyzeSentiment(marketData: Partial<Quote>[], model = 'openai/gpt-4o-mini', systemInstruction = ''): Promise<SentimentData | null> {
  const vix = String(marketData?.find((d) => d?.symbol === '^VIX')?.regularMarketPrice?.toFixed(2) ?? 'N/A');
  try {
    const prompt = buildSentimentPrompt(marketData, systemInstruction);
    const raw = await callAI(prompt, model);
    const parsed = parseJSON(raw, SentimentDataSchema);
    if (parsed.vixLevel === 'N/A' || parsed.vixLevel === 'string') {
      parsed.vixLevel = vix;
    }
    return parsed;
  } catch (err: unknown) {
    const kind = classifyError(err);
    if (kind === 'missing') return SENT_NEUTRAL(vix, '⚠️ API Key 未設定，請至「系統設定」輸入。');
    if (kind === 'unauth')  return SENT_NEUTRAL(vix, '⚠️ API Key 無效（401）。');
    if (kind === 'quota')   return SENT_NEUTRAL(vix, '⚠️ 配額限制，請稍後再試。');
    console.error('analyzeSentiment:', err);
    return SENT_NEUTRAL(vix, 'AI 回傳格式不符，已套用預設值');
  }
}

function buildNewsSentimentPrompt(news: NewsItem[], systemInstruction: string): string {
  const summary = news.slice(0, 10).map(n => n.title).join('\n');
  return `${systemInstruction ? systemInstruction + '\n\n' : ''}You are a financial news analyst. Analyze the following news headlines and provide a sentiment summary.
News:
${summary}

JSON: {"overall":"樂觀 (Bullish)|悲觀 (Bearish)|中立 (Neutral)","score":0-100,"vixLevel":"N/A","putCallRatio":"N/A","marketBreadth":"N/A","keyDrivers":["Traditional Chinese x3"],"aiAdvice":"Traditional Chinese"}`;
}

export async function analyzeNewsSentiment(news: NewsItem[], model = 'openai/gpt-4o-mini', systemInstruction = ''): Promise<SentimentData | null> {
  try {
    const prompt = buildNewsSentimentPrompt(news, systemInstruction);
    const raw = await callAI(prompt, model);
    return parseJSON(raw, SentimentDataSchema);
  } catch (err: unknown) {
    console.error('analyzeNewsSentiment:', err);
    return null;
  }
}
