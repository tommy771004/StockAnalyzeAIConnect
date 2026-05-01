/**
 * server/services/brokers/KGIAdapter.ts
 * 群益證券 SKCOM API — 架構預留
 *
 * 群益 SKCOM 為 Windows COM 元件，無法在 Vercel Serverless 或 macOS/Linux 環境執行。
 * 需在 Windows 本地透過 C# 或 Python (comtypes) 封裝成 HTTP 服務後再橋接。
 *
 * 申請步驟：
 *  1. 開立群益證券帳戶：https://www.capital.com.tw/
 *  2. 申請 API 使用權限，簽署「API 電子交易風險預告書」
 *  3. 下載 SKCOM 元件：https://easywin.capital.com.tw/trade/skcom
 *  4. 建立本地 Windows 服務並橋接至 http://localhost:8002
 */

import type { IBrokerAdapter, BrokerConfig, AccountBalance, Order, OrderResult, Position } from './BrokerAdapter.js';
import { bridgeCall } from './httpBridge.js';

const DEFAULT_BRIDGE_URL =
  process.env.KGI_BRIDGE_URL ||
  process.env.BROKER_BRIDGE_URL ||
  'http://127.0.0.1:18080';

export class KGIAdapter implements IBrokerAdapter {
  readonly brokerId = 'kgi';
  private _connected = false;
  private _bridgeUrl = DEFAULT_BRIDGE_URL;

  get isConnected(): boolean { return this._connected; }

  async connect(config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    try {
      this._bridgeUrl = config.bridgeUrl || this._bridgeUrl;
      const result = await bridgeCall<{ ok: boolean; message: string }>({
        baseUrl: this._bridgeUrl,
        path: '/brokers/kgi/connect',
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
        message: `無法連線至群益 Windows 橋接服務。請確認：\n1. python server/python/windows_broker_bridge.py 已啟動\n2. SKCOM 元件與憑證已安裝\n3. Bridge URL 可連線 (${this._bridgeUrl})\n錯誤：${(e as Error).message}`,
      };
    }
  }

  async disconnect(): Promise<void> {
    await bridgeCall({
      baseUrl: this._bridgeUrl,
      path: '/brokers/kgi/disconnect',
      method: 'POST',
    }).catch(() => {});
    this._connected = false;
  }

  async getBalance(): Promise<AccountBalance> {
    return bridgeCall<AccountBalance>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/kgi/balance',
      method: 'GET',
    });
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    return bridgeCall<OrderResult>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/kgi/order',
      method: 'POST',
      body: order,
    });
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean }> {
    return bridgeCall<{ ok: boolean }>({
      baseUrl: this._bridgeUrl,
      path: `/brokers/kgi/order/${encodeURIComponent(orderId)}`,
      method: 'DELETE',
    });
  }

  async getPositions(): Promise<Position[]> {
    return bridgeCall<Position[]>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/kgi/positions',
      method: 'GET',
    });
  }

  async getOpenOrders() {
    return bridgeCall<any[]>({
      baseUrl: this._bridgeUrl,
      path: '/brokers/kgi/orders',
      method: 'GET',
    });
  }
}

export const kgiAdapter = new KGIAdapter();
