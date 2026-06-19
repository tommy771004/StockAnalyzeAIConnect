/**
 * server/services/evaluation/capacityGate.ts
 * 實盤容量／群聚閘門：切換 mode:'real' 前的硬性檢查（非僅風險同意書）。
 *
 * 動機（研究簡報 Frontier）：平台自身的成長會稀釋使用者 edge——跟單人數越多，
 * 相同訊號越擁擠，恰在最需要時失效。上實盤前以「群聚 + 操作者狀態」做硬閘門。
 * 純函式，不做 IO；呼叫端負責蒐集輸入。
 */

export interface CapacityGateInput {
  /** Kill Switch 是否啟動（回撤疲勞保護中）。 */
  killSwitchActive: boolean;
  /** 目前啟用中的跟單人數＝訊號群聚代理。 */
  activeFollowers: number;
  /** 近期連續回撤日數（>0 代表尚未回穩）。 */
  consecutiveDrawdownDays: number;
}

export interface CapacityGateResult {
  allowed: boolean;
  reason?: string;
}

/** 跟單人數超過此值視為訊號過度群聚，禁止上實盤。 */
export const MAX_FOLLOWERS_FOR_REAL = 50;
/** 近期連續回撤日數超過此值（即 >0）不可上實盤。 */
export const MAX_DRAWDOWN_DAYS_FOR_REAL = 0;

export function checkRealModeCapacity(input: CapacityGateInput): CapacityGateResult {
  if (input.killSwitchActive) {
    return { allowed: false, reason: 'Kill Switch 啟動中（回撤疲勞保護），禁止切換實盤' };
  }
  if (input.consecutiveDrawdownDays > MAX_DRAWDOWN_DAYS_FOR_REAL) {
    return { allowed: false, reason: `近期連續回撤 ${input.consecutiveDrawdownDays} 日，需回穩後方可上實盤` };
  }
  if (input.activeFollowers > MAX_FOLLOWERS_FOR_REAL) {
    return { allowed: false, reason: `跟單人數 ${input.activeFollowers} 超過群聚上限 ${MAX_FOLLOWERS_FOR_REAL}，訊號已過度擁擠` };
  }
  return { allowed: true };
}
