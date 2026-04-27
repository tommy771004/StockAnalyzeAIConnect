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
import * as TWSeService from '../TWSeService.js';
import { computeTwStockFees } from '../twFees.js';

interface SimPositionInternal {
  symbol: string;
  qty: number;
  avgCost: number;
  marketType: MarketType;
  /** 當沖偵測用：本日是否曾發生買入動作 */
  openedToday?: boolean;
  openDate?: string; // YYYY-MM-DD
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
    let positionsValue = 0;
    const positionsList = Array.from(this._positions.values());
    
    for (const p of positionsList) {
      const currentPrice = await this._getSimulatedMarketPrice(p.symbol);
      positionsValue += (p.qty * currentPrice);
    }

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
    const fillPrice = order.price && order.price > 0 ? order.price : await this._getSimulatedMarketPrice(order.symbol);
    if (!fillPrice || fillPrice <= 0) {
      return { orderId, status: 'REJECTED', filledQty: 0, filledPrice: 0, timestamp: Date.now(), message: '無法取得報價' };
    }

    const orderValue = order.qty * fillPrice;
    const today = new Date().toISOString().slice(0, 10);
    const existingPos = this._positions.get(order.symbol);
    const isTwStock = order.marketType === 'TW_STOCK';
    const isDayTrade = isTwStock && order.side === 'SELL' && existingPos?.openedToday === true && existingPos.openDate === today;
    const isETF = isTwStock && /^00\d+\.TW/.test(order.symbol); // 台股 ETF 代號規則：00xx
    const { commission, tax } = isTwStock
      ? computeTwStockFees(orderValue, { side: order.side, isDayTrade, isETF })
      : { commission: 0, tax: 0 };
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
    if (order.side === 'BUY') {
      this._balance -= totalCost;
    } else {
      this._balance += (orderValue - commission - tax);
    }

    const posBefore = this._positions.get(order.symbol);
    const avgCostBefore = posBefore?.avgCost ?? fillPrice;

    this._updatePosition(order.symbol, order.side, order.qty, fillPrice, order.marketType ?? 'TW_STOCK');
    
    if (order.side === 'SELL') {
      const realizedPnL = (fillPrice - avgCostBefore) * order.qty - commission - tax;
      this._dailyPnl += realizedPnL;
    } else {
      this._dailyPnl -= commission; // 買入只扣手續費作為當日損益影響
    }

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
    const positionsList = Array.from(this._positions.values());
    const results = await Promise.all(positionsList.map(async p => {
      const currentPrice = await this._getSimulatedMarketPrice(p.symbol);
      return {
        symbol: p.symbol,
        qty: p.qty,
        avgCost: p.avgCost,
        currentPrice,
        unrealizedPnl: (currentPrice - p.avgCost) * p.qty,
        marketType: p.marketType,
      };
    }));
    return results;
  }

  async getOpenOrders() { return []; }

  /** 從 TWSE 服務獲取真實報價 */
  private async _getSimulatedMarketPrice(symbol: string): Promise<number> {
    try {
      const quote = await TWSeService.realtimeQuote(symbol);
      if (quote && quote.price > 0) return quote.price;
    } catch (e) {
      console.warn(`[SimAdapter] Failed to fetch price for ${symbol}, falling back to last cost.`);
    }

    const pos = this._positions.get(symbol);
    if (pos) return pos.avgCost;
    return 100;
  }

  private _updatePosition(symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, marketType: MarketType) {
    const existing = this._positions.get(symbol);
    const today = new Date().toISOString().slice(0, 10);
    if (side === 'BUY') {
      if (existing) {
        const totalQty = existing.qty + qty;
        existing.avgCost = (existing.qty * existing.avgCost + qty * price) / totalQty;
        existing.qty = totalQty;
        existing.openedToday = true;
        existing.openDate = today;
      } else {
        this._positions.set(symbol, { symbol, qty, avgCost: price, marketType, openedToday: true, openDate: today });
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
