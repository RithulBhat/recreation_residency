import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/components/ui';
import type { ScoutClue } from '@/scout/types';

export interface CareerTimelineProps {
  /** Clues unlocked so far, ladder order (draft → college → team → jersey). */
  clues: readonly ScoutClue[];
  /** The full ladder, so the rail can show the rungs still to come. */
  allClues: readonly ScoutClue[];
  className?: string;
}

/**
 * The `careerPath` mode's visual: a vertical timeline that extends as rungs unlock. The rail grows
 * with the number of unlocked nodes (a `scaleY` on a gradient line, so it is one cheap transform),
 * and the locked nodes stay as hollow dots.
 */
export function CareerTimeline({ clues, allClues, className }: CareerTimelineProps) {
  const reduce = useReducedMotion();
  const total = Math.max(allClues.length, clues.length, 1);
  const locked = Math.max(0, allClues.length - clues.length);
  const filled = clues.length / total;

  return (
    <section
      className={cn('glass relative isolate flex min-h-[16rem] flex-col overflow-hidden rounded-4xl bg-bg-elevated/85 p-4 sm:min-h-[20rem] sm:p-6', className)}
      data-testid="scout-stage-career"
      aria-label="Career path"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(120% 90% at 0% 100%, color-mix(in oklab, var(--sg-accent-vivid) 14%, transparent), transparent 60%)' }}
        aria-hidden
      />
      <span className="relative eyebrow-readable">Paper trail</span>

      <ol className="relative my-auto flex flex-col py-3 pl-8">
        {/* the rail */}
        <span className="absolute bottom-3 left-[11px] top-3 w-0.5 rounded-full bg-border" aria-hidden />
        <motion.span
          className="absolute left-[11px] top-3 w-0.5 origin-top rounded-full bg-gradient-accent"
          style={{ bottom: '0.75rem' }}
          initial={false}
          animate={{ scaleY: filled }}
          transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden
        />
        <AnimatePresence initial={false}>
          {clues.map((c, i) => (
            <motion.li
              key={`${c.kind}:${c.label}:${c.value}`}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.34, delay: reduce ? 0 : Math.min(i, 4) * 0.03 }}
              className="relative py-2.5"
              data-testid="scout-career-node"
            >
              <span
                className={cn(
                  'absolute -left-8 top-3.5 grid size-5 place-items-center rounded-full border-2',
                  i === clues.length - 1
                    ? 'border-accent bg-accent/25 shadow-glow'
                    : 'border-border-strong bg-bg-elevated',
                )}
                aria-hidden
              >
                <span className={cn('size-1.5 rounded-full', i === clues.length - 1 ? 'bg-accent' : 'bg-fg/40')} />
              </span>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{c.label}</div>
              <div className="text-base font-bold leading-snug text-fg sm:text-lg">{c.value}</div>
            </motion.li>
          ))}
        </AnimatePresence>
        {Array.from({ length: locked }, (_, i) => (
          <li key={`locked-${i}`} className="relative py-2.5 opacity-45" aria-hidden>
            <span className="absolute -left-8 top-3.5 size-5 rounded-full border-2 border-dashed border-border" />
            <span className="block h-2.5 w-20 rounded-full bg-fg/12" />
            <span className="mt-1.5 block h-3.5 w-32 rounded-md bg-fg/10" />
          </li>
        ))}
      </ol>

      <p className="relative text-xs text-muted">
        {locked > 0 ? 'The trail extends with every miss.' : 'The whole file is open.'}
      </p>
    </section>
  );
}
