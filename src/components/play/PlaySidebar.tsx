import { Flame } from 'lucide-react';
import type { GameState } from '@/types';
import { Badge, Kbd, cn } from '@/components/ui';
import { currentRound } from '@/game/selectors';
import { StageStrip } from './StageStrip';
import { currentStreak, packSummary } from './RoundChips';
import { VERDICT_LABEL, VERDICT_TONE } from './format';

export interface PlaySidebarProps {
  state: GameState;
  buzzer: boolean;
}

const eyebrow = 'font-mono text-[10px] uppercase tracking-widest text-muted';

/** Desktop rail while a round is open: the try ladder, the streak, the pack and the latest guesses. */
export function PlaySidebar({ state, buzzer }: PlaySidebarProps) {
  const round = currentRound(state);
  const streak = currentStreak(state);
  const pack = packSummary(state);
  const guesses = round ? round.guesses.slice(-3).reverse() : [];

  return (
    <div className="glass rounded-3xl p-4 text-sm" data-testid="play-sidebar">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">This round</p>
      <StageStrip state={state} className="mt-3" />

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <dt className={eyebrow}>Streak</dt>
          <dd className={cn('mt-1 flex items-center gap-1.5 font-display text-2xl font-bold leading-none', streak >= 2 ? 'text-warn' : 'text-fg')}>
            <Flame className={cn('size-5', streak >= 2 && 'fill-current')} aria-hidden />
            {streak}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border bg-surface p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-xl leading-none" aria-hidden>
            {pack?.emoji ?? '🎧'}
          </span>
          <div className="min-w-0">
            <dt className={eyebrow}>Pack</dt>
            <dd className="truncate font-semibold text-fg" title={pack?.name}>
              {pack ? pack.name : 'Your mix'}
              {pack && pack.extra > 0 && <span className="text-muted"> +{pack.extra}</span>}
            </dd>
          </div>
        </div>
      </dl>

      <section className="mt-4" aria-label="Your guesses">
        <h3 className={eyebrow}>Guesses</h3>
        {guesses.length === 0 ? (
          <p className="mt-1.5 text-muted">
            Nothing yet — <Kbd size="sm">Space</Kbd> to listen, <Kbd size="sm">Enter</Kbd> to guess.
          </p>
        ) : (
          <ol className="mt-1.5 flex flex-col gap-1">
            {guesses.map((g, i) => (
              <li key={`${g.at}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-2.5 py-1.5">
                <span className={cn('truncate', g.text ? 'text-fg' : 'text-muted italic')}>{g.text || (g.verdict === 'timeout' ? 'Out of time' : 'Skipped')}</span>
                <Badge tone={VERDICT_TONE[g.verdict]} size="sm">
                  {VERDICT_LABEL[g.verdict]}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-4 text-xs text-muted">
        {buzzer ? (
          'First to buzz gets the guess. A wrong answer locks you out for the round.'
        ) : (
          <>
            Press <Kbd size="sm">?</Kbd> for all shortcuts.
          </>
        )}
      </p>
    </div>
  );
}
