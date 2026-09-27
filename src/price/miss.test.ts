import { describe, expect, it } from 'vitest';
import { describeMiss, missLine } from './miss';

describe('describeMiss', () => {
  it('says nothing for an exact guess', () => {
    expect(describeMiss(100, 100)).toBeNull();
  });

  it('uses a percentage while a percentage means something', () => {
    expect(describeMiss(112, 100)?.text).toBe('12% too high');
    expect(describeMiss(90, 100)?.text).toBe('10% too low');
  });

  it('switches to a multiple once the percentage stops reading', () => {
    expect(describeMiss(300, 100)?.text).toBe('3× too high');
    expect(describeMiss(100, 300)?.text).toBe('3× too low');
  });

  it('keeps one decimal only where it adds something', () => {
    expect(describeMiss(150, 100)?.text).toBe('1.5× too high');
    expect(describeMiss(2000, 100)?.text).toBe('20× too high');
  });

  it('gives up on numbers at the extremes rather than printing noise', () => {
    // the case that prompted this module: $120,000 for a $4 jar of peanut butter
    expect(describeMiss(120_000, 4)?.text).toBe('Wildly over');
    expect(describeMiss(4, 120_000)?.text).toBe('Wildly under');
  });

  it('never produces a percentage above 100 or a bare huge number', () => {
    for (const [g, a] of [
      [1, 1_000_000],
      [1_000_000, 1],
      [7, 3],
      [3, 7],
      [999_999, 2],
    ]) {
      const text = describeMiss(g, a)?.text ?? '';
      const pct = text.match(/^(\d+)%/);
      if (pct) expect(Number(pct[1])).toBeLessThanOrEqual(100);
      expect(text.length).toBeLessThan(24);
    }
  });

  it('reports the direction correctly', () => {
    expect(describeMiss(200, 100)?.high).toBe(true);
    expect(describeMiss(50, 100)?.high).toBe(false);
  });

  it('refuses unusable input rather than dividing by zero', () => {
    expect(describeMiss(5, 0)).toBeNull();
    expect(describeMiss(NaN, 100)).toBeNull();
    expect(describeMiss(5, Infinity)).toBeNull();
  });
});

describe('missLine', () => {
  it('reads as a sentence', () => {
    expect(missLine(120_000, 4, 'usd')).toBe('You said $120K — Wildly over');
    expect(missLine(4, 4, 'usd')).toBe('You said $4 — spot on');
  });
});
