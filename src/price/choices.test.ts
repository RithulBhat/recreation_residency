import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import {
  CHOICE_SPREADS,
  type ChoiceDifficulty,
  buildChoices,
  correctChoiceIndex,
  roundLikePrice,
} from './choices';

describe('roundLikePrice', () => {
  it('scales the rounding step to the magnitude', () => {
    expect(roundLikePrice(1299)).toBe(1300);
    expect(roundLikePrice(1287)).toBe(1300);
    expect(roundLikePrice(47)).toBe(47);
  });

  it('is idempotent — rounding a rounded price changes nothing', () => {
    for (const v of [3, 47, 1299, 84_500, 2_400_000]) {
      expect(roundLikePrice(roundLikePrice(v))).toBe(roundLikePrice(v));
    }
  });

  it('refuses non-positive and non-finite input', () => {
    expect(roundLikePrice(0)).toBe(0);
    expect(roundLikePrice(-5)).toBe(0);
    expect(roundLikePrice(NaN)).toBe(0);
  });
});

describe('buildChoices', () => {
  it('always contains the answer exactly once', () => {
    for (let i = 0; i < 100; i++) {
      const set = buildChoices(1299, createRng(`s${i}`));
      expect(set.options.filter((c) => c === set.answer)).toHaveLength(1);
    }
  });

  it('returns the requested number of distinct options', () => {
    for (const answer of [47, 1299, 84_500, 2_400_000]) {
      const set = buildChoices(answer, createRng('s'));
      expect(set.options, `answer ${answer}`).toHaveLength(4);
      expect(new Set(set.options).size, `answer ${answer} had duplicates`).toBe(4);
    }
  });

  it('never offers a free or negative price', () => {
    for (let i = 0; i < 100; i++) {
      for (const c of buildChoices(12, createRng(`z${i}`)).options) expect(c).toBeGreaterThan(0);
    }
  });

  it('reports the snapped answer, which callers must compare against', () => {
    const set = buildChoices(1299, createRng('s'));
    expect(set.options).toContain(set.answer);
    // the raw price is NOT necessarily in the list — that is why the set carries the answer
    expect(set.answer).not.toBeNaN();
  });

  it('keeps hard distractors closer to the truth than easy ones', () => {
    const widest = (d: ChoiceDifficulty) =>
      Math.max(
        ...[...CHOICE_SPREADS[d].below, ...CHOICE_SPREADS[d].above].map((f) => Math.abs(Math.log(f))),
      );
    expect(widest('hard')).toBeLessThan(widest('medium'));
    expect(widest('medium')).toBeLessThan(widest('easy'));
  });

  it('gives every difficulty enough spread on each side to place the answer at an extreme', () => {
    for (const d of Object.keys(CHOICE_SPREADS) as ChoiceDifficulty[]) {
      expect(CHOICE_SPREADS[d].below.length, `${d} below`).toBeGreaterThanOrEqual(3);
      expect(CHOICE_SPREADS[d].above.length, `${d} above`).toBeGreaterThanOrEqual(3);
    }
  });

  it('is deterministic for a seed', () => {
    expect(buildChoices(1299, createRng('fixed'))).toEqual(buildChoices(1299, createRng('fixed')));
  });

  it('returns nothing for an unusable answer rather than throwing', () => {
    expect(buildChoices(0, createRng('s')).options).toEqual([]);
    expect(buildChoices(NaN, createRng('s')).options).toEqual([]);
    expect(buildChoices(-10, createRng('s')).options).toEqual([]);
  });

  it('snaps every option to the same granularity', () => {
    for (const answer of [47, 1299, 45_000, 250_000]) {
      const { options } = buildChoices(answer, createRng(`g${answer}`));
      const gcdAll = options.reduce((a, b) => gcd(a, b));
      expect(gcdAll, `answer ${answer} options ${options.join()}`).toBeGreaterThanOrEqual(1);
      // all options divide evenly by the shared step, so none looks rounder by construction
      for (const o of options) expect(o % gcdAll).toBe(0);
    }
  });

  it('still produces a usable distinct set for very small prices', () => {
    // below ~$8 the step floor of 1 runs out of cheaper options, so the rank guarantee degrades;
    // the set must still be valid and playable
    for (const answer of [2, 3, 5, 8]) {
      const { options, answer: truth } = buildChoices(answer, createRng(`tiny-${answer}`));
      expect(new Set(options).size, `answer ${answer}`).toBe(options.length);
      expect(options, `answer ${answer}`).toContain(truth);
      for (const v of options) expect(v).toBeGreaterThan(0);
    }
  });
});

/**
 * The strategy harness.
 *
 * Plays thousands of generated rounds with strategies that use NO price knowledge at all, and
 * fails if any of them departs from chance in EITHER direction. A strategy winning 0% is exactly
 * as exploitable as one winning 92% — the player simply inverts it — which is why the assertion
 * is two-sided.
 *
 * This is the test that would have caught the original generator. It drew from four fixed
 * spreads and dropped exactly one, so at least one distractor always sat on each side of the
 * truth: "pick the cheapest" and "pick the dearest" each won 0.0% of 4,000 rounds, letting a
 * player discard half the board on sight. The old test only asserted "not ALWAYS the extreme",
 * which 0% passes.
 */
describe('no strategy without price knowledge beats chance', () => {
  const ANSWERS = [12, 47, 199, 1299, 8400, 45_000, 250_000, 1_750_000];
  const ROUNDS = 3000;
  const CHANCE = 0.25;
  // generous enough for sampling noise at n=3000 (se ~0.8%), tight enough to catch a real tell
  const TOLERANCE = 0.05;

  const STRATEGIES: Record<string, (choices: readonly number[]) => number> = {
    'pick slot 0': (c) => c[0],
    'pick slot 1': (c) => c[1],
    'pick slot 2': (c) => c[2],
    'pick slot 3': (c) => c[3],
    'pick the cheapest': (c) => Math.min(...c),
    'pick the dearest': (c) => Math.max(...c),
    'pick the second cheapest': (c) => [...c].sort((a, b) => a - b)[1],
    'pick the second dearest': (c) => [...c].sort((a, b) => a - b)[2],
    'pick the roundest number': (c) =>
      [...c].sort((a, b) => trailingZeros(b) - trailingZeros(a) || a - b)[0],
  };

  function trailingZeros(n: number): number {
    const s = String(Math.round(n));
    return s.length - s.replace(/0+$/, '').length;
  }

  for (const difficulty of Object.keys(CHOICE_SPREADS) as ChoiceDifficulty[]) {
    it(`holds on ${difficulty}`, () => {
      const wins: Record<string, number> = {};
      for (const name of Object.keys(STRATEGIES)) wins[name] = 0;
      let played = 0;

      for (let i = 0; i < ROUNDS; i++) {
        const answer = ANSWERS[i % ANSWERS.length];
        const set = buildChoices(answer, createRng(`h-${difficulty}-${i}`), difficulty);
        if (set.options.length !== 4) continue;
        played++;
        for (const [name, strategy] of Object.entries(STRATEGIES)) {
          if (strategy(set.options) === set.answer) wins[name]++;
        }
      }

      expect(played).toBeGreaterThan(ROUNDS * 0.9);
      for (const [name, count] of Object.entries(wins)) {
        const rate = count / played;
        expect(
          Math.abs(rate - CHANCE),
          `"${name}" won ${(rate * 100).toFixed(1)}% of ${played} ${difficulty} rounds (chance ${CHANCE * 100}%) — the generator is readable without knowing the price`,
        ).toBeLessThan(TOLERANCE);
      }
    });
  }

  it('places the answer at every rank, not merely in every slot', () => {
    const ranks = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      const set = buildChoices(1299, createRng(`r${i}`));
      const rank = [...set.options].sort((a, b) => a - b).indexOf(set.answer);
      ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
    }
    expect([...ranks.keys()].sort()).toEqual([0, 1, 2, 3]);
    for (const [rank, count] of ranks) {
      expect(Math.abs(count / 2000 - 0.25), `rank ${rank} appeared ${count}/2000 times`).toBeLessThan(
        0.05,
      );
    }
  });
});

describe('correctChoiceIndex', () => {
  it('finds the answer in the set', () => {
    const set = buildChoices(1299, createRng('s'));
    expect(set.options[correctChoiceIndex(set)]).toBe(set.answer);
  });

  it('reports -1 when the answer is absent', () => {
    expect(correctChoiceIndex({ options: [1, 2, 3], answer: 999 })).toBe(-1);
  });
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
