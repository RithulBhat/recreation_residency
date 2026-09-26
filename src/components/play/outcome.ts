/**
 * How a finished round reads under the record: the label replaces the old grey "ROUND OVER", and the
 * 0.1 s Club stamp fires for a round won on a 0.1 s clip.
 */

import type { GameState, Round } from '@/types';
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

/** Membership is absolute: the clip heard on the winning try was 0.1 s (or less), whatever the try. */
export const CLUB_CLIP = 0.1;

export function isClubRound(round: Round): boolean {
  const win = winningGuess(round);
  return round.status === 'won' && win !== undefined && win.clipLength <= CLUB_CLIP + EPS;
}

export interface ClubStampData {
  /** Clip length the round was won at (seconds). */
  clip: number;
  score: number;
  /** Lifetime perfect rounds including this one. */
  count: number;
}

/**
 * Stamp data for the current round when it joined the club, else null. `lifetime` is the stats
 * store's `totals.byClipBucket['0.1'].correct` (the same figure the results card shows), which only
 * learns about this game when it ends — so the club rounds of the game in progress are added here.
 */
export function clubStampFor(state: GameState, lifetime: number): ClubStampData | null {
  const round = state.rounds[state.currentRound];
  const win = round ? winningGuess(round) : undefined;
  if (!round || !win || !isClubRound(round)) return null;
  const thisGame = state.rounds.filter(isClubRound).length;
  return { clip: win.clipLength, score: round.score, count: Math.max(0, lifetime) + thisGame };
}
