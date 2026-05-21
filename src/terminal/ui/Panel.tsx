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

const ACCENT_TOP: Record<string, { border: string; glow: string }> = {
  amber: {
    border: 'border-t-[var(--color-term-accent)]',
    glow: '0 0 20px -4px rgba(245,158,11,0.25)',
  },
  cyan: {
    border: 'border-t-cyan-400',
    glow: '0 0 20px -4px rgba(34,211,238,0.2)',
  },
  rose: {
    border: 'border-t-rose-400',
    glow: '0 0 20px -4px rgba(248,113,113,0.2)',
  },
  none: { border: '', glow: '' },
};

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

  const accentCfg = ACCENT_TOP[accent] ?? ACCENT_TOP.none;

  const headerInner = (
    <>
      {isCollapsible ? (
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-(--color-term-muted)/60 transition-transform duration-200',
            !isOpen && '-rotate-90',
          )}
          aria-hidden="true"
        />
      ) : null}
      <h2 className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.28em] text-(--color-term-muted) uppercase font-sans">
        {icon ? <span className="text-(--color-term-accent)">{icon}</span> : null}
        {title}
      </h2>
    </>
  );

  return (
    <section
      className={cn(
        'relative flex flex-col border border-(--color-term-border) rounded-xl overflow-hidden',
        'transition-[border-color,box-shadow] duration-300',
        accent !== 'none' && `border-t-2 ${accentCfg.border}`,
        glowOnHover && 'hover:border-(--color-term-accent)/30',
        className,
        isCollapsed && '!flex-none !h-auto !min-h-0',
      )}
      style={{
        background: 'linear-gradient(180deg, rgba(14,20,32,0.95) 0%, rgba(10,14,22,0.98) 100%)',
        // Top-edge glass highlight
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)${accentCfg.glow ? `, ${accentCfg.glow}` : ''}`,
      }}
    >
      {/* Top glass highlight line */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.06) 60%, transparent)' }}
        aria-hidden="true"
      />

      {(title || actions) ? (
        <header
          className={cn(
            'flex h-9 shrink-0 items-center justify-between border-b px-3',
            isCollapsed ? 'border-b-transparent' : 'border-(--color-term-border)/70',
            headerClassName,
          )}
          style={{
            background: 'linear-gradient(90deg, rgba(255,255,255,0.025) 0%, transparent 80%)',
          }}
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
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
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
