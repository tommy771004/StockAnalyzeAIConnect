import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PanelProps {
  title?: string;
  /** Optional icon shown before the title in the panel header */
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  children: ReactNode;
  accent?: 'amber' | 'cyan' | 'rose' | 'none';
  /** Show a subtle glow on the top border when hovered */
  glowOnHover?: boolean;
}

export function Panel({
  title,
  icon,
  actions,
  className,
  bodyClassName,
  headerClassName,
  children,
  accent = 'none',
  glowOnHover = false,
}: PanelProps) {
  const accentTopBorder = {
    amber: 'border-t-[var(--color-term-accent)]',
    cyan:  'border-t-cyan-400',
    rose:  'border-t-rose-400',
    none:  '',
  }[accent];

  return (
    <section
      className={cn(
        // Base panel styles — refined from original
        'relative flex flex-col border border-(--color-term-border) bg-(--color-term-panel)',
        'transition-[border-color,box-shadow] duration-200',
        // Accent top border
        accent !== 'none' && `border-t-2 ${accentTopBorder}`,
        // Optional hover glow
        glowOnHover && 'hover:border-(--color-term-accent)/40 hover:shadow-[0_0_12px_-2px_var(--color-term-accent,theme(colors.cyan.500/0.15))]',
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={cn(
            'flex h-9 shrink-0 items-center justify-between border-b border-(--color-term-border) px-3',
            'bg-gradient-to-r from-(--color-term-surface)/80 to-transparent',
            headerClassName,
          )}
        >
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.28em] text-(--color-term-muted) uppercase">
            {icon && <span className="text-(--color-term-accent)">{icon}</span>}
            {title}
          </h2>
          <div className="flex items-center gap-2 text-(--color-term-muted)">{actions}</div>
        </header>
      )}
      <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}
