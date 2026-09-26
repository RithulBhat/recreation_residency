import { useEffect, useState } from 'react';
import { useScoutStore } from '@/store/scoutStore';

export const TICK_MS = 250;

/**
 * Drives the engine clock (`tick`) every 250 ms while a round is live, and returns a `now` that
 * re-renders at the same cadence when `clock` is true (i.e. a round timer is on).
 *
 * `ticking` is deliberately gated on the stage being READY: the engine starts a round's clock on its
 * first tick, so waiting for the headshot to decode means a slow image never burns the timer.
 */
export function useScoutClock(ticking: boolean, clock: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    // Tick once immediately so the round is marked seen the moment it is actually on screen.
    const first = Date.now();
    useScoutStore.getState().tick(first);
    if (clock) setNow(first);
    const id = window.setInterval(() => {
      const t = Date.now();
      useScoutStore.getState().tick(t);
      if (clock) setNow(t);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking, clock]);
  return now;
}
