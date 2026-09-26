import { useCallback, useEffect, useState } from 'react';

/** localStorage flag: the first-run coach marks have been dismissed. */
export const COACH_KEY = 'sg:coach:play';

export function isCoachDone(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === 'done';
  } catch {
    return true; // no storage → never nag
  }
}

export function markCoachDone(): void {
  try {
    localStorage.setItem(COACH_KEY, 'done');
  } catch {
    /* private mode */
  }
}

/** Opens once, the first time `eligible` is true on a device that has not dismissed the marks. */
export function useCoachMarks(eligible: boolean): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (eligible && !isCoachDone()) setOpen(true);
  }, [eligible]);
  const dismiss = useCallback(() => {
    markCoachDone();
    setOpen(false);
  }, []);
  return { open, dismiss };
}
