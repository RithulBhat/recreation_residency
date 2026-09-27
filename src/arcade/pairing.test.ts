import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from './types';
import {
  HILO_BANDS,
  buildSequence,
  directionOf,
  isTooClose,
  pickPartner,
  ratioOf,
  relaxationLadder,
  withinBand,
} from './pairing';

function item(id: string, value: number): ContentItem {
  return {
    id,
    name: id,
    category: 'test',
    value,
    unit: 'count',
    source: 'test',
    asOf: '2026-09-27',
    verified: true,
  };
}

/** A pool with a wide spread, so every band has something to find. */
const SPREAD: readonly ContentItem[] = [
  item('a', 1),
  item('b', 1.02),
  item('c', 1.08),
  item('d', 1.4),
  item('e', 3),
  item('f', 10),
  item('g', 100),
  item('h', 1000),
];

describe('ratioOf', () => {
  it('is always >= 1 regardless of argument order', () => {
    expect(ratioOf(10, 5)).toBe(2);
    expect(ratioOf(5, 10)).toBe(2);
  });

  it('treats two zeros as identical', () => {
    expect(ratioOf(0, 0)).toBe(1);
  });

  it('has no finite ratio against a lone zero', () => {
    expect(ratioOf(0, 5)).toBe(Infinity);
  });

  it('rejects non-finite input', () => {
    expect(ratioOf(NaN, 1)).toBe(Infinity);
  });
});

describe('HILO_BANDS', () => {
  it('encodes the difficulty rules from the brief', () => {
    expect(HILO_BANDS.easy.min).toBe(2);
    expect(HILO_BANDS.hard.max).toBeCloseTo(1.1);
    expect(HILO_BANDS.insane.max).toBeCloseTo(1.03);
  });

  it('separates wide-gap from narrow-gap difficulties', () => {
    expect(withinBand(ratioOf(1, 4), HILO_BANDS.easy)).toBe(true);
    expect(withinBand(ratioOf(1, 4), HILO_BANDS.insane)).toBe(false);
    expect(withinBand(ratioOf(1, 1.02), HILO_BANDS.insane)).toBe(true);
    expect(withinBand(ratioOf(1, 1.02), HILO_BANDS.easy)).toBe(false);
  });

  it('caps the wide bands as well as flooring them', () => {
    // Left open at the top, a low anchor's only legal partners are dearer ones, so the chain
    // pins against the ceiling of the pool where the answer is forced. See pairing.strategies.
    expect(Number.isFinite(HILO_BANDS.easy.max)).toBe(true);
    expect(Number.isFinite(HILO_BANDS.medium.max)).toBe(true);
    expect(withinBand(ratioOf(1, 50), HILO_BANDS.easy)).toBe(false);
  });
});

describe('relaxationLadder', () => {
  it('starts at the requested band', () => {
    expect(relaxationLadder(HILO_BANDS.insane)[0]).toEqual(HILO_BANDS.insane);
  });

  it('always ends unconstrained, so it can never run out', () => {
    for (const band of Object.values(HILO_BANDS)) {
      const last = relaxationLadder(band).at(-1);
      expect(last).toEqual({ min: 1, max: Infinity });
    }
  });

  it('widens the ceiling monotonically for narrow bands', () => {
    const ladder = relaxationLadder(HILO_BANDS.insane);
    const maxes = ladder.map((b) => b.max);
    for (let i = 1; i < maxes.length; i++) expect(maxes[i]).toBeGreaterThan(maxes[i - 1]);
  });

  it('lowers the floor monotonically for wide bands', () => {
    const ladder = relaxationLadder(HILO_BANDS.easy);
    const mins = ladder.map((b) => b.min);
    for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeLessThanOrEqual(mins[i - 1]);
  });

  it('terminates for every band rather than looping', () => {
    for (const band of Object.values(HILO_BANDS)) {
      expect(relaxationLadder(band).length).toBeLessThan(40);
    }
  });
});

describe('pickPartner', () => {
  it('honours the band without degrading when the pool allows', () => {
    const rng = createRng('seed-1');
    const got = pickPartner(SPREAD, item('anchor', 1), HILO_BANDS.easy, rng);
    expect(got).not.toBeNull();
    expect(got?.degraded).toBe(0);
    expect(ratioOf(1, got?.item.value ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('degrades rather than failing when nothing fits the band', () => {
    // every candidate is >= 10x from the anchor, so "within 3%" is impossible
    const far = [item('x', 10), item('y', 100), item('z', 1000)];
    const got = pickPartner(far, item('anchor', 1), HILO_BANDS.insane, createRng('s'));
    expect(got).not.toBeNull();
    expect(got?.degraded).toBeGreaterThan(0);
  });

  it('returns null only when every item is used or is the anchor', () => {
    const used = new Set(SPREAD.map((i) => i.id));
    expect(pickPartner(SPREAD, item('anchor', 1), HILO_BANDS.easy, createRng('s'), used)).toBeNull();
  });

  it('never returns the anchor itself', () => {
    const anchor = SPREAD[0];
    for (let i = 0; i < 50; i++) {
      const got = pickPartner(SPREAD, anchor, HILO_BANDS.medium, createRng(`s-${i}`));
      expect(got?.item.id).not.toBe(anchor.id);
    }
  });

  it('never returns an already-used item', () => {
    const used = new Set(['e', 'f', 'g', 'h']);
    for (let i = 0; i < 50; i++) {
      const got = pickPartner(SPREAD, item('anchor', 1), HILO_BANDS.easy, createRng(`u-${i}`), used);
      expect(used.has(got?.item.id ?? '')).toBe(false);
    }
  });

  it('always produces a pair for every difficulty on a hostile pool', () => {
    // all values identical: no band demanding separation can ever be satisfied
    const flat = [item('p', 7), item('q', 7), item('r', 7)];
    for (const key of Object.keys(HILO_BANDS) as (keyof typeof HILO_BANDS)[]) {
      const got = pickPartner(flat, item('anchor', 7), HILO_BANDS[key], createRng(key));
      expect(got, `difficulty ${key} produced no pair`).not.toBeNull();
    }
  });

  it('is deterministic for a given seed', () => {
    const a = pickPartner(SPREAD, item('anchor', 1), HILO_BANDS.medium, createRng('fixed'));
    const b = pickPartner(SPREAD, item('anchor', 1), HILO_BANDS.medium, createRng('fixed'));
    expect(a?.item.id).toBe(b?.item.id);
  });
});

describe('buildSequence', () => {
  it('produces the requested length when the pool is big enough', () => {
    const built = buildSequence(SPREAD, 'medium', 5, createRng('seq'));
    expect(built.steps).toHaveLength(5);
    expect(built.exhausted).toBe(false);
  });

  it('never repeats an item within a run', () => {
    const built = buildSequence(SPREAD, 'medium', 8, createRng('seq'));
    const ids = built.steps.map((s) => s.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('degrades gracefully instead of throwing when the pool runs dry', () => {
    const built = buildSequence(SPREAD, 'easy', 999, createRng('seq'));
    expect(built.exhausted).toBe(true);
    expect(built.steps.length).toBeLessThanOrEqual(SPREAD.length);
    expect(built.steps.length).toBeGreaterThan(0);
  });

  it('is fully reproducible from a seed — the basis of daily and duel fairness', () => {
    const a = buildSequence(SPREAD, 'hard', 6, createRng('daily-2026-09-27'));
    const b = buildSequence(SPREAD, 'hard', 6, createRng('daily-2026-09-27'));
    expect(a.steps.map((s) => s.item.id)).toEqual(b.steps.map((s) => s.item.id));
  });

  it('gives a different sequence for a different seed', () => {
    const a = buildSequence(SPREAD, 'medium', 6, createRng('seed-a'));
    const b = buildSequence(SPREAD, 'medium', 6, createRng('seed-b'));
    expect(a.steps.map((s) => s.item.id)).not.toEqual(b.steps.map((s) => s.item.id));
  });

  it('reports zero degradation on a pool that comfortably fits the band', () => {
    // inside easy's [2, 8] band at every hop
    const wide = [item('a', 1), item('b', 3), item('c', 9), item('d', 27)];
    const built = buildSequence(wide, 'easy', 3, createRng('w'));
    expect(built.totalDegraded).toBe(0);
  });

  it('degrades, rather than failing, when every hop exceeds the band cap', () => {
    const scattered = [item('a', 1), item('b', 100), item('c', 10_000)];
    const built = buildSequence(scattered, 'easy', 3, createRng('w'));
    expect(built.steps).toHaveLength(3);
    expect(built.totalDegraded).toBeGreaterThan(0);
  });

  it('handles an empty pool and a zero length without throwing', () => {
    expect(buildSequence([], 'easy', 5, createRng('e')).steps).toHaveLength(0);
    expect(buildSequence(SPREAD, 'easy', 0, createRng('e')).steps).toHaveLength(0);
  });
});

describe('directionOf', () => {
  it('reads the move from A to B', () => {
    expect(directionOf(1, 2)).toBe('higher');
    expect(directionOf(2, 1)).toBe('lower');
    expect(directionOf(2, 2)).toBe('same');
  });
});

describe('isTooClose', () => {
  it('uses a ratio tolerance, not an absolute gap', () => {
    expect(isTooClose(100, 100.5, 0.01)).toBe(true);
    expect(isTooClose(100, 120, 0.01)).toBe(false);
    // the same absolute gap on a much larger pair is well within tolerance
    expect(isTooClose(1_000_000, 1_000_020, 0.01)).toBe(true);
  });

  it('falls back to exact equality at zero tolerance', () => {
    expect(isTooClose(5, 5, 0)).toBe(true);
    expect(isTooClose(5, 5.0001, 0)).toBe(false);
  });
});
