import type { TickerSummary } from '../types';
import { formatPct, toneClass } from '../ui/format';

export function TickerTape({ items }: { items: TickerSummary[] }) {
  return (
    <div className="flex h-10 items-center gap-6 overflow-x-auto border-b border-(--color-term-border) bg-(--color-term-bg) px-5 text-[12px]">
      {items.map((item) => (
        <div key={item.label} className="flex shrink-0 items-center gap-2">
          <span className="text-(--color-term-text) font-semibold tracking-wider">
            {item.label}
          </span>
          <span className="text-(--color-term-muted) tabular-nums">{item.value}</span>
          <span className={`${toneClass(item.changePct)} tabular-nums`}>
            {formatPct(item.changePct)}
          </span>
        </div>
      ))}
    </div>
  );
}
