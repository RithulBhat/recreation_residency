import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Lock } from 'lucide-react';
import { cn } from '@/components/ui';
import type { ScoutClue } from '@/scout/types';

export interface StatTableProps {
  /** The stat clues unlocked so far, ladder order. */
  clues: readonly ScoutClue[];
  /** Every stat clue the ladder will ever show — the locked rows are drawn as blanks. */
  allClues: readonly ScoutClue[];
  className?: string;
}

/**
 * The `statLine` mode's visual: a season stat sheet that fills in.
 *
 * Locked rows are drawn, but blank — a label like "Pass yds" is itself a huge clue, so a locked row
 * shows the SHAPE of the sheet (how much is still to come) and nothing else. They say LOCKED, in
 * the same dashed-and-padlocked idiom the franchise dossier and the clue rail use: an unlabelled
 * pair of grey pills is the universal "still loading" idiom, and at 40% opacity it was close to
 * invisible on the daylight theme.
 */
export function StatTable({ clues, allClues, className }: StatTableProps) {
  const reduce = useReducedMotion();
  const shown = clues.length;
  const locked = Math.max(0, allClues.length - shown);

  return (
    <section
      className={cn('glass relative isolate flex min-h-[16rem] flex-col overflow-hidden rounded-4xl bg-bg-elevated/85 p-4 sm:min-h-[20rem] sm:p-6', className)}
      data-testid="scout-stage-stats"
      aria-label="Season stat line"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--sg-accent-2-vivid) 14%, transparent), transparent 60%)' }}
        aria-hidden
      />
      <div className="relative flex items-baseline justify-between gap-3">
        <span className="eyebrow-readable">Stat sheet</span>
        <span className="font-mono text-[11px] text-muted tabular">
          {shown}/{allClues.length} lines
        </span>
      </div>

      <dl className="relative my-auto flex flex-col divide-y divide-border py-2">
        <AnimatePresence initial={false}>
          {clues.map((c, i) => (
            <motion.div
              key={`${c.label}:${c.value}`}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.32, delay: reduce ? 0 : Math.min(i, 3) * 0.02 }}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <dt className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-muted">{c.label}</dt>
              <dd className="shrink-0 font-mono text-2xl font-bold tabular text-fg sm:text-3xl">{c.value}</dd>
            </motion.div>
          ))}
        </AnimatePresence>
        {Array.from({ length: locked }, (_, i) => (
          <div
            key={`locked-${i}`}
            className="flex items-center justify-between gap-4 py-2.5 text-muted"
            aria-hidden
            data-testid="scout-stat-locked"
          >
            <span className="inline-flex items-center gap-2">
              <Lock className="size-3.5 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Locked</span>
            </span>
            <span className="h-6 w-16 rounded-md border border-dashed border-border-strong/70 bg-fg/[0.04]" />
          </div>
        ))}
      </dl>

      <p className="relative text-xs text-muted">
        {locked > 0 ? `${locked} more line${locked === 1 ? '' : 's'} unlock as you miss.` : 'That is the whole sheet.'}
      </p>
    </section>
  );
}
