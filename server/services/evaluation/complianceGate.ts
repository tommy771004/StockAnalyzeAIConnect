/**
 * server/services/evaluation/complianceGate.ts
 * 法遵閘門（stub）：切換 mode:'real' 前的監管/法遵硬性檢查。
 *
 * 動機（自評：缺漏的第 6 視角＝監管/市場結構）：實盤自動交易是否被允許、
 * 是否完成風險預告與轄區合規，先於「風險調整後報酬」。引擎再好，沒資格上路也不能跑。
 * 目前為 stub：要求明確的法遵確認 + 轄區白名單；真實 KYC/牌照接上前不得放行真實券商。
 * 純函式，不做 IO。
 */

export interface ComplianceGateInput {
  /** 使用者已完成法遵/風險預告確認。 */
  complianceAck: boolean;
  /** 監管轄區代碼，預設 'TW'。 */
  jurisdiction?: string;
}

export interface ComplianceGateResult {
  allowed: boolean;
  reason?: string;
}

/** 目前開放自動化實盤的轄區白名單（stub）。 */
export const ALLOWED_JURISDICTIONS = new Set<string>(['TW']);

export function checkRealModeCompliance(input: ComplianceGateInput): ComplianceGateResult {
  if (!input.complianceAck) {
    return { allowed: false, reason: '未完成法遵/風險預告確認（complianceAck），禁止上實盤' };
  }
  const jurisdiction = (input.jurisdiction ?? 'TW').toUpperCase();
  if (!ALLOWED_JURISDICTIONS.has(jurisdiction)) {
    return { allowed: false, reason: `轄區 ${jurisdiction} 尚未開放自動化實盤交易` };
  }
  return { allowed: true };
}
