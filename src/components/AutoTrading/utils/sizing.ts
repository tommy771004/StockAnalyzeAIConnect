/**
 * src/components/AutoTrading/utils/sizing.ts
 * 倉位計算工具庫 (Position Sizing Utilities)
 */

import { StrategyParams } from '../types';

/**
 * 計算動態倉位 (Risk-based Sizing)
 * 公式: 單位數 = (總資產 * 每筆風險%) / (進場價 - 止損價)
 * 
 * @param equity 帳戶總資產 (TWD)
 * @param entryPrice 預期進場價
 * @param stopLossPct 止損百分比 (例如 3.0 代表 3%)
 * @param params 策略參數 (包含風險比例)
 * @returns { units: number, cost: number, isLimited: boolean }
 */
export function calculateRiskBasedSize(
  equity: number,
  entryPrice: number,
  stopLossPct: number,
  params: StrategyParams
) {
  const riskPct = params.riskPerTradePct || 1.0;
  const maxPosPct = params.maxPositionPct || 20.0;
  
  // 1. 計算這筆交易願意承擔的金額 (Risk Amount)
  const riskAmount = equity * (riskPct / 100);
  
  // 2. 計算止損距離 (Price Distance)
  const stopLossPrice = entryPrice * (1 - (stopLossPct / 100));
  const priceDistance = Math.abs(entryPrice - stopLossPrice);
  
  if (priceDistance === 0) return { units: 0, cost: 0, isLimited: false };

  // 3. 根據風險計算單位數
  let units = Math.floor(riskAmount / priceDistance);
  
  // 4. 檢查是否超過單筆最大持倉限制 (Max Position Size)
  const maxCost = equity * (maxPosPct / 100);
  const currentCost = units * entryPrice;
  
  let isLimited = false;
  if (currentCost > maxCost) {
    units = Math.floor(maxCost / entryPrice);
    isLimited = true;
  }

  return {
    units,
    cost: units * entryPrice,
    isLimited,
    riskAmount: units * priceDistance
  };
}

/**
 * 根據設定選擇計算方式
 */
export function getPositionSize(
  equity: number,
  entryPrice: number,
  params: StrategyParams
) {
  if (params.sizingMethod === 'risk_base') {
    return calculateRiskBasedSize(
      equity,
      entryPrice,
      params.stopLossPct || 5.0, // 預設 5% 止損若未設定
      params
    );
  }

  // 固定金額模式
  const fixedAmount = params.maxAllocationPerTrade || 100000;
  const units = Math.floor(fixedAmount / entryPrice);
  
  return {
    units,
    cost: units * entryPrice,
    isLimited: false,
    riskAmount: units * entryPrice * ((params.stopLossPct || 5.0) / 100)
  };
}
