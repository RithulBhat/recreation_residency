import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export const TICK_MS = 250;

/**
 * Drives the engine clock (`tick`) every 250 ms while a game is playing and returns a `now`
 * that re-renders at the same cadence when `clock` is true (blitz clock / round timer).
 */
export function useGameClock(ticking: boolean, clock: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      useGameStore.getState().tick(t);
      if (clock) setNow(t);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking, clock]);
  return now;
}
