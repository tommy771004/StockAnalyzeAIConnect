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

export class KGIAdapter implements IBrokerAdapter {
  readonly brokerId = 'kgi';
  readonly isConnected = false;

  async connect(_config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: '群益 SKCOM 需要 Windows 本地服務。請聯繫技術支援以設定橋接服務。\n\n申請連結：https://easywin.capital.com.tw/trade/skcom',
    };
  }
  async disconnect(): Promise<void> {}
  async getBalance(): Promise<AccountBalance> { throw new Error('群益 SKCOM 未連線'); }
  async placeOrder(_order: Order): Promise<OrderResult> { throw new Error('群益 SKCOM 未連線'); }
  async cancelOrder(_orderId: string): Promise<{ ok: boolean }> { return { ok: false }; }
  async getPositions(): Promise<Position[]> { return []; }
  async getOpenOrders() { return []; }
}

export const kgiAdapter = new KGIAdapter();
