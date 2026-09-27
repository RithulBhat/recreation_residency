import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Timer } from 'lucide-react';
import { cn } from '@/components/ui';
import { BLITZ_PENALTY_SECONDS } from './formatCopy';
import { clock } from './format';

/** Under this much clock the hero turns danger and starts pulsing. */
export const BLITZ_DANGER_MS = 10_000;

export interface BlitzClockProps {
  /** `blitzTimeLeftMs(state, now)`. */
  msLeft: number;
  /** `state.blitzEndsAt` — the absolute deadline. It only ever moves BACKWARDS, on a miss. */
  endsAt?: number;
  /** Rounds won so far — the running tally. */
  correct: number;
  className?: string;
}

/**
 * The blitz hero: the run clock, big enough to be the thing you look at, with the tally beside it.
 *
 * A miss shortens the deadline rather than the displayed number, so the penalty is invisible unless
 * something says so — hence the `−5s` flash, fired by watching `endsAt` jump backwards. Under ten
 * seconds the clock turns `text-danger` and pulses (never under `prefers-reduced-motion`, where the
 * colour and the ring carry it alone).
 */
export function BlitzClock({ msLeft, endsAt, correct, className }: BlitzClockProps) {
  const reduce = useReducedMotion();
  const danger = msLeft <= BLITZ_DANGER_MS;
  const seconds = Math.ceil(msLeft / 1000);

  // Every backwards jump in the deadline is a miss penalty. Keyed by a counter so two misses in a
  // row each get their own flash.
  const prev = useRef<number | undefined>(endsAt);
  const [penalty, setPenalty] = useState(0);
  useEffect(() => {
    const before = prev.current;
    prev.current = endsAt;
    if (before === undefined || endsAt === undefined) return;
    if (endsAt < before - 500) setPenalty((n) => n + 1);
  }, [endsAt]);
  useEffect(() => {
    if (penalty === 0) return;
    const id = window.setTimeout(() => setPenalty(0), 1100);
    return () => window.clearTimeout(id);
  }, [penalty]);

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5 sm:gap-3.5', className)} data-testid="scout-blitz">
      <div className="min-w-0 leading-none">
        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          <Timer className="size-3" aria-hidden />
          Clock
        </div>
        <motion.div
          className={cn(
            'mt-0.5 font-mono text-4xl font-black tabular sm:text-5xl',
            danger ? 'text-danger' : 'text-fg',
          )}
          animate={danger && !reduce ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={danger && !reduce ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          aria-label={`${seconds} seconds left`}
          data-testid="scout-blitz-clock"
          data-danger={danger ? 'true' : 'false'}
          role="timer"
        >
          {clock(msLeft)}
        </motion.div>
      </div>

      <div className="min-w-0 border-l border-border pl-2.5 leading-tight sm:pl-3.5">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Named</div>
        <div className="font-display text-2xl font-bold text-fg tabular" data-testid="scout-blitz-tally">
          {correct}
        </div>
      </div>

      {/* The penalty gets a reserved lane of its own: a badge that floated over the tally would land
          on the one number the player is trying to read. */}
      <div className="w-12 shrink-0">
        <AnimatePresence>
          {penalty > 0 && (
            <motion.span
              key={penalty}
              className="inline-flex rounded-full border border-danger/50 bg-danger/20 px-2 py-0.5 font-mono text-sm font-black text-danger"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              role="status"
              data-testid="scout-blitz-penalty"
            >
              −{BLITZ_PENALTY_SECONDS}s
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
