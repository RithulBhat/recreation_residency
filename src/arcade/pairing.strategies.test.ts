/**
 * The strategy harness for Higher or Lower.
 *
 * Plays thousands of generated chains with strategies that use no knowledge of the items at all,
 * and fails if any departs from chance in EITHER direction. Assertions are PER DIFFICULTY: the
 * leak this harness first caught was invisible in the aggregate and only appeared once the
 * measurement was split, which is the same lesson the Scout side learned independently.
 *
 * What it caught, on a realistic long-tailed pool:
 *  - "if A is below the pool median, guess higher" won 78% of easy rounds against 50% chance,
 *    while the marginal rate of "higher" sat at a reassuring 50.6%. The game CHAINS, so the
 *    anchor is wherever the last round left you, and from a cheap anchor most of the pool is
 *    dearer. The tell is conditional on the anchor and cancels out in the mean.
 *  - the `insane` band (within 3%) degraded on 100% of rounds for a pool whose neighbouring
 *    values sit 9% apart — the hardest setting silently played no differently from the others.
 *    That is a property of the content, not the code, which is why `bandFeasibility` exists.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from './types';
import {
  HILO_BANDS,
  bandFeasibility,
  buildSequence,
  directionOf,
  feasibleDifficulties,
  type HiloDifficulty,
} from './pairing';

function item(id: string, value: number): ContentItem {
  return {
    id,
    name: id,
    emoji: '📦',
    category: 'c',
    value,
    unit: 'count',
    source: 's',
    asOf: '2026-09-27',
    verified: true,
  };
}

/** Long-tailed, like populations or prices: neighbours ~9% apart over four orders of magnitude. */
const WIDE: ContentItem[] = Array.from({ length: 120 }, (_, i) =>
  item(`w${i}`, Math.round(1000 * Math.pow(1.09, i))),
);
/** Densely spaced, so even the 3% band is satisfiable. */
const DENSE: ContentItem[] = Array.from({ length: 200 }, (_, i) =>
  item(`d${i}`, Math.round(10_000 * Math.pow(1.012, i))),
);

function poolFor(d: HiloDifficulty): ContentItem[] {
  return d === 'hard' || d === 'insane' ? DENSE : WIDE;
}

const DIFFICULTIES = Object.keys(HILO_BANDS) as HiloDifficulty[];
const CHANCE = 0.5;
const TOLERANCE = 0.05;

describe('no strategy without item knowledge beats chance', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`holds on ${difficulty}`, () => {
      const pool = poolFor(difficulty);
      const sorted = [...pool].map((p) => p.value).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const lowerQuartile = sorted[Math.floor(sorted.length / 4)];

      const strategies: Record<string, (a: number) => 'higher' | 'lower'> = {
        'always higher': () => 'higher',
        'always lower': () => 'lower',
        'mean reversion (vs median)': (a) => (a < median ? 'higher' : 'lower'),
        'mean reversion (vs lower quartile)': (a) => (a < lowerQuartile ? 'higher' : 'lower'),
        'trend following': (a) => (a < median ? 'lower' : 'higher'),
      };

      const wins: Record<string, number> = {};
      for (const name of Object.keys(strategies)) wins[name] = 0;
      let pairs = 0;

      for (let s = 0; s < 400; s++) {
        const built = buildSequence(pool, difficulty, 12, createRng(`h-${difficulty}-${s}`));
        for (let i = 1; i < built.steps.length; i++) {
          const a = built.steps[i - 1].item.value;
          const b = built.steps[i].item.value;
          const actual = directionOf(a, b);
          if (actual === 'same') continue;
          pairs++;
          for (const [name, strategy] of Object.entries(strategies)) {
            if (strategy(a) === actual) wins[name]++;
          }
        }
      }

      expect(pairs).toBeGreaterThan(3000);
      for (const [name, count] of Object.entries(wins)) {
        const rate = count / pairs;
        expect(
          Math.abs(rate - CHANCE),
          `"${name}" won ${(rate * 100).toFixed(1)}% of ${pairs} ${difficulty} pairs (chance 50%) — the chain is readable without knowing the items`,
        ).toBeLessThan(TOLERANCE);
      }
    });
  }
});

describe('bandFeasibility', () => {
  it('reports a band a pool cannot satisfy', () => {
    // WIDE's neighbours are 9% apart, so "within 3%" is impossible for every anchor
    expect(bandFeasibility(WIDE, HILO_BANDS.insane)).toBe(0);
  });

  it('reports a band a pool satisfies comfortably', () => {
    expect(bandFeasibility(DENSE, HILO_BANDS.insane)).toBeGreaterThan(0.9);
    expect(bandFeasibility(WIDE, HILO_BANDS.medium)).toBeGreaterThan(0.9);
  });

  it('is zero for a pool too small to pair', () => {
    expect(bandFeasibility([], HILO_BANDS.easy)).toBe(0);
    expect(bandFeasibility([item('a', 1)], HILO_BANDS.easy)).toBe(0);
  });
});

describe('feasibleDifficulties', () => {
  it('refuses to offer a difficulty the content cannot deliver', () => {
    const offered = feasibleDifficulties(WIDE);
    expect(offered).not.toContain('insane');
    expect(offered).toContain('medium');
  });

  it('offers the tight bands on a dense pool', () => {
    expect(feasibleDifficulties(DENSE)).toContain('insane');
  });

  it('offers nothing for an unusable pool', () => {
    expect(feasibleDifficulties([])).toEqual([]);
  });
});

describe('degradation stays rare on a pool that suits the band', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty} rarely degrades`, () => {
      const pool = poolFor(difficulty);
      let steps = 0;
      let degraded = 0;
      for (let s = 0; s < 200; s++) {
        const built = buildSequence(pool, difficulty, 12, createRng(`g-${difficulty}-${s}`));
        for (const step of built.steps) {
          steps++;
          if (step.degraded > 0) degraded++;
        }
      }
      expect(
        degraded / steps,
        `${difficulty} degraded on ${((degraded / steps) * 100).toFixed(1)}% of rounds`,
      ).toBeLessThan(0.15);
    });
  }
});
