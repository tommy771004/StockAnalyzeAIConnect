/**
 * server/services/brokers/YuantaAdapter.ts
 * 元大證券 API — 架構預留
 *
 * 元大 API 同樣為 Windows COM DLL，需本地封裝後橋接。
 *
 * 申請步驟：
 *  1. 開立元大期貨/證券帳戶：https://www.yuantafutures.com.tw/
 *  2. 簽署 API 使用同意書
 *  3. 下載元大 API 交易元件
 *  4. 建立 Windows 本地橋接服務
 */

import type { IBrokerAdapter, BrokerConfig, AccountBalance, Order, OrderResult, Position } from './BrokerAdapter.js';

export class YuantaAdapter implements IBrokerAdapter {
  readonly brokerId = 'yuanta';
  readonly isConnected = false;

  async connect(_config: BrokerConfig): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: '元大 API 需要 Windows 本地服務。\n\n申請連結：https://www.yuantafutures.com.tw/\n注意：元大 API 需先完成帳戶開立與書面申請後方可使用。',
    };
  }
  async disconnect(): Promise<void> {}
  async getBalance(): Promise<AccountBalance> { throw new Error('元大 API 未連線'); }
  async placeOrder(_order: Order): Promise<OrderResult> { throw new Error('元大 API 未連線'); }
  async cancelOrder(_orderId: string): Promise<{ ok: boolean }> { return { ok: false }; }
  async getPositions(): Promise<Position[]> { return []; }
  async getOpenOrders() { return []; }
}

export const yuantaAdapter = new YuantaAdapter();
