import { motion, useReducedMotion } from 'motion/react';
import { Heart, TrendingDown } from 'lucide-react';
import { cn } from '@/components/ui';
import { SURVIVAL_TIER_STEP, scoutLives, survivalTierIndex } from '@/scout/formats';
import { livesLeft, roundRungs, wonRounds } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';
import { SURVIVAL_TIER_CHIPS } from './formatCopy';

export interface SurvivalRailProps {
  state: ScoutState;
  className?: string;
}

/**
 * Survival's own rail: the lives you have left, and the escalation made legible.
 *
 * The escalation is the whole mode — the target tier walks stars → starters → rotation → deep cuts
 * every `SURVIVAL_TIER_STEP` correct calls and the ladder loses a rung each step — and none of that
 * is visible from the subjects themselves, so the four tiers are drawn as a ladder with the live one
 * lit, the ones already climbed dimmed, and a count of how many more calls the next step needs.
 */
export function SurvivalRail({ state, className }: SurvivalRailProps) {
  const reduce = useReducedMotion();
  const total = scoutLives(state.settings);
  const left = livesLeft(state) ?? total;
  const correct = wonRounds(state);
  const step = survivalTierIndex(correct);
  const toNext = SURVIVAL_TIER_STEP - (correct % SURVIVAL_TIER_STEP);
  const last = step >= SURVIVAL_TIER_CHIPS.length - 1;
  const round = state.rounds[state.currentRound];
  const rungs = round ? roundRungs(round) : state.settings.tries;

  return (
    <section
      className={cn('flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2', className)}
      aria-label="Survival run"
      data-testid="scout-survival-rail"
    >
      <ul className="flex shrink-0 items-center gap-1" aria-label={`${left} of ${total} lives left`}>
        {Array.from({ length: total }, (_, i) => {
          const alive = i < left;
          return (
            <motion.li
              key={i}
              data-testid="scout-life"
              data-state={alive ? 'alive' : 'spent'}
              animate={alive && i === left - 1 && !reduce ? { scale: [1, 1.14, 1] } : { scale: 1 }}
              transition={{ duration: 1.6, repeat: alive && i === left - 1 && !reduce ? Infinity : 0, ease: 'easeInOut' }}
            >
              <Heart
                className={cn('size-5 sm:size-6', alive ? 'fill-danger text-danger' : 'text-muted/40')}
                aria-hidden
              />
            </motion.li>
          );
        })}
      </ul>

      <ol className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Difficulty escalation">
        {SURVIVAL_TIER_CHIPS.map((chip, i) => (
          <li key={chip.tier} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="font-mono text-[10px] text-muted">
                →
              </span>
            )}
            <span
              aria-current={i === step ? 'step' : undefined}
              data-testid="scout-tier-step"
              data-state={i === step ? 'current' : i < step ? 'cleared' : 'upcoming'}
              className={cn(
                'rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors',
                i === step && 'border-transparent bg-gradient-accent text-accent-fg shadow-glow',
                i < step && 'border-border bg-surface text-muted line-through opacity-60',
                i > step && 'border-border text-muted opacity-70',
              )}
            >
              {chip.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] leading-tight text-muted tabular">
        <TrendingDown className="size-3 shrink-0" aria-hidden />
        <span>
          {last
            ? `deep cuts from here · ${rungs} ${rungs === 1 ? 'try' : 'tries'}`
            : `${toNext} more → ${SURVIVAL_TIER_CHIPS[step + 1].label.toLowerCase()} · ${rungs} ${rungs === 1 ? 'try' : 'tries'}`}
        </span>
      </p>
    </section>
  );
}
