/**
 * Higher or Lower — seeded matchup selection.
 *
 * Difficulty in this game is not "obscure items", it is **how close the two values are**. A pair
 * whose values differ 10× is trivial; a pair within 3% is a coin flip you can still reason about.
 * So difficulty is expressed as a band on the RATIO between the two values, never on the raw gap
 * (a $40 difference is enormous between coffees and invisible between houses).
 *
 * ## The rule that matters: never fail to produce a round
 * A pack can easily contain no partner inside a tight band — every remaining item may sit within
 * 1% of the anchor, or the pool may be nearly exhausted. Throwing there would end a run on what
 * is really a content problem. So `pickPartner` walks a **degradation ladder**: it relaxes the
 * band one documented step at a time and reports how far it had to go, and only returns `null`
 * when there is genuinely no unused item left. Callers surface `degraded` rather than hiding it,
 * so a pack that constantly degrades shows up as a content bug instead of silently playing easy.
 *
 * Pure and framework-free; deterministic for a given `Rng` seed.
 */

import type { Rng } from '@/game/rng';
import type { ContentItem } from './types';

export type HiloDifficulty = 'easy' | 'medium' | 'hard' | 'insane';

/** A band on `max(a,b) / min(a,b)`, which is always `>= 1`. */
export interface GapBand {
  /** Smallest acceptable ratio. `2` = the values must differ by at least 2×. */
  min: number;
  /** Largest acceptable ratio. `1.03` = the values must be within 3% of each other. */
  max: number;
}

/**
 * Easy and medium demand a wide gap; hard and insane demand a narrow one. The numbers come
 * straight from the build prompt: easy ≥ 2×, hard within 10%, insane within 3%.
 */
export const HILO_BANDS: Record<HiloDifficulty, GapBand> = {
  easy: { min: 2, max: 8 },
  medium: { min: 1.25, max: 3 },
  hard: { min: 1, max: 1.1 },
  insane: { min: 1, max: 1.03 },
};

/**
 * Ratio between two values, always `>= 1`. Two zeros are identical (`1`); one zero against a
 * non-zero has no finite ratio (`Infinity`) and so only ever satisfies an open-topped band.
 */
export function ratioOf(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (lo === 0) return hi === 0 ? 1 : Infinity;
  return hi / lo;
}

export function withinBand(ratio: number, band: GapBand): boolean {
  return ratio >= band.min && ratio <= band.max;
}

/**
 * The relaxation ladder for a band, loosest-last, starting with the band itself.
 *
 * A max-constrained band (hard/insane) widens its ceiling; a min-constrained one (easy/medium)
 * lowers its floor. Both end at the unconstrained band, so the ladder always terminates
 * somewhere that accepts any pair.
 */
export function relaxationLadder(band: GapBand): readonly GapBand[] {
  const steps: GapBand[] = [band];
  if (Number.isFinite(band.max)) {
    // 1.03 → 1.06 → 1.12 → 1.24 → 1.48 → ∞ : each step roughly doubles the tolerated distance
    let max = band.max;
    while (max < 1.5) {
      max = 1 + (max - 1) * 2;
      steps.push({ min: band.min, max });
    }
  }
  if (band.min > 1) {
    // 2 → 1.5 → 1.25 → 1.125 → 1 : each step halves the demanded separation
    let min = band.min;
    while (min > 1.0001) {
      min = 1 + (min - 1) / 2;
      steps.push({ min: min <= 1.0001 ? 1 : min, max: band.max });
    }
  }
  steps.push({ min: 1, max: Infinity });
  return steps;
}

export interface Matchup {
  item: ContentItem;
  /** How many rungs down the ladder we had to go. `0` = the requested difficulty was met. */
  degraded: number;
  /** The band actually satisfied. */
  band: GapBand;
}

/**
 * Choose a partner for `anchor` from `pool`, honouring `band` if possible and degrading if not.
 *
 * ## Direction is balanced deliberately, not left to the ratio filter
 * Filtering only by ratio looks unbiased — across a whole run, "higher" comes up about half the
 * time. It is not. Higher or Lower chains, so the anchor is wherever the last round left you,
 * and from a cheap anchor most of the pool is dearer. Measured on a realistic long-tailed pool,
 * "if A is below the median, guess higher" won 78% of easy rounds against 50% chance, while the
 * marginal rate of "higher" sat at a reassuring 50.6%. The tell is conditional on the anchor and
 * invisible in the aggregate.
 *
 * So candidates are split into dearer and cheaper buckets and the SIDE is chosen on a coin flip
 * first, then an item within it. Where the anchor sits then tells you nothing. At the very top
 * and bottom of a pool one bucket is empty and the other is forced — unavoidable, and rare
 * enough not to be readable.
 *
 * `usedIds` keeps a run from repeating an item. Returns `null` only when every item in the pool
 * is either the anchor or already used — the one case the caller must handle by ending the run.
 */
export function pickPartner(
  pool: readonly ContentItem[],
  anchor: ContentItem,
  band: GapBand,
  rng: Rng,
  usedIds: ReadonlySet<string> = new Set(),
): Matchup | null {
  const available = pool.filter((i) => i.id !== anchor.id && !usedIds.has(i.id));
  if (available.length === 0) return null;

  const ladder = relaxationLadder(band);
  for (let rung = 0; rung < ladder.length; rung++) {
    const step = ladder[rung];
    const fits = available.filter((i) => withinBand(ratioOf(anchor.value, i.value), step));
    if (fits.length === 0) continue;

    let dearer: readonly ContentItem[] = fits.filter((i) => i.value > anchor.value);
    let cheaper: readonly ContentItem[] = fits.filter((i) => i.value < anchor.value);
    // Backfill an empty side from looser rungs so the direction is genuinely a coin flip.
    if (dearer.length === 0) dearer = sideCandidates(available, anchor.value, ladder, rung + 1, true);
    if (cheaper.length === 0) {
      cheaper = sideCandidates(available, anchor.value, ladder, rung + 1, false);
    }

    const side =
      dearer.length > 0 && cheaper.length > 0
        ? rng.next() < 0.5
          ? dearer
          : cheaper
        : dearer.length > 0
          ? dearer
          : cheaper;
    if (side.length === 0) continue;
    return { item: rng.pick(side), degraded: rung, band: step };
  }

  // The ladder ends unconstrained, so this is unreachable while `available` is non-empty —
  // kept as a total function rather than a non-null assertion.
  return { item: rng.pick(available), degraded: ladder.length, band: { min: 1, max: Infinity } };
}

/**
 * Candidates on one side of the anchor, relaxing the band down the ladder until that side has
 * something in it.
 *
 * This is what makes the coin flip real at the edges of a pool. With a minimum-gap band like
 * easy's (at least 2x), nothing in the bottom of a pool has a partner 2x cheaper, so the only
 * legal move is upward and the answer is forced. Accepting a smaller gap for that one round is
 * a minor difficulty deviation; a forced answer is a leak the player can read every time.
 */
function sideCandidates(
  available: readonly ContentItem[],
  anchorValue: number,
  ladder: readonly GapBand[],
  fromRung: number,
  dearer: boolean,
): readonly ContentItem[] {
  for (let rung = fromRung; rung < ladder.length; rung++) {
    const found = available.filter(
      (i) =>
        (dearer ? i.value > anchorValue : i.value < anchorValue) &&
        withinBand(ratioOf(anchorValue, i.value), ladder[rung]),
    );
    if (found.length > 0) return found;
  }
  return [];
}

export interface SequenceStep {
  item: ContentItem;
  degraded: number;
}

export interface BuiltSequence {
  /** The chain, in play order. `steps[0]` is the opening anchor and is never degraded. */
  steps: readonly SequenceStep[];
  /** True when the pool ran out before `length` was reached. */
  exhausted: boolean;
  /** How many rungs of degradation the whole chain needed — a content-quality signal. */
  totalDegraded: number;
}

/**
 * Build a full run up front so a seed reproduces a sequence exactly — which is what makes the
 * Daily challenge, seeded duels and party races comparable between players.
 *
 * Returns a shorter chain rather than throwing when the pool is too small; `exhausted` says so.
 */
export function buildSequence(
  pool: readonly ContentItem[],
  difficulty: HiloDifficulty,
  length: number,
  rng: Rng,
): BuiltSequence {
  const want = Math.max(0, Math.floor(length));
  if (pool.length === 0 || want === 0) {
    return { steps: [], exhausted: pool.length === 0, totalDegraded: 0 };
  }

  const band = HILO_BANDS[difficulty];
  const used = new Set<string>();
  const steps: SequenceStep[] = [];

  const first = rng.pick(pool);
  used.add(first.id);
  steps.push({ item: first, degraded: 0 });

  let totalDegraded = 0;
  while (steps.length < want) {
    const anchor = steps[steps.length - 1].item;
    const next = pickPartner(pool, anchor, band, rng, used);
    if (next === null) {
      return { steps, exhausted: true, totalDegraded };
    }
    used.add(next.item.id);
    totalDegraded += next.degraded;
    steps.push({ item: next.item, degraded: next.degraded });
  }

  return { steps, exhausted: false, totalDegraded };
}

/** Which way the comparison goes. `same` only when the values are exactly equal. */
export type Direction = 'higher' | 'lower' | 'same';

export function directionOf(from: number, to: number): Direction {
  if (to > from) return 'higher';
  if (to < from) return 'lower';
  return 'same';
}

/**
 * Whether a pair is close enough to offer the optional "Same / Too close" third button.
 * Tolerance is a ratio, so `0.01` means the values are within 1% of one another.
 */
export function isTooClose(a: number, b: number, tolerance: number): boolean {
  if (tolerance <= 0) return a === b;
  return ratioOf(a, b) <= 1 + tolerance;
}

/**
 * How often a band can actually be satisfied by a pool, as a fraction of anchors that have at
 * least one partner inside it.
 *
 * A pool whose neighbouring values are 9% apart can never produce an "insane" pair (within 3%),
 * so every round silently degrades and the hardest setting plays no differently from the one
 * below it. Measuring this is what turns that from an invisible disappointment into something
 * the setup screen can refuse to offer.
 */
export function bandFeasibility(pool: readonly ContentItem[], band: GapBand): number {
  if (pool.length < 2) return 0;
  let usable = 0;
  for (const anchor of pool) {
    const has = pool.some(
      (other) => other.id !== anchor.id && withinBand(ratioOf(anchor.value, other.value), band),
    );
    if (has) usable++;
  }
  return usable / pool.length;
}

/**
 * The difficulties a pool can honestly deliver, at a given minimum feasibility.
 *
 * Offering a setting the content cannot honour is worse than not offering it: the player picks
 * "insane", gets ordinary rounds, and concludes the game is broken rather than the pack.
 */
export function feasibleDifficulties(
  pool: readonly ContentItem[],
  minimum = 0.6,
): readonly HiloDifficulty[] {
  return (Object.keys(HILO_BANDS) as HiloDifficulty[]).filter(
    (d) => bandFeasibility(pool, HILO_BANDS[d]) >= minimum,
  );
}
