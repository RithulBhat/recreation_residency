import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Lock } from 'lucide-react';
import { cn } from '@/components/ui';
import type { ScoutClue } from '@/scout/types';

export interface TriviaStackProps {
  /** Clues unlocked so far, ladder order (hardest first). */
  clues: readonly ScoutClue[];
  /** The full ladder, so the locked cards can be drawn as a stack you have yet to earn. */
  allClues: readonly ScoutClue[];
  className?: string;
}

/** Team colours arrive as a `#hex / #hex` string — render them as swatches, not text. */
function ColorSwatches({ value }: { value: string }) {
  const hexes = value.split('/').map((s) => s.trim()).filter((s) => /^#[0-9a-f]{3,8}$/i.test(s));
  if (hexes.length === 0) return <span className="font-semibold text-fg">{value}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {hexes.map((h) => (
        <span key={h} className="inline-flex items-center gap-1.5 font-mono text-xs text-fg">
          <span className="size-4 rounded-full border border-border-strong" style={{ background: h }} aria-hidden />
          {h}
        </span>
      ))}
    </span>
  );
}

/**
 * The `teamTrivia` mode's visual: the clue ladder as a stack of cards. The deepest cut is on top
 * (it arrived first), each miss slides another, easier card in underneath, and the cards still to
 * come sit at the bottom as locked slots so you can see how much rope is left.
 */
export function TriviaStack({ clues, allClues, className }: TriviaStackProps) {
  const reduce = useReducedMotion();
  const locked = Math.max(0, allClues.length - clues.length);
  const newestRef = useRef<HTMLLIElement>(null);
  const count = clues.length;

  // The dossier scrolls inside its own card (a long ladder must never push the guess box off
  // screen), so the card that just landed is brought into view.
  useEffect(() => {
    if (count <= 1) return;
    newestRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [count, reduce]);

  return (
    <section
      className={cn('glass relative isolate flex min-h-[16rem] flex-col gap-2.5 overflow-hidden rounded-4xl bg-bg-elevated/85 p-4 sm:min-h-[20rem] sm:p-5', className)}
      data-testid="scout-stage-trivia"
      aria-label="Franchise clues"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--sg-accent-3-vivid) 14%, transparent), transparent 60%)' }}
        aria-hidden
      />
      <span className="relative eyebrow-readable">Franchise dossier</span>
      <ol className="scrollbar-none relative flex max-h-[min(56vh,28rem)] flex-col gap-2.5 overflow-y-auto">
        <AnimatePresence initial={false}>
          {clues.map((c, i) => (
            <motion.li
              key={`${c.kind}:${c.label}:${c.value}`}
              ref={i === clues.length - 1 ? newestRef : undefined}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className={cn(
                'rounded-3xl border p-3 sm:p-3.5',
                i === clues.length - 1 && clues.length > 1
                  ? 'border-accent/40 bg-accent/10 shadow-glow'
                  : 'border-border bg-surface',
              )}
              data-testid="scout-trivia-card"
            >
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{c.label}</div>
              <div className="mt-1 text-sm font-semibold leading-snug text-fg sm:text-base">
                {c.kind === 'colors' ? <ColorSwatches value={c.value} /> : c.value}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {Array.from({ length: locked }, (_, i) => (
          <li
            key={`locked-${i}`}
            className="flex items-center gap-2 rounded-3xl border border-dashed border-border px-3 py-2.5 text-xs text-muted opacity-60"
            aria-hidden
          >
            <Lock className="size-3.5 shrink-0" />
            <span className="h-2.5 flex-1 rounded-full bg-fg/10" />
          </li>
        ))}
      </ol>
      <p className="relative mt-auto pt-1 text-xs text-muted">
        {locked > 0 ? 'Every miss trades a deep cut for an easier clue.' : 'That is everything the dossier has.'}
      </p>
    </section>
  );
}
