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
import { recordAutotradingDiagnostic } from '../services/autotradingDiagnostics.js';

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

/**
 * 根據權重獲取免費模型
 * tier: 1 = 最強免費模型 (主 Agent)
 * tier: 2 = 穩定免費模型 (子 Agent)
 * tier: 3 = 備援免費模型
 */
export async function getFreeModelByTier(tier: 1 | 2 | 3 = 1): Promise<string> {
  const models = await getTopFreeModels(3);
  if (tier === 1) return models[0] || '_default_free';
  if (tier === 2) return models[1] || models[0] || '_default_free';
  return models[2] || models[1] || models[0] || '_default_free';
}

// ─── Retry Logic (Transient-Only) ─────────────────────────────────────────────

/** HTTP status codes considered transient and retryable */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]); // 500 is often not transient in this app, removed it
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
  timeoutMs = 35_000,
  symbol?: string,
): Promise<FetchAttemptResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.text();

    if (!res.ok) {
      recordAutotradingDiagnostic(`llm.http_${res.status}`, 1, Date.now(), symbol);
      if (res.status === 429) recordAutotradingDiagnostic('llm.rate_limited', 1, Date.now(), symbol);

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES - 1) {
        recordAutotradingDiagnostic('llm.retry_attempt', 1, Date.now(), symbol);
        const backoff = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        console.warn(`[LLM] Transient ${res.status} on attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await sleep(backoff);
        return fetchWithRetry(url, init, attempt + 1, timeoutMs, symbol);
      }
      // 401, 400 etc — fail immediately (not transient)
      return { ok: false, status: res.status, body };
    }

    return { ok: true, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /aborted|timeout/i.test(msg);
    recordAutotradingDiagnostic(timedOut ? 'llm.timeout' : 'llm.network_error', 1, Date.now(), symbol);

    // Network-level errors (ECONNRESET, timeout) are transient
    if (attempt < MAX_RETRIES - 1) {
      recordAutotradingDiagnostic('llm.retry_attempt', 1, Date.now(), symbol);
      const backoff = Math.pow(2, attempt) * 500;
      console.warn(`[LLM] Network error on attempt ${attempt + 1}, retrying in ${backoff}ms:`, msg);
      await sleep(backoff);
      return fetchWithRetry(url, init, attempt + 1, timeoutMs, symbol);
    }
    throw err;
  } finally {
    clearTimeout(timer);
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
  /** Optional symbol context for diagnostics grouping */
  symbol?:      string;
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

  // ── 3. Resolve Candidate Models (for auto-fallback) ──────────────────────
  const models = opts.forceModel
    ? [opts.forceModel]
    : await getTopFreeModels(3).catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        recordAutotradingDiagnostic('llm.model_list_error', 1, Date.now(), opts.symbol);
        console.warn('[LLM] Failed to load model list, falling back to best model:', msg);
        return [await getBestFreeModel()];
      });

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      console.log(`[LLM] attempt → model=${model} tier=${opts.tier ?? 'free'} chars=${opts.prompt.length}`);

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
      }, 0, 35_000, opts.symbol);

      if (!result.ok) {
        // If it's an auth error, fail immediately (no point rotating)
        if (result.status === 401) {
          throw new Error('OpenRouter API key is invalid or expired. Please update it in Settings.');
        }

        // Credit exhaustion is account-level; rotating models won't help.
        if (result.status === 402) {
          recordAutotradingDiagnostic('llm.credit_exhausted', 1, Date.now(), opts.symbol);
          const parsed = JSON.parse(result.body || '{}') as { error?: { message?: string } };
          throw new Error(`OpenRouter 402: ${parsed.error?.message || '餘額不足 (Insufficient Credits)'}`);
        }
        
        // If it's a credit/quota issue (402) or rate limit (429) or server error (5xx)
        // AND we have more models to try, then continue to next model.
        if (models.indexOf(model) < models.length - 1) {
          recordAutotradingDiagnostic('llm.model_fallback', 1, Date.now(), opts.symbol);
          console.warn(`[LLM] Model ${model} failed (${result.status}), trying next candidate...`);
          continue; 
        }
        throw new Error(`OpenRouter ${result.status}: ${result.body.slice(0, 200)}`);
      }

      // If we reach here, the call succeeded!
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
      recordAutotradingDiagnostic('llm.success', 1, Date.now(), opts.symbol);

      console.log(
        `[LLM] done  model=${model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)} total=$${totalCost(tracker).toFixed(6)}`,
      );

      return { text, model, tracker, totalCostUsd: totalCost(tracker) };

    } catch (err: any) {
      lastError = err;
      recordAutotradingDiagnostic('llm.model_error', 1, Date.now(), opts.symbol);
      // If it's the last model, or it's an auth error, rethrow
      if (models.indexOf(model) === models.length - 1 || err.message.includes('API key')) {
        throw err;
      }
      console.warn(`[LLM] Error with model ${model}: ${err.message}. Retrying with next model...`);
    }
  }

  throw lastError || new Error('All candidate models failed');
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
  model?:   string,
): Promise<string> {
  const { text } = await callLLM({ prompt, jsonMode, userId, tier, forceModel: model });
  return text;
}

// Re-export the old multi-model fallback behaviour for backward compat
export { getBestFreeModel };
