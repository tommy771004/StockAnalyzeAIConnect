import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
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
  /** When true and a title is present, the panel becomes expandable via header click. */
  collapsible?: boolean;
  /** Initial open state when collapsible. Defaults to true. */
  defaultOpen?: boolean;
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
  collapsible = false,
  defaultOpen = true,
}: PanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isCollapsible = collapsible && !!title;
  const isCollapsed = isCollapsible && !isOpen;

  const accentTopBorder = {
    amber: 'border-t-[var(--color-term-accent)]',
    cyan:  'border-t-cyan-400',
    rose:  'border-t-rose-400',
    none:  '',
  }[accent];

  const headerInner = (
    <>
      {isCollapsible ? (
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-(--color-term-muted) transition-transform duration-200',
            !isOpen && '-rotate-90',
          )}
          aria-hidden="true"
        />
      ) : null}
      <h2 className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.28em] text-(--color-term-muted) uppercase">
        {icon ? <span className="text-(--color-term-accent)">{icon}</span> : null}
        {title}
      </h2>
    </>
  );

  return (
    <section
      className={cn(
        'relative flex flex-col border border-(--color-term-border) bg-(--color-term-panel)',
        'transition-[border-color,box-shadow] duration-200',
        accent !== 'none' && `border-t-2 ${accentTopBorder}`,
        glowOnHover && 'hover:border-(--color-term-accent)/40 hover:shadow-[0_0_12px_-2px_var(--color-term-accent,theme(colors.cyan.500/0.15))]',
        className,
        // When collapsed, strip growth classes so neighbors push up in flex-col stacks.
        isCollapsed && '!flex-none !h-auto !min-h-0',
      )}
    >
      {(title || actions) ? (
        <header
          className={cn(
            'flex h-9 shrink-0 items-center justify-between border-b px-3',
            'bg-gradient-to-r from-(--color-term-surface)/80 to-transparent',
            isCollapsed ? 'border-b-transparent' : 'border-(--color-term-border)',
            headerClassName,
          )}
        >
          {isCollapsible ? (
            <button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-2 text-left motion-safe:transition-colors hover:text-(--color-term-text) focus-ring rounded"
            >
              {headerInner}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">{headerInner}</div>
          )}
          {actions ? (
            <div
              className="flex items-center gap-2 text-(--color-term-muted)"
              onClick={(e) => { if (isCollapsible) e.stopPropagation(); }}
            >
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}
      {isCollapsible ? (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="panel-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1 min-h-0 overflow-hidden"
            >
              <div className={cn('h-full min-h-0', bodyClassName)}>{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
