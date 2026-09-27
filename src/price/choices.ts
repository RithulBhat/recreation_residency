/**
 * Multiple-choice option generation.
 *
 * ## The failure mode this module exists to avoid
 * If a distractor is manufactured differently from the truth, the manufacturing process IS the
 * clue. The round still resolves correctly, so every ordinary test passes while the player wins
 * by reading the generator instead of knowing the answer. There are at least three separate
 * axes, and fixing one does nothing for the others:
 *
 *  1. FORMATTING — a real `$1,299` among `$844.35` and `$2,077.19` is obvious on sight. Fixed by
 *     pushing the answer and every distractor through the same `roundLikePrice`.
 *  2. POSITION — if the answer favours a slot, "always pick slot 2" beats chance. Fixed by a
 *     final shuffle.
 *  3. MAGNITUDE — the first version drew from four fixed spreads and dropped exactly one, so at
 *     least one distractor always sat below the truth and one above: the answer was NEVER the
 *     cheapest or dearest option, measured at 0.0% each over 4,000 rounds against 25% chance.
 *     Eliminating both extremes on sight turned a 1-in-4 guess into a 1-in-2 guess. Fixed by
 *     choosing the answer's RANK uniformly first, then drawing that many distractors below it.
 *  4. ROUNDNESS — the subtle one, and only visible once axis 3 was fixed. Real prices are
 *     rounder than random products of a price: a house is $250,000, not $247,318. Rounding each
 *     option by its own magnitude left the truth on more trailing zeros than its distractors,
 *     and "pick the roundest number" won 34% of easy rounds. Fixed by giving every distractor
 *     the ANSWER'S OWN ENDING — if the truth is $1,299 the others are $399 and $1,799, never
 *     $400 and $1,800 — so roundness carries no signal and the board reads as real prices.
 *
 * The inverse matters as much as the excess: a strategy winning 0% is as exploitable as one
 * winning 92%, because the player just inverts it. `choices.test.ts` asserts two-sided.
 *
 * Pure, deterministic for a given `Rng` seed.
 */

import type { Rng } from '@/game/rng';

export type ChoiceDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Distractor multipliers, split by side so the answer's rank can be chosen deliberately. Each
 * side needs at least `count - 1` entries so the answer can sit at either extreme.
 */
export const CHOICE_SPREADS: Record<
  ChoiceDifficulty,
  { below: readonly number[]; above: readonly number[] }
> = {
  easy: { below: [0.28, 0.4, 0.55], above: [1.8, 2.5, 3.4] },
  medium: { below: [0.52, 0.64, 0.78], above: [1.32, 1.65, 2.05] },
  hard: { below: [0.76, 0.84, 0.91], above: [1.1, 1.19, 1.3] },
};

/**
 * Round a value the way a price is written, scaled to its own magnitude. Used for display; the
 * option set uses `snapAll` instead, which rounds every option to ONE shared step.
 */
export function roundLikePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = Math.floor(Math.log10(value));
  const step = Math.max(1, Math.pow(10, magnitude - 1) / 2);
  return Math.round(value / step) * step;
}

/**
 * The answer's price "ending" — the part below its own order of magnitude.
 *
 * `1299 -> { base: 100, tail: 99 }`, `45000 -> { base: 1000, tail: 0 }`, `47 -> { base: 1, tail: 0 }`.
 * Every distractor is then built to end the same way, which is what kills the roundness tell.
 */
function endingOf(answer: number): { base: number; tail: number } {
  const mag = Math.floor(Math.log10(answer));
  const base = Math.pow(10, Math.max(0, mag - 1));
  return { base, tail: Math.round(answer) % base };
}

/** Snap a value onto the answer's ending, keeping it positive. */
function withEnding(value: number, base: number, tail: number): number {
  if (base <= 1) return Math.max(1, Math.round(value));
  const steps = Math.round((value - tail) / base);
  return Math.max(base + tail, steps * base + tail);
}

/** How many zeros a number ends in — the thing "pick the roundest" reads. */
function trailingZeros(n: number): number {
  const s = String(Math.round(n));
  return s.length - s.replace(/0+$/, '').length;
}

export interface ChoiceSet {
  /** The options as shown, shuffled. */
  options: readonly number[];
  /** The correct option, already snapped — compare against this, never the raw price. */
  answer: number;
}

/**
 * Build the option set for one round. Always contains the answer exactly once, at a uniformly
 * random rank, with every option snapped to one shared step and the set shuffled.
 *
 * Returns the snapped answer rather than making callers re-derive it: the rounding depends on
 * the whole set, so re-deriving it from the raw price would silently fail to match.
 *
 * Very small answers cannot always supply enough distinct cheaper options — below about $8 the
 * step floor of 1 runs out of room. The missing slots are backfilled from the other side rather
 * than returning a short list the UI must special-case; the rank guarantee degrades there only.
 */
export function buildChoices(
  answer: number,
  rng: Rng,
  difficulty: ChoiceDifficulty = 'medium',
  count = 4,
): ChoiceSet {
  if (!Number.isFinite(answer) || answer <= 0 || count < 1) return { options: [], answer: 0 };

  const distractors = count - 1;
  // The answer's rank among the options, chosen uniformly — this is the magnitude fix.
  const wantBelow = rng.int(0, distractors);
  const spreads = CHOICE_SPREADS[difficulty];
  const below = rng.shuffle(spreads.below);
  const above = rng.shuffle(spreads.above);
  const { base, tail } = endingOf(answer);

  const truth = withEnding(answer, base, tail);
  const options: number[] = [truth];

  const truthZeros = trailingZeros(truth);
  const step = Math.max(1, base);

  const add = (raw: number, isBelow: boolean): boolean => {
    let v = withEnding(raw, base, tail);
    // Nudge further from the answer on its own side until the option is distinct AND carries the
    // same number of trailing zeros as the answer. Matching the count is what removes the
    // roundness tell in BOTH directions: without it the answer is sometimes the only round
    // number on the board and sometimes the only one that is not, and either is exploitable.
    for (let i = 0; i < 40; i++) {
      if (v > 0 && !options.includes(v) && trailingZeros(v) === truthZeros) {
        options.push(v);
        return true;
      }
      v = isBelow ? v - step : v + step;
      if (v <= 0) return false;
    }
    return false;
  };

  let placed = 0;
  for (let i = 0; i < below.length && placed < wantBelow; i++) {
    if (add(answer * below[i], true)) placed++;
  }
  let placedAbove = 0;
  for (let i = 0; i < above.length && placedAbove < distractors - wantBelow; i++) {
    if (add(answer * above[i], false)) placedAbove++;
  }

  // Backfill whichever side had room — only reachable for very small prices.
  let extra = 1;
  while (options.length < count && extra < 64) {
    if (!add(answer * (1 + extra * 0.35), false)) add(answer / (1 + extra * 0.35), true);
    extra++;
  }

  return { options: rng.shuffle(options), answer: truth };
}

/**
 * Which option is the correct one, by index into `set.options`.
 */
export function correctChoiceIndex(set: ChoiceSet): number {
  return set.options.indexOf(set.answer);
}
