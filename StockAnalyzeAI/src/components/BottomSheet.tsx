/**
 * BottomSheet.tsx — Mobile-first bottom sheet component
 *
 * On mobile (< md): slides up from the bottom with drag-to-dismiss.
 * On desktop (>= md): renders as a floating card near the trigger.
 *
 * Usage:
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="下單面板">
 *     {children}
 *   </BottomSheet>
 */
import React, { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Extra class on the sheet panel itself */
  className?: string;
  children: React.ReactNode;
  /** Desktop: max width of floating card (default 'max-w-sm') */
  desktopWidth?: string;
}

const BottomSheetInner: React.FC<Props> = ({
  open,
  onClose,
  title,
  className,
  children,
  desktopWidth = 'max-w-sm',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.classList.add('scroll-locked');
    } else {
      document.body.classList.remove('scroll-locked');
    }
    return () => { document.body.classList.remove('scroll-locked'); };
  }, [open]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 400) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet Panel — bottom sheet on mobile, floating card on desktop */}
          <motion.div
            key="bs-panel"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className={cn(
              // Mobile: full bottom sheet
              'fixed bottom-0 left-0 right-0 z-[90]',
              'md:static md:inset-auto',
              // Desktop: floating card
              'md:fixed md:bottom-auto md:left-auto md:right-6 md:top-auto',
              'liquid-glass-strong rounded-t-3xl md:rounded-2xl border border-white/10',
              'shadow-[0_-10px_60px_rgba(0,0,0,0.6)] md:shadow-2xl',
              'safe-area-bottom',
              // Desktop width
              `md:${desktopWidth}`,
              className
            )}
          >
            {/* Drag handle (mobile only) */}
            <div className="md:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
                <h2 className="text-sm font-bold text-white">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl hover:bg-[var(--border-color)] text-zinc-400 transition-colors"
                  aria-label="關閉"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="px-5 py-4 overflow-y-auto max-h-[calc(100vh-5rem)] md:max-h-none custom-scrollbar mobile-scroll">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const BottomSheet = memo(BottomSheetInner);
export default BottomSheet;
