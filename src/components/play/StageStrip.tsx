import type { GameState } from '@/types';
import { cn } from '@/components/ui';
import { clipLengthFor, currentRound, wonRounds } from '@/game/selectors';
import { clipLabel } from './format';

export interface StageStripProps {
  state: GameState;
}

/**
 * The ladder of tries: one pill per escalating stage (`0.1s · 0.3s · 1s …`) or dots for fixed
 * tries (`try 1/3 · 1s`). Consumed tries are struck, the current one glows. Hidden in blitz.
 */
export function StageStrip({ state }: StageStripProps) {
  const { settings } = state;
  const round = currentRound(state);
  if (!round || settings.mode === 'blitz') return null;

  const won = wonRounds(state);
  const escalating = settings.clipMode === 'escalating';
  const over = round.status !== 'playing';
  const winningTry = round.guesses.find((g) => g.verdict === 'correct')?.tryIndex;
  const tries = Array.from({ length: settings.tries }, (_, i) => ({ i, clip: clipLengthFor(settings, i, won) }));
  const currentClip = clipLengthFor(settings, Math.min(round.tryIndex, settings.tries - 1), won);

  const status = (i: number): 'used' | 'current' | 'won' | 'upcoming' => {
    if (winningTry !== undefined) return i === winningTry ? 'won' : i < winningTry ? 'used' : 'upcoming';
    if (over) return 'used';
    if (i < round.tryIndex) return 'used';
    if (i === round.tryIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="flex items-center gap-3" data-testid="stage-strip">
      <ol
        className={cn('flex min-w-0 flex-wrap items-center gap-1.5', !escalating && 'gap-2')}
        aria-label={escalating ? 'Clip stages' : 'Tries'}
      >
        {tries.map(({ i, clip }) => {
          const s = status(i);
          const label = escalating ? clipLabel(clip) : `Try ${i + 1}`;
          return (
            <li
              key={i}
              aria-current={s === 'current' ? 'step' : undefined}
              aria-label={`${label}${s === 'used' ? ', used' : s === 'won' ? ', correct' : ''}`}
              className={cn(
                'shrink-0 select-none font-mono font-semibold tabular transition-[background-color,color,box-shadow,transform] duration-300',
                escalating
                  ? 'rounded-full border px-2.5 py-1 text-xs'
                  : 'size-3 rounded-full border-2 text-[0px]',
                s === 'current' && 'border-transparent bg-gradient-accent text-accent-fg shadow-glow scale-105',
                s === 'won' && 'border-success/40 bg-success/20 text-success',
                s === 'used' && 'border-border bg-surface text-muted line-through opacity-50',
                s === 'upcoming' && 'border-border text-muted',
                !escalating && s === 'current' && 'scale-125',
                !escalating && s === 'used' && 'bg-fg/30 opacity-60',
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>
      {!escalating && (
        <span className="ml-auto shrink-0 font-mono text-xs text-muted tabular">
          try {Math.min(round.tryIndex + 1, settings.tries)}/{settings.tries} · {clipLabel(currentClip)}
          {settings.mode === 'survival' && ' clips'}
        </span>
      )}
    </div>
  );
}
