/**
 * server/services/twFees.ts
 * 台股交易稅費計算（共享版本，供 SimulatedAdapter 與報表使用）。
 *
 *  - 手續費：0.1425%，最低 20 元；多數券商會給 0.28~0.6 折優惠（dispatch via discount）
 *  - 證交稅：賣出時收 0.3%；當沖（同日買賣同檔）減半至 0.15%
 *  - ETF：0.1%（保留 isETF 旗標供未來擴充）
 */

export interface FeeBreakdown {
  commission: number;
  tax: number;
  totalFee: number;
}

export interface FeeOptions {
  side: 'BUY' | 'SELL';
  /** 手續費折扣，1 = 不打折，0.28 = 28 折，預設 1 */
  commissionDiscount?: number;
  /** 是否當日沖銷（買賣同日），會將證交稅減半 */
  isDayTrade?: boolean;
  /** 是否為 ETF（證交稅 0.1%） */
  isETF?: boolean;
}

export const TW_COMMISSION_RATE = 0.001425;
export const TW_COMMISSION_MIN = 20;
export const TW_TAX_STOCK = 0.003;
export const TW_TAX_STOCK_DAYTRADE = 0.0015;
export const TW_TAX_ETF = 0.001;

export function computeTwStockFees(orderValue: number, opts: FeeOptions): FeeBreakdown {
  const discount = opts.commissionDiscount ?? 1;
  const commission = Math.max(TW_COMMISSION_MIN, orderValue * TW_COMMISSION_RATE * discount);

  let tax = 0;
  if (opts.side === 'SELL') {
    if (opts.isETF) tax = orderValue * TW_TAX_ETF;
    else tax = orderValue * (opts.isDayTrade ? TW_TAX_STOCK_DAYTRADE : TW_TAX_STOCK);
  }

  return {
    commission: roundTo(commission, 2),
    tax: roundTo(tax, 2),
    totalFee: roundTo(commission + tax, 2),
  };
}

function roundTo(n: number, digits: number): number {
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}
