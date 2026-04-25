/**
 * server/services/orderExecutor.ts
 * 訂單執行 + 完整 lifecycle 追蹤 + 失敗重試 + 跨帳戶對沖聯動
 *
 * 重構（2026-04）：
 *  - 透過 ordersRepo 把每張單的 PENDING / PARTIAL / FILLED / REJECTED 狀態流持久化
 *  - 每次 status 變化 broadcast `order_lifecycle` WS 事件給前端 OrderBookPanel
 *  - 失敗時依設定 retry（指數退避，預設 max 3 次）
 *  - 失敗或拒絕時觸發 notifier（risk_block）
 */
import type { IBrokerAdapter, OrderResult } from './brokers/BrokerAdapter.js';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';
import { copyTradingService } from './copyTradingService.js';
import { ordersRepo } from '../repositories/ordersRepo.js';
import { notifier } from './notifier/index.js';

interface TradeRequest { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number; signalId?: string }

const MAX_RETRY = 3;

export class OrderExecutor {
  private wsBroadcast: ((msg: unknown) => void) | null = null;

  constructor(
    private primaryBroker: IBrokerAdapter,
    private hedgeBroker: IBrokerAdapter,
    private emitLog: (log: any) => void,
  ) {}

  setWsBroadcast(fn: (msg: unknown) => void) { this.wsBroadcast = fn; }

  async executeTrade(config: AgentConfig, trade: TradeRequest): Promise<OrderResult | null> {
    const userId = config.userId;
    const marketType = trade.symbol.endsWith('.TW') || trade.symbol.endsWith('.TWO') ? 'TW_STOCK' : 'US_STOCK';
    let dbRow: { id: number } | null = null;

    // 1. 持久化 PENDING — 只有在有 userId 時才寫 DB（測試/匿名情境跳過）
    if (userId) {
      try {
        const created = await ordersRepo.create({
          userId,
          brokerId: this.primaryBroker.brokerId,
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty.toString(),
          price: trade.price?.toString(),
          orderType: 'MARKET',
          marketType,
          status: 'PENDING',
          parentSignalId: trade.signalId,
        });
        if (created?.id != null) {
          dbRow = { id: created.id };
          this.broadcastLifecycle('PENDING', created.id, { ...trade, marketType });
        }
      } catch (e) {
        console.warn('[OrderExecutor] 持久化失敗，繼續送單：', (e as Error).message);
      }
    }

    this.emitLog({ level: 'EXECUTION', source: 'EXEC', symbol: trade.symbol, message: `🚀 主帳戶執行：${trade.side} ${trade.qty} 股 @ ${trade.price}` });

    // 2. 重試迴圈 — 只對「網路 / TIMEOUT / 暫時性」錯誤重試，對 REJECTED 直接失敗
    let lastError: Error | null = null;
    let mainOrder: OrderResult | null = null;
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        mainOrder = await this.primaryBroker.placeOrder({
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          orderType: 'MARKET',
          marketType,
        });
        if (mainOrder.status === 'REJECTED') {
          // 券商主動拒絕，不重試
          await this.persistFinal(dbRow, mainOrder, attempt, mainOrder.message);
          notifier.dispatch(userId ?? 'system', 'risk_block', {
            symbol: trade.symbol, side: trade.side, qty: trade.qty, reason: mainOrder.message ?? 'REJECTED',
          }).catch(() => {});
          this.emitLog({ level: 'WARNING', source: 'EXEC', symbol: trade.symbol, message: `委託被拒絕：${mainOrder.message ?? 'REJECTED'}` });
          return mainOrder;
        }
        await this.persistFinal(dbRow, mainOrder, attempt);
        break;
      } catch (e) {
        lastError = e as Error;
        const wait = Math.min(8000, 500 * Math.pow(2, attempt));
        this.emitLog({ level: 'WARNING', source: 'EXEC', symbol: trade.symbol, message: `下單失敗 (attempt ${attempt + 1}/${MAX_RETRY + 1})：${lastError.message}，${wait}ms 後重試` });
        if (attempt === MAX_RETRY) break;
        await new Promise(r => setTimeout(r, wait));
      }
    }

    if (!mainOrder) {
      if (dbRow) {
        await ordersRepo.update(dbRow.id, { status: 'REJECTED', lastError: lastError?.message ?? 'unknown', retryCount: MAX_RETRY }).catch(() => {});
        this.broadcastLifecycle('REJECTED', dbRow.id, { ...trade, marketType, error: lastError?.message });
      }
      this.emitLog({ level: 'ERROR', source: 'EXEC', symbol: trade.symbol, message: `下單最終失敗: ${lastError?.message ?? 'unknown'}` });
      return null;
    }

    // 3. 觸發多帳戶跟單 (P2)
    copyTradingService.syncTrade(
      { symbol: trade.symbol, side: trade.side, qty: trade.qty, price: trade.price },
      (msg) => this.emitLog({ level: 'SYSTEM', source: 'COPY', symbol: trade.symbol, message: msg })
    ).catch(e => console.error('[CopyTrade Error]', e));

    // 4. 聯動對沖 (P2)
    if (config.hedgeConfig?.enabled && config.hedgeConfig.hedgeSymbol) {
      await this.executeHedge(config, trade);
    }

    // 5. FILLED 通知
    if (mainOrder.status === 'FILLED') {
      notifier.dispatch(userId ?? 'system', 'fill', {
        symbol: trade.symbol, side: trade.side, qty: mainOrder.filledQty, price: mainOrder.filledPrice,
      }).catch(() => {});
    }

    return mainOrder;
  }

  private async persistFinal(dbRow: { id: number } | null, result: OrderResult, retry: number, errMsg?: string) {
    if (!dbRow) return;
    try {
      await ordersRepo.update(dbRow.id, {
        brokerOrderId: result.orderId,
        status: result.status,
        filledQty: (result.filledQty ?? 0).toString(),
        avgFillPrice: result.filledPrice ? result.filledPrice.toString() : null,
        retryCount: retry,
        lastError: errMsg,
      });
      this.broadcastLifecycle(result.status, dbRow.id, { result });
    } catch (e) {
      console.warn('[OrderExecutor] persistFinal 失敗：', (e as Error).message);
    }
  }

  private broadcastLifecycle(status: string, orderId: number, payload: unknown) {
    this.wsBroadcast?.({ type: 'order_lifecycle', data: { orderId, status, payload, timestamp: new Date().toISOString() } });
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
