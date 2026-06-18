/**
 * src/contexts/ConfirmContext.tsx
 * Promise-based confirmation dialog — a themed, accessible replacement for
 * the native window.confirm(). Call `const ok = await confirm({ ... })`.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const open = opts !== null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-hidden="true"
                onClick={() => close(false)}
              />
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby={opts?.message ? 'confirm-message' : undefined}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
                className="relative w-full max-w-sm rounded-xl border border-(--color-term-border-strong) bg-(--color-term-panel) p-5 shadow-2xl"
              >
                <div className="flex items-start gap-3">
                  {opts?.destructive && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
                      <AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 id="confirm-title" className="text-sm font-bold text-(--color-term-text)">
                      {opts?.title ?? t('common.confirmTitle', 'Are you sure?')}
                    </h2>
                    {opts?.message && (
                      <p id="confirm-message" className="mt-1 text-xs text-(--color-term-muted)">
                        {opts.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="focus-ring rounded-sm border border-(--color-term-border) px-3 py-1.5 text-xs font-medium text-(--color-term-muted) hover:text-(--color-term-text) motion-safe:transition-colors"
                  >
                    {opts?.cancelLabel ?? t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => close(true)}
                    className={
                      'focus-ring rounded-sm px-3 py-1.5 text-xs font-bold motion-safe:transition-colors ' +
                      (opts?.destructive
                        ? 'bg-rose-500 text-white hover:bg-rose-600'
                        : 'bg-(--color-term-accent) text-(--color-term-bg) hover:bg-(--color-term-accent-soft)')
                    }
                  >
                    {opts?.confirmLabel ?? t('common.confirm', 'Confirm')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
