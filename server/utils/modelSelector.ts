/**
 * server/utils/modelSelector.ts
 *
 * OpenRouter free-model selection with 1-hour cache. Shared by server.ts
 * (/api/ai/summarize) and server/api/agent.ts (/api/agent/chat) so that
 * both features adapt to OpenRouter's evolving free-tier roster instead
 * of pinning a hardcoded model ID.
 */

let cachedFreeModels: string[] = [];
let lastModelFetch = 0;
const CACHE_DURATION = 3600 * 1000; // 1 hour
const DEFAULT_FALLBACK = 'google/gemini-2.0-flash-exp:free';

/**
 * Dynamically fetches and selects the best available free model from OpenRouter.
 * Prefers larger / flagship models (70b, large, pro). Cached for 1h.
 */
export async function getBestFreeModel(): Promise<string> {
  const now = Date.now();
  if (cachedFreeModels.length > 0 && now - lastModelFetch < CACHE_DURATION) {
    return cachedFreeModels[0];
  }

  try {
    console.log('[AI] Fetching latest free models from OpenRouter...');
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error('Failed to fetch models');

    const json = (await res.json()) as any;
    const allModels = json.data || [];

    const freeModels: string[] = allModels
      .filter((m: any) => m.pricing?.prompt === '0' && m.pricing?.completion === '0')
      .map((m: any) => m.id);

    if (freeModels.length > 0) {
      freeModels.sort((a: string, b: string) => {
        const getScore = (id: string) => {
          id = id.toLowerCase();
          if (id.includes('70b') || id.includes('large')) return 100;
          if (id.includes('pro')) return 80;
          if (id.includes('flash')) return 60;
          if (id.includes('gemini')) return 50;
          return 0;
        };
        return getScore(b) - getScore(a);
      });

      cachedFreeModels = freeModels;
      lastModelFetch = now;
      console.log(`[AI] Selected top free model: ${cachedFreeModels[0]}`);
      return cachedFreeModels[0];
    }
  } catch (err) {
    console.warn('[AI] Error fetching free models, falling back to default:', (err as Error).message);
  }

  return DEFAULT_FALLBACK;
}

/** Returns a snapshot of the cached free-model list (up to N). Refreshes cache if empty. */
export async function getTopFreeModels(limit = 3): Promise<string[]> {
  if (cachedFreeModels.length === 0) await getBestFreeModel();
  const slice = cachedFreeModels.slice(0, limit);
  return slice.length > 0 ? slice : [DEFAULT_FALLBACK];
}
