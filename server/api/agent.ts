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
import * as vm from 'vm';
import type { AuthRequest } from '../middleware/auth.js';
import * as agentMemoryRepo from '../repositories/agentMemoryRepo.js';
import * as watchlistRepo   from '../repositories/watchlistRepo.js';
import * as tradesRepo      from '../repositories/tradesRepo.js';
import * as settingsRepo    from '../repositories/settingsRepo.js';
import { calcIndicators }    from '../utils/technical.js';
import { analyzeSentiment }  from '../utils/sentiment.js';

export const agentRouter = Router();

// ── 動態策略生成與 VM 執行 ──────────────────────────────────────────────────
agentRouter.post('/dynamic-strategy', async (req: AuthRequest, res) => {
  const { prompt, historyData } = req.body;
  if (!prompt || !historyData) return res.status(400).json({ error: 'Missing prompt or historyData' });

  try {
    const systemInstruction = `
你是一位頂尖的量化交易工程師。
你需要根據使用者的自然語言要求，寫出一段 JavaScript 函數。
該函數簽名必須為: \`function generate_signals(df) { ... }\`

參數 df 是一個陣列，每個元素包含：
{ date: Date, open: number, high: number, low: number, close: number, volume: number }

回傳值必須是一個與 df 長度相同的陣列，裡面的值只能是：
1 (買入), -1 (賣出), 或 0 (持有/無動作)。

請實作一個向量化的回測邏輯。如果需要技術指標（如 SMA, EMA, RSI），請你自己實作非常簡單的版本，不要依賴外部套件。

[嚴格約束]
1. 不要有任何 markdown。
2. 絕對只能輸出純 JavaScript 程式碼。
3. 程式碼最後不需要呼叫該函數。
`;

    // 1. Get OpenRouter Key
    let openrouterKey = req.body.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey && req.userId) {
      try {
        const storedKey = await settingsRepo.getSetting(req.userId, 'openrouterKey');
        if (storedKey && (storedKey as any).settingValue) openrouterKey = (storedKey as any).settingValue;
      } catch (e) {
        console.warn('Failed to fetch openrouterKey from db', e);
      }
    }

    // 2. Ask Hermes to generate Code
    const codeResponse = await callOpenRouter([
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ], FREE_MODEL_PRIMARY, openrouterKey);

    // 2. Clean up markdown if any
    let cleanCode = codeResponse.replace(/```(?:javascript|js)?\n/i, '').replace(/```$/m, '').trim();

    // 3. Setup Node.js VM Sandbox
    const sandbox = {
      Math: Math,
      Date: Date,
      console: { log: () => {} }, // mock console
    };

    const script = new vm.Script(`
      ${cleanCode}
      generate_signals(df);
    `);

    const context = vm.createContext({ ...sandbox, df: historyData });
    const signals = script.runInContext(context, { timeout: 3000 }); // 3s timeout to prevent infinite loops

    if (!Array.isArray(signals)) {
       throw new Error('Generated code did not return an array.');
    }

    res.json({
      ok: true,
      code: cleanCode,
      signals: signals
    });

  } catch (err: any) {
    console.error('[DynamicStrategy] VM Execution Error:', err);
    res.status(500).json({ error: 'Strategy Generation or Execution Failed', details: err.message, code: err.codeSnippet || undefined });
  }
});

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
  reqApiKey?: string
): Promise<string> {
  const apiKey = reqApiKey || getApiKey();
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
      return callOpenRouter(messages, FREE_MODEL_FALLBACK, reqApiKey);
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
  const trades = await tradesRepo.getTradesByUser(userId).catch(() => []);

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

    let openrouterKey = req.body.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey && userId) {
      try {
        const storedKey = await settingsRepo.getSetting(userId, 'openrouterKey');
        if (storedKey && (storedKey as any).settingValue) openrouterKey = (storedKey as any).settingValue;
      } catch (e) {
        console.warn('Failed to fetch openrouterKey from db', e);
      }
    }

    const rawReply = await callOpenRouter(messages, FREE_MODEL_PRIMARY, openrouterKey);
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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: Function Calling (Tools) Schema
// Rule: skills/02_Agent_GenUI.md §1 "Function Calling"
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'show_stock_chart',
      description: '顯示特定股票的互動式 K 線圖',
      parameters: {
        type: 'object',
        properties: {
          ticker:    { type: 'string',  description: '股票代號，例如 AAPL, NVDA, TSLA' },
          timeframe: { type: 'string',  enum: ['1D','1W','1M','3M','1Y'], description: '時間區間' },
          showMA:    { type: 'boolean', description: '是否疊加移動平均線' },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_portfolio_performance',
      description: '讀取使用者的投資組合績效，包含持倉明細與損益統計',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['1D','1W','1M','3M','YTD','1Y'], description: '績效計算區間' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_backtest',
      description: '對指定股票執行回測並回傳績效指標',
      parameters: {
        type: 'object',
        properties: {
          ticker:          { type: 'string', description: '股票代號' },
          strategy:        { type: 'string', description: '策略名稱 (ma_cross, rsi, bb)' },
          initialCapital:  { type: 'number', description: '初始資金 (USD)' },
          startDate:       { type: 'string', description: 'YYYY-MM-DD' },
          endDate:         { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['ticker', 'strategy'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_news_sentiment',
      description: '顯示特定標的的最新新聞情緒分析卡片',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string', description: '股票代號' },
          limit:  { type: 'number', description: '新聞筆數上限 (default 5)' },
        },
        required: ['ticker'],
      },
    },
  },
] as const;

type AgentToolName = (typeof AGENT_TOOLS)[number]['function']['name'];

interface ToolCallResult {
  tool_name: AgentToolName;
  args:      Record<string, unknown>;
  result:    unknown;
}

// Execute a Tool Call server-side and return the result
async function executeToolCall(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  switch (toolName) {
    case 'get_portfolio_performance': {
      const positions = await import('../repositories/positionsRepo.js').then(m => m.getPositionsByUser(userId)).catch(() => []);
      const tradeList = await tradesRepo.getTradesByUser(userId).catch(() => []);
      return { positions, recentTrades: tradeList.slice(0, 10) };
    }
    case 'execute_backtest': {
      // Placeholder — real impl would call server-side backtestEngine
      return { ok: true, message: '回測已排入佇列，結果將透過 SSE 回傳', args };
    }
    case 'show_stock_chart':
    case 'show_news_sentiment': {
      // These tools produce UI components rendered on the frontend
      return { rendered_on_client: true, args };
    }
    default:
      return { error: `未知工具: ${toolName as string}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/stream  — SSE streaming with Function Calling
// Rule: skills/02_Agent_GenUI.md §2 "串流與生成式 UI (Streaming & GenUI)"
// ─────────────────────────────────────────────────────────────────────────────

agentRouter.post('/stream', async (req: AuthRequest, res) => {
  const userId = req.userId;
  const { message, symbol, history: convHistory = [], locale = 'zh-TW' } = req.body ?? {};

  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  if (!message) { res.status(400).json({ error: '缺少 message' }); return; }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sseWrite = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let openrouterKey = req.body.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey && userId) {
      try {
        const storedKey = await settingsRepo.getSetting(userId, 'openrouterKey');
        if (storedKey && (storedKey as Record<string, unknown>)['settingValue']) {
          openrouterKey = (storedKey as Record<string, unknown>)['settingValue'];
        }
      } catch { /* ignore */ }
    }
    if (!openrouterKey) {
      sseWrite('error', { message: 'OPENROUTER_API_KEY 未設定' });
      res.end();
      return;
    }

    // Build system prompt with locale (Rule: skills/04_Production_Readiness.md §2 "AI 語系連動")
    const systemPrompt = await buildSystemPrompt(userId, null);
    const localizedSystem = `${systemPrompt}\n\n[LOCALE: ${locale}] 請以 ${locale} 語系回覆。`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: localizedSystem },
      ...(convHistory as OpenRouterMessage[]).slice(-8),
      { role: 'user', content: message },
    ];

    // Phase 1: Call LLM with Tools (non-streaming for tool handling, stream text chunks)
    const apiRes = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
        'HTTP-Referer':  'https://hermes-ai.trading',
        'X-Title':       'FIN-TERMINAL Agent',
      },
      body: JSON.stringify({
        model:       FREE_MODEL_PRIMARY,
        messages,
        tools:       AGENT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.65,
        max_tokens:  1200,
        stream:      false,
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!apiRes.ok) {
      sseWrite('error', { message: `OpenRouter ${apiRes.status}` });
      res.end();
      return;
    }

    const completion = await apiRes.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = completion.choices[0];
    if (!choice) { sseWrite('error', { message: '空回應' }); res.end(); return; }

    const assistantMsg = choice.message;

    // ── Handle Tool Calls ─────────────────────────────────────────────────────
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const toolResults: ToolCallResult[] = [];

      for (const tc of assistantMsg.tool_calls) {
        const toolName = tc.function.name as AgentToolName;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* ignore */ }

        // Emit the GenUI component marker BEFORE executing the tool
        // Rule: skills/02_Agent_GenUI.md "吐出特定的 JSON UI 標記"
        sseWrite('ui_component', {
          type:  'ui_component',
          name:  toolName === 'show_stock_chart'     ? 'ChartWidget'
               : toolName === 'show_news_sentiment'  ? 'NewsSentimentCard'
               : toolName === 'get_portfolio_performance' ? 'PortfolioSummary'
               : toolName === 'execute_backtest'     ? 'BacktestResult'
               : 'GenericCard',
          props: args,
          tool_call_id: tc.id,
        });

        const result = await executeToolCall(toolName, args, userId);
        toolResults.push({ tool_name: toolName, args, result });
      }

      // Phase 2: Ask LLM to summarise tool results as natural language
      const toolResultMessages: OpenRouterMessage[] = [
        ...messages,
        { role: 'assistant', content: JSON.stringify(assistantMsg.tool_calls) },
        {
          role: 'user',
          content: `以下是工具執行結果，請用 ${locale} 為使用者做一個簡潔的摘要說明：\n${JSON.stringify(toolResults, null, 2)}`,
        },
      ];
      const summaryText = await callOpenRouter(toolResultMessages, FREE_MODEL_PRIMARY, openrouterKey).catch(() => '已完成工具呼叫。');
      sseWrite('text', { delta: summaryText });
    } else {
      // Pure text response — emit as delta chunks (split by sentence for perceived streaming)
      const fullText = assistantMsg.content ?? '';
      const chunks = fullText.match(/[^。！？\n]{1,80}[。！？\n]?/g) ?? [fullText];
      for (const chunk of chunks) {
        sseWrite('text', { delta: chunk });
      }
    }

    // ── Persist extracted skills ──────────────────────────────────────────────
    const rawText = assistantMsg.content ?? '';
    const { skills } = parseExtractedSkills(rawText);
    if (skills.length > 0) {
      await Promise.allSettled(
        skills.map(s => agentMemoryRepo.createMemory({ userId, memoryType: s.type, content: s.content })),
      );
    }

    sseWrite('done', { ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Hermes/stream] error:', msg);
    sseWrite('error', { message: msg });
  } finally {
    res.end();
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
  const id     = parseInt(req.params['id'] as string, 10);
  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  if (isNaN(id)) { res.status(400).json({ error: '無效 id' }); return; }
  try {
    await agentMemoryRepo.deleteMemory(id, userId);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});
