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
import * as settingsRepo    from '../repositories/settingsRepo.js';
import { calcIndicators }    from '../utils/technical.js';
import { analyzeSentiment }  from '../utils/sentiment.js';
import { getBestFreeModel }  from '../utils/modelSelector.js';
import { getPersonaPrompt, getPersonaList } from '../utils/personas.js';
import { queueAgentBacktest } from '../services/agentBacktestTool.js';
import { getDataRegistry } from '../data/configure.js';
import { createDefaultAgentTools } from '../ai/defaultTools.js';
import { createAiStrategyDraft } from '../services/aiStrategyDraftService.js';
import { getStrategyRuntimeService } from '../services/strategyRuntimeService.js';
import { PromptRegistry } from '../ai/promptRegistry.js';
import { EvidenceModelGateway } from '../ai/modelGateway.js';
import { answerGroundedChat } from '../ai/chatService.js';
import {
  inspectPaperOrders,
  inspectPaperSession,
  startPaperStrategy,
  stopPaperStrategy,
} from '../services/paperSessionTools.js';

export const agentRouter = Router();

const registeredAgentTools = createDefaultAgentTools({
  resolveData: (request) => getDataRegistry().resolve(request),
  getPortfolio: (userId) => import('../repositories/positionsRepo.js')
    .then((module) => module.getPositionsByUser(userId)),
  getTrades: (userId) => tradesRepo.getTradesByUser(userId),
  getDataHealth: () => getDataRegistry().health(),
  queueBacktest: (userId, args) => queueAgentBacktest(userId, args),
  createStrategyVersion: (userId, strategyId, command) => (
    getStrategyRuntimeService().createVersion(userId, strategyId, command)
  ),
  validateStrategyVersion: (userId, strategyVersionId) => (
    getStrategyRuntimeService().validateVersion(userId, strategyVersionId)
  ),
  getBacktestJob: (userId, jobId) => (
    getStrategyRuntimeService().getBacktestJob(userId, jobId)
  ),
  startPaperStrategy,
  stopPaperStrategy,
  inspectPaperSession,
  inspectPaperOrders,
});

const promptRegistry = new PromptRegistry();
const groundedResearchPrompt = promptRegistry.register({
  id: 'agent.research.system',
  version: '1.0.0',
  template: [
    '你是 Hermes 投資研究助理。回覆使用繁體中文。',
    '只能把 EVIDENCE 區塊中的內容當成外部市場事實。',
    '所有外部事實都必須使用 [E#] 標記並列入 citations。',
    '資料不存在時明確說明，不得補造行情、新聞、基本面或總經數值。',
    '清楚標示風險，嚴禁保證獲利。',
  ].join('\n'),
});

// ── AI strategy draft generation (execution remains in Python runtime) ───────
agentRouter.post('/dynamic-strategy', async (req: AuthRequest, res) => {
  const userId = req.userId;
  const strategyId = Number(req.body?.strategyId);
  const runtime = req.body?.runtime;
  const prompt = req.body?.prompt;
  if (!userId) {
    res.status(401).json({ error: '未授權' });
    return;
  }
  if (
    !Number.isInteger(strategyId)
    || strategyId <= 0
    || (runtime !== 'indicator' && runtime !== 'script')
    || typeof prompt !== 'string'
    || !prompt.trim()
  ) {
    res.status(400).json({
      error: 'strategyId, runtime (indicator|script), and prompt are required',
    });
    return;
  }

  try {
    let openrouterKey = req.body.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) {
      try {
        const storedKey = await settingsRepo.getSetting(userId, 'OPENROUTER_API_KEY');
        if (typeof storedKey === 'string' && storedKey) openrouterKey = storedKey;
      } catch (e) {
        console.warn('Failed to fetch OPENROUTER_API_KEY from db', e);
      }
    }

    const version = await createAiStrategyDraft({
      userId,
      strategyId,
      runtime,
      prompt,
    }, {
      generateSource: ({ runtime: targetRuntime, prompt: userPrompt }) => {
        const contract = targetRuntime === 'indicator'
          ? 'Define def run(data, params) and return aligned buy/sell or four-way signal arrays.'
          : 'Define on_init(ctx) and on_bar(ctx, bar); use only ctx order methods and deterministic state.';
        return callOpenRouter([
          {
            role: 'system',
            content: [
              'Generate Python strategy source for the Hermes restricted quant runtime.',
              contract,
              'No markdown, imports, filesystem, network, process, environment, or dynamic evaluation.',
              'Return source code only. The draft will be validated separately and must not be executed here.',
            ].join('\n'),
          },
          { role: 'user', content: userPrompt },
        ], undefined, openrouterKey);
      },
      createVersion: (ownerId, parentStrategyId, command) => (
        getStrategyRuntimeService().createVersion(ownerId, parentStrategyId, command)
      ),
    });

    res.status(201).json({
      ok: true,
      version,
      next: {
        validate: `/api/strategy-versions/${(version as { id: string }).id}/validate`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Strategy draft generation failed';
    console.error('[DynamicStrategy] Draft generation failed:', message);
    res.status(500).json({ error: message });
  }
});

// ── 環境變數 ──────────────────────────────────────────────────────────────────
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Last-resort static fallback when dynamic model discovery and OpenRouter
// both fail. The primary model is resolved dynamically via getBestFreeModel()
// so it stays aligned with /api/ai/summarize.
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
  model?: string,
  reqApiKey?: string
): Promise<string> {
  const apiKey = reqApiKey || getApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY 未設定');

  const resolvedModel = model ?? await getBestFreeModel();

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://hermes-ai.trading',
      'X-Title':       'Hermes AI Trading Agent',
    },
    body: JSON.stringify({
      model: resolvedModel,
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
    if ((res.status === 429 || res.status === 503) && resolvedModel !== FREE_MODEL_FALLBACK) {
      console.warn(`[Hermes] ${resolvedModel} 不可用 (${res.status})，切換至備援模型`);
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
  personaId?: string,
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

  // 8. Persona overlay — if a persona is set, prefix its system prompt
  const personaPrompt = personaId ? getPersonaPrompt(personaId) : null;
  const baseIdentity = personaPrompt
    ? `${personaPrompt}\n\n---\n你現在使用以下的個人記憶與市場數據來強化你的分析：`
    : `你是 Hermes 代理框架，一個具備自我進化能力的高頻量化交易 AI。`;

  return `${baseIdentity}

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
  const { message, symbol, history: convHistory = [], persona = 'hermes' } = req.body ?? {};

  if (!userId) { res.status(401).json({ error: '未授權' }); return; }
  if (!message) { res.status(400).json({ error: '缺少 message' }); return; }

  try {
    let openrouterKey = req.body.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey && userId) {
      try {
        const storedKey = await settingsRepo.getSetting(userId, 'OPENROUTER_API_KEY');
        if (typeof storedKey === 'string' && storedKey) openrouterKey = storedKey;
      } catch (e) {
        console.warn('Failed to fetch OPENROUTER_API_KEY from db', e);
      }
    }

    const chatModel = req.body.model || await getBestFreeModel();
    const memoryContext = [
      await buildSystemPrompt(userId, null, persona),
      `RECENT_CONVERSATION:\n${JSON.stringify(
        (convHistory as OpenRouterMessage[]).slice(-8),
      )}`,
    ].join('\n\n');
    const gateway = new EvidenceModelGateway(
      await groundedResearchPrompt,
      async ({ messages }) => ({
        model: chatModel,
        content: await callOpenRouter(messages, chatModel, openrouterKey),
      }),
    );
    const answer = await answerGroundedChat({
      userId,
      message: String(message),
      symbol: typeof symbol === 'string' ? symbol : undefined,
      memoryContext,
      personaContext: getPersonaPrompt(persona) ?? undefined,
    }, {
      tools: registeredAgentTools,
      gateway,
    });
    const { cleanText, skills } = parseExtractedSkills(answer.answer);

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
      citations:       answer.citations,
      promptVersion:   answer.promptVersion,
      model:           answer.model,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Hermes] /chat error:', msg);
    res.status(500).json({ error: msg });
  }
});

interface ToolCallResult {
  tool_name: string;
  args:      Record<string, unknown>;
  result:    unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/stream  — SSE streaming with Function Calling
// Rule: skills/02_Agent_GenUI.md §2 "串流與生成式 UI (Streaming & GenUI)"
// ─────────────────────────────────────────────────────────────────────────────

agentRouter.post('/stream', async (req: AuthRequest, res) => {
  const userId = req.userId;
  const { message, symbol, history: convHistory = [], locale = 'zh-TW', persona = 'hermes' } = req.body ?? {};

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
        const storedKey = await settingsRepo.getSetting(userId, 'OPENROUTER_API_KEY');
        if (typeof storedKey === 'string' && storedKey) {
          openrouterKey = storedKey;
        }
      } catch { /* ignore */ }
    }
    if (!openrouterKey) {
      sseWrite('error', { message: 'OPENROUTER_API_KEY 未設定' });
      res.end();
      return;
    }

    // Build system prompt with locale (Rule: skills/04_Production_Readiness.md §2 "AI 語系連動")
    const systemPrompt = await buildSystemPrompt(userId, null, persona);
    const localizedSystem = `${systemPrompt}\n\n[LOCALE: ${locale}] 請以 ${locale} 語系回覆。`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: localizedSystem },
      ...(convHistory as OpenRouterMessage[]).slice(-8),
      { role: 'user', content: message },
    ];

    // Phase 1: Call LLM with Tools (non-streaming for tool handling, stream text chunks)
    const streamModel = req.body.model || await getBestFreeModel();
    const apiRes = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
        'HTTP-Referer':  'https://hermes-ai.trading',
        'X-Title':       'FIN-TERMINAL Agent',
      },
      body: JSON.stringify({
        model:       streamModel,
        messages,
        tools:       registeredAgentTools.openRouterTools(['R', 'B']),
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
        const toolName = tc.function.name;
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

        const result = await registeredAgentTools.execute(toolName, args, {
          userId,
          scopes: ['R', 'B'],
          paperOnly: true,
          allowedMarkets: [],
          allowedInstruments: [],
        });
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
      const summaryText = await callOpenRouter(toolResultMessages, streamModel, openrouterKey).catch(() => '已完成工具呼叫。');
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

// ── GET /api/agent/personas ───────────────────────────────────────────────────

agentRouter.get('/personas', (_req, res) => {
  res.json(getPersonaList());
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
