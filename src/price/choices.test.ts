import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { CHOICE_SPREADS, buildChoices, correctChoiceIndex, roundLikePrice } from './choices';

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
      const answer = 1299;
      const choices = buildChoices(answer, createRng(`s${i}`));
      const hits = choices.filter((c) => c === roundLikePrice(answer));
      expect(hits).toHaveLength(1);
    }
  });

  it('returns the requested number of distinct options', () => {
    for (const answer of [3, 47, 1299, 84_500, 2_400_000]) {
      const choices = buildChoices(answer, createRng('s'));
      expect(choices, `answer ${answer}`).toHaveLength(4);
      expect(new Set(choices).size, `answer ${answer} had duplicates`).toBe(4);
    }
  });

  it('never offers a free or negative price', () => {
    for (let i = 0; i < 100; i++) {
      for (const c of buildChoices(12, createRng(`z${i}`))) expect(c).toBeGreaterThan(0);
    }
  });

  it('does not leak the answer through formatting — every option is rounded alike', () => {
    // If the truth were the only "price-shaped" number, this would fail: each option must be
    // indistinguishable from its own re-rounding, exactly as the answer is.
    for (let i = 0; i < 100; i++) {
      for (const c of buildChoices(1299, createRng(`f${i}`))) {
        expect(roundLikePrice(c)).toBe(c);
      }
    }
  });

  it('does not leak the answer through position', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const choices = buildChoices(1299, createRng(`p${i}`));
      positions.add(correctChoiceIndex(choices, 1299));
    }
    // across many seeds the answer must land in every slot, not a favoured one
    expect(positions).toEqual(new Set([0, 1, 2, 3]));
  });

  it('does not leak the answer by always being the median or an extreme', () => {
    let lowest = 0;
    let highest = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const choices = buildChoices(1299, createRng(`m${i}`));
      const truth = roundLikePrice(1299);
      if (Math.min(...choices) === truth) lowest++;
      if (Math.max(...choices) === truth) highest++;
    }
    // it may sometimes be the extreme, but must not reliably be one
    expect(lowest).toBeLessThan(runs);
    expect(highest).toBeLessThan(runs);
  });

  it('keeps hard distractors closer to the truth than easy ones', () => {
    const spread = (d: 'easy' | 'hard') =>
      Math.max(...CHOICE_SPREADS[d].map((f) => Math.abs(Math.log(f))));
    expect(spread('hard')).toBeLessThan(spread('easy'));
  });

  it('is deterministic for a seed', () => {
    expect(buildChoices(1299, createRng('fixed'))).toEqual(buildChoices(1299, createRng('fixed')));
  });

  it('returns nothing for an unusable answer rather than throwing', () => {
    expect(buildChoices(0, createRng('s'))).toEqual([]);
    expect(buildChoices(NaN, createRng('s'))).toEqual([]);
  });
});

describe('correctChoiceIndex', () => {
  it('finds the answer in its rounded form', () => {
    const choices = buildChoices(1299, createRng('s'));
    expect(choices[correctChoiceIndex(choices, 1299)]).toBe(roundLikePrice(1299));
  });

  it('reports -1 when the answer is absent', () => {
    expect(correctChoiceIndex([1, 2, 3], 999)).toBe(-1);
  });
});
