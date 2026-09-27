import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleCheckBig, CircleX } from 'lucide-react';
import { cn } from '@/components/ui';
import type { ScoutRound } from '@/scout/types';
import { BLITZ_PENALTY_SECONDS } from './formatCopy';
import { points } from './format';

/** How long the answer of a just-finished blitz subject stays on screen. */
export const BLITZ_FLASH_MS = 1700;

export interface BlitzFlashProps {
  /** The round that just ended — `rounds[currentRound - 1]` in a live blitz. */
  round?: ScoutRound;
  className?: string;
}

/**
 * Blitz never stops on a reveal — a finished subject is replaced instantly, which is the whole point of
 * the format and also means the normal verdict line is already describing the NEXT subject. So the
 * answer gets its own flash: who it was, what it paid, and the five seconds a miss just cost.
 *
 * Without this you can play a 90-second run and never learn a single name you missed.
 */
export function BlitzFlash({ round, className }: BlitzFlashProps) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<ScoutRound | undefined>(round);

  useEffect(() => {
    setShown(round);
    if (!round) return;
    const id = window.setTimeout(() => setShown(undefined), BLITZ_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [round]);

  const won = shown?.status === 'won';

  return (
    <div className={cn('min-h-12', className)} aria-live="polite" data-testid="scout-blitz-flash">
      <AnimatePresence mode="wait" initial={false}>
        {shown && (
          <motion.div
            key={`${shown.index}:${shown.status}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn(
              'flex max-w-full items-center gap-2.5 rounded-3xl border px-3.5 py-2.5',
              won ? 'border-success/40 bg-success/15 text-success' : 'border-danger/40 bg-danger/15 text-danger',
            )}
            role="status"
            data-verdict={won ? 'correct' : 'wrong'}
          >
            <span className="shrink-0 [&>svg]:size-4" aria-hidden>
              {won ? <CircleCheckBig /> : <CircleX />}
            </span>
            <span className="min-w-0 truncate text-sm font-bold">
              {won ? shown.subject.name : `It was ${shown.subject.name}`}
            </span>
            <span className="ml-auto shrink-0 font-mono text-sm font-bold tabular">
              {won ? `+${points(shown.score)}` : `−${BLITZ_PENALTY_SECONDS}s`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
