import { describe, expect, it } from 'vitest';
import type { Round } from '@/types';
import { makeTrack } from './fixtures';
import { availableHints, coverBlur, hintText, maxHints, titleShape } from './hints';
import { normalizeSettings } from './presets';

const track = makeTrack({ id: 1, title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', releaseYear: 2019 });
const round = (over: Partial<Round> = {}): Round => ({
  index: 0,
  track,
  startOffset: 0,
  tryIndex: 0,
  guesses: [],
  hintsUsed: [],
  status: 'playing',
  score: 0,
  startedAt: 0,
  playsThisTry: 0,
  lockedOutPlayerIds: [],
  ...over,
});

describe('hints', () => {
  it('hintText per kind', () => {
    expect(hintText('year', track)).toBe('Released in 2019');
    expect(hintText('year', makeTrack({ releaseYear: undefined }))).toBeNull();
    expect(hintText('artistInitials', track)).toBe('Artist initials: T. W.');
    expect(hintText('coverPeek', track)).toBe('Cover peek unlocked');
    expect(hintText('coverPeek', makeTrack({ cover: '', coverBig: '' }))).toBeNull();
    expect(hintText('firstLetter', track)).toBe('Title: B_______ ______');
    expect(hintText('album', track)).toBe('From the album "After Hours"');
  });

  it('album hint is withheld when it would spoil the title', () => {
    expect(hintText('album', makeTrack({ title: 'Hello', album: 'Hello' }))).toBeNull();
    expect(hintText('album', makeTrack({ title: 'Hello', album: 'Hello - Single' }))).toBeNull();
    expect(hintText('album', makeTrack({ title: 'Hello', album: '' }))).toBeNull();
    expect(hintText('album', makeTrack({ title: 'Hello', album: '25' }))).toBe('From the album "25"');
  });

  it('titleShape keeps the first letter and word lengths', () => {
    expect(titleShape("Don't Stop Me Now")).toBe('D___ ____ __ ___');
    expect(titleShape('Levitating (feat. DaBaby)')).toBe('L_________');
  });

  it('maxHints = min(3, tries − 1), 0 when disabled', () => {
    expect(maxHints({ hintsEnabled: true, tries: 7 })).toBe(3);
    expect(maxHints({ hintsEnabled: true, tries: 3 })).toBe(2);
    expect(maxHints({ hintsEnabled: true, tries: 1 })).toBe(0);
    expect(maxHints({ hintsEnabled: false, tries: 7 })).toBe(0);
  });

  it('availableHints excludes used/unavailable kinds and respects the budget', () => {
    const settings = normalizeSettings({ mode: 'classic' });
    expect(availableHints(settings, round())).toEqual(['year', 'artistInitials', 'coverPeek', 'firstLetter', 'album']);
    expect(availableHints(settings, round({ hintsUsed: ['year'] }))).not.toContain('year');
    expect(availableHints(settings, round({ hintsUsed: ['year', 'album', 'coverPeek'] }))).toEqual([]);
    expect(availableHints(settings, round({ status: 'won' }))).toEqual([]);
    expect(availableHints(normalizeSettings({ mode: 'fixed', tries: 1 }), round())).toEqual([]);
    expect(availableHints(normalizeSettings({ hintsEnabled: false }), round())).toEqual([]);
    const noYear = round({ track: makeTrack({ releaseYear: undefined }) });
    expect(availableHints(settings, noYear)).not.toContain('year');
  });

  it('coverBlur: 1 at try 0, decreasing with tries, cut by coverPeek, 0 when over', () => {
    const settings = { tries: 4 };
    expect(coverBlur(round(), settings)).toBe(1);
    const t2 = coverBlur(round({ tryIndex: 2 }), settings);
    expect(t2).toBeLessThan(1);
    expect(t2).toBeGreaterThan(coverBlur(round({ tryIndex: 3 }), settings));
    expect(coverBlur(round({ hintsUsed: ['coverPeek'] }), settings)).toBeLessThan(0.5);
    expect(coverBlur(round({ hintsUsed: ['coverPeek'] }), settings)).toBeGreaterThanOrEqual(0.1);
    expect(coverBlur(round({ status: 'won' }), settings)).toBe(0);
    expect(coverBlur(round({ status: 'lost', tryIndex: 3 }), settings)).toBe(0);
  });
});
