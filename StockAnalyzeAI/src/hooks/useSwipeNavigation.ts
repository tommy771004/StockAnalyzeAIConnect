/**
 * useSwipeNavigation.ts — Mobile horizontal-swipe page navigation hook
 *
 * Returns touch event handlers to attach to a container element.
 * Triggers onSwipeLeft (→ next page) or onSwipeRight (→ prev page)
 * only when the horizontal displacement clearly exceeds the vertical one,
 * preventing false triggers during normal vertical scrolling.
 */
import { useRef, useCallback } from 'react';

interface Options {
  onSwipeLeft?: () => void;   // finger moves left  → go to next page
  onSwipeRight?: () => void;  // finger moves right → go to prev page
  /** Minimum horizontal px before triggering (default: 55) */
  threshold?: number;
  /** If |dy| / |dx| exceeds this ratio, treat as scroll not swipe (default: 0.8) */
  maxVerticalRatio?: number;
  /** Disabled when false (e.g. on desktop) */
  enabled?: boolean;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove:  (e: React.TouchEvent) => void;
  onTouchEnd:   (e: React.TouchEvent) => void;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 90,
  maxVerticalRatio = 0.5,
  enabled = true,
}: Options): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);
  // Track whether the current gesture was locked as a scroll (ignore swipe)
  const isScroll = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    isScroll.current = false;
  }, [enabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !start.current || isScroll.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - start.current.x);
    const dy = Math.abs(t.clientY - start.current.y);
    // Lock as vertical scroll as soon as dy > dx (stricter angle requirement)
    if (dy > 8 && dy / Math.max(dx, 1) > maxVerticalRatio) {
      isScroll.current = true;
    }
  }, [enabled, maxVerticalRatio]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled || !start.current || isScroll.current) {
      start.current = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;

    // Final angle check: reject if too vertical (angle from horizontal must be < ~27°)
    if (Math.abs(dy) / Math.max(Math.abs(dx), 1) > maxVerticalRatio) return;
    // Must pass horizontal threshold
    if (Math.abs(dx) < threshold) return;

    if (dx < 0) {
      onSwipeLeft?.();   // swiped left → next page
    } else {
      onSwipeRight?.();  // swiped right → prev page
    }
  }, [enabled, onSwipeLeft, onSwipeRight, threshold, maxVerticalRatio]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
