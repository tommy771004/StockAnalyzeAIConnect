/**
 * server/services/autotradingDiagnostics.ts
 *
 * In-memory diagnostics counters for AutoTrading runtime health.
 * Focuses on transient failures (timeout/429/402/network) and exposes
 * totals + recent minute-level trends for quick troubleshooting.
 */

const STARTED_AT_MS = Date.now();
const MAX_WINDOW_MINUTES = Math.max(60, Number(process.env.AUTOTRADING_DIAGNOSTICS_MAX_MINUTES ?? 24 * 60));

const totalCounters = new Map<string, number>();
const minuteBuckets = new Map<number, Map<string, number>>();

interface DiagnosticsSeriesPoint {
  minute: string;
  counters: Record<string, number>;
}

export interface AutotradingDiagnosticsSnapshot {
  startedAt: string;
  uptimeMs: number;
  maxWindowMinutes: number;
  windowMinutes: number;
  totals: Record<string, number>;
  windowTotals: Record<string, number>;
  series: DiagnosticsSeriesPoint[];
}

function toMinuteEpoch(tsMs: number): number {
  return Math.floor(tsMs / 60_000) * 60_000;
}

function toSortedObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function addCounter(map: Map<string, number>, metric: string, delta: number): void {
  map.set(metric, (map.get(metric) ?? 0) + delta);
}

function pruneOldBuckets(nowMs: number): void {
  if (minuteBuckets.size <= MAX_WINDOW_MINUTES + 5) return;
  const oldestKeep = toMinuteEpoch(nowMs) - (MAX_WINDOW_MINUTES - 1) * 60_000;
  for (const key of minuteBuckets.keys()) {
    if (key < oldestKeep) minuteBuckets.delete(key);
  }
}

export function recordAutotradingDiagnostic(metric: string, delta = 1, tsMs = Date.now()): void {
  const name = metric.trim();
  if (!name) return;
  if (!Number.isFinite(delta) || delta === 0) return;

  addCounter(totalCounters, name, delta);

  const minuteKey = toMinuteEpoch(tsMs);
  const bucket = minuteBuckets.get(minuteKey) ?? new Map<string, number>();
  addCounter(bucket, name, delta);
  minuteBuckets.set(minuteKey, bucket);

  pruneOldBuckets(tsMs);
}

export function getAutotradingDiagnostics(windowMinutes = 60): AutotradingDiagnosticsSnapshot {
  const safeWindow = Math.min(
    MAX_WINDOW_MINUTES,
    Math.max(1, Number.isFinite(windowMinutes) ? Math.floor(windowMinutes) : 60),
  );

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

  const series: DiagnosticsSeriesPoint[] = seriesEntries.map(([minute, counters]) => ({
    minute: new Date(minute).toISOString(),
    counters: toSortedObject(counters),
  }));

  return {
    startedAt: new Date(STARTED_AT_MS).toISOString(),
    uptimeMs: nowMs - STARTED_AT_MS,
    maxWindowMinutes: MAX_WINDOW_MINUTES,
    windowMinutes: safeWindow,
    totals: toSortedObject(totalCounters),
    windowTotals: toSortedObject(windowAggregate),
    series,
  };
}
