/**
 * server/services/derivatives/marginCalc.ts
 * 台灣期權保證金計算 (原始保證金 + 維持保證金)
 *
 * 資料來源: TAIFEX 官方公佈
 * https://www.taifex.com.tw/chinese/3/100
 *
 * 注意：實際保證金會定期調整，此處為 2026 年初的典型值
 */

export interface MarginConfig {
  // 期貨原始保證金（台幣）
  txfInitialMargin: number;  // 台指期貨，通常 ~165,000-170,000
  txoInitialMultiplier: number; // 台指選擇權，通常 0.15 (15% of notional)

  // 維持保證金（原始保證金的百分比）
  maintenanceRatio: number; // 通常 0.7-0.75
}

export interface MarginResult {
  initialMargin: number;  // 原始保證金
  maintenanceMargin: number; // 維持保證金
  totalUsed: number; // max(initial, maintenance)
}

// 預設設定（2026 年初，請定期更新）
const DEFAULT_CONFIG: MarginConfig = {
  txfInitialMargin: 167_000,    // 台指期貨原始保證金約 NT$167,000
  txoInitialMultiplier: 0.15,   // 台指選擇權 15% notional
  maintenanceRatio: 0.70,       // 維持保證金 70% of initial
};

/**
 * 計算期貨保證金 (TXF)
 */
export function calculateFuturesMargin(
  qty: number,
  spotPrice: number,
  config = DEFAULT_CONFIG,
): MarginResult {
  // 台指期貨單位為 1 點 = NT$200
  const contractValue = spotPrice * 200;

  // 原始保證金
  const initialMargin = config.txfInitialMargin * Math.abs(qty);

  // 維持保證金
  const maintenanceMargin = initialMargin * config.maintenanceRatio;

  return {
    initialMargin,
    maintenanceMargin,
    totalUsed: Math.max(initialMargin, maintenanceMargin),
  };
}

/**
 * 計算選擇權保證金 (TXO)
 *
 * Call 賣方 (Short Call) 保證金:
 *   = max(premium + MAX(delta * S, strike * 0.1), 0.15 * S * multiplier)
 *
 * Put 賣方 (Short Put) 保證金:
 *   = max(premium + MAX(0.2 * K, 0.15 * S), strike * multiplier)
 *
 * Long Call / Put: 標準保證金 (不需額外保證金，只扣權利金)
 */
export function calculateOptionMargin(
  side: 'BUY' | 'SELL',
  optionType: 'C' | 'P',
  qty: number,
  strike: number,
  spotPrice: number,
  premium: number,
  delta: number = 0,
  config = DEFAULT_CONFIG,
): MarginResult {
  const absQty = Math.abs(qty);
  const multiplier = 100; // 台指選擇權 1 contract = 100 倍

  if (side === 'BUY') {
    // Long call/put - 只需支付權利金，無額外保證金
    return {
      initialMargin: premium * absQty * multiplier,
      maintenanceMargin: premium * absQty * multiplier,
      totalUsed: premium * absQty * multiplier,
    };
  }

  // SELL (賣方保證金)
  const notional = spotPrice * multiplier;

  if (optionType === 'C') {
    // Short Call
    const premiumComponent = premium * absQty * multiplier;
    const deltaComponent = Math.max(delta * spotPrice, strike * 0.1) * absQty;
    const floor = 0.15 * notional * absQty;
    const margin = Math.max(premiumComponent + deltaComponent, floor);

    return {
      initialMargin: margin,
      maintenanceMargin: margin * config.maintenanceRatio,
      totalUsed: Math.max(margin, margin * config.maintenanceRatio),
    };
  } else {
    // Short Put
    const premiumComponent = premium * absQty * multiplier;
    const strikeComponent = Math.max(0.2 * strike, 0.15 * spotPrice) * absQty;
    const margin = premiumComponent + strikeComponent;

    return {
      initialMargin: margin,
      maintenanceMargin: margin * config.maintenanceRatio,
      totalUsed: Math.max(margin, margin * config.maintenanceRatio),
    };
  }
}

/**
 * 計算投資組合級別的保證金需求
 * (假設 delta neutral 或給定 net delta)
 */
export function calculatePortfolioMargin(
  positions: Array<{
    type: 'FUTURE' | 'OPTION';
    side: 'BUY' | 'SELL';
    optionType?: 'C' | 'P';
    qty: number;
    strike?: number;
    spotPrice: number;
    premium?: number;
    delta?: number;
  }>,
  config = DEFAULT_CONFIG,
): {
  totalInitialMargin: number;
  totalMaintenanceMargin: number;
  netDelta: number;
} {
  let totalInitial = 0;
  let totalMaintenance = 0;
  let netDelta = 0;

  for (const pos of positions) {
    if (pos.type === 'FUTURE') {
      const margin = calculateFuturesMargin(pos.qty, pos.spotPrice, config);
      totalInitial += margin.initialMargin;
      totalMaintenance += margin.maintenanceMargin;
      // Futures delta ~= 1
      netDelta += pos.qty * (pos.side === 'BUY' ? 1 : -1);
    } else {
      const margin = calculateOptionMargin(
        pos.side,
        pos.optionType ?? 'C',
        pos.qty,
        pos.strike ?? pos.spotPrice,
        pos.spotPrice,
        pos.premium ?? 0,
        pos.delta ?? 0,
        config,
      );
      totalInitial += margin.initialMargin;
      totalMaintenance += margin.maintenanceMargin;
      const positionDelta = (pos.delta ?? 0) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
      netDelta += positionDelta;
    }
  }

  return {
    totalInitialMargin: totalInitial,
    totalMaintenanceMargin: totalMaintenance,
    netDelta,
  };
}
