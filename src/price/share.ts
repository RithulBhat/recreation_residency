/** Turning a finished Price Guess run into a shareable grid. */

import type { ShareCard, ShareMark } from '@/arcade/share';
import { relativeError } from '@/arcade/units';
import type { PriceState } from './types';

/** Bands chosen so the grid reads at a glance: sharp, respectable, wild, and nothing at all. */
export function markFor(guess: number | undefined, answer: number, over: boolean): ShareMark {
  if (guess === undefined) return 'skip';
  if (over) return 'miss';
  const error = relativeError(guess, answer);
  if (error <= 0.05) return 'great';
  if (error <= 0.15) return 'good';
  if (error <= 0.4) return 'poor';
  return 'miss';
}

export function shareCard(state: PriceState, opts: { daily?: string; url?: string } = {}): ShareCard {
  const marks = state.rounds
    .filter((r) => r.verdict !== null)
    .map((r) =>
      markFor(r.guesses[r.guesses.length - 1]?.value, r.item.value, r.verdict === 'over'),
    );
  return {
    title: opts.daily ? `Price Guess — Daily ${opts.daily}` : 'Price Guess',
    subtitle: `${state.totalScore.toLocaleString()} points · best streak ${state.bestStreak}`,
    marks,
    url: opts.url,
  };
}
