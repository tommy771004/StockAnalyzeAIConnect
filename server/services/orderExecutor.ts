/**
 * server/services/orderExecutor.ts
 * 專責訂單執行與跨帳戶對沖聯動
 */
import type { IBrokerAdapter } from './brokers/BrokerAdapter.js';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';
import { copyTradingService } from './copyTradingService.js';


export class OrderExecutor {
  constructor(
    private primaryBroker: IBrokerAdapter,
    private hedgeBroker: IBrokerAdapter,
    private emitLog: (log: any) => void
  ) {}

  async executeTrade(config: AgentConfig, trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number }) {
    try {
      // 1. 執行主訂單
      this.emitLog({ level: 'EXECUTION', source: 'EXEC', symbol: trade.symbol, message: `🚀 主帳戶執行：${trade.side} ${trade.qty} 股 @ ${trade.price}` });
      const mainOrder = await this.primaryBroker.placeOrder({
        symbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        orderType: 'MARKET',
        marketType: trade.symbol.endsWith('.TW') ? 'TW_STOCK' : 'US_STOCK'
      });

      if (!mainOrder) {
        throw new Error('主帳戶下單失敗，取消後續操作');
      }

      // 1.5 觸發多帳戶跟單 (P2)
      copyTradingService.syncTrade(
        { symbol: trade.symbol, side: trade.side, qty: trade.qty, price: trade.price },
        (msg) => this.emitLog({ level: 'SYSTEM', source: 'COPY', symbol: trade.symbol, message: msg })
      ).catch(e => console.error('[CopyTrade Error]', e));


      // 2. 聯動對沖 (P2)
      if (config.hedgeConfig?.enabled && config.hedgeConfig.hedgeSymbol) {
        await this.executeHedge(config, trade);
      }

      return mainOrder;
    } catch (e) {
      this.emitLog({ level: 'ERROR', source: 'EXEC', symbol: trade.symbol, message: `下單程序異常: ${(e as Error).message}` });
      return null;
    }
  }

  private async executeHedge(config: AgentConfig, trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number }) {
    const { hedgeSymbol, hedgeRatio } = config.hedgeConfig!;
    const hedgeQty = Math.floor(trade.qty * (hedgeRatio || 0.5));
    
    if (hedgeQty <= 0) return;

    this.emitLog({ level: 'EXECUTION', source: 'HEDGE', symbol: hedgeSymbol, message: `🛡️ 對沖連動：${hedgeSymbol} 買入 ${hedgeQty} 股 (比例: ${hedgeRatio})` });
    
    try {
      await this.hedgeBroker.placeOrder({
        symbol: hedgeSymbol!,
        side: 'BUY', // 避險通常是買入反向標的
        qty: hedgeQty,
        orderType: 'MARKET',
        marketType: hedgeSymbol!.endsWith('.TW') ? 'TW_STOCK' : 'US_STOCK'
      });
    } catch (e) {
      this.emitLog({ level: 'WARNING', source: 'HEDGE', symbol: hedgeSymbol, message: `⚠️ 對沖下單失敗：${(e as Error).message}，請手動檢查風險曝險！` });
    }
  }
}
