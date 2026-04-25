import { useState, useEffect } from 'react';

/**
 * useMediaQuery — Returns true when the CSS media query matches.
 * SSR-safe: defaults to false before hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Convenience: true when viewport < 768px */
export const useMobile = () => useMediaQuery('(max-width: 767px)');
/** Convenience: true when viewport < 1024px */
export const useTablet = () => useMediaQuery('(max-width: 1023px)');
