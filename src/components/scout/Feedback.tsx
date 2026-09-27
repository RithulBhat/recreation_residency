import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleCheckBig, CircleX, Flag, TimerOff, TrendingUp } from 'lucide-react';
import { cn } from '@/components/ui';
import { isAmbiguousSurname, nameTokens } from '@/scout/names';
import { triesLeft } from '@/scout/selectors';
import type { ScoutGuess, ScoutRound, ScoutState, ScoutSubject } from '@/scout/types';
import { points } from './format';

export interface FeedbackProps {
  state: ScoutState;
  /** The subjects the guess was judged against, for the near-miss wording. */
  pool: readonly ScoutSubject[];
  /** Keep a line of space while there is no verdict, so nothing jumps. */
  reserve?: boolean;
  /** What fills the slot while there is no verdict. */
  fallback?: ReactNode;
  className?: string;
}

export interface CloseCopy {
  title: string;
  detail: string;
}

/**
 * Why a guess came back `close`, in words.
 *
 * The matcher returns `close` for exactly three situations (see `@/scout/names`): the right surname
 * on the wrong player, a bare surname two players in the run share, and the right city with the
 * wrong franchise. Each deserves its own sentence — "so close" with no explanation is the most
 * annoying message a guessing game can show.
 */
export function closeCopy(guess: string, subject: ScoutSubject, pool: readonly ScoutSubject[]): CloseCopy {
  const tokens = nameTokens(guess);

  if (subject.kind === 'team') {
    // Never "try the other one": only a handful of cities have two clubs, so that line was a lie
    // most of the time. `isAmbiguousSurname` is what actually knows, so it is what decides.
    return {
      title: 'Right city, wrong club.',
      detail: isAmbiguousSurname(subject, pool)
        ? 'Two franchises play there. Name the one you mean.'
        : 'You have the city — now the nickname.',
    };
  }

  if (tokens.length === 1 && isAmbiguousSurname(subject, pool)) {
    return {
      title: 'That surname is taken twice.',
      detail: 'Two players in this run share it — give me a first name.',
    };
  }
  return {
    title: 'Right surname, wrong player.',
    detail: 'Same last name, different guy. Who else has it?',
  };
}

type Tone = 'success' | 'warn' | 'danger' | 'neutral';

const TONE: Record<Tone, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  warn: 'border-warn/45 bg-warn/15 text-warn',
  danger: 'border-danger/40 bg-danger/15 text-danger',
  neutral: 'border-border bg-surface text-fg',
};

interface Line {
  tone: Tone;
  icon: ReactNode;
  text: string;
  /** The second line, used by the `close` card. */
  detail?: string;
  /** What the player typed, echoed back on a near miss. */
  echo?: string;
}

/** The verdict line for the latest guess of a round. Pure; the component just paints it. */
export function verdictLine(state: ScoutState, round: ScoutRound, guess: ScoutGuess, pool: readonly ScoutSubject[]): Line {
  const left = triesLeft(state);
  // A franchise is not a "him". Every person-noun on this screen branches on the subject's kind.
  const team = round.subject.kind === 'team';
  switch (guess.verdict) {
    case 'correct':
      return {
        tone: 'success',
        icon: <CircleCheckBig />,
        text: `${team ? 'Got it' : 'Got him'} on try ${guess.tryIndex + 1} · +${points(round.score)}`,
      };
    case 'close': {
      const copy = closeCopy(guess.text, round.subject, pool);
      return { tone: 'warn', icon: <TrendingUp />, text: copy.title, detail: copy.detail, echo: guess.text };
    }
    case 'timeout':
      return { tone: 'danger', icon: <TimerOff />, text: "Time's up." };
    case 'skipped':
      return round.status === 'playing'
        ? { tone: 'neutral', icon: <Flag />, text: 'Skipped — here is another clue.' }
        : { tone: 'neutral', icon: <Flag />, text: 'Gave up on that one.' };
    default: {
      const miss = team ? 'Not that club.' : 'Not him.';
      return {
        tone: 'danger',
        icon: <CircleX />,
        text: round.status === 'playing' ? `${miss} ${left} ${left === 1 ? 'try' : 'tries'} left.` : miss,
        echo: guess.text,
      };
    }
  }
}

/**
 * The inline verdict for the latest guess. A `close` guess gets the whole amber two-line treatment —
 * it is the best moment in the game and it should feel like one.
 */
export function Feedback({ state, pool, reserve = true, fallback, className }: FeedbackProps) {
  const reduce = useReducedMotion();
  const round = state.rounds[state.currentRound];
  const guess = round?.guesses[round.guesses.length - 1];
  const line = round && guess ? verdictLine(state, round, guess, pool) : null;
  const key = round && guess ? `${state.id}:${round.index}:${round.guesses.length}` : 'none';

  return (
    <div className={cn(reserve && 'min-h-12', className)} aria-live="polite" data-testid="scout-feedback">
      <AnimatePresence mode="wait" initial={false}>
        {line ? (
          <motion.div
            key={key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn(
              'flex max-w-full items-start gap-2.5 rounded-3xl border px-3.5 py-2.5',
              TONE[line.tone],
              line.detail && 'shadow-glow',
            )}
            role="status"
            data-verdict={guess?.verdict}
          >
            <span className="mt-0.5 shrink-0 [&>svg]:size-4" aria-hidden>
              {line.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-snug">{line.text}</span>
              {line.detail && <span className="mt-0.5 block text-xs font-medium leading-snug opacity-90">{line.detail}</span>}
              {line.echo && (
                <span className="mt-1 block truncate font-mono text-[11px] opacity-70">you said “{line.echo}”</span>
              )}
            </span>
          </motion.div>
        ) : fallback ? (
          <motion.div
            key="fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={cn('flex w-full items-center', reserve && 'min-h-12')}
          >
            {fallback}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
