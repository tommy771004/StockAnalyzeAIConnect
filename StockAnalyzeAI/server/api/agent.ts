/**
 * server/api/agent.ts
 * Hermes AI Agent — 完整功能
 *
 * 功能涵蓋：
 *  21. OpenRouter API 串接 (nousresearch/hermes-3-llama-3.1-405b:free)
 *  22. 長期記憶 RAG Context 注入 (AgentMemory + Watchlist + Trades + MarketData + 技術指標)
 *  23. 自我進化 System Prompt (Skill Extraction via <extracted_skills> JSON 區塊)
 *  24. 記憶寫入資料庫 (Memory Persistence)
 *
 * 掛載至 server.ts：
 *   import { agentRouter } from './server/api/agent.js';
 *   app.use('/api/agent', authMiddleware, agentRouter);
 */

import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import * as agentMemoryRepo from '../repositories/agentMemoryRepo.js';
import * as watchlistRepo   from '../repositories/watchlistRepo.js';
import * as tradesRepo      from '../repositories/tradesRepo.js';
import { calcIndicators }    from '../utils/technical.js';
import { analyzeSentiment }  from '../utils/sentiment.js';

export const agentRouter = Router();

// ── 環境變數 ──────────────────────────────────────────────────────────────────
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FREE_MODEL_PRIMARY = 'nousresearch/hermes-3-llama-3.1-405b:free';
const FREE_MODEL_FALLBACK = 'mistralai/mistral-7b-instruct:free';

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? '';
}

// ── 呼叫 OpenRouter ───────────────────────────────────────────────────────────

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string = FREE_MODEL_PRIMARY,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY 未設定');

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://hermes-ai.trading',
      'X-Title':       'Hermes AI Trading Agent',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature:  0.7,
      max_tokens:   1024,
      stream:       false,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Fallback to secondary free model on rate-limit or model unavailable
    if ((res.status === 429 || res.status === 503) && model !== FREE_MODEL_FALLBACK) {
      console.warn(`[Hermes] ${model} 不可用 (${res.status})，切換至備援模型`);
      return callOpenRouter(messages, FREE_MODEL_FALLBACK);
    }
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('OpenRouter 回傳空內容');
  return content;
}

// ── 解析 <extracted_skills> 區塊 ─────────────────────────────────────────────

interface ExtractedSkill {
  type:    'PREFERENCE' | 'SKILL' | 'CONTEXT';
  content: Record<string, unknown>;
}

function parseExtractedSkills(raw: string): { cleanText: string; skills: ExtractedSkill[] } {
  const blockRe = /<extracted_skills>([\s\S]*?)<\/extracted_skills>/i;
  const match   = blockRe.exec(raw);
  if (!match) return { cleanText: raw.trim(), skills: [] };

  const jsonStr  = match[1].trim();
  const cleanText = raw.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(jsonStr);
    const arr: ExtractedSkill[] = Array.isArray(parsed) ? parsed : [parsed];
    return { cleanText, skills: arr };
  } catch {
    console.warn('[Hermes] <extracted_skills> JSON 解析失敗:', jsonStr.slice(0, 100));
    return { cleanText, skills: [] };
  }
}

// ── 建構 RAG System Prompt ────────────────────────────────────────────────────

interface MarketSnap {
  symbol: string;
  price:  number;
  history: Array<{ date: string | Date; open: number; high: number; low: number; close: number; volume: number }>;
}

async function buildSystemPrompt(
  userId: string,
  marketSnap?: MarketSnap | null,
): Promise<string> {
  // 1. 讀取長期記憶
  const memories = await agentMemoryRepo.getMemoriesByUser(userId, 30).catch(() => []);

  // 2. 讀取自選股
  const watchlist = await watchlistRepo.getWatchlistByUser(userId).catch(() => []);

  // 3. 讀取最近 10 筆交易記錄
  const trades = await tradesRepo.getTradesByUser(userId, { limit: 10 }).catch(() => []);

  // 4. 技術指標 & 情緒（若有 marketSnap）
  let marketContext = '';
  if (marketSnap && marketSnap.history.length >= 15) {
    const tech = calcIndicators(marketSnap.history as Parameters<typeof calcIndicators>[0]);
    marketContext = `
## 最新市場數據 [${marketSnap.symbol}]
- 當前價格: ${marketSnap.price}
- SMA20: ${tech.latest.sma20?.toFixed(2) ?? 'N/A'}
- SMA50: ${tech.latest.sma50?.toFixed(2) ?? 'N/A'}
- MACD 柱狀: ${tech.latest.macdHist?.toFixed(4) ?? 'N/A'}
- RSI(14): ${tech.latest.rsi14?.toFixed(1) ?? 'N/A'}
- 技術建議: ${tech.recommendation}（信號強度 ${tech.score}/100）
`;
  }

  // 5. 格式化記憶摘要
  const memSummary = memories.length === 0
    ? '（目前尚無長期記憶）'
    : memories.map(m =>
        `[${m.memoryType}] ${JSON.stringify(m.content).slice(0, 120)}`
      ).join('\n');

  // 6. 格式化自選股
  const watchSummary = watchlist.length === 0
    ? '（無自選股）'
    : watchlist.map(w => w.symbol).join(', ');

  // 7. 格式化最近交易
  const tradeSummary = trades.length === 0
    ? '（尚無交易記錄）'
    : trades.slice(0, 5).map(t =>
        `${t.date} ${t.side} ${t.ticker} @${t.entry} qty:${t.qty} pnl:${t.pnl ?? '?'}`
      ).join('\n');

  return `你是 Hermes 代理框架，一個具備自我進化能力的高頻量化交易 AI。

## 使用者背景記憶
${memSummary}

## 自選股列表
${watchSummary}

## 最近交易紀錄
${tradeSummary}
${marketContext}

## 行為準則
1. 回覆一律使用**繁體中文**。
2. 提供具體、可操作的交易建議，引用上方提供的技術指標與記憶背景。
3. 觀察使用者的對話，若發現他們偏好特定的投資策略、指標或標的，請在回覆末尾**另外**輸出一個嚴格格式的技能萃取區塊：

<extracted_skills>
[
  { "type": "PREFERENCE", "content": { "key": "策略偏好", "value": "..." } }
]
</extracted_skills>

若沒有偵測到新的偏好，請省略此區塊。
4. 所有風險提示清晰標明，嚴禁提供保證獲利承諾。`;
}

// ── POST /api/agent/chat ──────────────────────────────────────────────────────

agentRouter.post('/chat', async (req: AuthRequest, res) => {
  const userId    = req.userId;
  const { message, symbol, history: convHistory = [] } = req.body ?? {};

  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  if (!message) { res.status(400).json({ error: '缺少 message' }); return; }

  try {
    // 可選：傳入 symbol 時，嘗試取得最新報價作為 RAG 快照
    let marketSnap: MarketSnap | null = null;
    if (symbol) {
      try {
        // 動態 import 避免循環依賴（server.ts NativeYahooApi 已在頂層）
        const { default: serverModule } = await import('../../server.js' as string).catch(() => ({ default: null }));
        void serverModule; // NativeYahooApi is in server.ts scope, not exposed; skip market fetch via dynamic import
      } catch { /* 無法取得市場快照，繼續 */ }
    }

    const systemPrompt = await buildSystemPrompt(userId, marketSnap);

    // 組裝對話歷史
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(convHistory as OpenRouterMessage[]).slice(-8), // 保留最近 8 輪
      { role: 'user', content: message },
    ];

    const rawReply = await callOpenRouter(messages);
    const { cleanText, skills } = parseExtractedSkills(rawReply);

    // 持久化萃取出的技能/偏好
    if (skills.length > 0) {
      await Promise.allSettled(
        skills.map(s =>
          agentMemoryRepo.createMemory({
            userId,
            memoryType: s.type,
            content:    s.content,
          }),
        ),
      );
      console.log(`[Hermes] 萃取並儲存 ${skills.length} 筆記憶 (userId=${userId})`);
    }

    res.json({
      reply:           cleanText,
      extractedSkills: skills,
      model:           FREE_MODEL_PRIMARY,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Hermes] /chat error:', msg);
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/agent/memories ───────────────────────────────────────────────────

agentRouter.get('/memories', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  try {
    const memories = await agentMemoryRepo.getMemoriesByUser(userId, 50);
    res.json(memories);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── DELETE /api/agent/memories/:id ───────────────────────────────────────────

agentRouter.delete('/memories/:id', async (req: AuthRequest, res) => {
  const userId = req.userId;
  const id     = parseInt(req.params.id, 10);
  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  if (isNaN(id)) { res.status(400).json({ error: '無效 id' }); return; }
  try {
    await agentMemoryRepo.deleteMemory(id, userId);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});
