import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { normalizeSettings } from '@/game/presets';
import type { GameState, Track } from '@/types';
import { breakdownFor, isLastRound, roundVerdict } from './RevealCard';
import { skipLabel } from './GuessBox';

function track(id: number, title: string): Track {
  return { id, title, titleFull: title, artist: 'Artist', artistId: id, album: 'A', albumId: id, cover: '', coverBig: '', preview: 'x', previewFetchedAt: 0, duration: 200, rank: 1, explicit: false };
}
const TRACKS = [track(1, 'Alpha'), track(2, 'Bravo'), track(3, 'Charlie')];

function start(overrides: Record<string, unknown> = {}): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 3, rounds: 2, seed: 'r', ...overrides });
  return reduce(createInitialState(), { type: 'start', settings, tracks: TRACKS, now: 1000 });
}

describe('RevealCard helpers', () => {
  it('breakdownFor mirrors the engine score of a won round', () => {
    const s = start();
    const won = reduce(s, { type: 'hint', kind: 'artistInitials', now: 1500 });
    const done = reduce(won, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    const b = breakdownFor(done, done.rounds[0]);
    expect(b).not.toBeNull();
    expect(b!.total).toBe(done.rounds[0].score);
    expect(b!.hintPenalty).toBeGreaterThan(0);
    expect(b!.tryFactor).toBe(1);
  });

  it('breakdownFor is null for a lost round', () => {
    const s = start();
    const lost = reduce(s, { type: 'giveUp', now: 2000 });
    expect(breakdownFor(lost, lost.rounds[0])).toBeNull();
  });

  it('roundVerdict distinguishes correct / wrong / skipped / timeout / partial', () => {
    const s = start({ guessTarget: 'both' });
    expect(roundVerdict(reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 2 }).rounds[0])).toBe('correct');
    expect(roundVerdict(reduce(s, { type: 'giveUp', now: 2 }).rounds[0])).toBe('skipped');
    expect(roundVerdict(reduce(s, { type: 'timeout', now: 2 }).rounds[0])).toBe('timeout');
    const wrongThenGiveUp = reduce(reduce(s, { type: 'guess', text: 'nope', now: 2 }), { type: 'giveUp', now: 3 });
    expect(roundVerdict(wrongThenGiveUp.rounds[0])).toBe('wrong');
    const partialThenGiveUp = reduce(reduce(s, { type: 'guess', text: 'Artist', now: 2 }), { type: 'giveUp', now: 3 });
    expect(roundVerdict(partialThenGiveUp.rounds[0])).toBe('partial');
  });

  it('isLastRound knows when Next ends the game', () => {
    const s = start({ rounds: 2 });
    const r1 = reduce(s, { type: 'giveUp', now: 2 });
    expect(isLastRound(r1)).toBe(false);
    const r2 = reduce(reduce(r1, { type: 'next', now: 3 }), { type: 'giveUp', now: 4 });
    expect(isLastRound(r2)).toBe(true);
    const survival = reduce(start({ mode: 'survival', lives: 1, rounds: 0 }), { type: 'giveUp', now: 2 });
    expect(isLastRound(survival)).toBe(true);
  });

  it('skipLabel says what a skip unlocks', () => {
    expect(skipLabel(start({ mode: 'classic', stages: [0.1, 0.3, 1] }))).toBe('Skip → 0.3s');
    expect(skipLabel(start({ tries: 3 }))).toBe('Skip try');
    expect(skipLabel(start({ tries: 1 }))).toBe('Skip · reveal');
    expect(skipLabel(start({ mode: 'blitz', rounds: 0 }))).toBe('Skip (−3s)');
  });
});
