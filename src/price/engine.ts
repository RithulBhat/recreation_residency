/**
 * Price Guess — the pure engine.
 *
 * A reducer over `PriceState`, framework-free and fully deterministic given a seed. The UI, the
 * party layer and the tests all drive the same `reduce`, so a rule can only be implemented once.
 * Mirrors `src/game/engine.ts` (Songooner) in shape deliberately.
 *
 * ## Two round shapes, one reducer
 * `ladder` input is a Costcodle-style loop: one player, several guesses, each answered "higher"
 * or "lower", and the round ends on a hit or on running out of tries. Every other input is a
 * single sealed guess per player, and the round ends when everyone has answered. Both funnel
 * into `resolve`, which is the only place a score is ever awarded.
 *
 * ## Scoring happens once, at reveal
 * Never on the guess. A round can still change after a guess lands — a later player can overbid,
 * a hint can be bought, a timer can expire — and scoring early makes those paths inconsistent.
 */

import { createRng, type Rng } from '@/game/rng';
import { relativeError } from '@/arcade/units';
import type { ContentItem } from '@/arcade/types';
import { eliminationCasualty, scoreGuess } from './scoring';
import type {
  PriceGuess,
  PriceHint,
  PriceRound,
  PriceSettings,
  PriceState,
  PriceVerdict,
} from './types';

export type PriceAction =
  | { type: 'start' }
  | { type: 'guess'; playerId: string; value: number; elapsedMs: number }
  | { type: 'hint'; hint: PriceHint }
  | { type: 'timeout' }
  | { type: 'skip' }
  | { type: 'next' }
  | { type: 'finish' };

/** Build the opening state. `items` is already seeded and trimmed to `settings.rounds`. */
export function createInitialState(
  settings: PriceSettings,
  items: readonly ContentItem[],
): PriceState {
  const rounds: PriceRound[] = items.slice(0, settings.rounds).map((item) => ({
    item,
    guesses: [],
    hintsUsed: [],
    verdict: null,
    score: 0,
  }));
  return {
    status: 'idle',
    settings,
    rounds,
    index: 0,
    streak: 0,
    bestStreak: 0,
    totalScore: 0,
    eliminated: [],
  };
}

/** Deterministic pick of this game's items from a pool. Same seed, same game. */
export function selectItems(
  pool: readonly ContentItem[],
  settings: PriceSettings,
  rng: Rng = createRng(settings.seed),
): readonly ContentItem[] {
  return rng.shuffle(pool).slice(0, settings.rounds);
}

function currentRound(state: PriceState): PriceRound | undefined {
  return state.rounds[state.index];
}

/** Who still has a guess to make this round. Eliminated players do not. */
export function pendingPlayers(state: PriceState): readonly string[] {
  const round = currentRound(state);
  if (!round) return [];
  const answered = new Set(round.guesses.map((g) => g.playerId));
  return state.settings.players
    .map((p) => p.id)
    .filter((id) => !state.eliminated.includes(id) && !answered.has(id));
}

/** Ladder feedback for one guess. `hit` when inside the configured tolerance. */
export function ladderFeedback(
  guess: number,
  answer: number,
  tolerance: number,
): 'higher' | 'lower' | 'hit' {
  if (relativeError(guess, answer) <= tolerance) return 'hit';
  return guess < answer ? 'higher' : 'lower';
}

function isLadderDone(round: PriceRound, settings: PriceSettings): boolean {
  const last = round.guesses[round.guesses.length - 1];
  if (last?.feedback === 'hit') return true;
  return round.guesses.length >= settings.ladderTries;
}

/**
 * Score the current round and move to `revealing`. The single place points are awarded, so
 * every route into a resolved round — a final guess, a timeout, a skip — agrees.
 */
function resolve(state: PriceState, forced: PriceVerdict | null): PriceState {
  const round = currentRound(state);
  if (!round) return state;

  const { settings } = state;
  const answer = round.item.value;

  // In ladder mode the run's own last guess is the one that counts; elsewhere the best guess
  // stands in for the round when scoring a solo scoreboard.
  const scoring = round.guesses.length > 0 ? bestGuess(round.guesses, answer, state) : null;

  let verdict: PriceVerdict = forced ?? 'wide';
  let score = 0;

  if (forced === null && scoring !== null) {
    const breakdown = scoreGuess({
      guess: scoring.value,
      answer,
      scoring: settings.scoring,
      timer: settings.timer,
      elapsedMs: scoring.elapsedMs,
      speedBonus: settings.speedBonus,
      streak: state.streak + 1,
      streakMultiplier: settings.streakMultiplier,
      hintsUsed: round.hintsUsed.length,
    });
    verdict = breakdown.verdict;
    score = breakdown.total;
  }

  const won = verdict === 'exact' || verdict === 'close';
  const streak = won ? state.streak + 1 : 0;

  const eliminated = [...state.eliminated];
  if (settings.scoring === 'elimination' && forced === null) {
    const casualty = eliminationCasualty(round.guesses, answer);
    if (casualty && !eliminated.includes(casualty.playerId)) eliminated.push(casualty.playerId);
  }

  const rounds = state.rounds.map((r, i) => (i === state.index ? { ...r, verdict, score } : r));

  return {
    ...state,
    status: 'revealing',
    rounds,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    totalScore: state.totalScore + score,
    eliminated,
  };
}

/** The guess a round is scored on: in ladder mode the last, otherwise the closest. */
function bestGuess(
  guesses: readonly PriceGuess[],
  answer: number,
  state: PriceState,
): PriceGuess | null {
  if (guesses.length === 0) return null;
  if (state.settings.input === 'ladder') return guesses[guesses.length - 1];
  let best = guesses[0];
  for (const g of guesses) {
    if (relativeError(g.value, answer) < relativeError(best.value, answer)) best = g;
  }
  return best;
}

export function reduce(state: PriceState, action: PriceAction): PriceState {
  switch (action.type) {
    case 'start': {
      if (state.rounds.length === 0) return { ...state, status: 'finished' };
      return { ...state, status: 'playing' };
    }

    case 'guess': {
      if (state.status !== 'playing') return state;
      const round = currentRound(state);
      if (!round) return state;
      if (!Number.isFinite(action.value) || action.value < 0) return state;
      if (state.eliminated.includes(action.playerId)) return state;

      const isLadder = state.settings.input === 'ladder';
      // Outside ladder mode a player gets exactly one sealed guess per round.
      if (!isLadder && round.guesses.some((g) => g.playerId === action.playerId)) return state;

      const guess: PriceGuess = {
        playerId: action.playerId,
        value: action.value,
        elapsedMs: Math.max(0, action.elapsedMs),
      };
      if (isLadder) {
        guess.feedback = ladderFeedback(
          action.value,
          round.item.value,
          state.settings.ladderTolerance,
        );
      }

      const updated: PriceRound = { ...round, guesses: [...round.guesses, guess] };
      const next: PriceState = {
        ...state,
        rounds: state.rounds.map((r, i) => (i === state.index ? updated : r)),
      };

      if (isLadder) return isLadderDone(updated, state.settings) ? resolve(next, null) : next;
      return pendingPlayers(next).length === 0 ? resolve(next, null) : next;
    }

    case 'hint': {
      if (state.status !== 'playing') return state;
      const round = currentRound(state);
      if (!round) return state;
      if (!state.settings.hints.includes(action.hint)) return state;
      if (round.hintsUsed.includes(action.hint)) return state;
      return {
        ...state,
        rounds: state.rounds.map((r, i) =>
          i === state.index ? { ...r, hintsUsed: [...r.hintsUsed, action.hint] } : r,
        ),
      };
    }

    case 'timeout': {
      if (state.status !== 'playing') return state;
      // A timeout with guesses on the board still scores them — running out of clock should not
      // erase an answer a player already committed.
      const round = currentRound(state);
      return resolve(state, round && round.guesses.length > 0 ? null : 'timeout');
    }

    case 'skip': {
      if (state.status !== 'playing') return state;
      return resolve(state, 'skipped');
    }

    case 'next': {
      if (state.status !== 'revealing') return state;
      const index = state.index + 1;
      if (index >= state.rounds.length) return { ...state, status: 'finished' };
      // Elimination can empty the room before the rounds run out.
      const remaining = state.settings.players.filter((p) => !state.eliminated.includes(p.id));
      if (state.settings.scoring === 'elimination' && remaining.length <= 1) {
        return { ...state, status: 'finished' };
      }
      return { ...state, status: 'playing', index };
    }

    case 'finish':
      return { ...state, status: 'finished' };

    default:
      return state;
  }
}

/** Fold a list of actions over a state — the shape most tests want. */
export function reduceAll(state: PriceState, actions: readonly PriceAction[]): PriceState {
  return actions.reduce(reduce, state);
}
