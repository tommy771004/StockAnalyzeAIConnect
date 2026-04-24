/**
 * server/utils/llmPipeline.ts
 *
 * Cost-Aware LLM Pipeline — adapted from cost-aware-llm-pipeline skill
 * for OpenRouter (OpenAI-compatible chat completions API).
 *
 * Implements all 4 skill patterns:
 *   1. Model routing by task complexity (prompt length + tier)
 *   2. Immutable cost tracking (CostRecord / CostTracker)
 *   3. Narrow retry logic (transient errors only, exponential backoff)
 *   4. Prompt caching (long system prompts marked with cache_control)
 *
 * Usage:
 *   import { llm } from './llmPipeline.js';
 *   const { text, tracker } = await llm.call({ prompt, userId });
 */

import * as settingsRepo from '../repositories/settingsRepo.js';
import { getTopFreeModels, getBestFreeModel } from './modelSelector.js';

// ─── Pricing Reference (OpenRouter, approximate 2025-2026) ────────────────────
// Free-tier models have $0 pricing — we track them for request counts, not $.
// Paid models that a Pro user might provide via their own key:
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  'openai/gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'openai/gpt-4o':                    { input: 2.50,  output: 10.00 },
  'anthropic/claude-3-haiku':         { input: 0.25,  output: 1.25  },
  'anthropic/claude-3-5-sonnet':      { input: 3.00,  output: 15.00 },
  'google/gemini-2.0-flash-exp:free': { input: 0,     output: 0     },
  '_default_free':                    { input: 0,     output: 0     },
};

function pricingFor(modelId: string): { input: number; output: number } {
  return PRICE_PER_1M[modelId] ?? PRICE_PER_1M['_default_free']!;
}

// ─── Cost Tracking (Immutable) ─────────────────────────────────────────────────

export interface CostRecord {
  readonly requestId:    string;
  readonly model:        string;
  readonly inputTokens:  number;
  readonly outputTokens: number;
  readonly costUsd:      number;
  readonly ts:           number;
}

export interface CostTracker {
  readonly budgetLimitUsd: number;
  readonly records: readonly CostRecord[];
}

export function createTracker(budgetLimitUsd = 1.00): CostTracker {
  return { budgetLimitUsd, records: [] };
}

export function addRecord(tracker: CostTracker, record: CostRecord): CostTracker {
  // Immutable — returns new tracker object, never mutates
  return {
    budgetLimitUsd: tracker.budgetLimitUsd,
    records: [...tracker.records, record],
  };
}

export function totalCost(tracker: CostTracker): number {
  return tracker.records.reduce((sum, r) => sum + r.costUsd, 0);
}

export function isOverBudget(tracker: CostTracker): boolean {
  return totalCost(tracker) > tracker.budgetLimitUsd;
}

// ─── Model Routing by Task Complexity ────────────────────────────────────────

interface ModelRouteOptions {
  promptLength:   number;
  /** How many items to analyse (e.g. symbols in screener) */
  itemCount?:     number;
  /** Override — bypasses routing logic */
  forceModel?:    string;
  /** User's subscription tier — PRO users get better routing */
  tier?:          'free' | 'basic' | 'pro';
}

/**
 * Thresholds (tuned for financial analysis prompts):
 *  - > 8 000 chars or > 20 items → use "better" free model (if available)
 *  - PRO tier → always use the top-ranked free model
 *  - Basic/Free → start from position 1 or 2 in the ranked list to save quota
 */
const COMPLEX_PROMPT_THRESHOLD = 8_000;
const COMPLEX_ITEM_THRESHOLD   = 20;

async function routeModel(opts: ModelRouteOptions): Promise<string> {
  if (opts.forceModel) return opts.forceModel;

  const models = await getTopFreeModels(3);
  const [best = '', second = '', third = ''] = models;

  const isComplex =
    opts.promptLength >= COMPLEX_PROMPT_THRESHOLD ||
    (opts.itemCount ?? 0) >= COMPLEX_ITEM_THRESHOLD;

  // PRO tier: always use best model
  if (opts.tier === 'pro') return best;

  // Complex task: use best regardless of tier (quality matters)
  if (isComplex) return best;

  // Simple tasks: rotate to second or third model to preserve quota on primary
  return second || best;
}

// ─── Retry Logic (Transient-Only) ─────────────────────────────────────────────

/** HTTP status codes considered transient and retryable */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface FetchAttemptResult {
  ok:     boolean;
  status: number;
  body:   string;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempt = 0,
): Promise<FetchAttemptResult> {
  try {
    const res = await fetch(url, init);
    const body = await res.text();

    if (!res.ok) {
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        console.warn(`[LLM] Transient ${res.status} on attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await sleep(backoff);
        return fetchWithRetry(url, init, attempt + 1);
      }
      // 401, 400 etc — fail immediately (not transient)
      return { ok: false, status: res.status, body };
    }

    return { ok: true, status: res.status, body };
  } catch (err) {
    // Network-level errors (ECONNRESET, timeout) are transient
    if (attempt < MAX_RETRIES - 1) {
      const backoff = Math.pow(2, attempt) * 500;
      console.warn(`[LLM] Network error on attempt ${attempt + 1}, retrying in ${backoff}ms:`, (err as Error).message);
      await sleep(backoff);
      return fetchWithRetry(url, init, attempt + 1);
    }
    throw err;
  }
}

// ─── Prompt Caching Helper ────────────────────────────────────────────────────

/**
 * Builds a message array with cache_control on the system prompt
 * (OpenRouter passes this through to models that support it,
 *  e.g. Claude, which saves ~70% on repeated system prompts > 1024 tokens).
 *
 * For models that don't support it the field is ignored.
 */
interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ContentPart {
  type:           'text';
  text:           string;
  cache_control?: { type: 'ephemeral' };
}

export function buildCachedMessages(
  systemPrompt: string,
  userContent:  string,
  history:      Array<{ role: 'user' | 'assistant'; content: string }> = [],
): ChatMessage[] {
  const shouldCache = systemPrompt.length > 1_024; // Only cache long prompts

  const systemMsg: ChatMessage = shouldCache
    ? {
        role: 'user', // Some OpenRouter models need system-as-user
        content: [
          {
            type:          'text',
            text:          systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: '\n---\n' },
        ],
      }
    : { role: 'system', content: systemPrompt };

  return [
    systemMsg,
    ...history,
    { role: 'user', content: userContent },
  ];
}

// ─── Main Pipeline Call ───────────────────────────────────────────────────────

export interface LLMCallOptions {
  /** The user message / prompt */
  prompt:       string;
  /** Optional system prompt — cached if > 1024 chars */
  systemPrompt?: string;
  /** Conversation history */
  history?:     Array<{ role: 'user' | 'assistant'; content: string }>;
  /** User ID — used to resolve their API key from settings */
  userId?:      string;
  /** Override model */
  forceModel?:  string;
  /** Return JSON object */
  jsonMode?:    boolean;
  /** Complexity hints for routing */
  itemCount?:   number;
  /** User's subscription tier — influences model routing */
  tier?:        'free' | 'basic' | 'pro';
  /** Existing tracker to append to */
  tracker?:     CostTracker;
  /** Budget limit in USD (default 1.00) */
  budgetLimitUsd?: number;
  /** Max tokens (default 1024) */
  maxTokens?:   number;
  /** Temperature (default 0.3 for analysis, 0.7 for chat) */
  temperature?: number;
}

export interface LLMCallResult {
  text:    string;
  model:   string;
  tracker: CostTracker;
  /** Total cost of this session in USD */
  totalCostUsd: number;
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * The main cost-aware LLM call function.
 * Replaces the scattered callAIWithFallback calls throughout the codebase.
 */
export async function callLLM(opts: LLMCallOptions): Promise<LLMCallResult> {
  // ── 1. Resolve API Key ────────────────────────────────────────────────────
  let apiKey = '';

  if (opts.userId) {
    try {
      const dbKey = await settingsRepo.getSetting<string>(opts.userId, 'OPENROUTER_API_KEY');
      if (dbKey && dbKey.trim() && !dbKey.includes('YOUR_KEY')) {
        apiKey = dbKey.trim();
      }
    } catch {
      // ignore — fallback to env
    }
  }

  if (!apiKey) {
    apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey || apiKey.includes('YOUR_KEY')) apiKey = '';
  }

  if (!apiKey) {
    throw new Error('AI key missing — please set your OpenRouter API Key in Settings');
  }

  // ── 2. Initialise / check tracker ────────────────────────────────────────
  let tracker = opts.tracker ?? createTracker(opts.budgetLimitUsd ?? 1.00);

  if (isOverBudget(tracker)) {
    throw new Error(
      `LLM budget exceeded: $${totalCost(tracker).toFixed(4)} / $${tracker.budgetLimitUsd}. ` +
      'Increase budgetLimitUsd or reset the tracker.',
    );
  }

  // ── 3. Route model ────────────────────────────────────────────────────────
  const model = await routeModel({
    promptLength: opts.prompt.length,
    itemCount:    opts.itemCount,
    forceModel:   opts.forceModel,
    tier:         opts.tier,
  });

  console.log(`[LLM] routing → model=${model} tier=${opts.tier ?? 'free'} chars=${opts.prompt.length}`);

  // ── 4. Build messages (with prompt caching for long system prompts) ───────
  const messages = opts.systemPrompt
    ? buildCachedMessages(opts.systemPrompt, opts.prompt, opts.history)
    : [
        ...(opts.history ?? []),
        { role: 'user' as const, content: opts.prompt },
      ];

  // ── 5. Fetch with retry ───────────────────────────────────────────────────
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const result = await fetchWithRetry(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://hermes-ai.trading',
      'X-Title':       'Hermes AI Trading',
      'X-Request-Id':  requestId,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens:  opts.maxTokens  ?? 1024,
      stream:      false,
      ...(opts.jsonMode && { response_format: { type: 'json_object' } }),
    }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!result.ok) {
    // If it's an auth error, give a clear message
    if (result.status === 401) {
      throw new Error('OpenRouter API key is invalid or expired. Please update it in Settings.');
    }
    throw new Error(`OpenRouter ${result.status}: ${result.body.slice(0, 200)}`);
  }

  const json = JSON.parse(result.body) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?:   { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = json?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('LLM returned empty content');

  // ── 6. Track cost (immutable) ─────────────────────────────────────────────
  const inputTokens  = json.usage?.prompt_tokens      ?? 0;
  const outputTokens = json.usage?.completion_tokens  ?? 0;
  const pricing      = pricingFor(model);
  const costUsd =
    (inputTokens  / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

  const record: CostRecord = {
    requestId,
    model,
    inputTokens,
    outputTokens,
    costUsd,
    ts: Date.now(),
  };

  tracker = addRecord(tracker, record);

  console.log(
    `[LLM] done  model=${model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)} total=$${totalCost(tracker).toFixed(6)}`,
  );

  return { text, model, tracker, totalCostUsd: totalCost(tracker) };
}

/**
 * Convenience wrapper — mirrors the old callAIWithFallback signature.
 * Drop-in replacement: swap `callAIWithFallback(p, json, uid)` →
 * `callAISimple(p, json, uid)`.
 */
export async function callAISimple(
  prompt:   string,
  jsonMode  = false,
  userId?:  string,
  tier:     'free' | 'basic' | 'pro' = 'free',
): Promise<string> {
  const { text } = await callLLM({ prompt, jsonMode, userId, tier });
  return text;
}

// Re-export the old multi-model fallback behaviour for backward compat
export { getBestFreeModel };
