/**
 * server/services/analytics/featureStoreService.ts
 * 共享特徵快取，供 AutoTrading / Backtest / Screener 使用同一份特徵向量。
 */

export interface FeatureVector {
  symbol: string;
  timestamp: string;
  rsi: number;
  macd_diff: number;
  flow_bias: number;
  returns_5d: number;
  volatility: number;
  sector?: string;
  [key: string]: unknown;
}

export interface SectorFeatureAggregate {
  sector: string;
  avgRsi: number;
  avgMacdDiff: number;
  avgReturns5d: number;
  count: number;
  updatedAt: string;
}

const featureCache = new Map<string, FeatureVector>();
const sectorCache = new Map<string, SectorFeatureAggregate>();

export function cacheFeatures(features: FeatureVector): void {
  featureCache.set(features.symbol, features);
}

export function getFeatures(symbol: string): FeatureVector | undefined {
  return featureCache.get(symbol);
}

export function updateSectorAggregate(
  sector: string,
  vectors: FeatureVector[],
): SectorFeatureAggregate {
  const n = vectors.length;
  if (n === 0) {
    const empty: SectorFeatureAggregate = {
      sector,
      avgRsi: 50,
      avgMacdDiff: 0,
      avgReturns5d: 0,
      count: 0,
      updatedAt: new Date().toISOString(),
    };
    sectorCache.set(sector, empty);
    return empty;
  }
  const sum = (fn: (v: FeatureVector) => number) =>
    vectors.reduce((acc, v) => acc + fn(v), 0);

  const agg: SectorFeatureAggregate = {
    sector,
    avgRsi: sum((v) => v.rsi) / n,
    avgMacdDiff: sum((v) => v.macd_diff) / n,
    avgReturns5d: sum((v) => v.returns_5d) / n,
    count: n,
    updatedAt: new Date().toISOString(),
  };
  sectorCache.set(sector, agg);
  return agg;
}

export function getSectorFeatures(sector: string): SectorFeatureAggregate | undefined {
  return sectorCache.get(sector);
}

export function getAllSectorFeatures(): SectorFeatureAggregate[] {
  return Array.from(sectorCache.values());
}
