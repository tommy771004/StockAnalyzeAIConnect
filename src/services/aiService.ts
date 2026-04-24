import { z } from 'zod';
import Decimal from 'decimal.js';
import * as api from './api';
import { Quote, HistoricalData, AIAnalysisResult, MTFResult, SentimentData, TradingStrategy, NewsItem } from '../types';

// ── Settings helpers ──────────────────────────────────────────────────────────
function getSettings() {
  try { return JSON.parse(localStorage.getItem('llm_trader_settings') ?? '{}'); } catch { return {}; }
}
const getOpenRouterKey = async (): Promise<string> => {
  try {
    const v = await api.getSetting<string>('openrouterKey');
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  } catch(e) { console.warn('[aiService] getSetting openrouterKey:', e); }
  const s = getSettings();
  return s.openrouterKey?.trim() || (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) || '';
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
const OPENROUTER_API_URL    = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
/** Emergency hardcoded fallback used only when models-list API also fails. */
const OPENROUTER_FALLBACK   = 'meta-llama/llama-3.3-70b-instruct:free';

// ── Free-model list cache (30 min TTL, module-level) ─────────────────────────
const _freeModelsCache: { list: string[]; ts: number } = { list: [], ts: 0 };
const FREE_MODELS_TTL = 30 * 60 * 1000;

/**
 * Fetches all currently-available :free models from OpenRouter's models API.
 * Results are cached for 30 minutes. Falls back to [OPENROUTER_FALLBACK] on error.
 */
async function getOpenRouterFreeModels(apiKey: string): Promise<string[]> {
  if (_freeModelsCache.list.length > 0 && Date.now() - _freeModelsCache.ts < FREE_MODELS_TTL) {
    return _freeModelsCache.list;
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  'https://hermes-ai.trading',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`models API ${res.status}`);
    const json = await res.json();
    // A model is "free" when both prompt and completion pricing equal "0"
    const list: string[] = (json?.data ?? [])
      .filter((m: { id: string; pricing?: { prompt: string; completion: string } }) =>
        m.pricing?.prompt === '0' && m.pricing?.completion === '0'
      )
      .map((m: { id: string }) => m.id)
      .filter(Boolean);
    if (list.length > 0) {
      _freeModelsCache.list = list;
      _freeModelsCache.ts   = Date.now();
      console.log(`[aiService] 取得 ${list.length} 個可用免費模型`);
    }
    return list.length > 0 ? list : [OPENROUTER_FALLBACK];
  } catch (e) {
    console.warn('[aiService] 無法取得免費模型清單，使用預設備援:', e);
    return [OPENROUTER_FALLBACK];
  }
}

/**
 * Calls OpenRouter with automatic free-model rotation on 429/503/404.
 * `_tried` tracks models already attempted in this request to avoid loops.
 */
async function callOpenRouter(
  prompt: string,
  model: string,
  jsonMode: boolean = true,
  _tried: Set<string> = new Set(),
): Promise<string> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw Object.assign(new Error('MISSING_API_KEY'), { code: 'MISSING_API_KEY' });

  _tried.add(model);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  'https://hermes-ai.trading',
        'X-Title':       'Hermes AI Trading',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2048,
        stream: false,
        ...(jsonMode && { response_format: { type: 'json_object' } })
      }),
      signal: AbortSignal.timeout(45000), // raised timeout slightly
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      const freeModels = await getOpenRouterFreeModels(apiKey);
      const next = freeModels.find(m => !_tried.has(m));
      if (next) {
        console.warn(`[aiService] ${model} 逾時，自動切換至 ${next}`);
        return callOpenRouter(prompt, next, jsonMode, _tried);
      }
      throw Object.assign(new Error('AI 服務請求逾時，且已無備用模型'), { status: 408 });
    }
    throw Object.assign(new Error(`網路或連線失敗: ${err.message}`), { status: 0 });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const st = res.status;
    
    // Auto-retry without json_mode if model doesn't support it
    if (st === 400 && jsonMode && (
      body.toLowerCase().includes('json mode') && (body.toLowerCase().includes('not supported') || body.toLowerCase().includes('not enabled'))
    )) {
      console.warn(`[aiService] 模型 ${model} 不支援 JSON Mode，取消參數進行重試…`);
      return callOpenRouter(prompt, model, false, _tried);
    }

    // On rate-limit / overload / removed-endpoint / internal error, rotate to next free model
    if (st === 429 || st === 503 || st === 502 || st === 500 || st === 404 || st === 522) {
      // Invalidate cache on 404 so stale model list is refreshed
      if (st === 404) _freeModelsCache.ts = 0;

      const freeModels = await getOpenRouterFreeModels(apiKey);
      const next = freeModels.find(m => !_tried.has(m));
      if (next) {
        console.warn(`[aiService] ${model} 限流/不可用 (${st})，自動切換至 ${next}`);
        return callOpenRouter(prompt, next, jsonMode, _tried);
      }
      // All known free models exhausted in this request
      throw Object.assign(
        new Error('所有免費模型均已達限流或不可用，請稍後再試'),
        { status: 429 },
      );
    }
    throw Object.assign(new Error(`OpenRouter ${st}: ${body.slice(0, 200)}`), { status: st });
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('OpenRouter 回傳空內容');
  return content;
}

// ── Router: Ollama vs OpenRouter ──────────────────────────────────────────────
async function callAI(prompt: string, model: string, jsonMode: boolean = true): Promise<string> {
  const targetModel = model || OPENROUTER_FALLBACK;

  if (isOllamaModel(targetModel)) {
    return callOllama(prompt, targetModel, jsonMode);
  }

  return callOpenRouter(prompt, targetModel, jsonMode);
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
  const name = String((err as { name?: string })?.name ?? '');

  if (code === 'MISSING_API_KEY') return 'missing';
  if (st === 401 || msg.includes('401')) return 'unauth';
  if (st === 429 || st === 402 || /quota|credit|RESOURCE_EXHAUSTED/i.test(msg)) return 'quota';
  if (msg.includes('Failed to fetch') || name === 'TypeError' || msg.includes('NetworkError')) return 'network';
  return 'unknown';
}

function parseJSON<T>(raw: string, schema: z.ZodSchema<T>): T {
  let content = raw.trim();

  // Try to find a JSON block in markdown fences first
  const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    content = match[1].trim();
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    // If strict parsing fails, try to extract first JSON object/array
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        json = JSON.parse(content.substring(firstBrace, lastBrace + 1));
      } catch {
        // Continue to array check if object extraction fails
      }
    }

    if (!json) {
      const firstBracket = content.indexOf('[');
      const lastBracket = content.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        try {
          json = JSON.parse(content.substring(firstBracket, lastBracket + 1));
        } catch {
          // Both failed
        }
      }
    }

    if (!json) {
      throw new Error('AI 回傳格式無效，無法解析 JSON');
    }
  }

  try {
    return schema.parse(json);
  } catch (e) {
    console.error('Zod Parsing Error:', e);
    throw new Error('AI 回傳資料結構不符預期');
  }
}

// ── Validators (Zod Schemas) ──────────────────────────────────────────────────
const AIAnalysisSchema = z.object({
  action: z.string()
    .transform(s => s.toUpperCase())
    .pipe(z.enum(['STRONG BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG SELL']))
    .catch('NEUTRAL')
    .default('NEUTRAL'),
  reasoning: z.string().default('分析失敗'),
  targetPrice: z.coerce.number().catch(0).default(0),
  stopLoss: z.coerce.number().catch(0).default(0),
  trend: z.string()
    .transform(s => s.toLowerCase() as 'bullish' | 'bearish' | 'neutral')
    .pipe(z.enum(['bullish', 'bearish', 'neutral']))
    .catch('neutral')
    .default('neutral'),
});

const MTFIndicatorSchema = z.object({
  name: z.string().default('Unknown'),
  values: z.array(z.string().default('-')).length(3).default(['-', '-', '-']),
  statuses: z.array(
    z.string()
      .transform(s => s.toLowerCase() as 'bullish' | 'bearish' | 'neutral')
      .pipe(z.enum(['bullish', 'bearish', 'neutral']))
      .catch('neutral')
  ).length(3).default(['neutral', 'neutral', 'neutral']),
});

const MTFResultSchema = z.object({
  indicators: z.array(MTFIndicatorSchema).catch([]).default([]),
  synthesis: z.string().default(''),
  score: z.coerce.number().min(0).max(100).catch(50).default(50),
  overallTrend: z.string().default('中性'),
});

const TradingStrategySchema = z.object({
  strategy: z.string().default('分析失敗'),
  entry: z.string().default('N/A'),
  exit: z.string().default('N/A'),
  riskLevel: z.string()
    .transform(s => {
      const v = s.toUpperCase();
      if (v === 'LOW') return 'low';
      if (v === 'MEDIUM') return 'medium';
      if (v === 'HIGH') return 'high';
      return 'N/A';
    })
    .pipe(z.enum(['low', 'medium', 'high', 'N/A']))
    .catch('N/A')
    .default('N/A'),
  confidence: z.coerce.number().min(0).max(100).catch(0).default(0),
});

const SentimentDataSchema = z.object({
  overall: z.string().default('中立 (Neutral)'),
  score: z.coerce.number().min(0).max(100).catch(50).default(50),
  vixLevel: z.string().default('N/A'),
  putCallRatio: z.string().default('N/A'),
  marketBreadth: z.string().default('N/A'),
  keyDrivers: z.array(z.string()).catch([]).default([]),
  aiAdvice: z.string().default(''),
});


export const AIChatResponseSchema = z.object({
  message: z.string().default('分析失敗，請重新嘗試'),
  ui_action: z.object({
    type: z.enum(['CHANGE_SYMBOL', 'SET_ORDER']).optional(),
    payload: z.any().optional()
  }).optional().nullable()
});

export type AIChatResponse = z.infer<typeof AIChatResponseSchema>;

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

Respond ONLY with a valid JSON object. No explanation, no conversational filler.
JSON:
{"action":"STRONG BUY|BUY|NEUTRAL|SELL|STRONG SELL","reasoning":"Traditional Chinese detailed analysis","targetPrice":number,"stopLoss":number,"trend":"bullish|bearish|neutral"}`;
}

function parseAndValidateStockAnalysis(raw: string): AIAnalysisResult | null {
  try {
    return parseJSON(raw, AIAnalysisSchema) as unknown as AIAnalysisResult;
  } catch (e) {
    console.error('parseAndValidateStockAnalysis error:', e);
    return null;
  }
}

export async function analyzeStock(
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  model = 'meta-llama/llama-3.3-70b-instruct:free',
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
    if (kind === 'missing') return errAnalysis(price, '⚠️ AI 服務未設定。請檢查配置。');
    if (kind === 'unauth') return errAnalysis(price, '⚠️ API Key 無效（401 Unauthorized）。');
    if (kind === 'quota') return errAnalysis(price, '⚠️ AI 服務達配額限制或點數不足，請檢查配置。');
    if (kind === 'network') return errAnalysis(price, '⚠️ 網路連線失敗或 AI 服務被阻擋。請檢查網路狀態。');
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

  return `${systemInstruction ? systemInstruction + '\n\n' : ''}You are Hermes Agent, an expert AI stock trader specialising in ${market}.
The user is asking a question or giving a command about ${ticker}.

Quote (${currency}): Price=${price}, Change=${quoteData?.regularMarketChange?.toFixed(2)}, ChangePercent=${quoteData?.regularMarketChangePercent?.toFixed(2)}%,
Volume=${quoteData?.regularMarketVolume}, 52wHigh=${quoteData?.fiftyTwoWeekHigh}, 52wLow=${quoteData?.fiftyTwoWeekLow},
PE=${quoteData?.trailingPE ?? 'N/A'}, MarketCap=${quoteData?.marketCap ?? 'N/A'}

Last 30 close prices: ${recent.map((d) => d.close?.toFixed(2) ?? 'N/A').join(', ')}

User Question/Command: ${query}

Respond ONLY with a JSON object exactly matching this schema:
{
  "message": "Your text response to the user in Traditional Chinese.",
  "ui_action": {
    "type": "CHANGE_SYMBOL" | "SET_ORDER",
    "payload": { … }
  }
}

Rules for ui_action:
- If the user asks to analyze/switch to a different stock (e.g. "幫我看一下台積電" or "切換到 2330.TW"), output {"type": "CHANGE_SYMBOL", "payload": {"symbol": "2330.TW"}}. Always use standard ticker symbols.
- If the user explicitly asks to setup an order to buy or sell (e.g. "幫我買入 10 股", "我要賣出"), output {"type": "SET_ORDER", "payload": {"side": "buy" | "sell", "qty": 10}}.
- If NO action is needed and it's just a general question, ONLY output the "message" field and OMIT "ui_action" completely.
- NEVER wrap JSON in markdown block ticks.`;
}

export async function chatWithAI(
  query: string,
  ticker: string,
  quoteData: Partial<Quote>,
  historicalData: HistoricalData[],
  model = 'meta-llama/llama-3.3-70b-instruct:free',
  systemInstruction = ''
): Promise<AIChatResponse | null> {
  try {
    if (!Array.isArray(historicalData)) return null;
    const prompt = buildChatPrompt(query, ticker, quoteData, historicalData, systemInstruction);
    const raw = await callAI(prompt, model, true); // true forces JSON mode
    try {
      return parseJSON(raw, AIChatResponseSchema);
    } catch {
      // Fallback if parsing fails but there is text
      return { message: raw };
    }
  } catch (err: unknown) {
    const kind  = classifyError(err);
    if (kind === 'missing') return { message: '⚠️ AI 服務未設定。' };
    if (kind === 'unauth')  return { message: '⚠️ API Key 無效。' };
    if (kind === 'quota')   return { message: '⚠️ AI 服務達配額限制或點數不足。' };
    console.error('chatWithAI:', err);
    return { message: '分析失敗，請稍後再試' };
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

Respond ONLY with a valid JSON object (exactly 5 indicators). No extra text.
JSON:
{"indicators":[{"name":"Chinese+English","values":["1H","1D","1W"],"statuses":["bullish|bearish|neutral","…","…"]}],"synthesis":"Traditional Chinese","score":0-100,"overallTrend":"偏多|偏空|中性"}`;
}

export async function analyzeMTF(
  ticker: string, data1h: HistoricalData[], data1d: HistoricalData[], data1wk: HistoricalData[],
  model = 'meta-llama/llama-3.3-70b-instruct:free',
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

Respond ONLY with a valid JSON object. No explanation.
JSON:
{"strategy":"Traditional Chinese detailed strategy","entry":"price range","exit":"price range","riskLevel":"low|medium|high","confidence":0-100}`;
}

export async function getTradingStrategy(
  ticker: string,
  aiAnalysis: AIAnalysisResult,
  mtfAnalysis: MTFResult,
  model = 'meta-llama/llama-3.3-70b-instruct:free',
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
Respond ONLY with a valid JSON object. No explanation.
JSON:
{"overall":"樂觀 (Bullish)|悲觀 (Bearish)|中立 (Neutral)","score":0-100,"vixLevel":"string","putCallRatio":"string","marketBreadth":"string","keyDrivers":["Traditional Chinese x3"],"aiAdvice":"Traditional Chinese"}`;
}

export async function analyzeSentiment(marketData: Partial<Quote>[], model = 'meta-llama/llama-3.3-70b-instruct:free', systemInstruction = ''): Promise<SentimentData | null> {
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

Respond ONLY with a valid JSON object. No explanation.
JSON:
{"overall":"樂觀 (Bullish)|悲觀 (Bearish)|中立 (Neutral)","score":0-100,"vixLevel":"N/A","putCallRatio":"N/A","marketBreadth":"N/A","keyDrivers":["Traditional Chinese x3"],"aiAdvice":"Traditional Chinese"}`;
}

export async function analyzeNewsSentiment(news: NewsItem[], model = 'meta-llama/llama-3.3-70b-instruct:free', systemInstruction = ''): Promise<SentimentData | null> {
  try {
    const prompt = buildNewsSentimentPrompt(news, systemInstruction);
    const raw = await callAI(prompt, model);
    return parseJSON(raw, SentimentDataSchema);
  } catch (err: unknown) {
    console.error('analyzeNewsSentiment:', err);
    return null;
  }
}
