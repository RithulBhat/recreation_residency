import { describe, expect, it } from 'vitest';
import type { GameState, Track } from '@/types';
import { createInitialState, hasListened, reduce } from './engine';
import { makeTrack } from './fixtures';
import { DEFAULT_PLAYERS, normalizeSettings } from './presets';
import {
  activePlayer,
  canGuess,
  clipLengthFor,
  currentClipLength,
  currentRound,
  elapsedMs,
  isRoundOver,
  isTie,
  leader,
  livesLeft,
  nextClipLength,
  progress,
  standings,
  timeLeftMs,
  triesLeft,
} from './selectors';

const T0 = 1_700_000_000_000;
const pool: Track[] = [1, 2, 3, 4].map((id) => makeTrack({ id, title: `Song ${id}` }));
const begin = (over: Parameters<typeof normalizeSettings>[0], tracks = pool): GameState =>
  reduce(createInitialState(), { type: 'start', settings: normalizeSettings({ ...over, seed: 's' }), tracks, now: T0 });

describe('selectors', () => {
  it('handle the idle state gracefully', () => {
    const s = createInitialState();
    expect(currentRound(s)).toBeUndefined();
    expect(currentClipLength(s)).toBe(0.1);
    expect(nextClipLength(s)).toBeUndefined();
    expect(triesLeft(s)).toBe(0);
    expect(canGuess(s)).toBe(false);
    expect(isRoundOver(s)).toBe(false);
    expect(activePlayer(s)).toBeUndefined();
    expect(leader(s)).toBeUndefined();
    expect(progress(s)).toEqual({ round: 0, total: 10 });
    expect(timeLeftMs(s, T0)).toBeNull();
    expect(elapsedMs(s, T0)).toBe(0);
    expect(livesLeft(s)).toBeUndefined();
  });

  it('clipLengthFor covers fixed / escalating / blitz / survival', () => {
    const esc = normalizeSettings({ mode: 'classic', stages: [0.1, 1, 5] });
    expect(clipLengthFor(esc, 0)).toBe(0.1);
    expect(clipLengthFor(esc, 2)).toBe(5);
    expect(clipLengthFor(esc, 9)).toBe(5);
    const fixed = normalizeSettings({ mode: 'fixed', clipLength: 2 });
    expect(clipLengthFor(fixed, 3)).toBe(2);
    const blitz = normalizeSettings({ mode: 'blitz', clipLength: 1.5 });
    expect(clipLengthFor(blitz, 1)).toBe(1.5);
    const surv = normalizeSettings({ mode: 'survival', clipLength: 2 });
    expect(clipLengthFor(surv, 0, 0)).toBe(2);
    expect(clipLengthFor(surv, 0, 1)).toBe(1.7);
    expect(clipLengthFor(surv, 0, 30)).toBe(0.1);
  });

  it('current/next clip length and tries follow the round', () => {
    let s = begin({ mode: 'classic', stages: [0.1, 0.5, 2] });
    expect(currentClipLength(s)).toBe(0.1);
    expect(nextClipLength(s)).toBe(0.5);
    expect(triesLeft(s)).toBe(3);
    s = reduce(s, { type: 'skip', now: T0 + 1 });
    s = reduce(s, { type: 'skip', now: T0 + 2 });
    expect(currentClipLength(s)).toBe(2);
    expect(nextClipLength(s)).toBeUndefined();
    expect(triesLeft(s)).toBe(1);
    expect(canGuess(s)).toBe(true);
    s = reduce(s, { type: 'skip', now: T0 + 3 });
    expect(isRoundOver(s)).toBe(true);
    expect(canGuess(s)).toBe(false);
    expect(triesLeft(s)).toBe(0);
  });

  it('progress reports 1-based round and capped total; endless for blitz', () => {
    let s = begin({ mode: 'classic', rounds: 10 });
    expect(progress(s)).toEqual({ round: 1, total: 4 });
    s = reduce(s, { type: 'giveUp', now: T0 + 1 });
    s = reduce(s, { type: 'next', now: T0 + 2 });
    expect(progress(s)).toEqual({ round: 2, total: 4 });
    expect(progress(begin({ mode: 'classic', rounds: 2 }))).toEqual({ round: 1, total: 2 });
    expect(progress(begin({ mode: 'blitz' }))).toEqual({ round: 1, total: 0 });
    expect(progress(begin({ mode: 'survival', rounds: 0 }))).toEqual({ round: 1, total: 0 });
  });

  it('timeLeftMs tracks blitz clock and round timer', () => {
    const b = begin({ mode: 'blitz', blitzDuration: 30 });
    expect(timeLeftMs(b, T0 + 10000)).toBe(20000);
    expect(timeLeftMs(b, T0 + 40000)).toBe(0);
    let r = begin({ mode: 'classic', roundTimer: 20 });
    expect(timeLeftMs(r, T0 + 5000)).toBe(20000); // not listened yet: the ring stays full
    r = reduce(r, { type: 'play', now: T0 + 5000 });
    expect(timeLeftMs(r, T0 + 5000)).toBe(20000);
    expect(timeLeftMs(r, T0 + 9000)).toBe(16000);
    expect(elapsedMs(r, T0 + 7000)).toBe(2000);
    expect(timeLeftMs(begin({ mode: 'classic' }), T0)).toBeNull();
  });

  it('round-timer ring stays full until the first listen, in step with tick (P2-1)', () => {
    let s = begin({ mode: 'classic', roundTimer: 20 });
    expect(hasListened(currentRound(s)!)).toBe(false);
    // 25 s of reading the hints without pressing play: no drain, and tick does not time out
    expect(timeLeftMs(s, T0 + 25_000)).toBe(20_000);
    expect(reduce(s, { type: 'tick', now: T0 + 25_000 })).toBe(s);
    s = reduce(s, { type: 'play', now: T0 + 25_000 });
    expect(hasListened(currentRound(s)!)).toBe(true);
    expect(timeLeftMs(s, T0 + 25_000)).toBe(20_000);
    expect(timeLeftMs(s, T0 + 30_000)).toBe(15_000);
    expect(timeLeftMs(s, T0 + 50_000)).toBe(0);
    // acting on the round without playing (a skip) also starts the clock, as tick already assumes
    let k = begin({ mode: 'classic', roundTimer: 20 });
    k = reduce(k, { type: 'skip', now: T0 + 1000 });
    expect(hasListened(currentRound(k)!)).toBe(true);
    expect(timeLeftMs(k, T0 + 6000)).toBe(14_000);
  });

  it('activePlayer, leader, standings, tie, lives', () => {
    let s = begin({ mode: 'party', clipLength: 1, tries: 1, players: DEFAULT_PLAYERS.slice(0, 2) });
    expect(activePlayer(s)?.id).toBe('p1');
    expect(isTie(s)).toBe(true);
    s = reduce(s, { type: 'guess', text: currentRound(s)!.track.title, now: T0 + 1 });
    expect(leader(s)?.id).toBe('p1');
    expect(isTie(s)).toBe(false);
    expect(standings(s).map((p) => p.id)).toEqual(['p1', 'p2']);
    s = reduce(s, { type: 'next', now: T0 + 2 });
    expect(activePlayer(s)?.id).toBe('p2');

    const d = begin({ mode: 'duel', duelStyle: 'buzzer', players: DEFAULT_PLAYERS.slice(0, 2) });
    expect(canGuess(d)).toBe(false);
    expect(canGuess(reduce(d, { type: 'buzz', playerId: 'p2', now: T0 + 1 }))).toBe(true);
    expect(activePlayer(reduce(d, { type: 'buzz', playerId: 'p2', now: T0 + 1 }))?.id).toBe('p2');

    const sv = begin({ mode: 'survival', lives: 4 });
    expect(livesLeft(sv)).toBe(4);
  });
});
