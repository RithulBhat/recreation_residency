import { Link } from 'react-router';
import { ArrowRight, Dumbbell, Medal } from 'lucide-react';
import { PACKS, getPack } from '@/lib/catalog';
import { weakestPacks } from '@/stats/aggregate';
import type { PackStanding, StatsTotals } from '@/stats/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { R } from '@/routes';
import { pct } from './format';

export interface PackStandingsProps {
  totals: StatsTotals;
  className?: string;
}

/** Every pack with at least one round, newest data first. */
export function packStandings(totals: StatsTotals): PackStanding[] {
  return Object.entries(totals.byPack)
    .filter(([, v]) => v.seen > 0)
    .map(([packId, v]) => {
      const pack = getPack(packId);
      return {
        packId,
        name: pack?.name ?? packId,
        emoji: pack?.emoji ?? '🎵',
        seen: v.seen,
        correct: v.correct,
        accuracy: v.seen > 0 ? v.correct / v.seen : 0,
      };
    });
}

function bestPacks(all: readonly PackStanding[], limit = 3, minSeen = 4): PackStanding[] {
  const sort = (list: readonly PackStanding[]) =>
    [...list].sort((a, b) => b.accuracy - a.accuracy || b.seen - a.seen || a.packId.localeCompare(b.packId));
  const strict = sort(all.filter((p) => p.seen >= minSeen));
  return (strict.length > 0 ? strict : sort(all)).slice(0, limit);
}

function Row({ standing, tone }: { standing: PackStanding; tone: 'good' | 'bad' }) {
  return (
    <li className="flex items-center gap-3">
      <Link
        to={`${R.songooner.setup}?packs=${encodeURIComponent(standing.packId)}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 transition-colors hover:text-fg"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-surface-strong text-lg leading-none" aria-hidden>
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

/** Best packs, weakest packs and the ones you keep coming back to. */
export function PackStandings({ totals, className }: PackStandingsProps) {
  const all = packStandings(totals);
  if (all.length === 0) return null;

  const best = bestPacks(all);
  const weakest = weakestPacks(totals, PACKS, { limit: 3 });
  const mostPlayed = [...all].sort((a, b) => b.seen - a.seen || a.packId.localeCompare(b.packId)).slice(0, 5);
  const maxSeen = mostPlayed.reduce((m, p) => Math.max(m, p.seen), 1);
  const showWeakest = all.length >= 2 && weakest.length > 0;

  return (
    <div className={cn('grid gap-3 sm:gap-4', showWeakest ? 'lg:grid-cols-2' : '', className)}>
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

      <div className={cn('glass rounded-4xl p-4 sm:p-6', showWeakest && 'lg:col-span-2')}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-bold text-fg">Most played</h3>
          <Button variant="ghost" size="sm" to={R.songooner.packs} trailingIcon={<ArrowRight />}>
            All packs
          </Button>
        </div>
        <ul className="flex flex-col gap-2.5">
          {mostPlayed.map((s) => (
            <li key={s.packId} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-center text-lg leading-none" aria-hidden>
                {s.emoji}
              </span>
              <span className="w-24 shrink-0 truncate text-sm font-medium text-fg sm:w-40">{s.name}</span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
                <span
                  className="block h-full rounded-full bg-gradient-accent"
                  style={{ width: `${Math.max((s.seen / maxSeen) * 100, 3)}%` }}
                />
              </span>
              <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular text-muted">
                {s.seen} {s.seen === 1 ? 'round' : 'rounds'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
