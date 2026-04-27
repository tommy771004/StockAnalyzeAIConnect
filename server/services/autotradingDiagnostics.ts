/**
 * server/services/autotradingDiagnostics.ts
 *
 * In-memory diagnostics counters for AutoTrading runtime health.
 * Focuses on transient failures (timeout/429/402/network) and exposes
 * totals + recent minute-level trends for quick troubleshooting.
 */

const STARTED_AT_MS = Date.now();
const MAX_WINDOW_MINUTES = Math.max(60, Number(process.env.AUTOTRADING_DIAGNOSTICS_MAX_MINUTES ?? 24 * 60));
let lastResetAtMs: number | null = null;

const totalCounters = new Map<string, number>();
const minuteBuckets = new Map<number, Map<string, number>>();
const totalCountersBySymbol = new Map<string, Map<string, number>>();
const minuteBucketsBySymbol = new Map<number, Map<string, Map<string, number>>>();

interface DiagnosticsSeriesPoint {
  minute: string;
  counters: Record<string, number>;
}

export interface AutotradingDiagnosticsSnapshot {
  startedAt: string;
  uptimeMs: number;
  maxWindowMinutes: number;
  windowMinutes: number;
  symbolFilter?: string;
  lastResetAt?: string;
  totals: Record<string, number>;
  windowTotals: Record<string, number>;
  bySymbolTotals: Record<string, Record<string, number>>;
  bySymbolWindowTotals: Record<string, Record<string, number>>;
  series: DiagnosticsSeriesPoint[];
  symbolSeries?: DiagnosticsSeriesPoint[];
}

export interface AutotradingDiagnosticsResetResult {
  resetAt: string;
  clearedTotals: number;
  clearedMinuteBuckets: number;
  clearedSymbolGroups: number;
}

function toMinuteEpoch(tsMs: number): number {
  return Math.floor(tsMs / 60_000) * 60_000;
}

function toSortedObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function nestedMapToSortedObject(
  nested: Map<string, Map<string, number>>,
  symbolFilter?: string,
): Record<string, Record<string, number>> {
  const entries = [...nested.entries()]
    .filter(([symbol]) => !symbolFilter || symbol === symbolFilter)
    .sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(entries.map(([symbol, counters]) => [symbol, toSortedObject(counters)]));
}

function addCounter(map: Map<string, number>, metric: string, delta: number): void {
  map.set(metric, (map.get(metric) ?? 0) + delta);
}

function addSymbolCounter(
  map: Map<string, Map<string, number>>,
  symbol: string,
  metric: string,
  delta: number,
): void {
  const symbolMap = map.get(symbol) ?? new Map<string, number>();
  addCounter(symbolMap, metric, delta);
  map.set(symbol, symbolMap);
}

function normalizeSymbol(symbol?: string): string | null {
  if (!symbol) return null;
  const normalized = symbol.trim().toUpperCase();
  return normalized || null;
}

function pruneOldBuckets(nowMs: number): void {
  if (minuteBuckets.size <= MAX_WINDOW_MINUTES + 5) return;
  const oldestKeep = toMinuteEpoch(nowMs) - (MAX_WINDOW_MINUTES - 1) * 60_000;
  for (const key of minuteBuckets.keys()) {
    if (key < oldestKeep) minuteBuckets.delete(key);
  }
  for (const key of minuteBucketsBySymbol.keys()) {
    if (key < oldestKeep) minuteBucketsBySymbol.delete(key);
  }
}

export function recordAutotradingDiagnostic(metric: string, delta = 1, tsMs = Date.now(), symbol?: string): void {
  const name = metric.trim();
  if (!name) return;
  if (!Number.isFinite(delta) || delta === 0) return;
  const normalizedSymbol = normalizeSymbol(symbol);

  addCounter(totalCounters, name, delta);

  const minuteKey = toMinuteEpoch(tsMs);
  const bucket = minuteBuckets.get(minuteKey) ?? new Map<string, number>();
  addCounter(bucket, name, delta);
  minuteBuckets.set(minuteKey, bucket);

  if (normalizedSymbol) {
    addSymbolCounter(totalCountersBySymbol, normalizedSymbol, name, delta);
    const symbolBucket = minuteBucketsBySymbol.get(minuteKey) ?? new Map<string, Map<string, number>>();
    addSymbolCounter(symbolBucket, normalizedSymbol, name, delta);
    minuteBucketsBySymbol.set(minuteKey, symbolBucket);
  }

  pruneOldBuckets(tsMs);
}

export function getAutotradingDiagnostics(windowMinutes = 60, symbol?: string): AutotradingDiagnosticsSnapshot {
  const safeWindow = Math.min(
    MAX_WINDOW_MINUTES,
    Math.max(1, Number.isFinite(windowMinutes) ? Math.floor(windowMinutes) : 60),
  );
  const normalizedSymbol = normalizeSymbol(symbol) ?? undefined;

  const nowMs = Date.now();
  const fromMinute = toMinuteEpoch(nowMs) - (safeWindow - 1) * 60_000;

  const seriesEntries = [...minuteBuckets.entries()]
    .filter(([minute]) => minute >= fromMinute)
    .sort((a, b) => a[0] - b[0]);

  const windowAggregate = new Map<string, number>();
  for (const [, counters] of seriesEntries) {
    for (const [metric, value] of counters.entries()) {
      addCounter(windowAggregate, metric, value);
    }
  }

  const windowBySymbolAggregate = new Map<string, Map<string, number>>();
  for (const [minute, symbolCounters] of minuteBucketsBySymbol.entries()) {
    if (minute < fromMinute) continue;
    for (const [symbolKey, counters] of symbolCounters.entries()) {
      if (normalizedSymbol && symbolKey !== normalizedSymbol) continue;
      for (const [metric, value] of counters.entries()) {
        addSymbolCounter(windowBySymbolAggregate, symbolKey, metric, value);
      }
    }
  }

  let symbolSeries: DiagnosticsSeriesPoint[] | undefined;
  if (normalizedSymbol) {
    symbolSeries = [...minuteBucketsBySymbol.entries()]
      .filter(([minute]) => minute >= fromMinute)
      .sort((a, b) => a[0] - b[0])
      .map(([minute, symbolCounters]) => {
        const counters = symbolCounters.get(normalizedSymbol) ?? new Map<string, number>();
        return {
          minute: new Date(minute).toISOString(),
          counters: toSortedObject(counters),
        };
      })
      .filter((point) => Object.keys(point.counters).length > 0);
  }

  const series: DiagnosticsSeriesPoint[] = seriesEntries.map(([minute, counters]) => ({
    minute: new Date(minute).toISOString(),
    counters: toSortedObject(counters),
  }));

  return {
    startedAt: new Date(STARTED_AT_MS).toISOString(),
    uptimeMs: nowMs - STARTED_AT_MS,
    maxWindowMinutes: MAX_WINDOW_MINUTES,
    windowMinutes: safeWindow,
    symbolFilter: normalizedSymbol,
    lastResetAt: lastResetAtMs ? new Date(lastResetAtMs).toISOString() : undefined,
    totals: toSortedObject(totalCounters),
    windowTotals: toSortedObject(windowAggregate),
    bySymbolTotals: nestedMapToSortedObject(totalCountersBySymbol, normalizedSymbol),
    bySymbolWindowTotals: nestedMapToSortedObject(windowBySymbolAggregate, normalizedSymbol),
    series,
    symbolSeries,
  };
}

export function resetAutotradingDiagnostics(): AutotradingDiagnosticsResetResult {
  const result: AutotradingDiagnosticsResetResult = {
    resetAt: new Date().toISOString(),
    clearedTotals: totalCounters.size,
    clearedMinuteBuckets: minuteBuckets.size,
    clearedSymbolGroups: totalCountersBySymbol.size,
  };

  totalCounters.clear();
  minuteBuckets.clear();
  totalCountersBySymbol.clear();
  minuteBucketsBySymbol.clear();
  lastResetAtMs = Date.now();

  return result;
}
