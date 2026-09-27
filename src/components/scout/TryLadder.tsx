import { cn } from '@/components/ui';
import type { ScoutRound } from '@/scout/types';
import { points, rungValue } from './format';

export interface TryLadderProps {
  round: ScoutRound;
  /** `settings.tries` — the ladder is exactly this long. */
  tries: number;
  className?: string;
}

type RungStatus = 'used' | 'current' | 'won' | 'upcoming';

/**
 * A rung's price, exactly as the scorer will pay it.
 *
 * ONE rule for every puzzle type. Abbreviating four figures used to put `1.2k 920 747 575 460` on a
 * Silhouette ladder next to `1k 800 650 500 400` on a Locker Room one — two rounding rules in one
 * row, and `1.2k` for a rung that actually pays 1,150. Every rung in the game is between 180 and
 * 1,200 points (`BASE_POINTS` 1000 × `tryFactor` 1→0.3 × `modeWeight` 0.6→1.2), so the exact figure
 * is at most four characters — never wider than the `1.2k` it replaces — and the pills can be read
 * against each other. `points()` (with its thousands separator) still labels the running total, where
 * five and six figures do turn up.
 */
export function rungLabel(n: number): string {
  return String(Math.round(Number.isFinite(n) ? n : 0));
}

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
              {rungLabel(pts)}
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
