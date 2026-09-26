/**
 * Glue between the local `GameState` and the two scoreboard messages.
 * Both peers race the same seeded game, so a progress message is purely informational —
 * nothing here ever feeds back into the engine.
 */

import type { GameState } from '@/types';
import { progress as roundProgress, wonRounds } from '@/game/selectors';
import type { FinishedMsg, ProgressMsg } from './protocol';

/** Verdict of the most recent guess in the most recent round, if any. */
function lastVerdict(state: GameState): ProgressMsg['lastVerdict'] {
  for (let i = state.rounds.length - 1; i >= 0; i--) {
    const guesses = state.rounds[i].guesses;
    if (guesses.length > 0) return guesses[guesses.length - 1].verdict;
  }
  return null;
}

/** Snapshot to broadcast — call it on every round end (and once on start). */
export function progressFrom(state: GameState, at: number = Date.now()): ProgressMsg {
  return {
    type: 'progress',
    round: roundProgress(state).round,
    score: Math.max(0, Math.round(state.totalScore)),
    streak: Math.max(0, state.streak),
    correct: wonRounds(state),
    status: state.status,
    lastVerdict: lastVerdict(state),
    at,
  };
}

/** Final result to broadcast once the local game reaches 'finished'. */
export function finishedFrom(state: GameState, at: number = Date.now()): FinishedMsg {
  const startedAt = state.startedAt ?? at;
  const endedAt = state.finishedAt ?? at;
  return {
    type: 'finished',
    score: Math.max(0, Math.round(state.totalScore)),
    correct: wonRounds(state),
    rounds: state.rounds.length,
    durationMs: Math.max(0, Math.round(endedAt - startedAt)),
  };
}

export type Outcome = 'win' | 'loss' | 'tie' | 'pending';

/**
 * Who won the race. 'pending' until BOTH sides have finished.
 * Higher score wins; identical scores are broken by the faster run, then it's a genuine tie.
 */
export function outcome(mine: FinishedMsg | null, theirs: FinishedMsg | null): Outcome {
  if (!mine || !theirs) return 'pending';
  if (mine.score !== theirs.score) return mine.score > theirs.score ? 'win' : 'loss';
  if (mine.correct !== theirs.correct) return mine.correct > theirs.correct ? 'win' : 'loss';
  if (mine.durationMs !== theirs.durationMs) return mine.durationMs < theirs.durationMs ? 'win' : 'loss';
  return 'tie';
}

/** Who is ahead right now, for the live race bar. 0 = level, 1 = me, -1 = them. */
export function leadFrom(mine: ProgressMsg | null, theirs: ProgressMsg | null): -1 | 0 | 1 {
  const a = mine?.score ?? 0;
  const b = theirs?.score ?? 0;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}
