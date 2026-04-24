import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  children: ReactNode;
  accent?: 'amber' | 'none';
}

export function Panel({
  title,
  actions,
  className,
  bodyClassName,
  headerClassName,
  children,
  accent = 'none',
}: PanelProps) {
  return (
    <section
      className={cn(
        'relative flex flex-col border border-(--color-term-border) bg-(--color-term-panel)',
        accent === 'amber' && 'border-t-2 border-t-(--color-term-accent)',
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={cn(
            'flex h-9 shrink-0 items-center justify-between border-b border-(--color-term-border) px-3',
            headerClassName,
          )}
        >
          <h2 className="text-[11px] font-semibold tracking-[0.22em] text-(--color-term-text) uppercase">
            {title}
          </h2>
          <div className="flex items-center gap-2 text-(--color-term-muted)">{actions}</div>
        </header>
      )}
      <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}
