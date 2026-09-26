import { Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { pct } from './summary';
import { scoutModeStandings, sharpestScoutMode, type ScoutTotals } from './scoutAggregate';

export interface ScoutModeChartProps {
  totals: ScoutTotals;
  className?: string;
}

/** Recessive reference lines at 25 / 50 / 75%. */
const GRIDLINES = [0.25, 0.5, 0.75];

function brag(name: string, acc: number): string {
  if (acc >= 0.75) return `${name} is your game.`;
  if (acc >= 0.5) return `You're dangerous at ${name}.`;
  if (acc >= 0.3) return `You're solid at ${name}.`;
  return `Your best mode is ${name}.`;
}

/**
 * Accuracy per mode as a horizontal bar list — one series, so one accent ramp and no legend.
 * Built from divs; every mode stays on the axis even at zero rounds so the shape never jumps.
 */
export function ScoutModeChart({ totals, className }: ScoutModeChartProps) {
  const standings = scoutModeStandings(totals);
  const sharpest = sharpestScoutMode(standings);
  const anyPlayed = standings.some((s) => s.rounds > 0);

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-fg">
            {sharpest ? (
              <span className="text-gradient">{brag(sharpest.name, sharpest.accuracy)}</span>
            ) : (
              'No rounds scouted yet.'
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {anyPlayed
              ? 'Share of rounds you named the subject, by the mode the round was played in.'
              : 'Play a run and all seven modes fill in here.'}
          </p>
        </div>
        {sharpest && (
          <Badge tone="accent" className="shrink-0">
            <Crosshair className="size-3" aria-hidden />
            {pct(sharpest.accuracy)} in {sharpest.name}
          </Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1.5" data-testid="scout-mode-chart">
        {standings.map((s) => {
          const isBest = sharpest !== null && s.mode === sharpest.mode;
          const empty = s.rounds === 0;
          return (
            <li
              key={s.mode}
              title={empty ? `${s.name}: not played yet` : `${s.name}: ${s.correct} of ${s.rounds} rounds (${pct(s.accuracy)})`}
              className={cn(
                'grid grid-cols-[6rem_minmax(0,1fr)_2.6rem] items-center gap-1.5 rounded-2xl px-1 py-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_3.4rem] sm:gap-3 sm:px-2',
                isBest && 'bg-accent/10 ring-1 ring-accent/35',
              )}
            >
              <span className={cn('flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs', isBest ? 'font-bold text-accent' : 'text-muted')}>
                <span aria-hidden>{s.emoji}</span>
                <span className="truncate">{s.name}</span>
              </span>

              <div className="relative h-7 min-w-0 overflow-hidden rounded-full bg-surface-strong sm:h-8">
                {GRIDLINES.map((g) => (
                  <span key={g} className="absolute inset-y-0 w-px bg-border" style={{ left: `${g * 100}%` }} aria-hidden />
                ))}
                {s.correct > 0 && (
                  <span
                    className="absolute inset-0 bg-gradient-accent transition-[clip-path] duration-700 ease-out"
                    style={{ clipPath: `inset(0 ${(1 - Math.max(s.accuracy, 0.03)) * 100}% 0 0 round 9999px)` }}
                    aria-hidden
                  />
                )}
                <span className="absolute inset-y-0 right-2 flex items-center font-mono text-[10px] tabular text-muted">
                  {empty ? 'not played' : `${s.correct}/${s.rounds}`}
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
