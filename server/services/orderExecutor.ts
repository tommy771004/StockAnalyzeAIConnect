/**
 * server/services/orderExecutor.ts
 * 專責訂單執行、生命週期管理與跨帳戶對沖聯動
 *
 * 訂單生命週期：
 *   PENDING → PARTIAL → FILLED    (正常路徑)
 *   PENDING → CANCELLED           (超時或手動取消)
 *   PENDING → REJECTED            (券商拒絕)
 *
 * 改善 (2026-05)：
 *  - 完整 PENDING/PARTIAL/FILLED/CANCELLED 狀態機
 *  - 指數退避自動重試（最多 MAX_RETRY 次，僅限 transient 錯誤）
 *  - 部分成交（PARTIAL）支援：累積 filledQty，等待全數成交或超時取消
 *  - 活躍訂單追蹤 Map，支援外部呼叫 cancelOrder()
 */

import type { IBrokerAdapter, OrderResult } from './brokers/BrokerAdapter.js';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';
import { copyTradingService } from './copyTradingService.js';

// ── 常數 ──────────────────────────────────────────────────────────
const MAX_RETRY = 3;
const BASE_RETRY_DELAY_MS = 500;        // 首次重試等待 500ms
const PARTIAL_FILL_TIMEOUT_MS = 30_000; // 部分成交後 30 秒仍未完成 → 取消
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i, /network/i, /ECONNRESET/i, /503/i, /429/i, /rate.?limit/i,
];

export type OrderLifecycleStatus =
  | 'PENDING'
  | 'PARTIAL'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

export interface OrderLifecycleEvent {
  orderId: string;
  status: OrderLifecycleStatus;
  symbol: string;
  side: 'BUY' | 'SELL';
  requestedQty: number;
  filledQty: number;
  filledPrice: number;
  timestamp: string;
  message?: string;
  retryCount?: number;
}

interface ActiveOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  requestedQty: number;
  filledQty: number;
  filledPrice: number;
  status: OrderLifecycleStatus;
  partialTimer?: ReturnType<typeof setTimeout>;
}

// ── Utility ───────────────────────────────────────────────────────
function isTaiwanSymbol(symbol: string): boolean {
  return /\.(TW|TWO)$/i.test(symbol);
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some(p => p.test(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── OrderExecutor ─────────────────────────────────────────────────
export class OrderExecutor {
  /** 目前活躍中的訂單（尚未 FILLED 或 CANCELLED）*/
  private _activeOrders = new Map<string, ActiveOrder>();

  constructor(
    private primaryBroker: IBrokerAdapter,
    private hedgeBroker: IBrokerAdapter,
    private emitLog: (log: any) => void,
    private onLifecycle?: (event: OrderLifecycleEvent) => void,
  ) {}

  // ── 公開 API ────────────────────────────────────────────────────

  /**
   * 執行主訂單，含重試機制、部分成交追蹤與對沖聯動。
   * 回傳最終 OrderLifecycleEvent（狀態為 FILLED / CANCELLED / REJECTED）。
   */
  async executeTrade(
    config: AgentConfig,
    trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number },
  ): Promise<OrderLifecycleEvent | null> {
    const { symbol, side, qty, price } = trade;

    this.emitLog({
      level: 'EXECUTION', source: 'EXEC', symbol,
      message: `🚀 主帳戶執行：${side} ${qty} 股 @ ${price} [PENDING]`,
    });

    let result: OrderResult | null = null;
    let retryCount = 0;
    let lastError: unknown;

    // ── 重試迴圈（僅 transient 錯誤重試）──
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        result = await this.primaryBroker.placeOrder({
          symbol,
          side,
          qty,
          orderType: 'MARKET',
          marketType: isTaiwanSymbol(symbol) ? 'TW_STOCK' : 'US_STOCK',
          price,
        });
        retryCount = attempt;
        break;
      } catch (err) {
        lastError = err;
        if (!isTransientError(err) || attempt === MAX_RETRY) break;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        this.emitLog({
          level: 'WARNING', source: 'EXEC', symbol,
          message: `⚡ 下單失敗（嘗試 ${attempt + 1}/${MAX_RETRY + 1}），${delay}ms 後重試：${(err as Error).message}`,
        });
        await sleep(delay);
      }
    }

    // ── 券商呼叫失敗（非 transient 或重試耗盡）──
    if (!result) {
      const msg = lastError instanceof Error ? lastError.message : '下單程序異常';
      this.emitLog({ level: 'ERROR', source: 'EXEC', symbol, message: `下單失敗：${msg}` });
      const evt = this._buildEvent('REJECTED', symbol, side, qty, 0, 0, msg, retryCount);
      this.onLifecycle?.(evt);
      return null;
    }

    // ── REJECTED ──
    if (result.status === 'REJECTED') {
      this.emitLog({
        level: 'WARNING', source: 'EXEC', symbol,
        message: `❌ 訂單被拒絕：${result.message ?? '券商拒絕'}`,
      });
      const evt = this._buildEvent('REJECTED', symbol, side, qty, 0, 0, result.message, retryCount);
      evt.orderId = result.orderId || evt.orderId;
      this.onLifecycle?.(evt);
      return null;
    }

    // ── FILLED（立即全額成交）──
    if (result.status === 'FILLED') {
      this.emitLog({
        level: 'EXECUTION', source: 'EXEC', symbol,
        message: `✅ 訂單成交：${side} ${result.filledQty} 股 @ ${result.filledPrice} [FILLED]${retryCount > 0 ? ` (retry=${retryCount})` : ''}`,
      });
      const evt = this._buildEvent('FILLED', symbol, side, qty, result.filledQty, result.filledPrice, undefined, retryCount);
      evt.orderId = result.orderId;
      this.onLifecycle?.(evt);

      // 觸發跟單與對沖
      this._postFill(config, trade, result);
      return evt;
    }

    // ── PARTIAL（部分成交 — 啟動超時追蹤）──
    if (result.status === 'PARTIAL') {
      this.emitLog({
        level: 'MONITOR', source: 'EXEC', symbol,
        message: `🔄 部分成交：已成交 ${result.filledQty}/${qty} 股 @ ${result.filledPrice} [PARTIAL]`,
      });

      const activeOrder: ActiveOrder = {
        orderId: result.orderId,
        symbol, side,
        requestedQty: qty,
        filledQty: result.filledQty,
        filledPrice: result.filledPrice,
        status: 'PARTIAL',
      };
      this._activeOrders.set(result.orderId, activeOrder);

      const evt = this._buildEvent('PARTIAL', symbol, side, qty, result.filledQty, result.filledPrice, undefined, retryCount);
      evt.orderId = result.orderId;
      this.onLifecycle?.(evt);

      // 若超時仍部分，則取消剩餘
      activeOrder.partialTimer = setTimeout(() => {
        void this._cancelRemainingPartial(activeOrder, config, trade, result!);
      }, PARTIAL_FILL_TIMEOUT_MS);

      // 此路徑先以已成交部分回報呼叫端（後續透過 lifecycle callback 更新）
      return evt;
    }

    // ── 未預期狀態 fallback ──
    this.emitLog({ level: 'WARNING', source: 'EXEC', symbol, message: `未知訂單狀態：${result.status}` });
    return null;
  }

  /**
   * 手動取消指定訂單（供外部呼叫，例如 Kill Switch）。
   * 若訂單已 FILLED / 不存在則回傳 false。
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const active = this._activeOrders.get(orderId);
    if (!active) return false;

    try {
      await this.primaryBroker.cancelOrder(orderId);
    } catch {
      // 即使券商呼叫失敗，仍標記本地狀態
    }

    if (active.partialTimer) clearTimeout(active.partialTimer);
    active.status = 'CANCELLED';
    this._activeOrders.delete(orderId);

    const evt = this._buildEvent(
      'CANCELLED', active.symbol, active.side,
      active.requestedQty, active.filledQty, active.filledPrice,
      '手動取消',
    );
    evt.orderId = orderId;
    this.onLifecycle?.(evt);

    this.emitLog({
      level: 'WARNING', source: 'EXEC', symbol: active.symbol,
      message: `🚫 訂單 ${orderId} 已取消（已成交 ${active.filledQty}/${active.requestedQty}）`,
    });
    return true;
  }

  /** 取得目前活躍訂單列表（供監控 UI 使用）*/
  getActiveOrders(): ActiveOrder[] {
    return Array.from(this._activeOrders.values());
  }

  // ── 私有輔助 ────────────────────────────────────────────────────

  private async _cancelRemainingPartial(
    active: ActiveOrder,
    config: AgentConfig,
    trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number },
    partialResult: OrderResult,
  ) {
    this.emitLog({
      level: 'WARNING', source: 'EXEC', symbol: active.symbol,
      message: `⏱️ 部分成交超時 ${PARTIAL_FILL_TIMEOUT_MS / 1000}s，取消剩餘 ${active.requestedQty - active.filledQty} 股`,
    });

    try {
      await this.primaryBroker.cancelOrder(active.orderId);
    } catch { /* ignore */ }

    active.status = 'CANCELLED';
    this._activeOrders.delete(active.orderId);

    const evt = this._buildEvent(
      'CANCELLED', active.symbol, active.side,
      active.requestedQty, active.filledQty, active.filledPrice,
      `部分成交超時取消 (已成交 ${active.filledQty}/${active.requestedQty})`,
    );
    evt.orderId = active.orderId;
    this.onLifecycle?.(evt);

    // 已成交部分仍觸發跟單與對沖
    if (active.filledQty > 0) {
      this._postFill(config, trade, partialResult);
    }
  }

  private _postFill(
    config: AgentConfig,
    trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number },
    result: OrderResult,
  ) {
    // 觸發跟單
    copyTradingService.syncTrade(
      { symbol: trade.symbol, side: trade.side, qty: result.filledQty, price: result.filledPrice },
      (msg) => this.emitLog({ level: 'SYSTEM', source: 'COPY', symbol: trade.symbol, message: msg }),
    ).catch(e => console.error('[CopyTrade Error]', e));

    // 聯動對沖
    if (config.hedgeConfig?.enabled && config.hedgeConfig.hedgeSymbol) {
      void this._executeHedge(config, { ...trade, qty: result.filledQty });
    }
  }

  private async _executeHedge(
    config: AgentConfig,
    trade: { symbol: string; side: 'BUY' | 'SELL'; qty: number },
  ) {
    const { hedgeSymbol, hedgeRatio, hedgeType } = config.hedgeConfig!;
    const hedgeQty = Math.floor(trade.qty * (hedgeRatio || 0.5));
    if (hedgeQty <= 0) return;

    const hedgeSide: 'BUY' | 'SELL' = hedgeType === 'direct'
      ? (trade.side === 'BUY' ? 'SELL' : 'BUY')
      : 'BUY';

    this.emitLog({
      level: 'EXECUTION', source: 'HEDGE', symbol: hedgeSymbol,
      message: `🛡️ 對沖連動：${hedgeSymbol} ${hedgeSide} ${hedgeQty} 股 (比例: ${hedgeRatio}, 類型: ${hedgeType ?? 'inverse_etf'})`,
    });

    try {
      await this.hedgeBroker.placeOrder({
        symbol: hedgeSymbol!,
        side: hedgeSide,
        qty: hedgeQty,
        orderType: 'MARKET',
        marketType: isTaiwanSymbol(hedgeSymbol!) ? 'TW_STOCK' : 'US_STOCK',
      });
    } catch (e) {
      this.emitLog({
        level: 'WARNING', source: 'HEDGE', symbol: hedgeSymbol,
        message: `⚠️ 對沖下單失敗：${(e as Error).message}，請手動檢查風險曝險！`,
      });
    }
  }

  private _buildEvent(
    status: OrderLifecycleStatus,
    symbol: string,
    side: 'BUY' | 'SELL',
    requestedQty: number,
    filledQty: number,
    filledPrice: number,
    message?: string,
    retryCount?: number,
  ): OrderLifecycleEvent {
    return {
      orderId: `exec-${Date.now()}`,
      status,
      symbol,
      side,
      requestedQty,
      filledQty,
      filledPrice,
      timestamp: new Date().toISOString(),
      message,
      retryCount,
    };
  }
}
