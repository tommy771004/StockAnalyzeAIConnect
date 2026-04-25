/**
 * server/services/brokers/SinopacAdapter.ts
 * 永豐金證券 Shioaji API 橋接
 *
 * 實際串接需要：
 *  1. 向永豐金申請 API Key：https://sinotrade.github.io/
 *  2. 下載電子憑證 (.pfx)
 *  3. 啟動本地 Python microservice（server/python/sinopac_bridge.py）
 *  4. 在 BrokerSettings 填入 API Key、Secret、憑證路徑
 *
 * 本模組透過 HTTP 呼叫本地 Python bridge service（預設 http://localhost:8001）
 * 避免 Node.js 直接依賴 Python SDK 或 COM 元件。
 */

import type {
  IBrokerAdapter, BrokerConfig, AccountBalance, Order,
  OrderResult, Position,
} from './BrokerAdapter.js';

const BRIDGE_URL = process.env.SINOPAC_BRIDGE_URL || 'http://localhost:8001';

async function bridgeCall<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error((err as any).message || `Bridge error: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export class SinopacAdapter implements IBrokerAdapter {
  readonly brokerId = 'sinopac';
  private _connected = false;

  get isConnected(): boolean { return this._connected; }

  async connect(config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await bridgeCall<{ ok: boolean; message: string }>('/connect', 'POST', {
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        cert_path: config.certPath,
        account_id: config.accountId,
        simulation: config.mode === 'simulated',
      });
      this._connected = result.ok;
      return result;
    } catch (e) {
      return {
        ok: false,
        message: `無法連線至永豐橋接服務。請確認：\n1. Python bridge 已啟動 (python server/python/sinopac_bridge.py)\n2. API Key 與憑證設定正確\n錯誤：${(e as Error).message}`,
      };
    }
  }

  async disconnect(): Promise<void> {
    await bridgeCall('/disconnect', 'POST').catch(() => {});
    this._connected = false;
  }

  async getBalance(): Promise<AccountBalance> {
    return bridgeCall<AccountBalance>('/balance');
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    return bridgeCall<OrderResult>('/order', 'POST', order);
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean }> {
    return bridgeCall<{ ok: boolean }>(`/order/${orderId}`, 'DELETE');
  }

  async getPositions(): Promise<Position[]> {
    return bridgeCall<Position[]>('/positions');
  }

  async getOpenOrders() {
    return bridgeCall<any[]>('/orders');
  }
}

export const sinopacAdapter = new SinopacAdapter();
