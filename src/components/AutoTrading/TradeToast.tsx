import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import type { OrderLifecycleEvent } from './useAutotradingWS';

interface ToastItem {
  id: string;
  type: 'buy' | 'sell' | 'cancel';
  symbol: string;
  qty: number;
  price: number;
}

interface Props {
  events: OrderLifecycleEvent[];
}

function ProgressBar({ type }: { type: ToastItem['type'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '100%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'width 4s linear';
        el.style.width = '0%';
      });
    });
  }, []);
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--color-term-border) rounded-b overflow-hidden">
      <div
        ref={ref}
        className={cn(
          'h-full rounded-full',
          type === 'buy' ? 'bg-emerald-400' :
          type === 'sell' ? 'bg-rose-400' : 'bg-amber-400'
        )}
      />
    </div>
  );
}

export function TradeToast({ events }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef(new Set<number>());

  useEffect(() => {
    events.forEach(e => {
      if (seenRef.current.has(e.orderId)) return;
      if (e.status !== 'FILLED') return;
      seenRef.current.add(e.orderId);

      const item: ToastItem = {
        id: `${e.orderId}-${e.timestamp}`,
        type: e.side === 'BUY' ? 'buy' : e.side === 'SELL' ? 'sell' : 'cancel',
        symbol: e.symbol,
        qty: e.qty,
        price: e.price,
      };

      setToasts(prev => [...prev.slice(-2), item]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id));
      }, 4200);
    });
  }, [events]);

  if (toasts.length === 0) return null;

  const label = (t: ToastItem) =>
    t.type === 'buy' ? '✓ 已買入' : t.type === 'sell' ? '✓ 已賣出' : '✗ 已取消';

  return (
    <div className="fixed z-50 flex flex-col gap-2 bottom-4 right-4">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'relative w-72 rounded border-l-4 bg-(--color-term-bg) p-3 shadow-xl text-sm',
            'animate-in slide-in-from-right-4 fade-in duration-200',
            toast.type === 'buy' && 'border-emerald-400',
            toast.type === 'sell' && 'border-rose-400',
            toast.type === 'cancel' && 'border-amber-400',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={cn(
                'font-mono font-semibold text-[13px]',
                toast.type === 'buy' && 'text-emerald-400',
                toast.type === 'sell' && 'text-rose-400',
                toast.type === 'cancel' && 'text-amber-400',
              )}>
                {label(toast)}  {toast.symbol}
              </div>
              <div className="text-[11px] text-(--color-term-muted) mt-0.5 font-mono">
                {toast.qty.toLocaleString()} 股 @ ${toast.price.toLocaleString()}
                {' · '}總額 ${(toast.qty * toast.price).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-(--color-term-muted) hover:text-(--color-term-fg) shrink-0 leading-none"
            >
              ×
            </button>
          </div>
          <ProgressBar type={toast.type} />
        </div>
      ))}
    </div>
  );
}
