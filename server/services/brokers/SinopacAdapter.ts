/**
 * server/services/brokers/SinopacAdapter.ts
 * 永豐金證券 Shioaji API 橋接
 *
 * 實際串接需要：
 *  1. 向永豐金申請 API Key：https://sinotrade.github.io/
 *  2. 下載電子憑證 (.pfx)
 *  3. 啟動本地 Python microservice（server/python/windows_broker_bridge.py）
 *  4. 在 BrokerSettings 填入 API Key、Secret、憑證路徑
 *
 * 本模組透過 HTTP 呼叫本地 Python bridge service（預設 http://127.0.0.1:18080）
 * 避免 Node.js 直接依賴 Python SDK 或 COM 元件。
 */

import type {
  IBrokerAdapter, BrokerConfig, AccountBalance, Order,
  OrderResult, Position,
} from './BrokerAdapter.js';
import { bridgeCall } from './httpBridge.js';

const DEFAULT_BRIDGE_URL =
  process.env.SINOPAC_BRIDGE_URL ||
  process.env.BROKER_BRIDGE_URL ||
  'http://127.0.0.1:18080';

export class SinopacAdapter implements IBrokerAdapter {
  readonly brokerId = 'sinopac';
  private _connected = false;
  private _bridgeUrl = DEFAULT_BRIDGE_URL;

  get isConnected(): boolean { return this._connected; }

  async connect(config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    try {
      this._bridgeUrl = config.bridgeUrl || this._bridgeUrl;
      const result = await bridgeCall<{ ok: boolean; message: string }>({
        baseUrl: this._bridgeUrl,
        path: '/brokers/sinopac/connect',
        method: 'POST',
        body: {
          api_key: config.apiKey,
          api_secret: config.apiSecret,
          cert_path: config.certPath,
          cert_passphrase: config.certPassphrase || config.apiSecret,
          account_id: config.accountId,
          simulation: config.mode === 'simulated',
        },
      });
      this._connected = result.ok;
      return result;
    } catch (e) {
      this._connected = false;
      return {
        ok: false,
        message: `無法連線至永豐橋接服務。請確認：\n1. Python bridge 已啟動 (python server/python/windows_broker_bridge.py)\n2. API Key / 憑證 / 帳號設定正確\n3. Bridge URL 可連線 (${this._bridgeUrl})\n錯誤：${(e as Error).message}`,
      };
    }
  }

  async disconnect(): Promise<void> {
    await bridgeCall({
      baseUrl: this._bridgeUrl,
      path: '/brokers/sinopac/disconnect',
      method: 'POST',
    }).catch(() => {});
    this._connected = false;
  }

  async getBalance(): Promise<AccountBalance> {
    return bridgeCall<AccountBalance>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/sinopac/balance',
      method: 'GET',
    });
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    return bridgeCall<OrderResult>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/sinopac/order',
      method: 'POST',
      body: order,
    });
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean }> {
    return bridgeCall<{ ok: boolean }>({
      baseUrl: this._bridgeUrl,
      path: `/brokers/sinopac/order/${encodeURIComponent(orderId)}`,
      method: 'DELETE',
    });
  }

  async getPositions(): Promise<Position[]> {
    return bridgeCall<Position[]>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/sinopac/positions',
      method: 'GET',
    });
  }

  async getOpenOrders() {
    return bridgeCall<any[]>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/sinopac/orders',
      method: 'GET',
    });
  }
}

export const sinopacAdapter = new SinopacAdapter();
