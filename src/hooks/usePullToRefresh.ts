import { useState, useEffect, type RefObject } from 'react';

export interface PullState {
  progress: number;
  refreshing: boolean;
  pulling: boolean;
}

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  options: { onRefresh: () => Promise<void> | void; threshold?: number }
): PullState {
  const [state, setState] = useState<PullState>({
    progress: 0,
    refreshing: false,
    pulling: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startY = 0;
    let isPulling = false;
    let currentProgress = 0;
    let isRefreshing = false;
    const threshold = options.threshold || 60;

    const onTouchStart = (e: TouchEvent) => {
      // Only trigger if we are at the very top of the scroll container
      if (el.scrollTop <= 0 && !isRefreshing) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;

      if (dy > 0 && el.scrollTop <= 0) {
        // We are pulling down
        if (e.cancelable) e.preventDefault(); // Prevent native scroll/bounce
        currentProgress = Math.min(dy / threshold, 1.5);
        setState({ progress: currentProgress, pulling: true, refreshing: false });
      }
    };

    const onTouchEnd = async () => {
      if (!isPulling) return;
      isPulling = false;

      if (currentProgress >= 1 && !isRefreshing) {
        isRefreshing = true;
        setState({ progress: 1, pulling: false, refreshing: true });
        
        try {
          await options.onRefresh();
        } finally {
          isRefreshing = false;
          currentProgress = 0;
          setState({ progress: 0, pulling: false, refreshing: false });
        }
      } else {
        // Cancelled pull
        currentProgress = 0;
        setState({ progress: 0, pulling: false, refreshing: false });
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // Must be non-passive to call e.preventDefault()
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, options.onRefresh, options.threshold]);

  return state;
}
