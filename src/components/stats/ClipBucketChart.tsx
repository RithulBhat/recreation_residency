import { Ear } from 'lucide-react';
import { bestClipBucket } from '@/stats/aggregate';
import { CLIP_BUCKETS, type ClipBucket, type ClipBucketStanding, type StatsTotals } from '@/stats/types';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { clipLabel, pct } from './format';

export interface ClipBucketChartProps {
  totals: StatsTotals;
  className?: string;
}

/** Every bucket, in order, with 0-sample buckets kept so the axis never moves. */
export function bucketStandings(totals: StatsTotals): ClipBucketStanding[] {
  return CLIP_BUCKETS.map((bucket) => {
    const v = totals.byClipBucket[bucket] ?? { seen: 0, correct: 0 };
    return {
      bucket,
      seen: v.seen,
      correct: v.correct,
      accuracy: v.seen > 0 ? v.correct / v.seen : 0,
    };
  });
}

/**
 * The bucket the player is actually best at: highest accuracy with a real
 * sample. Ties break towards the shorter clip (harder → more impressive).
 */
export function sharpestBucket(
  standings: readonly ClipBucketStanding[],
  minSeen = 4,
): ClipBucketStanding | null {
  const pick = (threshold: number): ClipBucketStanding | null => {
    let best: ClipBucketStanding | null = null;
    for (const s of standings) {
      if (s.seen < threshold || s.correct === 0) continue;
      if (!best || s.accuracy > best.accuracy) best = s;
    }
    return best;
  };
  return pick(minSeen) ?? pick(1);
}

function brag(bucket: ClipBucket, acc: number): string {
  const label = clipLabel(bucket);
  if (acc >= 0.7) return `You're deadly at ${label}.`;
  if (acc >= 0.5) return `You're dangerous at ${label}.`;
  if (acc >= 0.32) return `You're solid at ${label}.`;
  return `Your best window is ${label}.`;
}

const GRIDLINES = [0.25, 0.5, 0.75];

export function ClipBucketChart({ totals, className }: ClipBucketChartProps) {
  const standings = bucketStandings(totals);
  const sharpest = sharpestBucket(standings);
  const shortestWin = bestClipBucket(totals);
  const anySeen = standings.some((s) => s.seen > 0);

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-fg">
            {sharpest ? (
              <>
                <span className="text-gradient">{brag(sharpest.bucket, sharpest.accuracy)}</span>
              </>
            ) : (
              'No clips heard yet.'
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {anySeen
              ? 'Share of rounds you named the song, by the clip length that was on the table.'
              : 'Play a round and this fills in from 0.1 seconds up to 10.'}
          </p>
        </div>
        {shortestWin && (
          <Badge tone="accent" className="shrink-0">
            <Ear className="size-3" aria-hidden />
            Shortest win {clipLabel(shortestWin.bucket)}
          </Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {standings.map((s) => {
          const isBest = sharpest !== null && s.bucket === sharpest.bucket;
          const empty = s.seen === 0;
          return (
            <li
              key={s.bucket}
              className={cn(
                'grid grid-cols-[2.9rem_minmax(0,1fr)_3.4rem] items-center gap-2 rounded-2xl px-1.5 py-1 sm:gap-3 sm:px-2',
                isBest && 'bg-accent/10 ring-1 ring-accent/35',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[11px] tabular sm:text-xs',
                  isBest ? 'font-bold text-accent' : 'text-muted',
                )}
              >
                {clipLabel(s.bucket)}
              </span>

              <div className="relative h-7 min-w-0 overflow-hidden rounded-full bg-surface-strong sm:h-8">
                {GRIDLINES.map((g) => (
                  <span
                    key={g}
                    className="absolute inset-y-0 w-px bg-border"
                    style={{ left: `${g * 100}%` }}
                    aria-hidden
                  />
                ))}
                {s.correct > 0 && (
                  <span
                    className="absolute inset-0 bg-gradient-accent transition-[clip-path] duration-700 ease-out"
                    style={{ clipPath: `inset(0 ${(1 - Math.max(s.accuracy, 0.03)) * 100}% 0 0 round 9999px)` }}
                    aria-hidden
                  />
                )}
                <span className="absolute inset-y-0 right-2 flex items-center font-mono text-[10px] tabular text-muted">
                  {empty ? 'not heard yet' : `${s.correct}/${s.seen}`}
                </span>
              </div>

              <span
                className={cn(
                  'text-right font-mono text-xs tabular',
                  empty ? 'text-muted/60' : isBest ? 'font-bold text-accent' : 'text-fg',
                )}
              >
                {empty ? '—' : pct(s.accuracy)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
