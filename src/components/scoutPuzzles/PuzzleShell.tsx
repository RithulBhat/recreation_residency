import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/**
 * The frame every choice-shaped stage sits in.
 *
 * It matches the existing stages (`TriviaStack`, `StatTable`): a glass card with an eyebrow, sized
 * to the same hero slot, with the question typeset large enough to read at a glance on a laptop.
 * One `<h2>`-free heading: the Play screen owns the page's single `<h1>`, so the question is a `<p>`
 * and the card is labelled through `aria-label` instead.
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
  children,
  className,
}: PuzzleShellProps) {
  return (
    <section
      className={cn(
        'glass relative isolate flex min-h-[16rem] flex-col gap-3 overflow-hidden rounded-4xl bg-bg-elevated/85 p-4 sm:min-h-[20rem] sm:p-5',
        className,
      )}
      aria-label={label}
      data-testid={testId}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${TINT[tint]} 14%, transparent), transparent 60%)` }}
      />
      <header className="relative flex min-w-0 flex-col gap-1">
        <span className="eyebrow-readable">{eyebrow}</span>
        <p className="text-balance font-display text-base font-bold leading-snug text-fg sm:text-lg">{question}</p>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col justify-center">{children}</div>
      {hint !== undefined && <p className="relative shrink-0 text-xs text-muted">{hint}</p>}
    </section>
  );
}

/** The grid the card sets use: as many columns as fit, never narrower than a readable card. */
export function CardGrid({ min = '7.5rem', children }: { min?: string; children: ReactNode }) {
  return (
    <div
      className="grid gap-2.5 sm:gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}
      data-testid="scout-puzzle-grid"
    >
      {children}
    </div>
  );
}
