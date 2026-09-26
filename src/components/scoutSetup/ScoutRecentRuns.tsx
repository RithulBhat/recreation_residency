import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { absoluteTime, formatDuration, relativeTime } from '@/components/stats/format';
import { formatScore } from '@/stats/share';
import { SCOUT_DIFFICULTY_INFO, SCOUT_MODE_EMOJI, SCOUT_MODE_LABEL, pct } from './summary';
import type { ScoutGameRecord } from '@/store/scoutResultStore';

export interface ScoutRecentRunsProps {
  /** Newest first. */
  records: readonly ScoutGameRecord[];
  count?: number;
  className?: string;
}

/** The last few runs: how they were set up and how they went. */
export function ScoutRecentRuns({ records, count = 8, className }: ScoutRecentRunsProps) {
  const rows = records.slice(0, count);
  if (rows.length === 0) return null;

  return (
    <ul className={cn('flex flex-col gap-2', className)} data-testid="scout-recent-runs">
      {rows.map((r) => {
        const accuracy = r.played > 0 ? r.correct / r.played : 0;
        const clean = r.played > 0 && r.correct === r.played;
        return (
          <li
            key={r.id}
            className="glass flex min-w-0 items-center gap-3 rounded-2xl p-3"
            title={absoluteTime(r.finishedAt)}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-strong text-lg leading-none" aria-hidden>
              {r.mixModes ? '🎲' : SCOUT_MODE_EMOJI[r.mode]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-bold text-fg">
                  {r.mixModes ? 'Mixed bag' : SCOUT_MODE_LABEL[r.mode]}
                </span>
                {r.daily && (
                  <Badge tone="accent" size="sm">
                    Daily
                  </Badge>
                )}
                {clean && (
                  <Badge tone="gradient" size="sm">
                    Perfect
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11px] tabular text-muted">
                {r.correct}/{r.played} · {SCOUT_DIFFICULTY_INFO[r.difficulty].label} · {r.tries} tries ·{' '}
                {formatDuration(r.durationMs)} · {relativeTime(r.finishedAt)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm font-bold tabular text-fg">{formatScore(r.score)}</span>
              <span className={cn('block font-mono text-[10px] tabular', accuracy >= 0.5 ? 'text-success' : 'text-muted')}>
                {pct(accuracy)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
