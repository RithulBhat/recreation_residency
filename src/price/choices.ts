/**
 * Multiple-choice option generation.
 *
 * ## The failure mode this module exists to avoid
 * The obvious implementation — take the real price, multiply it by a few random factors, and
 * shuffle — leaks the answer without anyone noticing. A real price like `$1,299` sits among
 * distractors like `$844.35` and `$2,077.19`, and the player picks the one that *looks like a
 * price* while knowing nothing about the item. The round is then a formatting puzzle, not a
 * price puzzle. Tests pass the whole time, because the round still resolves correctly.
 *
 * So every option, the true one included, goes through the SAME `roundLikePrice` before being
 * returned. The truth gets no special treatment, and the set is shuffled so position carries no
 * information either.
 *
 * Pure, deterministic for a given `Rng` seed.
 */

import type { Rng } from '@/game/rng';

/** How far distractors sit from the truth, as multipliers. Widened by difficulty. */
export const CHOICE_SPREADS: Record<'easy' | 'medium' | 'hard', readonly number[]> = {
  easy: [0.3, 0.55, 1.9, 3.2],
  medium: [0.55, 0.75, 1.4, 2.1],
  hard: [0.78, 0.88, 1.15, 1.32],
};

/**
 * Round a value the way a price is written, scaled to its own magnitude: tens stay whole,
 * hundreds round to 5, thousands to 50, and so on. Applied identically to the answer and to
 * every distractor — that uniformity is the entire point.
 */
export function roundLikePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = Math.floor(Math.log10(value));
  // step is ~1% of the value's order of magnitude, floored at 1 for small numbers
  const step = Math.max(1, Math.pow(10, magnitude - 1) / 2);
  return Math.round(value / step) * step;
}

/**
 * Build the option set for one round. Always contains the true answer exactly once, always
 * `count` long when the spreads allow, and never contains a duplicate or a non-positive price.
 */
export function buildChoices(
  answer: number,
  rng: Rng,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  count = 4,
): number[] {
  if (!Number.isFinite(answer) || answer <= 0) return [];

  const truth = roundLikePrice(answer);
  const chosen: number[] = [truth];

  const spreads = rng.shuffle(CHOICE_SPREADS[difficulty]);
  for (const factor of spreads) {
    if (chosen.length >= count) break;
    const candidate = roundLikePrice(answer * factor);
    if (candidate > 0 && !chosen.includes(candidate)) chosen.push(candidate);
  }

  // Rounding can collapse two spreads onto the same number on small values; widen until the set
  // is full rather than returning a short list the UI has to special-case.
  let widen = 2;
  while (chosen.length < count && widen < 64) {
    for (const dir of [widen, 1 / widen]) {
      if (chosen.length >= count) break;
      const candidate = roundLikePrice(answer * dir);
      if (candidate > 0 && !chosen.includes(candidate)) chosen.push(candidate);
    }
    widen *= 2;
  }

  return rng.shuffle(chosen);
}

/**
 * Which option is the correct one. Compared against the ROUNDED answer, because that is what
 * `buildChoices` put in the list — comparing against the raw price would never match.
 */
export function correctChoiceIndex(choices: readonly number[], answer: number): number {
  return choices.indexOf(roundLikePrice(answer));
}
