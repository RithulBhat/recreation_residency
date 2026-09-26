import { describe, expect, it } from 'vitest';
import { clipFactor, formatScore, scoreGuess, streakBonusFraction, timeBonusFraction, tryFactor } from './scoring';

describe('clipFactor', () => {
  it('matches the table at the anchor points', () => {
    expect(clipFactor(0.1)).toBe(1);
    expect(clipFactor(0.25)).toBe(0.85);
    expect(clipFactor(0.5)).toBe(0.7);
    expect(clipFactor(1)).toBe(0.55);
    expect(clipFactor(2)).toBe(0.42);
    expect(clipFactor(4)).toBe(0.3);
    expect(clipFactor(7)).toBe(0.22);
    expect(clipFactor(10)).toBe(0.15);
  });
  it('log-interpolates between points and is monotonic', () => {
    const mid = clipFactor(Math.sqrt(0.5 * 1)); // geometric midpoint of 0.5 and 1
    expect(mid).toBeCloseTo((0.7 + 0.55) / 2, 3);
    let prev = clipFactor(0.1);
    for (let x = 0.1; x <= 15; x += 0.1) {
      const v = clipFactor(x);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
  it('clamps outside 0.1–15', () => {
    expect(clipFactor(0.01)).toBe(1);
    expect(clipFactor(0)).toBe(1);
    expect(clipFactor(30)).toBe(0.1);
    expect(clipFactor(Number.NaN)).toBe(1);
  });
});

describe('tryFactor', () => {
  it('follows the table and plateaus', () => {
    expect([0, 1, 2, 3, 4, 5].map(tryFactor)).toEqual([1, 0.8, 0.65, 0.5, 0.4, 0.3]);
    expect(tryFactor(6)).toBe(0.3);
    expect(tryFactor(99)).toBe(0.3);
    expect(tryFactor(-1)).toBe(1);
  });
});

describe('bonuses', () => {
  it('time bonus: 25% up to 3 s, linear to 0 at 20 s', () => {
    expect(timeBonusFraction(0)).toBe(0.25);
    expect(timeBonusFraction(3000)).toBe(0.25);
    expect(timeBonusFraction(11500)).toBeCloseTo(0.125, 6);
    expect(timeBonusFraction(20000)).toBe(0);
    expect(timeBonusFraction(60000)).toBe(0);
  });
  it('streak bonus: 5% per streak, capped at 50%', () => {
    expect(streakBonusFraction(0)).toBe(0);
    expect(streakBonusFraction(3)).toBeCloseTo(0.15, 6);
    expect(streakBonusFraction(10)).toBe(0.5);
    expect(streakBonusFraction(40)).toBe(0.5);
  });
});

describe('scoreGuess', () => {
  const base = { clipLength: 0.1, tryIndex: 0, tries: 7, elapsedMs: 1000, hintsUsed: 0, streak: 0 };

  it('perfect first-try 0.1s guess with time bonus = 1250', () => {
    const b = scoreGuess(base);
    expect(b).toEqual({ base: 1000, clipFactor: 1, tryFactor: 1, timeBonus: 250, streakBonus: 0, hintPenalty: 0, total: 1250 });
  });

  it('applies clip and try factors', () => {
    const b = scoreGuess({ ...base, clipLength: 1, tryIndex: 3, elapsedMs: 30000 });
    // 1000 * 0.55 * 0.5 = 275
    expect(b.total).toBe(275);
    expect(b.timeBonus).toBe(0);
  });

  it('adds streak bonus and subtracts hint penalty', () => {
    const b = scoreGuess({ ...base, elapsedMs: 30000, streak: 4, hintsUsed: 2 });
    // raw 1000; streak +20% = 200; hints -30% = 300 → 900
    expect(b.streakBonus).toBe(200);
    expect(b.hintPenalty).toBe(300);
    expect(b.total).toBe(900);
  });

  it('partial is worth 30% of the total', () => {
    const full = scoreGuess({ ...base, elapsedMs: 30000 });
    const partial = scoreGuess({ ...base, elapsedMs: 30000, partial: true });
    expect(partial.total).toBe(Math.round(full.total * 0.3));
  });

  it('never goes negative and rounds to integers', () => {
    const b = scoreGuess({ ...base, elapsedMs: 30000, hintsUsed: 10 });
    expect(b.total).toBe(0);
    const c = scoreGuess({ ...base, clipLength: 0.3, elapsedMs: 5000, streak: 1 });
    expect(Number.isInteger(c.total)).toBe(true);
    expect(Number.isInteger(c.timeBonus)).toBe(true);
  });
});

describe('formatScore', () => {
  it('adds thousands separators', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1000)).toBe('1,000');
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatScore(-1234)).toBe('-1,234');
    expect(formatScore(12.6)).toBe('13');
  });
});
