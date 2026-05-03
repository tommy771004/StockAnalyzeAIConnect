/**
 * server/types/signal.ts
 * Unified signal contracts for strategy/live/backtest paths.
 */

export type SignalSource = 'technical' | 'ai' | 'quantum' | 'macro' | 'forecast';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface SignalObservation {
  source: SignalSource;
  action: SignalAction;
  confidence: number; // 0..100
  weight?: number; // default 1
  score?: number; // optional normalized score -1..1
  latencyMs?: number;
  sourceVersion?: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

export interface SignalFusionInput {
  symbol: string;
  observations: SignalObservation[];
  minConfidence?: number;
  preferSource?: SignalSource;
  quantumEnabled?: boolean;
  /** Score dead zone for HOLD: |score| < holdThreshold → HOLD. Default 0.15. */
  holdThreshold?: number;
}

export interface SignalComponent {
  source: SignalSource;
  action: SignalAction;
  confidence: number;
  weight: number;
  score: number;
  weightedScore: number;
  reason?: string;
  latencyMs?: number;
  sourceVersion?: string;
}

export interface SignalFusionResult {
  symbol: string;
  action: SignalAction;
  confidence: number;
  score: number;
  reason: string;
  components: SignalComponent[];
  meta: {
    minConfidence: number;
    quantumEnabled: boolean;
    preferSource?: SignalSource;
  };
}
