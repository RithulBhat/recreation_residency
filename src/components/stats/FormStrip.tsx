import { useId } from 'react';
import { recentForm } from '@/stats/aggregate';
import { formatScore } from '@/stats/share';
import type { GameRecord, RecentFormPoint } from '@/stats/types';
import { cn } from '@/components/ui/cn';
import { MODE_LABEL, absoluteTime, pct } from './format';

export interface FormStripProps {
  /** Newest-first, as stored. */
  records: readonly GameRecord[];
  /** How many games to plot. Default 20. */
  count?: number;
  className?: string;
}

/** SVG user units — the chart is stretched to its container width. */
const H = 40;
const PAD_TOP = 0.12;
const PAD_BOTTOM = 0.18;

function yFor(accuracy: number): number {
  const a = Math.max(0, Math.min(1, accuracy));
  return (PAD_TOP + (1 - a) * (1 - PAD_TOP - PAD_BOTTOM)) * H;
}

function xFor(i: number, n: number): number {
  if (n <= 1) return 50;
  return (i / (n - 1)) * 100;
}

function tileTone(accuracy: number): string {
  if (accuracy >= 0.85) return 'bg-success';
  if (accuracy >= 0.6) return 'bg-accent';
  if (accuracy >= 0.35) return 'bg-warn';
  if (accuracy > 0) return 'bg-danger';
  return 'bg-surface-strong';
}

function summary(points: readonly RecentFormPoint[]): string {
  if (points.length === 0) return 'No games yet.';
  const avg = points.reduce((n, p) => n + p.accuracy, 0) / points.length;
  return `Accuracy over the last ${points.length} games, oldest to newest. Average ${pct(avg)}.`;
}

/**
 * Recent form: an accuracy sparkline over the last `count` games plus a
 * per-game strip. Plain SVG + divs, no chart library.
 */
export function FormStrip({ records, count = 20, className }: FormStripProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9-_]/g, '');
  const points = recentForm(records, count);
  const n = points.length;

  if (n === 0) {
    return (
      <div className={cn('glass rounded-4xl p-5 text-sm text-muted sm:p-6', className)}>
        Nothing to plot yet — your last twenty games will show up here.
      </div>
    );
  }

  const avg = points.reduce((sum, p) => sum + p.accuracy, 0) / n;
  const bestScore = points.reduce((m, p) => Math.max(m, p.score), 0);
  const half = Math.floor(n / 2);
  const older = points.slice(0, half);
  const newer = points.slice(half);
  const trend =
    older.length > 0 && newer.length > 0
      ? newer.reduce((s, p) => s + p.accuracy, 0) / newer.length -
        older.reduce((s, p) => s + p.accuracy, 0) / older.length
      : 0;

  const coords = points.map((p, i) => ({ x: xFor(i, n), y: yFor(p.accuracy), p }));
  const line =
    n === 1
      ? `M0 ${coords[0].y.toFixed(2)} L100 ${coords[0].y.toFixed(2)}`
      : coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
  const area = `${line} L100 ${H} L0 ${H} Z`;

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-lg font-bold text-fg">
          Last {n} {n === 1 ? 'game' : 'games'}
        </p>
        <p className="font-mono text-xs tabular text-muted">
          avg <span className="text-fg">{pct(avg)}</span> · best{' '}
          <span className="text-fg">{formatScore(bestScore)}</span>
          {Math.abs(trend) >= 0.05 && (
            <>
              {' '}
              ·{' '}
              <span className={trend > 0 ? 'text-success' : 'text-danger'}>
                {trend > 0 ? '▲' : '▼'} {pct(Math.abs(trend))}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="relative h-24 w-full sm:h-28" role="img" aria-label={summary(points)}>
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--sg-accent)" />
              <stop offset="55%" stopColor="var(--sg-accent-2)" />
              <stop offset="100%" stopColor="var(--sg-accent-3)" />
            </linearGradient>
            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sg-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--sg-accent-2)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1="0"
            x2="100"
            y1={yFor(0.5)}
            y2={yFor(0.5)}
            stroke="var(--sg-border)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path d={area} fill={`url(#${gradientId}-fill)`} />
          <path
            d={line}
            fill="none"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Round dots as HTML so the non-uniform SVG scale can't squash them. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {coords.map((c, i) => (
            <span
              key={c.p.gameId}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full',
                i === n - 1 ? 'size-3 bg-accent-3 ring-2 ring-bg' : c.p.clean ? 'size-2 bg-success' : 'size-1.5 bg-fg/50',
              )}
              style={{ left: `${c.x}%`, top: `${(c.y / H) * 100}%` }}
            />
          ))}
        </div>

        <span className="absolute left-0 top-0 font-mono text-[10px] tabular text-muted" aria-hidden>
          100%
        </span>
        <span className="absolute bottom-0 left-0 font-mono text-[10px] tabular text-muted" aria-hidden>
          0%
        </span>
      </div>

      <ul className="mt-3 flex gap-1" aria-label="Per-game accuracy strip">
        {points.map((p) => (
          <li
            key={p.gameId}
            className="min-w-0 flex-1"
            title={`${MODE_LABEL[p.mode]} · ${p.correct}/${p.rounds} · ${formatScore(p.score)} pts · ${absoluteTime(p.at)}`}
          >
            <span className="sr-only">
              {MODE_LABEL[p.mode]} {p.correct} of {p.rounds}
            </span>
            <span
              className={cn(
                'block h-2.5 rounded-full',
                tileTone(p.accuracy),
                p.clean && 'ring-1 ring-success/60',
              )}
              aria-hidden
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
