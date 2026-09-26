import { cn } from '@/components/ui';
import type { ScoutRound } from '@/scout/types';
import { points, rungValue, shortPoints } from './format';

export interface TryLadderProps {
  round: ScoutRound;
  /** `settings.tries` — the ladder is exactly this long. */
  tries: number;
  className?: string;
}

type RungStatus = 'used' | 'current' | 'won' | 'upcoming';

/** Who owns each rung once the dust settles. Pure, so the unit test can pin it. */
export function rungStatuses(round: ScoutRound, tries: number): RungStatus[] {
  const win = round.guesses.find((g) => g.verdict === 'correct');
  const over = round.status !== 'playing';
  return Array.from({ length: Math.max(1, tries) }, (_, i): RungStatus => {
    if (win) return i === win.tryIndex ? 'won' : i < win.tryIndex ? 'used' : 'upcoming';
    if (over) return i < Math.max(round.tryIndex, 1) ? 'used' : 'upcoming';
    if (i < round.tryIndex) return 'used';
    if (i === round.tryIndex) return 'current';
    return 'upcoming';
  });
}

/**
 * The reveal ladder as a price list: one pill per rung showing what solving there pays. Consumed
 * rungs are struck through, the live one glows, the winning one turns green. Mirrors Songooner's
 * StageStrip, where the pills carry clip lengths instead of points.
 */
export function TryLadder({ round, tries, className }: TryLadderProps) {
  const statuses = rungStatuses(round, tries);
  const live = Math.min(round.tryIndex, tries - 1);
  const value = rungValue(round.mode, live);

  return (
    <div className={cn('flex min-w-0 items-center gap-2 sm:gap-3', className)} data-testid="scout-try-ladder">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Reveal ladder — points on offer per try">
        {statuses.map((s, i) => {
          const pts = rungValue(round.mode, i);
          return (
            <li
              key={i}
              aria-current={s === 'current' ? 'step' : undefined}
              aria-label={`Try ${i + 1}, worth ${points(pts)} points${s === 'used' ? ', used' : s === 'won' ? ', solved here' : ''}`}
              className={cn(
                'shrink-0 select-none rounded-full border px-2.5 py-1 font-mono text-xs font-semibold tabular',
                'transition-[background-color,color,box-shadow,transform] duration-300',
                s === 'current' && 'scale-105 border-transparent bg-gradient-accent text-accent-fg shadow-glow',
                s === 'won' && 'border-success/40 bg-success/20 text-success',
                s === 'used' && 'border-border bg-surface text-muted line-through opacity-50',
                s === 'upcoming' && 'border-border text-muted',
              )}
              data-status={s}
            >
              {shortPoints(pts)}
            </li>
          );
        })}
      </ol>
      <span className="ml-auto shrink-0 text-right font-mono text-[11px] leading-tight text-muted tabular">
        try {Math.min(round.tryIndex + 1, tries)}/{tries}
        <span className="hidden sm:inline"> · {points(value)} pts</span>
      </span>
    </div>
  );
}
