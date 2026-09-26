/**
 * How a finished round reads under the record: the label replaces the old grey "ROUND OVER", and the
 * 0.1 s Club stamp fires for a first-try win at the shortest clip the run allows.
 */

import type { GameSettings, GameState, Round } from '@/types';
import { shortestClip } from '@/stats/aggregate';
import { clipLabel } from './format';

export type OutcomeTone = 'success' | 'warn' | 'muted';

export interface OutcomeLabel {
  text: string;
  tone: OutcomeTone;
  /** Clip label to append (`1s`) — kept apart so the UI can keep its case in an uppercase line. */
  clip?: string;
}

const EPS = 1e-6;

/** The winning guess of a round, if any. */
export function winningGuess(round: Round) {
  return round.guesses.find((g) => g.verdict === 'correct');
}

/** Label for a round that is over; null while it is still being played. */
export function outcomeLabel(round: Round): OutcomeLabel | null {
  if (round.status === 'playing') return null;
  const win = winningGuess(round);
  if (round.status === 'won' && win) return { text: 'Nailed it', tone: 'success', clip: clipLabel(win.clipLength) };
  if (round.guesses.some((g) => g.verdict === 'partial')) return { text: 'Artist credit', tone: 'warn' };
  return { text: 'The answer', tone: 'muted' };
}

/** First try, at the shortest clip of the run — same definition as the stats' `perfect` rounds. */
export function isPerfectRound(round: Round, settings: GameSettings): boolean {
  const win = winningGuess(round);
  return round.status === 'won' && win !== undefined && win.tryIndex === 0 && win.clipLength <= shortestClip(settings) + EPS;
}

export interface ClubStampData {
  /** Clip length the round was won at (seconds). */
  clip: number;
  score: number;
  /** Lifetime perfect rounds including this one. */
  count: number;
}

/**
 * Stamp data for the current round when it was perfect, else null. `lifetime` is the stats store's
 * `totals.perfectRounds`, which only learns about this game when it ends — so the rounds of the game
 * in progress are added here.
 */
export function clubStampFor(state: GameState, lifetime: number): ClubStampData | null {
  const round = state.rounds[state.currentRound];
  if (!round || !isPerfectRound(round, state.settings)) return null;
  const win = winningGuess(round);
  if (!win) return null;
  const thisGame = state.rounds.filter((r) => isPerfectRound(r, state.settings)).length;
  return { clip: win.clipLength, score: round.score, count: Math.max(0, lifetime) + thisGame };
}
