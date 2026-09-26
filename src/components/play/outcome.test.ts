import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import type { GameState } from '@/types';
import { clubStampFor, isPerfectRound, outcomeLabel } from './outcome';

const TRACKS = [makeTrack({ id: 1, title: 'Alpha' }), makeTrack({ id: 2, title: 'Bravo' }), makeTrack({ id: 3, title: 'Charlie' })];

function start(overrides: Record<string, unknown> = {}): GameState {
  const settings = normalizeSettings({ mode: 'classic', clipMode: 'escalating', stages: [0.1, 0.3, 1], rounds: 3, seed: 'o', ...overrides });
  return reduce(createInitialState(), { type: 'start', settings, tracks: TRACKS, now: 1000 });
}

describe('outcomeLabel', () => {
  it('is null while the round is open, and names the outcome once it is over', () => {
    const s = start();
    expect(outcomeLabel(s.rounds[0])).toBeNull();
    const won = reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    expect(outcomeLabel(won.rounds[0])).toEqual({ text: 'Nailed it', tone: 'success', clip: '0.1s' });
    const lost = reduce(s, { type: 'giveUp', now: 2000 });
    expect(outcomeLabel(lost.rounds[0])).toEqual({ text: 'The answer', tone: 'muted' });
  });

  it('gives artist credit its own label', () => {
    const s = start({ guessTarget: 'both', clipMode: 'fixed', clipLength: 1, tries: 2, mode: 'fixed' });
    const partial = reduce(s, { type: 'guess', text: s.rounds[0].track.artist, now: 2000 });
    const over = reduce(partial, { type: 'giveUp', now: 3000 });
    expect(outcomeLabel(over.rounds[0])).toEqual({ text: 'Artist credit', tone: 'warn' });
  });
});

describe('isPerfectRound / clubStampFor', () => {
  it('needs a first-try win at the shortest clip of the run', () => {
    const s = start();
    const first = reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    expect(isPerfectRound(first.rounds[0], first.settings)).toBe(true);
    const skipped = reduce(s, { type: 'skip', now: 1500 });
    const second = reduce(skipped, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    expect(isPerfectRound(second.rounds[0], second.settings)).toBe(false);
    expect(clubStampFor(second, 4)).toBeNull();
  });

  it('counts the lifetime tally plus this game, and reports the clip and score', () => {
    const s = start();
    const won = reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    expect(clubStampFor(won, 0)).toEqual({ clip: 0.1, score: won.rounds[0].score, count: 1 });
    const next = reduce(won, { type: 'next', now: 3000 });
    const wonAgain = reduce(next, { type: 'guess', text: next.rounds[1].track.title, now: 4000 });
    expect(clubStampFor(wonAgain, 5)?.count).toBe(7);
    // A fixed-clip run: the only clip length is the shortest one.
    const fixed = start({ mode: 'fixed', clipMode: 'fixed', clipLength: 2, tries: 3 });
    const fixedWin = reduce(fixed, { type: 'guess', text: fixed.rounds[0].track.title, now: 2000 });
    expect(clubStampFor(fixedWin, 0)?.clip).toBe(2);
  });
});
