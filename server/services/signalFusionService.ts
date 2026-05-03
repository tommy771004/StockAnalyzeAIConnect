/**
 * server/services/signalFusionService.ts
 * Unified signal fusion for live agent + backtest paths.
 */
import type {
  SignalAction,
  SignalComponent,
  SignalFusionInput,
  SignalFusionResult,
  SignalObservation,
} from '../types/signal.js';

const ACTION_SCORE: Record<SignalAction, number> = {
  BUY: 1,
  SELL: -1,
  HOLD: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(v);
}

export function isQuantumSignalEnabled(): boolean {
  return envBool('ENABLE_QUANTUM_SIGNAL', false);
}

function normalizeObservation(o: SignalObservation): SignalComponent {
  const confidence = clamp(Number.isFinite(o.confidence) ? o.confidence : 0, 0, 100);
  const weight = clamp(Number.isFinite(o.weight) ? (o.weight as number) : 1, 0, 5);
  const score = clamp(
    Number.isFinite(o.score) ? (o.score as number) : ACTION_SCORE[o.action],
    -1,
    1,
  );
  const weightedScore = score * (confidence / 100) * weight;
  return {
    source: o.source,
    action: o.action,
    confidence,
    weight,
    score,
    weightedScore,
    reason: o.reason,
    latencyMs: o.latencyMs,
    sourceVersion: o.sourceVersion,
  };
}

function actionFromScore(score: number, holdThreshold = 0.15): SignalAction {
  if (score > holdThreshold) return 'BUY';
  if (score < -holdThreshold) return 'SELL';
  return 'HOLD';
}

export function fuseSignals(input: SignalFusionInput): SignalFusionResult {
  const quantumEnabled = input.quantumEnabled ?? isQuantumSignalEnabled();
  const minConfidence = clamp(input.minConfidence ?? 55, 0, 100);

  const components = input.observations
    .filter((o) => quantumEnabled || o.source !== 'quantum')
    .map(normalizeObservation)
    .filter((o) => o.weight > 0);

  if (components.length === 0) {
    return {
      symbol: input.symbol,
      action: 'HOLD',
      confidence: 0,
      score: 0,
      reason: 'No valid signal observations',
      components: [],
      meta: { minConfidence, quantumEnabled, preferSource: input.preferSource },
    };
  }

  const weightedDenom = components.reduce((acc, c) => acc + c.weight * (c.confidence / 100), 0);
  const weightedSum = components.reduce((acc, c) => acc + c.weightedScore, 0);
  const score = weightedDenom > 0 ? weightedSum / weightedDenom : 0;
  const avgConfidence = components.reduce((acc, c) => acc + c.confidence, 0) / components.length;
  const aggregateConfidence = clamp(Math.abs(score) * 100 * 0.7 + avgConfidence * 0.3, 0, 100);

  const holdThreshold = clamp(input.holdThreshold ?? 0.15, 0.01, 0.5);
  let action = actionFromScore(score, holdThreshold);
  let confidence = aggregateConfidence;
  let reason = `Fused ${components.length} signals`;

  // Legacy-safe mode: quantum flag off 時，優先保留 AI 主決策語義，避免行為突變。
  if (!quantumEnabled && input.preferSource) {
    const preferred = components.find((c) => c.source === input.preferSource);
    if (preferred) {
      action = preferred.action;
      confidence = clamp(Math.max(preferred.confidence, aggregateConfidence * 0.7), 0, 100);
      reason = `Preferred ${input.preferSource} source while quantum flag is off`;
    }
  }

  if (confidence < minConfidence) {
    action = 'HOLD';
    reason += `; confidence ${confidence.toFixed(1)} < ${minConfidence}`;
  }

  return {
    symbol: input.symbol,
    action,
    confidence: Number(confidence.toFixed(2)),
    score: Number(score.toFixed(4)),
    reason,
    components,
    meta: { minConfidence, quantumEnabled, preferSource: input.preferSource },
  };
}

