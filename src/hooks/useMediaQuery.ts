import { useCallback, useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query. SSR/jsdom safe (returns `false` when unsupported). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)');
