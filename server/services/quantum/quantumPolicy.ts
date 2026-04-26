/**
 * server/services/quantum/quantumPolicy.ts
 *
 * Pure function layer — accepts a pre-quantum SignalFusionResult and the raw
 * Python quantum output, applies uncertainty gating + leverage adjustment, and
 * returns a QuantumPolicyResult.
 *
 * Intentionally does NOT import or call RiskManager. The caller (autonomousAgent)
 * applies RiskManager after receiving this result.
 */

import type { SignalAction, SignalFusionResult } from '../../types/signal.js';

export interface RawQuantumOutput {
  action: SignalAction;
  confidence: number;          // 0..100
  momentum_phase: number;      // -1..1
  regime_flip_prob: number;    // 0..1
  uncertainty_penalty: number; // 0..1
  model: string;
  errors: string[];
}

export interface QuantumPolicyResult {
  action: SignalAction;
  confidence: number;
  leverageMultiplier: number;   // [0.25, 1.0]
  preQuantumAction: SignalAction;
  preQuantumConfidence: number;
  quantumScores: {
    momentum_phase: number;
    regime_flip_prob: number;
    uncertainty_penalty: number;
  };
  reason: string;
  gated: boolean;
}

const UNCERTAINTY_GATE_THRESHOLD = 0.65;
const MIN_LEVERAGE = 0.25;
const MAX_LEVERAGE = 1.0;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Derive leverage multiplier from uncertainty_penalty.
 * Linear interpolation: penalty=0 → 1.0, penalty=1 → 0.25
 */
function deriveLeverage(uncertaintyPenalty: number): number {
  const p = clamp(uncertaintyPenalty, 0, 1);
  return clamp(MAX_LEVERAGE - p * (MAX_LEVERAGE - MIN_LEVERAGE), MIN_LEVERAGE, MAX_LEVERAGE);
}

/**
 * Adjust confidence using momentum_phase.
 * Negative momentum_phase dampens confidence proportionally.
 */
function adjustConfidence(confidence: number, momentumPhase: number): number {
  if (momentumPhase >= 0) return confidence;
  // momentum_phase in [-1, 0): reduce confidence by up to 30%
  const reduction = Math.abs(momentumPhase) * 0.3;
  return clamp(confidence * (1 - reduction), 0, 100);
}

export function applyQuantumPolicy(
  fused: SignalFusionResult,
  quantum: RawQuantumOutput,
): QuantumPolicyResult {
  const preQuantumAction = fused.action;
  const preQuantumConfidence = fused.confidence;

  const { momentum_phase, regime_flip_prob, uncertainty_penalty } = quantum;
  const quantumScores = { momentum_phase, regime_flip_prob, uncertainty_penalty };

  const gated = uncertainty_penalty > UNCERTAINTY_GATE_THRESHOLD;
  const action: SignalAction = gated ? 'HOLD' : fused.action;

  const adjustedConfidence = gated
    ? 0
    : adjustConfidence(fused.confidence, momentum_phase);

  const leverageMultiplier = deriveLeverage(uncertainty_penalty);

  const reason = gated
    ? `quantum gated: uncertainty_penalty=${uncertainty_penalty.toFixed(3)} > ${UNCERTAINTY_GATE_THRESHOLD}`
    : `quantum ok: uncertainty=${uncertainty_penalty.toFixed(3)}, momentum=${momentum_phase.toFixed(3)}`;

  return {
    action,
    confidence: Number(adjustedConfidence.toFixed(2)),
    leverageMultiplier: Number(leverageMultiplier.toFixed(4)),
    preQuantumAction,
    preQuantumConfidence,
    quantumScores,
    reason,
    gated,
  };
}
