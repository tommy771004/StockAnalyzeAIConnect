/**
 * server/repositories/featureSnapshotRepo.ts
 * 下單前特徵快照的 in-memory store。
 * 提供「每筆交易可回溯：輸入特徵、融合分數、下單理由、風控結果」的能力。
 */
import type { SignalFusionResult } from '../types/signal.js';
import type { DecisionAttribution } from '../services/analytics/attributionService.js';
import type { RiskCheckResult } from '../services/RiskManager.js';

export interface FeatureSnapshot {
  correlationId: string;
  tradeId?: number;
  userId: string;
  symbol: string;
  timestamp: string;
  features: Record<string, number>;
  fusionResult: SignalFusionResult;
  attribution: DecisionAttribution;
  riskResult: RiskCheckResult;
}

const store = new Map<string, FeatureSnapshot>();

export function saveSnapshot(snapshot: FeatureSnapshot): void {
  store.set(snapshot.correlationId, snapshot);
}

export function getSnapshot(correlationId: string): FeatureSnapshot | undefined {
  return store.get(correlationId);
}

export function getSnapshotsByUser(userId: string): FeatureSnapshot[] {
  return Array.from(store.values()).filter((s) => s.userId === userId);
}

export function linkTradeId(correlationId: string, tradeId: number): void {
  const snapshot = store.get(correlationId);
  if (snapshot) snapshot.tradeId = tradeId;
}
