/**
 * Price Guess scoring.
 *
 * The curve is the one from the brief: `1000 × max(0, 1 − error)^1.5`, where `error` is the
 * relative error as a ratio. The exponent is what makes the game feel fair — a linear curve pays
 * far too well for a wild guess. At 1.5, being 10% out keeps ~85% of the points, 50% out keeps
 * ~35%, and double the real price scores zero. A guess cannot go below zero no matter how wrong.
 *
 * ## Price Is Right is a different game, not a modifier
 * Under `priceIsRight` the closeness curve still decides how many points a valid guess earns, but
 * going even a penny over scores exactly zero. That rule has to be applied before the bonuses,
 * otherwise a fast, streak-boosted overbid would out-score a careful correct one.
 *
 * Pure and framework-free.
 */

import { relativeError } from '@/arcade/units';
import type { PriceScoreBreakdown, PriceScoreInput, PriceVerdict } from './types';

export const BASE_POINTS = 1000;
export const CURVE_EXPONENT = 1.5;

/** Relative error at or under which a guess is "exact" — worth the top accuracy bonus. */
export const EXACT_THRESHOLD = 0.01;
/** Relative error at or under which a guess is "close". */
export const CLOSE_THRESHOLD = 0.05;

export const EXACT_BONUS = 250;
export const CLOSE_BONUS = 100;

/** Maximum speed bonus, as a fraction of the base points. */
export const MAX_SPEED_BONUS = 0.25;
/** Added per streak step. */
export const STREAK_STEP = 0.05;
/** Streak multiplier ceiling. */
export const MAX_STREAK_BONUS = 0.5;
/** Each hint costs this fraction of the round's base points. */
export const HINT_COST = 0.15;

/**
 * The closeness curve. `error` is a ratio (0.1 = 10% out); returns 0..1000.
 * Anything 100% or more out is worthless, which is what makes overbidding by 2× a zero.
 */
export function closenessPoints(error: number): number {
  if (!Number.isFinite(error) || error < 0) return 0;
  const remaining = Math.max(0, 1 - error);
  return BASE_POINTS * Math.pow(remaining, CURVE_EXPONENT);
}

/**
 * Speed bonus as a fraction of base. Untimed rounds pay nothing — there is no deadline to beat,
 * and paying for raw reaction time would punish anyone reading the item carefully.
 */
export function speedFraction(elapsedMs: number, timerSeconds: number): number {
  if (timerSeconds <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const limit = timerSeconds * 1000;
  const remaining = Math.max(0, limit - elapsedMs) / limit;
  return MAX_SPEED_BONUS * remaining;
}

/** Streak multiplier. A streak of 0 or 1 is no bonus; it ramps and then caps. */
export function streakFactor(streak: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(streak) || streak <= 1) return 1;
  return 1 + Math.min(MAX_STREAK_BONUS, (streak - 1) * STREAK_STEP);
}

export function verdictFor(guess: number, answer: number, isPriceIsRight: boolean): PriceVerdict {
  const error = relativeError(guess, answer);
  if (isPriceIsRight && guess > answer) return 'over';
  if (error <= EXACT_THRESHOLD) return 'exact';
  if (error <= CLOSE_THRESHOLD) return 'close';
  return 'wide';
}

/**
 * Score one guess and show the working. The breakdown is rendered to the player after every
 * round, so each field has to stand on its own rather than being an intermediate.
 */
export function scoreGuess(input: PriceScoreInput): PriceScoreBreakdown {
  const { guess, answer, scoring, timer, elapsedMs, speedBonus, streak, streakMultiplier } = input;
  const hintsUsed = Math.max(0, Math.floor(input.hintsUsed));
  const error = relativeError(guess, answer);
  const isPIR = scoring === 'priceIsRight';
  const verdict = verdictFor(guess, answer, isPIR);

  const empty: PriceScoreBreakdown = {
    base: 0,
    accuracyBonus: 0,
    speedBonus: 0,
    streakFactor: 1,
    hintPenalty: 0,
    total: 0,
    verdict,
    error,
  };

  // Going over under Price Is Right is a zero, full stop — before any bonus can rescue it.
  if (verdict === 'over') return empty;
  if (!Number.isFinite(guess)) return { ...empty, verdict: 'wide' };

  const base = closenessPoints(error);
  if (base <= 0) return { ...empty, base: 0 };

  const accuracyBonus =
    verdict === 'exact' ? EXACT_BONUS : verdict === 'close' ? CLOSE_BONUS : 0;
  const speed = speedBonus ? BASE_POINTS * speedFraction(elapsedMs, timer) : 0;
  const factor = streakFactor(streak, streakMultiplier);
  const hintPenalty = BASE_POINTS * HINT_COST * hintsUsed;

  const total = Math.max(0, Math.round((base + accuracyBonus + speed) * factor - hintPenalty));

  return {
    base: Math.round(base),
    accuracyBonus,
    speedBonus: Math.round(speed),
    streakFactor: factor,
    hintPenalty: Math.round(hintPenalty),
    total,
    verdict,
    error,
  };
}

/**
 * Resolve a whole round under Price Is Right: the winner is the closest guess that did not go
 * over. Returns `null` when everyone overbid — the round has no winner, which is the correct
 * outcome rather than awarding it to the least-wrong overbidder.
 */
export function priceIsRightWinner<T extends { playerId: string; value: number }>(
  guesses: readonly T[],
  answer: number,
): T | null {
  let best: T | null = null;
  for (const g of guesses) {
    if (!Number.isFinite(g.value) || g.value > answer) continue;
    if (best === null || g.value > best.value) best = g;
  }
  return best;
}

/**
 * Resolve a round under `elimination`: the single furthest-out player goes. Ties keep everyone —
 * knocking out several players on a coincidence would end a party game far too abruptly.
 */
export function eliminationCasualty<T extends { playerId: string; value: number }>(
  guesses: readonly T[],
  answer: number,
): T | null {
  if (guesses.length <= 1) return null;
  let worst: T | null = null;
  let worstError = -1;
  let tied = false;
  for (const g of guesses) {
    const error = relativeError(g.value, answer);
    if (error > worstError) {
      worstError = error;
      worst = g;
      tied = false;
    } else if (error === worstError) {
      tied = true;
    }
  }
  return tied ? null : worst;
}
