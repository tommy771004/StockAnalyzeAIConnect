import type { DataProviderRegistry } from '../data/registry.js';
import { BarSchema, type StrategyBar } from '../types/strategyRuntime.js';
import type { LoadStrategyBars } from './strategyRuntimeService.js';

type DataResolver = Pick<DataProviderRegistry, 'resolve'>;

function marketFor(symbol: string): 'tw_stock' | 'us_stock' | 'crypto' | 'forex' {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.TW') || upper.endsWith('.TWO')) return 'tw_stock';
  if (upper.endsWith('-USD') || upper.endsWith('-USDT')) return 'crypto';
  if (upper.endsWith('=X')) return 'forex';
  return 'us_stock';
}

function asIsoTime(value: string | number): string | undefined {
  const numeric = typeof value === 'number' || /^\d+$/.test(String(value))
    ? Number(value)
    : Number.NaN;
  const timestamp = Number.isFinite(numeric)
    ? (numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function createRegistryBarLoader(
  registry: DataResolver,
  now: () => number = Date.now,
): LoadStrategyBars {
  return async ({ symbol, period1, period2 }) => {
    const envelope = await registry.resolve({
      operation: 'bars',
      symbol,
      market: marketFor(symbol),
      params: {
        interval: '1d',
        start: asIsoTime(period1 ?? now() - 365 * 24 * 60 * 60 * 1_000),
        end: asIsoTime(period2 ?? now()),
        limit: 10_000,
      },
    });
    const bars = (Array.isArray(envelope.data) ? envelope.data : [])
      .flatMap((value): StrategyBar[] => {
        const parsed = BarSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      });
    if (bars.length < 2) {
      throw new Error(`Insufficient normalized OHLCV data for ${symbol}`);
    }
    console.info(
      `[StrategyRuntime] bars source=${envelope.provenance.providerId}`
      + ` marketTimestamp=${envelope.provenance.marketTimestamp}`,
    );
    return bars;
  };
}
