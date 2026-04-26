/**
 * server/services/analytics/attributionService.ts
 * 純函數：從訊號融合結果計算「哪個訊號主導這筆決策」。
 */
import type { SignalFusionResult } from '../../types/signal.js';
import type { QuantumPolicyResult } from '../quantum/quantumPolicy.js';

export interface SignalComponentSummary {
  source: string;
  score: number;
  weight: number;
  action: string;
}

export interface DecisionAttribution {
  correlationId: string;
  symbol: string;
  timestamp: string;
  preQuantumAction: string;
  finalAction: string;
  dominantSource: string;
  signalComponents: SignalComponentSummary[];
  quantumGated: boolean;
  leverageMultiplier: number;
  fusionScore: number;
  reason: string;
}

function pickDominantSource(components: SignalFusionResult['components']): string {
  if (components.length === 0) return 'none';
  return components.reduce((best, c) =>
    Math.abs(c.weightedScore) > Math.abs(best.weightedScore) ? c : best,
  ).source;
}

export function computeAttribution(
  fused: SignalFusionResult,
  quantum: QuantumPolicyResult | null,
  correlationId: string,
): DecisionAttribution {
  const finalAction = quantum?.action ?? fused.action;
  const preQuantumAction = quantum?.preQuantumAction ?? fused.action;
  const quantumGated = quantum?.gated ?? false;
  const leverageMultiplier = quantum?.leverageMultiplier ?? 1.0;

  const signalComponents: SignalComponentSummary[] = fused.components.map((c) => ({
    source: c.source,
    score: c.score,
    weight: c.weight,
    action: c.action,
  }));

  const dominantSource = quantumGated
    ? 'quantum'
    : pickDominantSource(fused.components);

  const reason = quantum
    ? `${quantum.reason}; fused: ${fused.reason}`
    : fused.reason;

  return {
    correlationId,
    symbol: fused.symbol,
    timestamp: new Date().toISOString(),
    preQuantumAction,
    finalAction,
    dominantSource,
    signalComponents,
    quantumGated,
    leverageMultiplier,
    fusionScore: fused.score,
    reason,
  };
}
