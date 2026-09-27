import { ChevronDown, ChevronUp } from 'lucide-react';
import { MIN_CUT_SEEN, type ScoutCut } from '@/scout/report';
import { cn } from '@/components/ui/cn';
import { barWidth, cutBand, cutExtremes, pct } from './format';

export interface ScoutCutBarsProps {
  /** Axis name — 'Position groups', 'Fame tiers', … */
  title: string;
  /** One line under the title saying what the axis measures. */
  hint?: string;
  /** The FULL ordered axis, zero rows included, so the chart never reflows. */
  cuts: readonly ScoutCut[];
  /** Sightings a row needs before it can be called sharpest or a blind spot. */
  minSeen?: number;
  /** Long labels ('Wide Receivers') instead of the compact tick ('WR'). */
  long?: boolean;
  className?: string;
  testId?: string;
}

/** Recessive reference lines at 25 / 50 / 75%. */
const GRIDLINES = [0.25, 0.5, 0.75];

/**
 * One accuracy axis as horizontal bars — divs, no chart library.
 *
 * Every row of the axis is always drawn, including the ones never seen, so the shape stays stable as
 * history arrives. Rows with fewer than `minSeen` sightings are explicitly "thin": they get a
 * dashed, muted track and can never be named the sharpest or the blind spot, which keeps the bars
 * agreeing with the verdict above them. The single best and single worst eligible rows are tinted
 * success / danger and captioned, so the two that matter are readable at a glance.
 */
export function ScoutCutBars({
  title,
  hint,
  cuts,
  minSeen = MIN_CUT_SEEN,
  long = false,
  className,
  testId,
}: ScoutCutBarsProps) {
  const { best, worst } = cutExtremes(cuts, minSeen);
  const anySeen = cuts.some((c) => c.seen > 0);

  return (
    <section className={cn('glass rounded-4xl p-4 sm:p-5', className)} data-testid={testId}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-fg">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {best && (
          <span className="shrink-0 text-right font-mono text-[11px] tabular text-success">
            {best.short} {pct(best.accuracy)}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {cuts.map((cut) => {
          const band = cutBand(cut, minSeen);
          const isBest = best !== null && cut.key === best.key;
          const isWorst = worst !== null && cut.key === worst.key;
          const thin = band === 'thin';
          const width = barWidth(cut.accuracy);
          return (
            <li
              key={cut.key}
              title={
                cut.seen === 0
                  ? `${cut.label}: never scouted`
                  : `${cut.label}: ${cut.correct} of ${cut.seen} named (${pct(cut.accuracy)})${
                      cut.avgRung > 0 ? `, average rung ${cut.avgRung.toFixed(1)}` : ''
                    }`
              }
              className={cn(
                'grid grid-cols-[4.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-2xl px-1 py-1 sm:grid-cols-[7rem_minmax(0,1fr)_3.25rem_3rem] sm:gap-3 sm:px-2',
                isBest && 'bg-success/10 ring-1 ring-success/30',
                isWorst && 'bg-danger/10 ring-1 ring-danger/30',
              )}
            >
              <span className="flex min-w-0 flex-col justify-center">
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs',
                    isBest ? 'font-bold text-success' : isWorst ? 'font-bold text-danger' : 'text-fg/80',
                  )}
                >
                  <span aria-hidden>{cut.emoji}</span>
                  <span className="truncate">{long ? cut.label : cut.short}</span>
                </span>
                {isBest && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                    <ChevronUp className="size-2.5" aria-hidden />
                    Sharpest
                  </span>
                )}
                {isWorst && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-danger">
                    <ChevronDown className="size-2.5" aria-hidden />
                    Blind spot
                  </span>
                )}
              </span>

              <div
                className={cn(
                  'relative h-7 min-w-0 overflow-hidden rounded-full sm:h-8',
                  thin ? 'border border-dashed border-border bg-surface/40' : 'bg-surface-strong',
                )}
              >
                {GRIDLINES.map((g) => (
                  <span
                    key={g}
                    className="absolute inset-y-0 w-px bg-border"
                    style={{ left: `${g * 100}%` }}
                    aria-hidden
                  />
                ))}
                {cut.correct > 0 && (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out',
                      isBest ? 'bg-success' : isWorst ? 'bg-danger' : thin ? 'bg-fg/25' : 'bg-gradient-accent',
                    )}
                    style={{ width: `${width * 100}%` }}
                    aria-hidden
                  />
                )}
              </div>

              <span className="hidden text-right font-mono text-[11px] tabular text-muted sm:block">
                {cut.seen === 0 ? 'unseen' : thin ? `${cut.correct}/${cut.seen}·thin` : `${cut.correct}/${cut.seen}`}
              </span>

              <span
                className={cn(
                  'text-right font-mono text-xs tabular',
                  cut.seen === 0
                    ? 'text-muted/60'
                    : isBest
                      ? 'font-bold text-success'
                      : isWorst
                        ? 'font-bold text-danger'
                        : 'text-fg',
                )}
              >
                {cut.seen === 0 ? '—' : pct(cut.accuracy)}
              </span>
            </li>
          );
        })}
      </ul>

      {!anySeen && (
        <p className="mt-3 text-xs text-muted">
          Nothing on this axis yet — every row fills in from the rounds you play.
        </p>
      )}
    </section>
  );
}
