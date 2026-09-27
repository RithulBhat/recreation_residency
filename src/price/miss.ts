/**
 * How to describe a wrong guess.
 *
 * A relative error reads well while it is small — "12% out" is information a player can use. It
 * stops meaning anything the moment the guess is wild: guessing $120,000 for a jar of peanut
 * butter produced "2999900% out", which is noise, and it is the single most likely line in the
 * game because chaos mode deliberately mixes $2 sweets with $2M houses.
 *
 * So the description switches register with the size of the miss: a percentage while that is
 * meaningful, a multiple once it is not, and plain words at the extremes. Pure and testable.
 */

import { formatCompact } from '@/arcade/units';

export interface MissDescription {
  /** Short phrase for the reveal line. */
  text: string;
  /** Whether the guess was above the real price. */
  high: boolean;
}

export function describeMiss(guess: number, answer: number): MissDescription | null {
  if (!Number.isFinite(guess) || !Number.isFinite(answer) || answer <= 0) return null;
  if (guess === answer) return null;

  const high = guess > answer;
  const ratio = high ? guess / answer : answer / guess;
  const direction = high ? 'too high' : 'too low';

  // Under a quarter out, a percentage is the most useful thing to say.
  const error = Math.abs(guess - answer) / answer;
  if (error < 0.25) return { text: `${Math.round(error * 100)}% ${direction}`, high };

  // Up to 100x, a multiple reads better than a three-digit percentage.
  if (ratio < 100) {
    const shown = ratio < 10 ? ratio.toFixed(1).replace(/\.0$/, '') : String(Math.round(ratio));
    return { text: `${shown}× ${direction}`, high };
  }

  // Beyond that the number stops helping at all.
  return { text: high ? 'Wildly over' : 'Wildly under', high };
}

/** The reveal's full "you said" line. */
export function missLine(guess: number, answer: number, currency: 'usd' | 'gbp' | 'eur'): string {
  const miss = describeMiss(guess, answer);
  const said = formatCompact(guess, currency);
  return miss ? `You said ${said} — ${miss.text}` : `You said ${said} — spot on`;
}
