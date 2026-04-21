// server/services/RiskManager.ts

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

class RiskManager {
  private dailyLimit = 100000; // 每日交易額度
  private currentDailyUsage = 0;
  private maxPositionSize = 20000; // 單筆最大部位限制

  validateOrder(order: OrderRequest): { allowed: boolean; reason?: string } {
    const orderValue = order.quantity * order.price;

    // 1. 部位限制檢查
    if (orderValue > this.maxPositionSize) {
      return { allowed: false, reason: `單筆部位超過限制: $${orderValue.toFixed(2)} > $${this.maxPositionSize}` };
    }

    // 2. 每日額度檢查
    if (this.currentDailyUsage + orderValue > this.dailyLimit) {
      return { allowed: false, reason: `超過每日交易額度限制` };
    }

    return { allowed: true };
  }

  recordTrade(orderValue: number) {
    this.currentDailyUsage += orderValue;
  }
}

export const riskManager = new RiskManager();
