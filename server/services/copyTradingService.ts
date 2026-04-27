/**
 * server/services/copyTradingService.ts
 * 升級版：多帳戶跟單服務 — 具備並發執行、異常隔離與超時保護
 */
import { simulatedAdapter } from './brokers/SimulatedAdapter.js';

function isTaiwanSymbol(symbol: string): boolean {
  return /\.(TW|TWO)$/i.test(symbol);
}

export interface FollowerAccount {
  id: string;
  name: string;
  multiplier: number;
  enabled: boolean;
  mode: 'live' | 'shadow';
  staggeredDelayMs?: number;
  balance: number;
  totalSlippage: number;
}

class CopyTradingService {
  private followers: FollowerAccount[] = [
    { id: 'acc_001', name: '家人帳戶_A', multiplier: 0.5, enabled: true, mode: 'live', balance: 500000, totalSlippage: 0, staggeredDelayMs: 1500 },
    { id: 'acc_002', name: '影子測試_B', multiplier: 1.0, enabled: true, mode: 'shadow', balance: 200000, totalSlippage: 0 }
  ];

  getFollowers() { return this.followers; }

  async syncTrade(masterOrder: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number }, logFn: (msg: string) => void) {
    const activeFollowers = this.followers.filter(f => f.enabled);
    await Promise.allSettled(activeFollowers.map(follower => 
      this.processFollowerTrade(follower, masterOrder, logFn)
    ));
  }

  private async processFollowerTrade(follower: FollowerAccount, masterOrder: any, logFn: (msg: string) => void) {
    try {
      const delay = follower.staggeredDelayMs || (Math.random() * 2000 + 500);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));

      const twSymbol = isTaiwanSymbol(masterOrder.symbol);
      const scaledQty = Number(masterOrder.qty) * follower.multiplier;
      const followerQty = twSymbol
        ? Math.floor(scaledQty / 1000) * 1000
        : Math.floor(scaledQty * 1000) / 1000;

      if (followerQty <= 0) {
        logFn(`⚪ [跟單略過] ${follower.name}（數量不足最小下單單位）`);
        return;
      }
      
      if (follower.mode === 'shadow') {
        logFn(`👻 [影子跟單] ${follower.name} 同步完成`);
        return;
      }

      // P3: 增加 8 秒超時保護，防止 API 永久掛起
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('API_TIMEOUT')), 8000)
      );

      const orderPromise = simulatedAdapter.placeOrder({
        symbol: masterOrder.symbol,
        side: masterOrder.side,
        orderType: 'MARKET',
        qty: followerQty,
        marketType: twSymbol ? 'TW_STOCK' : 'US_STOCK'
      });

      const result = await Promise.race([orderPromise, timeoutPromise]) as any;

      if (result && !result.error) {
        logFn(`✅ [跟單成功] ${follower.name} (${delay.toFixed(0)}ms)`);
      } else {
        logFn(`❌ [跟單失敗] ${follower.name}: ${result?.error || '未知錯誤'}`);
      }
    } catch (e) {
      const errorMsg = (e as Error).message === 'API_TIMEOUT' ? '請求超時 (8s)' : (e as Error).message;
      logFn(`❌ [跟單異常] ${follower.name}: ${errorMsg}`);
    }
  }

  updateFollower(id: string, patch: Partial<FollowerAccount>) {
    this.followers = this.followers.map(f => f.id === id ? { ...f, ...patch } : f);
  }
}

export const copyTradingService = new CopyTradingService();
