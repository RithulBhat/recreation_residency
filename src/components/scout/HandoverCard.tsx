import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, EyeOff } from 'lucide-react';
import { Avatar, Button, cn } from '@/components/ui';
import type { ScoutPlayerState } from '@/scout/types';

export interface HandoverCardProps {
  /** Who just played. */
  from: ScoutPlayerState;
  /** Who is up next. */
  to: ScoutPlayerState;
  /** 1-based round the next player is about to get. */
  round: number;
  /** Everyone's running score, highest first — safe to show, it gives nothing away. */
  standings?: readonly ScoutPlayerState[];
  onReady: () => void;
  className?: string;
}

/**
 * The pass-and-play curtain.
 *
 * It replaces the WHOLE play column rather than floating over it: a dialog would leave the reveal (and
 * with it the last answer, and the face that went with it) in the DOM behind a translucent backdrop,
 * which is exactly what a handover is for. Nothing of the previous round is rendered while this is up,
 * and `next` is not dispatched until the incoming player taps — so their round's clock starts when
 * they are actually looking at it.
 */
export function HandoverCard({ from, to, round, standings = [], onReady, className }: HandoverCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className={cn(
        'glass-strong noise relative flex min-h-[60dvh] flex-1 flex-col items-center justify-center overflow-hidden rounded-4xl p-6 text-center',
        className,
      )}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-label="Pass the laptop"
      data-testid="scout-handover"
    >
      <div
        className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full opacity-30 blur-3xl"
        style={{ background: to.color }}
        aria-hidden
      />
      <div className="relative flex flex-col items-center">
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="opacity-45">
            <Avatar emoji={from.emoji} color={from.color} size="md" name={from.name} />
          </span>
          <ArrowRight className="size-5 text-muted" aria-hidden />
          <Avatar emoji={to.emoji} color={to.color} size="xl" name={to.name} active />
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-widest text-muted">Pass the laptop · round {round}</p>
        <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
          {to.name}, you&apos;re up
        </h2>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
          <EyeOff className="size-4" aria-hidden />
          The last answer is off the screen. Nothing to peek at.
        </p>

        {standings.length > 1 && (
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-1.5" aria-label="Scores so far">
            {standings.map((p) => (
              <li
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg"
              >
                <span aria-hidden>{p.emoji}</span>
                <span className="max-w-24 truncate">{p.name}</span>
                <span className="font-mono text-muted tabular">{p.score.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="glow"
          size="xl"
          className="mt-7"
          onClick={onReady}
          trailingIcon={<ArrowRight />}
          data-autofocus
          data-testid="scout-handover-ready"
        >
          I&apos;m ready
        </Button>
      </div>
    </motion.section>
  );
}
