/**
 * usePullToRefresh.ts — Mobile pull-to-refresh gesture hook
 *
 * Attaches touch listeners to a scrollable container ref.
 * Calls `onRefresh` when the user pulls down past the threshold while
 * the container is already scrolled to the top.
 */
import { useRef, useEffect, useCallback, useState } from 'react';

interface Options {
  /** Pixels to pull before triggering (default: 72) */
  threshold?: number;
  /** Callback to invoke on refresh — should return a Promise */
  onRefresh: () => Promise<void> | void;
  /** Set false to disable the hook entirely (e.g. on desktop) */
  enabled?: boolean;
}

export interface PullState {
  /** 0–1 where 1 = threshold reached */
  progress: number;
  /** true while the async refresh is running */
  refreshing: boolean;
  /** true while user is actively pulling */
  pulling: boolean;
}

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  { threshold = 72, onRefresh, enabled = true }: Options
): PullState {
  const startY    = useRef(0);
  const pulling   = useRef(false);
  const [state, setState] = useState<PullState>({ progress: 0, refreshing: false, pulling: false });

  const reset = useCallback(() => {
    pulling.current = false;
    setState({ progress: 0, refreshing: false, pulling: false });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;            // only at top
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { pulling.current = false; return; }
      // dampen resistance
      const progress = Math.min(delta / threshold, 1);
      setState(s => ({ ...s, progress, pulling: true }));
    };

    let mounted = true;

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      setState(s => {
        if (s.progress < 1) { return { ...s, progress: 0, pulling: false }; }
        return { ...s, refreshing: true, pulling: false };
      });
      try {
        await onRefresh();
      } finally {
        if (mounted) reset();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: true });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      mounted = false;
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [enabled, threshold, onRefresh, reset, containerRef]);

  return state;
}
