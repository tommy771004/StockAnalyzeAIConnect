/**
 * server/services/brokers/BrokerAdapter.ts
 * 統一券商介面定義
 *
 * 台灣現行支援：
 *  - SimulatedAdapter  — 完整模擬交易（無需申請，立即可用）
 *  - SinopacAdapter    — 永豐金 Shioaji Python 橋接（需申請 API Key + 憑證）
 *  - KGIAdapter        — 群益 SKCOM stub（需 Windows COM 元件）
 *  - YuantaAdapter     — 元大 API stub（需 Windows COM 元件）
 */

export type TradingMode = 'simulated' | 'real';
export type MarketType = 'TW_STOCK' | 'TW_OPTIONS' | 'TW_FUTURES' | 'US_STOCK' | 'CRYPTO';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'REJECTED';

export interface BrokerConfig {
  brokerId: 'simulated' | 'sinopac' | 'kgi' | 'yuanta' | 'fubon';
  apiKey?: string;
  apiSecret?: string;
  certPath?: string;      // 電子憑證路徑（永豐/元大/群益）
  accountId?: string;
  mode: TradingMode;
}

export interface AccountBalance {
  totalAssets: number;    // 總資產 (TWD)
  availableMargin: number;// 可用資金
  usedMargin: number;     // 已用保證金
  dailyPnl: number;       // 當日損益
  currency: 'TWD' | 'USD';
}

export interface Order {
  symbol: string;         // 例 "2330.TW", "AAPL"
  side: OrderSide;
  qty: number;
  price?: number;         // LIMIT 訂單必填
  orderType: OrderType;
  marketType: MarketType;
  note?: string;          // AI 決策理由
}

export interface OrderResult {
  orderId: string;
  status: OrderStatus;
  filledQty: number;
  filledPrice: number;
  timestamp: number;
  message?: string;
}

export interface Position {
  symbol: string;
  qty: number;            // 正數=多頭, 負數=空頭
  avgCost: number;
  currentPrice: number;
  unrealizedPnl: number;
  marketType: MarketType;
}

export interface IBrokerAdapter {
  readonly brokerId: string;
  readonly isConnected: boolean;

  connect(config: BrokerConfig): Promise<{ ok: boolean; message: string }>;
  disconnect(): Promise<void>;

  getBalance(): Promise<AccountBalance>;
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<{ ok: boolean }>;
  getPositions(): Promise<Position[]>;
  getOpenOrders(): Promise<Array<Order & { orderId: string; status: OrderStatus }>>;
}
