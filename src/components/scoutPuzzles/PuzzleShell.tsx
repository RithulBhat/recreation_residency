import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/**
 * The frame every choice-shaped stage sits in.
 *
 * It matches the existing stages (`TriviaStack`, `StatTable`): a glass card with an eyebrow, sized
 * to the same hero slot, with the question typeset large enough to read at a glance on a laptop.
 * One `<h2>`-free heading: the Play screen owns the page's single `<h1>`, so the question is a `<p>`
 * and the card is labelled through `aria-label` instead.
 *
 * `dense` is the shape the board takes AT THE REVEAL, where it shares the hero column with the
 * reveal card: same board, same marks, a third of the height — the eyebrow and one line of question,
 * no hint, and cards that keep their floor size rather than growing into the slot.
 */
export interface PuzzleShellProps {
  /** Small caps caption: 'Locker room'. */
  eyebrow: string;
  /** The question, in words: 'Four of his teammates. Name the man missing.' */
  question: string;
  /** Screen-reader name for the region. */
  label: string;
  /** Bottom line: what the next miss buys you. */
  hint?: string;
  tint?: 'accent' | 'accent-2' | 'accent-3';
  testId?: string;
  /** Reveal-time shape: short header, no hint, no growing. */
  dense?: boolean;
  children: ReactNode;
  className?: string;
}

const TINT: Record<'accent' | 'accent-2' | 'accent-3', string> = {
  accent: 'var(--sg-accent-vivid)',
  'accent-2': 'var(--sg-accent-2-vivid)',
  'accent-3': 'var(--sg-accent-3-vivid)',
};

export function PuzzleShell({
  eyebrow,
  question,
  label,
  hint,
  tint = 'accent-2',
  testId,
  dense = false,
  children,
  className,
}: PuzzleShellProps) {
  return (
    <section
      className={cn(
        'glass relative isolate flex flex-col overflow-hidden rounded-4xl bg-bg-elevated/85',
        dense ? 'min-h-0 gap-2 p-3 sm:p-3.5' : 'min-h-[16rem] gap-3 p-4 sm:min-h-[20rem] sm:p-5',
        className,
      )}
      aria-label={label}
      data-testid={testId}
      data-dense={dense ? 'true' : 'false'}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${TINT[tint]} 14%, transparent), transparent 60%)` }}
      />
      <header className={cn('relative flex min-w-0 shrink-0', dense ? 'items-baseline gap-2' : 'flex-col gap-1')}>
        <span className="eyebrow-readable shrink-0">{eyebrow}</span>
        <p
          className={cn(
            'min-w-0 text-balance font-display font-bold leading-snug text-fg',
            dense ? 'truncate text-sm' : 'text-base sm:text-lg',
          )}
        >
          {question}
        </p>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col justify-center">{children}</div>
      {hint !== undefined && !dense && <p className="relative shrink-0 text-xs text-muted">{hint}</p>}
    </section>
  );
}

/**
 * The grid the card sets use.
 *
 * Column counts are CHOSEN, not left to `auto-fit`: six cells in `repeat(auto-fit, minmax(7.5rem))`
 * at 690 px laid five across and orphaned the sixth on a row of its own. Three columns from `sm` up
 * divides both a five-cell and a six-cell board evenly (the odd board spends its spare column on the
 * mystery tile, which is the one cell worth being bigger), and two columns does the same on a phone.
 *
 * `fill` stretches the rows to the height the stage was given, so the board occupies the slot rather
 * than floating in the middle of it; the cards' photo plates grow with their cells.
 */
export function CardGrid({
  children,
  cols = 3,
  fill = false,
  className,
}: {
  children: ReactNode;
  /** Columns from `sm` up. Two on a phone, always. */
  cols?: 2 | 3 | 4;
  fill?: boolean;
  className?: string;
}) {
  const COLS: Record<2 | 3 | 4, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  };
  return (
    <div
      className={cn(
        'grid min-h-0 gap-2.5 sm:gap-3',
        COLS[cols],
        fill && 'flex-1 auto-rows-fr',
        className,
      )}
      data-testid="scout-puzzle-grid"
    >
      {children}
    </div>
  );
}
