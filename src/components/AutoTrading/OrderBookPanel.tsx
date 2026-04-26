/**
 * src/components/AutoTrading/OrderBookPanel.tsx
 *
 * 顯示訂單生命週期：
 *  - 啟動載入時拉一次 /api/autotrading/orders?open=1
 *  - 之後透過 WebSocket `order_lifecycle` 事件即時更新
 *  - 對 PENDING / PARTIAL 狀態提供「取消」按鈕
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, X, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { OrderLifecycleEvent } from './useAutotradingWS';
import * as api from '../../services/api';

interface OrderRow {
  id: number;
  brokerOrderId: string | null;
  symbol: string;
  side: string;
  qty: string | number;
  price: string | number | null;
  status: string;
  filledQty: string | number;
  avgFillPrice: string | number | null;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

interface Props {
  events: OrderLifecycleEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  PARTIAL: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  FILLED: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  CANCELLED: 'text-(--color-term-muted) bg-white/5 border-white/10',
  REJECTED: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
};

const SIDE_LABEL_KEYS: Record<string, string> = {
  BUY: 'autotrading.orderBook.side.buy',
  SELL: 'autotrading.orderBook.side.sell',
  HOLD: 'autotrading.orderBook.side.hold',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: 'autotrading.orderBook.status.pending',
  PARTIAL: 'autotrading.orderBook.status.partial',
  FILLED: 'autotrading.orderBook.status.filled',
  CANCELLED: 'autotrading.orderBook.status.cancelled',
  REJECTED: 'autotrading.orderBook.status.rejected',
};

export function OrderBookPanel({ events }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAutotradingOrders(false);
      if (data.ok) setRows((data.orders ?? []) as OrderRow[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // WebSocket 事件 → 更新對應的 row 狀態 (in-place)；新單則整批 refetch
  useEffect(() => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    setRows(prev => {
      const i = prev.findIndex(r => r.id === last.orderId);
      if (i < 0) {
        // 新單，等下次 refresh 拿完整資料；先 schedule
        refresh();
        return prev;
      }
      const next = [...prev];
      next[i] = { ...next[i], status: last.status };
      return next;
    });
  }, [events]);

  async function handleCancel(id: number) {
    try {
      await api.cancelAutotradingOrder(id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="border border-(--color-term-border) rounded-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border)">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-cyan-400" />
          <span className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">{t('autotrading.orderBook.title', 'Order Lifecycle')}</span>
        </div>
        <button onClick={refresh} className="p-1 text-(--color-term-muted) hover:text-white" title={t('common.refresh', '重新載入')}>
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>

      {error && <div className="px-3 py-2 text-[10px] text-rose-300">{error}</div>}

      {rows.length === 0 ? (
        <div className="p-4 text-[10px] text-(--color-term-muted) text-center">{loading ? t('common.loading', '載入中...') : t('autotrading.orderBook.empty', '尚無訂單')}</div>
      ) : (
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-[10px] font-mono">
            <thead className="text-(--color-term-muted) uppercase">
              <tr className="border-b border-(--color-term-border)">
                <th className="text-left px-2 py-1">{t('autotrading.orderBook.columns.time', '時間')}</th>
                <th className="text-left px-2 py-1">{t('autotrading.orderBook.columns.symbol', '標的')}</th>
                <th className="text-right px-2 py-1">{t('autotrading.orderBook.columns.side', '側')}</th>
                <th className="text-right px-2 py-1">{t('autotrading.orderBook.columns.quantity', '數量')}</th>
                <th className="text-right px-2 py-1">{t('autotrading.orderBook.columns.avgFillPrice', '成交均價')}</th>
                <th className="text-right px-2 py-1">{t('autotrading.orderBook.columns.retries', '重試')}</th>
                <th className="text-center px-2 py-1">{t('autotrading.orderBook.columns.status', '狀態')}</th>
                <th className="text-right px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isOpen = r.status === 'PENDING' || r.status === 'PARTIAL';
                return (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="px-2 py-1 text-(--color-term-muted)">{new Date(r.createdAt).toLocaleTimeString()}</td>
                    <td className="px-2 py-1 text-white">{r.symbol}</td>
                    <td className={cn('px-2 py-1 text-right', r.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>
                      {t(SIDE_LABEL_KEYS[r.side] ?? 'autotrading.orderBook.side.unknown', r.side)}
                    </td>
                    <td className="px-2 py-1 text-right text-white/80">{Number(r.filledQty)}/{Number(r.qty)}</td>
                    <td className="px-2 py-1 text-right text-white/80">{r.avgFillPrice ?? '-'}</td>
                    <td className="px-2 py-1 text-right text-(--color-term-muted)">{r.retryCount}</td>
                    <td className="px-2 py-1 text-center">
                      <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-bold', STATUS_COLORS[r.status] ?? '')}>
                        {t(STATUS_LABEL_KEYS[r.status] ?? 'autotrading.orderBook.status.unknown', r.status)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      {isOpen && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="text-rose-300 hover:text-rose-200 p-0.5"
                          title={t('autotrading.orderBook.cancelOrder', '取消委託')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
