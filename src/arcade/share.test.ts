import { describe, expect, it } from 'vitest';
import { gridOf, renderShare, type ShareMark } from './share';
import { dailySeedFor, secondsUntilTomorrow } from './daily';

const marks = (n: number, m: ShareMark = 'great'): ShareMark[] => Array.from({ length: n }, () => m);

describe('gridOf', () => {
  it('renders one glyph per mark', () => {
    expect(gridOf(['great', 'miss', 'skip'])).toBe('🟩🟥⬜');
  });

  it('wraps long runs so they stay readable', () => {
    expect(gridOf(marks(25)).split('\n')).toHaveLength(3);
  });

  it('is empty for an empty run', () => {
    expect(gridOf([])).toBe('');
  });
});

describe('renderShare', () => {
  it('puts the headline first and the link last', () => {
    const text = renderShare({
      title: 'Price Guess — Daily 2026-09-27',
      subtitle: '7,420 points',
      marks: ['great', 'good'],
      url: 'https://example.com',
    });
    const lines = text.split('\n');
    expect(lines[0]).toContain('Daily');
    expect(lines[1]).toBe('7,420 points');
    expect(lines.at(-1)).toBe('https://example.com');
  });

  it('never leaks an answer — only glyphs, a score and a link', () => {
    const text = renderShare({
      title: 'Higher or Lower — Daily',
      subtitle: '12 in a row',
      marks: marks(12),
      url: 'https://example.com',
    });
    // no digits beyond the score line, no item names: the body is glyphs only
    const body = text.split('\n').slice(2).join('');
    expect(body.replace(/[🟩🟨🟧🟥⬜\s]/gu, '').replace('https://example.com', '')).toBe('');
  });

  it('works with no subtitle, no marks and no link', () => {
    expect(renderShare({ title: 'Just a title', marks: [] })).toBe('Just a title');
  });
});

describe('dailySeedFor', () => {
  it('is stable for a date and different per game', () => {
    expect(dailySeedFor('price', '2026-09-27')).toBe(dailySeedFor('price', '2026-09-27'));
    expect(dailySeedFor('price', '2026-09-27')).not.toBe(dailySeedFor('hilo', '2026-09-27'));
  });

  it('changes with the date', () => {
    expect(dailySeedFor('hilo', '2026-09-27')).not.toBe(dailySeedFor('hilo', '2026-09-28'));
  });
});

describe('secondsUntilTomorrow', () => {
  it('counts down to local midnight', () => {
    const at = new Date(2026, 8, 27, 23, 59, 30);
    expect(secondsUntilTomorrow(at)).toBe(30);
  });

  it('is never negative', () => {
    expect(secondsUntilTomorrow(new Date(2026, 8, 27, 0, 0, 0))).toBeGreaterThan(0);
  });
});
