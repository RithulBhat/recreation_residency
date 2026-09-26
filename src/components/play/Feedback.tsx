import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { GameState, Guess, Round } from '@/types';
import { cn } from '@/components/ui';
import { matchGuess } from '@/game/match';
import { isBuzzerDuel } from '@/game/presets';
import { currentClipLength, currentRound, triesLeft } from '@/game/selectors';
import { clipLabel, points } from './format';

export interface FeedbackProps {
  state: GameState;
  className?: string;
  /** Keep a line of space while there is no verdict (default) so the layout never jumps. */
  reserve?: boolean;
}

type Tone = 'success' | 'warn' | 'danger' | 'neutral';

const TONE: Record<Tone, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  warn: 'border-warn/40 bg-warn/15 text-warn',
  danger: 'border-danger/40 bg-danger/15 text-danger',
  neutral: 'border-border bg-surface text-fg',
};

function verdictLine(state: GameState, round: Round, guess: Guess): { text: string; tone: Tone } {
  const left = triesLeft(state);
  const blitz = state.settings.mode === 'blitz';
  if (blitz && guess.verdict !== 'correct') {
    return { text: guess.verdict === 'skipped' ? 'Skipped. −3s' : 'Nope. −3s', tone: 'danger' };
  }
  switch (guess.verdict) {
    case 'correct':
      return { text: `🔥 Correct at ${clipLabel(guess.clipLength)} (+${points(round.score)})`, tone: 'success' };
    case 'partial':
      return { text: "Artist's right! Title?", tone: 'warn' };
    case 'timeout':
      return { text: "Time's up!", tone: 'danger' };
    case 'skipped':
      return round.status === 'playing'
        ? { text: `Skipped → now ${clipLabel(currentClipLength(state))}`, tone: 'neutral' }
        : { text: 'Gave up.', tone: 'neutral' };
    default: {
      const close = matchGuess(guess.text, round.track, state.settings.guessTarget).confidence >= 0.3;
      const lead = close ? 'So close!' : 'Nope.';
      if (isBuzzerDuel(state.settings)) {
        const who = state.players.find((p) => p.id === guess.playerId)?.name ?? 'Buzzer';
        return { text: round.status === 'playing' ? `${lead} ${who} is locked out.` : lead, tone: 'danger' };
      }
      const tail = round.status === 'playing' ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : '';
      return { text: `${lead}${tail}`, tone: 'danger' };
    }
  }
}

/** Inline verdict toast for the latest guess of the current round. */
export function Feedback({ state, className, reserve = true }: FeedbackProps) {
  const reduce = useReducedMotion();
  const current = currentRound(state);
  // Blitz auto-advances, so the verdict of the song that just ended lives on the previous round.
  const round =
    current && current.guesses.length === 0 && state.settings.mode === 'blitz' ? state.rounds[current.index - 1] : current;
  const guess = round?.guesses[round.guesses.length - 1];
  const line = round && guess ? verdictLine(state, round, guess) : null;
  const key = round && guess ? `${state.id}:${round.index}:${round.guesses.length}` : 'none';

  return (
    <div className={cn(reserve && 'min-h-9', className)} aria-live="polite" data-testid="feedback">
      <AnimatePresence mode="wait" initial={false}>
        {line && (
          <motion.div
            key={key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className={cn('inline-flex max-w-full items-center rounded-2xl border px-3.5 py-2 text-sm font-semibold', TONE[line.tone])}
            role="status"
          >
            <span className="truncate">{line.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
