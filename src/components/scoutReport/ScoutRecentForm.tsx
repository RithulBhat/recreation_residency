import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { scoutFormatInfo } from '@/scout/formats';
import { scoutMode } from '@/scout/packs';
import type { ScoutReport } from '@/scout/report';
import { asScoutFormat, type ScoutRunRecord } from '@/scout/scoutStats';
import { formatScore } from '@/stats/share';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { absoluteTime, relativeTime } from '@/components/stats/format';
import { formAverage, formTrend, pct, sparkGeometry } from './format';

export interface ScoutRecentFormProps {
  report: ScoutReport;
  /** Newest first, straight out of the store. */
  runs: readonly ScoutRunRecord[];
  /** Runs listed under the sparkline. */
  limit?: number;
  className?: string;
}

const W = 100;
const H = 32;

/**
 * Recent form: accuracy per run as a sparkline (inline SVG, no chart library) plus the last runs.
 *
 * The path is drawn in a fixed 100×32 viewBox and stretched with `preserveAspectRatio="none"`, so the
 * stroke uses `vectorEffect="non-scaling-stroke"` to stay 2 px at any width, and the point markers are
 * absolutely-positioned elements rather than SVG circles — a circle in a non-uniformly scaled viewBox
 * would render as an ellipse.
 */
export function ScoutRecentForm({ report, runs, limit = 6, className }: ScoutRecentFormProps) {
  const points = report.recentForm;
  const geo = sparkGeometry(points, W, H);
  const trend = formTrend(points);
  const avg = formAverage(points);
  const listed = runs.slice(0, limit);

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)} data-testid="scout-recent-form">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-fg">
            {points.length === 0 ? (
              'No runs on the books yet.'
            ) : (
              <>
                Last {points.length} {points.length === 1 ? 'run' : 'runs'} ·{' '}
                <span className="text-gradient">{pct(avg)}</span> average
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {points.length === 0
              ? 'Each finished run drops a point on this line — accuracy, oldest to newest.'
              : 'Accuracy per run, oldest to newest. The dashed line is 50%.'}
          </p>
        </div>
        {trend !== null && (
          <Badge tone={trend > 0.05 ? 'success' : trend < -0.05 ? 'danger' : 'neutral'}>
            {trend > 0.05 ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : trend < -0.05 ? (
              <TrendingDown className="size-3" aria-hidden />
            ) : (
              <Minus className="size-3" aria-hidden />
            )}
            {trend >= 0 ? '+' : '−'}
            {Math.abs(Math.round(trend * 100))} pts lately
          </Badge>
        )}
      </div>

      {points.length === 0 ? (
        <div className="grid h-20 place-items-center rounded-3xl border border-dashed border-border text-xs text-muted sm:h-24">
          <span className="flex items-center gap-1.5">
            <Activity className="size-3.5" aria-hidden />
            Waiting on your first run
          </span>
        </div>
      ) : (
        <div
          className="relative h-24 w-full overflow-hidden rounded-3xl border border-border bg-surface/40 p-2 sm:h-28"
          data-testid="scout-sparkline"
        >
          <span className="absolute right-2 top-1 font-mono text-[9px] tabular text-muted/70" aria-hidden>
            100%
          </span>
          <span className="absolute bottom-1 right-2 font-mono text-[9px] tabular text-muted/70" aria-hidden>
            0%
          </span>
          <span
            className="absolute inset-x-2 border-t border-dashed border-border"
            style={{ top: `calc(0.5rem + (100% - 1rem) * ${(geo.midY / H).toFixed(4)})` }}
            aria-hidden
          />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="size-full"
            role="img"
            aria-label={`Accuracy across the last ${points.length} runs, ${pct(avg)} on average`}
          >
            <defs>
              <linearGradient id="scout-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sg-accent-vivid)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--sg-accent-vivid)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill="url(#scout-spark-fill)" />
            <path
              d={geo.line}
              fill="none"
              stroke="var(--sg-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {geo.dots.map((dot, i) => {
            const last = i === geo.dots.length - 1;
            return (
              <span
                key={dot.point.runId}
                title={`${pct(dot.point.accuracy)} — ${dot.point.correct} of ${dot.point.rounds} on ${
                  scoutFormatInfo(asScoutFormat(dot.point.format))?.name ?? dot.point.format
                }`}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full',
                  last ? 'size-3 bg-accent ring-2 ring-bg' : 'size-2 bg-accent/70',
                  dot.point.clean && !last && 'bg-success',
                )}
                style={{
                  left: `calc(0.5rem + (100% - 1rem) * ${(dot.x / W).toFixed(4)})`,
                  top: `calc(0.5rem + (100% - 1rem) * ${(dot.y / H).toFixed(4)})`,
                }}
              />
            );
          })}
        </div>
      )}

      {listed.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border" data-testid="scout-recent-runs">
          {listed.map((run) => {
            const format = scoutFormatInfo(run.format);
            const mode = scoutMode(run.mode);
            const acc = run.rounds === 0 ? 0 : run.correct / run.rounds;
            return (
              <li key={run.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-surface-strong text-base" aria-hidden>
                    {format?.emoji ?? '🏈'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {format?.name ?? run.format}
                      {run.mixModes ? ' · Mixed' : mode ? ` · ${mode.name}` : ''}
                    </span>
                    <span className="font-mono text-[11px] tabular text-muted" title={absoluteTime(run.finishedAt)}>
                      {relativeTime(run.finishedAt)} · {run.correct}/{run.rounds} named
                      {run.daily ? ' · daily' : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {run.perfect && (
                    <Badge tone="gradient" size="sm">
                      Flawless
                    </Badge>
                  )}
                  {!run.perfect && run.rounds > 0 && run.correct === run.rounds && (
                    <Badge tone="success" size="sm">
                      Clean
                    </Badge>
                  )}
                  <span className="text-right">
                    <span className="block font-mono text-sm font-semibold tabular text-fg">
                      {formatScore(run.score)}
                    </span>
                    <span
                      className={cn(
                        'block font-mono text-[11px] tabular',
                        acc >= 0.6 ? 'text-success' : acc >= 0.35 ? 'text-muted' : 'text-danger',
                      )}
                    >
                      {pct(acc)}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
