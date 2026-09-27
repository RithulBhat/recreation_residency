import { Binoculars, Crosshair, Flame, Map as MapIcon, Sparkles, Target, Timer } from 'lucide-react';
import { SCOUT_MAX_LEVEL, SCOUT_RANKS, scoutRankFor } from '@/scout/progress';
import type { ScoutReport } from '@/scout/report';
import type { ScoutStatsTotals } from '@/scout/scoutStats';
import { formatScore } from '@/stats/share';
import { StatTile } from '@/components/StatTile';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/components/ui/cn';
import { formatDuration } from '@/components/stats/format';
import { pct } from './format';

export interface ScoutRankHeroProps {
  report: ScoutReport;
  totals: ScoutStatsTotals;
  className?: string;
}

/**
 * The football rank ladder (Waterboy → Gold Jacket) plus the six lifetime numbers that belong on a
 * scout's business card. Rank, XP and progress all come from `scoutRankFor`; nothing is computed
 * here beyond the per-run average.
 */
export function ScoutRankHero({ report, totals, className }: ScoutRankHeroProps) {
  const rank = scoutRankFor(report.xp);
  const toNext = rank.nextAt === null ? 0 : Math.max(0, rank.nextAt - rank.xp);
  const avg = report.runs > 0 ? Math.round(totals.score / report.runs) : 0;

  return (
    <div className={cn('flex flex-col gap-3 sm:gap-4', className)} data-testid="scout-rank-hero">
      <div className="glass noise relative animate-rise overflow-hidden rounded-4xl p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -left-16 -top-24 size-64 rounded-full bg-accent opacity-25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-28 -right-10 size-64 rounded-full bg-accent-2 opacity-20 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div
            className="grid size-20 shrink-0 place-items-center rounded-3xl bg-gradient-accent text-4xl leading-none shadow-glow sm:size-28 sm:text-6xl"
            aria-hidden
          >
            {rank.emoji}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent" size="sm">
                Level {rank.level} / {SCOUT_MAX_LEVEL}
              </Badge>
              <Badge tone="neutral" size="sm">
                <Sparkles className="size-3" aria-hidden />
                {formatScore(rank.xp)} XP
              </Badge>
              <Badge tone="neutral" size="sm">
                {formatScore(totals.score)} points scouted
              </Badge>
            </div>
            <h2 className="mt-2 font-display text-3xl font-black leading-tight tracking-tight sm:text-5xl">
              <span className="text-gradient">{rank.title}</span>
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {rank.next ? (
                <>
                  <span className="font-mono tabular text-fg">{formatScore(toNext)} XP</span> to{' '}
                  <span className="font-semibold text-fg">
                    {rank.next.emoji} {rank.next.title}
                  </span>
                  <span className="lg:hidden">
                    {report.rounds > 0 && ' — deep cuts pay five times what a household name does.'}
                  </span>
                </>
              ) : (
                <>Top of the ladder. Nothing left to climb — only records to break.</>
              )}
            </p>
            <ProgressBar
              className="mt-4 max-w-2xl"
              value={rank.progress}
              size="md"
              label={rank.next ? `Progress to ${rank.next.title}` : 'Max rank'}
              showValue
            />
          </div>

          {/* The ladder — fills the right of a wide hero with the one thing the rank does not say:
              how much of the climb is behind you. */}
          <div className="hidden shrink-0 border-l border-border pl-6 lg:flex lg:w-60 lg:flex-col lg:gap-2">
            <div className="eyebrow-readable">{rank.next ? 'Up next' : 'The summit'}</div>
            {rank.next ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none" aria-hidden>
                    {rank.next.emoji}
                  </span>
                  <span className="font-display text-base font-bold leading-tight text-fg">{rank.next.title}</span>
                </div>
                <p className="font-mono text-xs tabular text-muted">{formatScore(toNext)} XP away</p>
                {report.rounds > 0 && (
                  <p className="text-xs text-muted">Deep cuts pay five times what a household name does.</p>
                )}
              </>
            ) : (
              <p className="font-display text-base font-bold text-fg">Gold Jacket. Nothing above this.</p>
            )}
            <div className="mt-2 flex gap-0.5" aria-hidden>
              {SCOUT_RANKS.map((tier) => (
                <span
                  key={tier.level}
                  title={tier.title}
                  className={cn(
                    'h-2 flex-1 rounded-full',
                    tier.level < rank.level
                      ? 'bg-accent/60'
                      : tier.level === rank.level
                        ? 'bg-gradient-accent'
                        : 'bg-surface-strong',
                  )}
                />
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Waterboy → Gold Jacket</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <StatTile
          variant="opaque"
          label="Accuracy"
          value={report.accuracy * 100}
          icon={<Crosshair />}
          tone={report.accuracy >= 0.6 ? 'success' : report.accuracy >= 0.35 ? 'warn' : 'danger'}
          suffix="%"
          hint={`${report.correct} named of ${report.rounds}`}
        />
        <StatTile
          variant="opaque"
          label="Rounds graded"
          value={report.rounds}
          icon={<Binoculars />}
          hint={`${report.runs} ${report.runs === 1 ? 'run' : 'runs'} · ${formatScore(avg)} avg`}
        />
        <StatTile
          variant="opaque"
          label="Best streak"
          value={report.bestStreak}
          icon={<Flame />}
          tone="warn"
          hint="Calls in a row"
        />
        <StatTile
          variant="opaque"
          label="First looks"
          value={totals.firstRungSolves}
          icon={<Target />}
          hint="Named before a single clue"
        />
        <StatTile
          variant="opaque"
          label="Franchises"
          value={report.teamsKnown}
          suffix=" / 32"
          icon={<MapIcon />}
          hint={report.divisionsSwept.length > 0 ? `${report.divisionsSwept.length} divisions swept` : 'Named at least one'}
        />
        <StatTile
          variant="opaque"
          label="Tape watched"
          value={formatDuration(totals.timePlayedMs)}
          icon={<Timer />}
          hint={`Best run ${formatScore(report.bestScore)}`}
        />
      </div>

      <p className="sr-only">
        Rank {rank.title}, level {rank.level} of {SCOUT_MAX_LEVEL}. Lifetime accuracy {pct(report.accuracy)} across{' '}
        {report.rounds} graded rounds.
      </p>
    </div>
  );
}
