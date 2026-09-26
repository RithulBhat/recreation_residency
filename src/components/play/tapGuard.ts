/**
 * Double-tap guard for the record. A second tap / Space within `DOUBLE_TAP_MS` of the play that
 * just started is a bounce (mobile double-tap, key repeat, a desktop dblclick), not a request to
 * stop — and it must not count as a second listen.
 */

export const DOUBLE_TAP_MS = 250;

export interface TapGuard {
  /** True when a play was accepted less than the window ago. */
  isRecent(): boolean;
  /** Record an accepted play. */
  mark(): void;
  reset(): void;
}

export function createTapGuard(windowMs = DOUBLE_TAP_MS, now: () => number = () => Date.now()): TapGuard {
  let last = Number.NEGATIVE_INFINITY;
  return {
    isRecent: () => now() - last < windowMs,
    mark: () => {
      last = now();
    },
    reset: () => {
      last = Number.NEGATIVE_INFINITY;
    },
  };
}
