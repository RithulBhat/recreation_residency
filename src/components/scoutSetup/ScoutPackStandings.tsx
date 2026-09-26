import { Link } from 'react-router';
import { Dumbbell, Medal } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { R } from '@/routes';
import { pct } from './summary';
import {
  scoutPackStandings,
  strongestScoutPacks,
  weakestScoutPacks,
  type ScoutPackStanding,
  type ScoutTotals,
} from './scoutAggregate';

export interface ScoutPackStandingsProps {
  totals: ScoutTotals;
  className?: string;
}

function Row({ standing, tone }: { standing: ScoutPackStanding; tone: 'good' | 'bad' }) {
  return (
    <li className="flex items-center gap-3">
      <Link
        to={`${R.scout.setup}?packs=${encodeURIComponent(standing.packId)}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 transition-colors hover:text-fg"
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-2xl text-lg leading-none"
          style={{ background: `color-mix(in oklab, ${standing.accent} 26%, var(--sg-surface-strong))` }}
          aria-hidden
        >
          {standing.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{standing.name}</span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
            <span
              className={cn('block h-full rounded-full', tone === 'good' ? 'bg-gradient-accent' : 'bg-danger')}
              style={{ width: `${Math.max(standing.accuracy * 100, 2)}%` }}
            />
          </span>
        </span>
      </Link>
      <span className="shrink-0 text-right">
        <span className={cn('block font-mono text-sm tabular', tone === 'good' ? 'text-success' : 'text-danger')}>
          {pct(standing.accuracy)}
        </span>
        <span className="block font-mono text-[10px] tabular text-muted">
          {standing.correct}/{standing.seen}
        </span>
      </span>
    </li>
  );
}

/** Strongest and weakest packs, each row a one-tap rematch link into the lobby. */
export function ScoutPackStandings({ totals, className }: ScoutPackStandingsProps) {
  const all = scoutPackStandings(totals);
  if (all.length === 0) return null;
  const best = strongestScoutPacks(all);
  const weakest = weakestScoutPacks(all);
  const showWeakest = all.length >= 2;

  return (
    <div className={cn('grid gap-3 sm:gap-4', showWeakest && 'lg:grid-cols-2', className)}>
      <div className="glass rounded-4xl p-4 sm:p-6">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-fg">
          <Medal className="size-4 text-success" aria-hidden />
          Your strongest packs
        </h3>
        <ul className="flex flex-col gap-3">
          {best.map((s) => (
            <Row key={s.packId} standing={s} tone="good" />
          ))}
        </ul>
      </div>

      {showWeakest && (
        <div className="glass rounded-4xl p-4 sm:p-6">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-fg">
            <Dumbbell className="size-4 text-danger" aria-hidden />
            Needs a rematch
          </h3>
          <ul className="flex flex-col gap-3">
            {weakest.map((s) => (
              <Row key={s.packId} standing={s} tone="bad" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
