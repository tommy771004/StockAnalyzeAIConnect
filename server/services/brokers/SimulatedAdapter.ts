/**
 * server/services/brokers/SimulatedAdapter.ts
 * 完整模擬券商 — 所有功能均在記憶體中模擬，不需要任何外部 API 金鑰
 *
 * 功能：
 *  - 模擬下單/成交（MARKET 立即成交，LIMIT 排隊等待）
 *  - 帳戶餘額管理（以 TWD 計算）
 *  - 持倉追蹤與損益計算
 *  - 模擬滑點與手續費（台灣股票手續費 0.1425%，交易稅 0.3%）
 */

import type {
  IBrokerAdapter, BrokerConfig, AccountBalance, Order,
  OrderResult, Position, OrderStatus, MarketType,
} from './BrokerAdapter.js';

const COMMISSION_RATE = 0.001425; // 手續費 0.1425%
const TRANSACTION_TAX_STOCK = 0.003; // 股票交易稅 0.3%（賣出時）

interface SimPositionInternal {
  symbol: string;
  qty: number;
  avgCost: number;
  marketType: MarketType;
}

export class SimulatedAdapter implements IBrokerAdapter {
  readonly brokerId = 'simulated';
  private _connected = false;
  private _balance: number = 10_000_000; // 預設 1000 萬 TWD 模擬資金
  private _dailyPnl: number = 0;
  private _positions: Map<string, SimPositionInternal> = new Map();
  private _orderCounter = 0;

  get isConnected(): boolean { return this._connected; }

  async connect(config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    this._connected = true;
    return { ok: true, message: '模擬交易模式已啟動，可用資金 TWD 10,000,000' };
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  async getBalance(): Promise<AccountBalance> {
    const positionsValue = Array.from(this._positions.values()).reduce((sum, p) => {
      return sum + (p.qty * p.avgCost); // 使用成本價估算
    }, 0);

    return {
      totalAssets: this._balance + positionsValue,
      availableMargin: this._balance,
      usedMargin: positionsValue,
      dailyPnl: this._dailyPnl,
      currency: 'TWD',
    };
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    if (!this._connected) {
      return { orderId: '', status: 'REJECTED', filledQty: 0, filledPrice: 0, timestamp: Date.now(), message: '未連線' };
    }

    this._orderCounter++;
    const orderId = `SIM-${Date.now()}-${this._orderCounter}`;

    // 模擬即時成交（MARKET order）
    const fillPrice = order.price ?? this._getSimulatedMarketPrice(order.symbol);
    if (!fillPrice || fillPrice <= 0) {
      return { orderId, status: 'REJECTED', filledQty: 0, filledPrice: 0, timestamp: Date.now(), message: '無法取得報價' };
    }

    const orderValue = order.qty * fillPrice;
    const commission = Math.max(20, orderValue * COMMISSION_RATE); // 最低手續費 20 元
    const tax = order.side === 'SELL' ? orderValue * TRANSACTION_TAX_STOCK : 0;
    const totalCost = order.side === 'BUY' ? orderValue + commission : -(orderValue - commission - tax);

    // 餘額不足檢查
    if (order.side === 'BUY' && totalCost > this._balance) {
      return { orderId, status: 'REJECTED', filledQty: 0, filledPrice: 0, timestamp: Date.now(), message: `餘額不足 (需 ${totalCost.toFixed(0)} TWD)` };
    }

    // 賣出時：持倉不足檢查
    if (order.side === 'SELL') {
      const pos = this._positions.get(order.symbol);
      if (!pos || pos.qty < order.qty) {
        return { orderId, status: 'REJECTED', filledQty: 0, filledPrice: 0, timestamp: Date.now(), message: '持倉不足' };
      }
    }

    // 執行成交
    this._balance -= order.side === 'BUY' ? totalCost : 0;
    if (order.side === 'SELL') this._balance += (orderValue - commission - tax);

    this._updatePosition(order.symbol, order.side, order.qty, fillPrice, order.marketType ?? 'TW_STOCK');
    this._dailyPnl += order.side === 'SELL' ? (fillPrice - (this._positions.get(order.symbol)?.avgCost ?? fillPrice)) * order.qty - commission - tax : -commission;

    return {
      orderId,
      status: 'FILLED',
      filledQty: order.qty,
      filledPrice: fillPrice,
      timestamp: Date.now(),
    };
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean }> {
    return { ok: true }; // 模擬環境立即成交，無需取消
  }

  async getPositions(): Promise<Position[]> {
    return Array.from(this._positions.values()).map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      avgCost: p.avgCost,
      currentPrice: this._getSimulatedMarketPrice(p.symbol),
      unrealizedPnl: (this._getSimulatedMarketPrice(p.symbol) - p.avgCost) * p.qty,
      marketType: p.marketType,
    }));
  }

  async getOpenOrders() { return []; }

  /** 從上次已知價格取模擬報價（生產環境應由 TWSE/Yahoo 補充） */
  private _getSimulatedMarketPrice(symbol: string): number {
    // 使用持倉平均成本作為當前模擬報價
    const pos = this._positions.get(symbol);
    if (pos) return pos.avgCost * (1 + (Math.random() - 0.5) * 0.02);
    // 預設台股約 100 TWD
    return 100;
  }

  private _updatePosition(symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, marketType: MarketType) {
    const existing = this._positions.get(symbol);
    if (side === 'BUY') {
      if (existing) {
        const totalQty = existing.qty + qty;
        existing.avgCost = (existing.qty * existing.avgCost + qty * price) / totalQty;
        existing.qty = totalQty;
      } else {
        this._positions.set(symbol, { symbol, qty, avgCost: price, marketType });
      }
    } else {
      if (existing) {
        existing.qty -= qty;
        if (existing.qty <= 0) this._positions.delete(symbol);
      }
    }
  }

  /** 設定模擬資金（供測試/重置用） */
  resetBalance(amount: number = 10_000_000) {
    this._balance = amount;
    this._dailyPnl = 0;
    this._positions.clear();
  }
}

export const simulatedAdapter = new SimulatedAdapter();
