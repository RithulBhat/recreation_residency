import { Flame, Gamepad2, Sparkles, Target, Timer, Trophy } from 'lucide-react';
import { accuracy } from '@/stats/aggregate';
import { MAX_LEVEL, rankFor } from '@/stats/rank';
import { formatScore } from '@/stats/share';
import type { StatsTotals } from '@/stats/types';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/components/ui/cn';
import { StatTile } from '@/components/StatTile';
import { formatDuration, pct } from './format';

export interface RankHeroProps {
  totals: StatsTotals;
  className?: string;
}

/**
 * Rank card + the six headline lifetime numbers.
 * Everything comes from `totals`; no clocks, no network.
 */
export function RankHero({ totals, className }: RankHeroProps) {
  const rank = rankFor(totals.xp);
  const acc = accuracy(totals);
  const toNext = rank.nextAt === null ? 0 : Math.max(0, rank.nextAt - rank.xp);

  return (
    <div className={cn('flex flex-col gap-3 sm:gap-4', className)}>
      <div className="glass noise relative animate-rise overflow-hidden rounded-4xl p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -left-16 -top-24 size-64 rounded-full bg-accent opacity-25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-28 -right-10 size-64 rounded-full bg-accent-2 opacity-20 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div
            className="grid size-20 shrink-0 place-items-center rounded-3xl bg-gradient-accent text-4xl leading-none shadow-glow sm:size-24 sm:text-5xl"
            aria-hidden
          >
            {rank.emoji}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent" size="sm">
                Level {rank.level} / {MAX_LEVEL}
              </Badge>
              <Badge tone="neutral" size="sm">
                <Sparkles className="size-3" aria-hidden />
                {formatScore(rank.xp)} XP
              </Badge>
            </div>
            <h2 className="mt-2 font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              <span className="text-gradient">{rank.title}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {rank.next ? (
                <>
                  <span className="font-mono tabular text-fg">{formatScore(toNext)} XP</span> to{' '}
                  <span className="font-semibold text-fg">
                    {rank.next.emoji} {rank.next.title}
                  </span>
                </>
              ) : (
                <>Top of the ladder. Nothing left to climb — only records to break.</>
              )}
            </p>
            <ProgressBar
              className="mt-4"
              value={rank.progress}
              size="md"
              label={rank.next ? `Progress to ${rank.next.title}` : 'Max rank'}
              showValue
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile
          label="Total score"
          value={totals.score}
          icon={<Trophy />}
          tone="accent"
          format={(v) => formatScore(v)}
          hint={`${formatScore(Math.round(totals.games > 0 ? totals.score / totals.games : 0))} per game`}
        />
        <StatTile label="Games" value={totals.games} icon={<Gamepad2 />} hint={`${totals.rounds} rounds played`} />
        <StatTile
          label="Accuracy"
          value={acc * 100}
          icon={<Target />}
          tone={acc >= 0.6 ? 'success' : acc >= 0.35 ? 'warn' : 'danger'}
          suffix="%"
          decimals={acc > 0 && acc < 0.1 ? 1 : 0}
          hint={`${totals.correct} named · ${totals.partial} artist-only`}
        />
        <StatTile
          label="Best streak"
          value={totals.bestStreak}
          icon={<Flame />}
          tone="warn"
          hint="Consecutive correct"
        />
        <StatTile
          label="Perfect rounds"
          value={totals.perfectRounds}
          icon={<Sparkles />}
          hint="First try, shortest clip"
        />
        <StatTile
          label="Time listening"
          value={formatDuration(totals.timePlayedMs)}
          icon={<Timer />}
          hint={`${totals.games} ${totals.games === 1 ? 'session' : 'sessions'}`}
        />
      </div>

      <p className="sr-only">
        Rank {rank.title}, level {rank.level} of {MAX_LEVEL}. Lifetime accuracy {pct(acc)} across {totals.games} games.
      </p>
    </div>
  );
}
