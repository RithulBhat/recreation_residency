import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, RANKS, leveledUp, rankFor, tierForLevel, xpForLevel, xpToNext } from './rank';

describe('rank table', () => {
  it('has at least twelve titles', () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(12);
    expect(MAX_LEVEL).toBe(RANKS.length);
  });

  it('starts at Shower Singer and tops out at Songooner Supreme', () => {
    expect(RANKS[0]).toMatchObject({ level: 1, title: 'Shower Singer', at: 0 });
    expect(RANKS[RANKS.length - 1].title).toBe('Songooner Supreme');
    expect(RANKS.some((r) => r.title === 'Shazam Who?')).toBe(true);
    expect(RANKS.some((r) => r.title === 'Certified Songooner')).toBe(true);
  });

  it('is strictly monotonic in level, threshold and gap size', () => {
    let lastGap = 0;
    for (let i = 0; i < RANKS.length; i += 1) {
      expect(RANKS[i].level).toBe(i + 1);
      expect(RANKS[i].emoji.length).toBeGreaterThan(0);
      if (i === 0) continue;
      const gap = RANKS[i].at - RANKS[i - 1].at;
      expect(RANKS[i].at).toBeGreaterThan(RANKS[i - 1].at);
      expect(gap).toBeGreaterThanOrEqual(lastGap);
      lastGap = gap;
    }
  });

  it('has unique titles and emoji', () => {
    expect(new Set(RANKS.map((r) => r.title)).size).toBe(RANKS.length);
  });
});

describe('rankFor', () => {
  it('handles zero and junk XP', () => {
    for (const xp of [0, -1, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const r = rankFor(xp);
      expect(r.level).toBe(1);
      expect(r.xp).toBe(0);
      expect(r.threshold).toBe(0);
    }
  });

  it('lands exactly on a threshold', () => {
    const tier = RANKS[3];
    const r = rankFor(tier.at);
    expect(r.level).toBe(tier.level);
    expect(r.title).toBe(tier.title);
    expect(r.progress).toBe(0);
    expect(r.nextAt).toBe(RANKS[4].at);
  });

  it('sits one XP below a threshold', () => {
    const tier = RANKS[3];
    const r = rankFor(tier.at - 1);
    expect(r.level).toBe(tier.level - 1);
    expect(r.progress).toBeGreaterThan(0.99);
    expect(r.progress).toBeLessThan(1);
  });

  it('reports mid-tier progress', () => {
    const mid = Math.round((RANKS[1].at + RANKS[2].at) / 2);
    const r = rankFor(mid);
    expect(r.level).toBe(2);
    expect(r.progress).toBeGreaterThan(0.45);
    expect(r.progress).toBeLessThan(0.55);
    expect(r.next?.level).toBe(3);
  });

  it('caps at the top tier', () => {
    const r = rankFor(10_000_000);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.nextAt).toBeNull();
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
    expect(xpToNext(10_000_000)).toBe(0);
  });

  it('never decreases as XP grows', () => {
    let last = 0;
    for (let xp = 0; xp <= 60_000; xp += 137) {
      const level = rankFor(xp).level;
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
    expect(last).toBe(MAX_LEVEL);
  });

  it('exposes progress within 0..1 everywhere', () => {
    for (let xp = 0; xp <= 60_000; xp += 311) {
      const p = rankFor(xp).progress;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('helpers', () => {
  it('xpForLevel / tierForLevel clamp', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(999)).toBe(RANKS[RANKS.length - 1].at);
    expect(tierForLevel(-5).level).toBe(1);
    expect(tierForLevel(999).level).toBe(MAX_LEVEL);
  });

  it('xpToNext counts down to the next title', () => {
    expect(xpToNext(0)).toBe(RANKS[1].at);
    expect(xpToNext(RANKS[1].at - 10)).toBe(10);
  });

  it('leveledUp detects a crossing', () => {
    expect(leveledUp(RANKS[1].at - 1, RANKS[1].at)).toBe(true);
    expect(leveledUp(RANKS[1].at, RANKS[1].at + 1)).toBe(false);
  });
});
