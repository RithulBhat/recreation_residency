import { Heart, Map, Target, Timer, TrendingDown, Zap } from 'lucide-react';
import { cn } from '@/components/ui';
import { StatTile } from '@/components/StatTile';
import { SURVIVAL_TIER_STEP, scoutBlitzDuration, scoutLives, survivalTierIndex } from '@/scout/formats';
import { currentFormat, franchisesCleared, franchisesTotal, wonRounds } from '@/scout/selectors';
import type { ScoutState } from '@/scout/types';
import { FranchiseBoard } from './FranchiseBoard';
import { BLITZ_PENALTY_SECONDS, SCOUT_FORMAT_ACCENT, SURVIVAL_TIER_CHIPS, scoutOutcome } from './formatCopy';

export interface FormatOutcomeProps {
  state: ScoutState;
  className?: string;
}

const TILE = 'bg-bg-elevated/70! min-h-24 [&>*:last-child]:mt-auto';

function played(state: ScoutState): number {
  return state.rounds.filter((r) => r.status !== 'playing').length;
}

/**
 * The card that says what the FORMAT did — the thing a shared "12 / 20, 8,400 points" line cannot.
 *
 * Blitz is a rate against a clock, survival is a depth, the gauntlet is a map. Duel and party get the
 * {@link Scoreboard} instead, and standard gets nothing: its accuracy hero already is the story.
 */
export function FormatOutcome({ state, className }: FormatOutcomeProps) {
  const format = currentFormat(state);
  if (format === 'standard' || format === 'duel' || format === 'party') return null;
  const outcome = scoutOutcome(state);
  const accent = SCOUT_FORMAT_ACCENT[format];
  const correct = wonRounds(state);
  const done = played(state);
  const misses = Math.max(0, done - correct);

  return (
    <section
      className={cn('glass relative overflow-hidden rounded-4xl p-4 sm:p-5', className)}
      aria-label={`${outcome.name} result`}
      data-testid="scout-format-outcome"
      data-format={format}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full opacity-25 blur-3xl"
        style={{ background: accent }}
      />
      <header className="relative flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg leading-none shadow-md"
          style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 45%, var(--sg-accent-2)))` }}
          aria-hidden
        >
          {outcome.emoji}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold leading-tight text-fg">{outcome.name}</h2>
          <p className="text-sm text-muted" data-testid="scout-outcome-detail">
            {outcome.detail}
          </p>
        </div>
      </header>

      {format === 'blitz' && (
        <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            size="sm"
            className={TILE}
            label="Named"
            icon={<Zap />}
            value={correct}
            tone="accent"
            hint={`of ${done} put up`}
          />
          <StatTile
            size="sm"
            className={TILE}
            label="On the clock"
            icon={<Timer />}
            value={`${scoutBlitzDuration(state.settings)}s`}
            hint="start to zero"
          />
          <StatTile
            size="sm"
            className={TILE}
            label="Every"
            icon={<Target />}
            value={correct > 0 ? `${Math.round((scoutBlitzDuration(state.settings) / correct) * 10) / 10}s` : '—'}
            hint="per name"
          />
          <StatTile
            size="sm"
            className={TILE}
            label="Burnt"
            icon={<TrendingDown />}
            value={`${misses * BLITZ_PENALTY_SECONDS}s`}
            tone={misses > 0 ? 'danger' : 'neutral'}
            hint={`${misses} × ${BLITZ_PENALTY_SECONDS}s`}
          />
        </div>
      )}

      {format === 'survival' && (
        <div className="relative mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile size="sm" className={TILE} label="Rounds" icon={<Map />} value={Math.max(1, done)} tone="accent" hint="before the lights went out" />
            <StatTile size="sm" className={TILE} label="Right" icon={<Target />} value={correct} hint={`every ${SURVIVAL_TIER_STEP} steps a tier`} />
            <StatTile size="sm" className={TILE} label="Lives" icon={<Heart />} value={scoutLives(state.settings)} hint="at the start" />
          </div>
          <ol className="flex flex-wrap items-center gap-1" aria-label="How deep the league got">
            {SURVIVAL_TIER_CHIPS.map((chip, i) => {
              const reached = i <= survivalTierIndex(correct);
              return (
                <li key={chip.tier} className="flex items-center gap-1">
                  {i > 0 && (
                    <span aria-hidden className="font-mono text-[10px] text-muted">
                      →
                    </span>
                  )}
                  <span
                    data-testid="scout-tier-step"
                    data-state={reached ? 'cleared' : 'upcoming'}
                    className={cn(
                      'rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider',
                      reached ? 'border-success/50 bg-success/15 text-success' : 'border-border text-muted opacity-60',
                    )}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {format === 'gauntlet' && (
        <div className="relative mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile
              size="sm"
              className={TILE}
              label="Cleared"
              icon={<Map />}
              value={`${franchisesCleared(state).length}/${franchisesTotal(state)}`}
              tone="accent"
              hint="franchises"
            />
            <StatTile size="sm" className={TILE} label="Missed" icon={<TrendingDown />} value={misses} tone={misses > 0 ? 'danger' : 'neutral'} hint="clubs that beat you" />
            <StatTile size="sm" className={TILE} label="Played" icon={<Target />} value={done} hint="rounds on the board" />
          </div>
          <FranchiseBoard state={state} />
        </div>
      )}
    </section>
  );
}
