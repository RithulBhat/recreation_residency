import { Flag, MousePointerClick, SkipForward } from 'lucide-react';
import { Button, Kbd, cn } from '@/components/ui';
import { canGuess as canGuessNow } from '@/scout/selectors';
import type { ScoutMode, ScoutState } from '@/scout/types';
import { skipLabel } from './GuessBox';

export interface ChoiceActionsProps {
  state: ScoutState;
  /** `round.mode` — decides how many number keys are advertised. */
  mode: ScoutMode;
  onSkip: () => void;
  onGiveUp: () => void;
  className?: string;
}

/**
 * What sits where the guess box would be on a tap-only round.
 *
 * Higher or Lower and Odd One Out are answered by picking a card, so the combobox is not merely
 * disabled — it is gone. The two verbs that still make sense (burn a try for the next clue, give up)
 * stay, with the same testids and the same hotkeys as every other round, and the keys the board binds
 * are printed here so they are discoverable without reading the help sheet.
 */
export function ChoiceActions({ state, mode, onSkip, onGiveUp, className }: ChoiceActionsProps) {
  const round = state.rounds[state.currentRound];
  const live = state.status === 'playing' && round?.status === 'playing';
  const allowed = canGuessNow(state);
  const two = mode === 'higherLower';

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)} data-testid="scout-choice-actions">
      <p className="flex min-w-0 shrink items-center gap-1.5 text-xs text-muted">
        <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
        {allowed || !live ? (
          <span className="min-w-0">
            Pick a card
            <span className="hidden sm:inline">
              {' — or press '}
              <Kbd size="sm">1</Kbd>
              {two ? ' / ' : '–'}
              <Kbd size="sm">{two ? '2' : '4'}</Kbd>
            </span>
          </span>
        ) : (
          <span className="font-semibold text-warn">Buzz in before you pick.</span>
        )}
      </p>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          leadingIcon={<SkipForward />}
          onClick={onSkip}
          disabled={!live}
          className="min-w-0"
          data-testid="scout-skip"
        >
          {skipLabel(state)}
        </Button>
        <Button
          variant="ghost"
          size="md"
          leadingIcon={<Flag />}
          onClick={onGiveUp}
          disabled={!live}
          aria-label="Give up on this one"
          className="min-w-0 shrink text-muted"
          data-testid="scout-give-up"
        >
          <span className="hidden sm:inline">Give up</span>
        </Button>
      </div>
    </div>
  );
}
