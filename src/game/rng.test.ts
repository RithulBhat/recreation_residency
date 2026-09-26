import { describe, expect, it } from 'vitest';
import { createRng, hashToUnit, mulberry32, xmur3 } from './rng';

describe('rng', () => {
  it('xmur3 is deterministic and differs per seed', () => {
    const a = xmur3('hello');
    const b = xmur3('hello');
    const c = xmur3('hellp');
    const a1 = a();
    expect(a1).toBe(b());
    expect(a1).not.toBe(c());
    expect(a()).not.toBe(a1);
  });

  it('mulberry32 yields floats in [0,1) deterministically', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(r2());
    }
  });

  it('seeded rng replays the same sequence, ints, picks, shuffles and ids', () => {
    const a = createRng('daily-2026-09-26');
    const b = createRng('daily-2026-09-26');
    expect(a.seed).toBe('daily-2026-09-26');
    const arr = Array.from({ length: 20 }, (_, i) => i);
    expect(a.next()).toBe(b.next());
    expect(a.int(1, 6)).toBe(b.int(1, 6));
    expect(a.pick(arr)).toBe(b.pick(arr));
    expect(a.shuffle(arr)).toEqual(b.shuffle(arr));
    expect(a.id()).toBe(b.id());
    expect(a.id()).toHaveLength(12);
  });

  it('different seeds produce different shuffles', () => {
    const arr = Array.from({ length: 30 }, (_, i) => i);
    expect(createRng('a').shuffle(arr)).not.toEqual(createRng('b').shuffle(arr));
  });

  it('shuffle is a permutation and does not mutate the input', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = arr.slice();
    const out = createRng('x').shuffle(arr);
    expect(arr).toEqual(copy);
    expect(out.slice().sort((x, y) => x - y)).toEqual(copy);
  });

  it('int is inclusive on both ends and covers the range', () => {
    const r = createRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([3, 4, 5]));
  });

  it('unseeded rng uses crypto randomness and is not repeatable', () => {
    const a = createRng();
    const b = createRng();
    expect(a.seed).toBeUndefined();
    const sa = Array.from({ length: 8 }, () => a.next());
    const sb = Array.from({ length: 8 }, () => b.next());
    expect(sa).not.toEqual(sb);
    expect(a.id()).not.toBe(b.id());
  });

  it('pick throws on empty arrays', () => {
    expect(() => createRng('e').pick([])).toThrow(RangeError);
  });

  it('hashToUnit is stable and in [0,1)', () => {
    expect(hashToUnit('k')).toBe(hashToUnit('k'));
    expect(hashToUnit('k')).not.toBe(hashToUnit('k2'));
    for (const k of ['a', 'b', 'c', 'game|0|123|0']) {
      const v = hashToUnit(k);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
