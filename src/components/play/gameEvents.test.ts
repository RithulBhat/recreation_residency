import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { DEFAULT_PLAYERS, normalizeSettings } from '@/game/presets';
import type { GameState, Track } from '@/types';
import { diffGameEvents, initialGameEvents } from './gameEvents';

function track(id: number, title: string, artist = 'Artist'): Track {
  return {
    id,
    title,
    titleFull: title,
    artist,
    artistId: id,
    album: 'Album',
    albumId: id,
    cover: '',
    coverBig: '',
    preview: `https://cdn.example/${id}.mp3`,
    previewFetchedAt: Date.now(),
    duration: 200,
    rank: 1000 - id,
    explicit: false,
  };
}

const TRACKS = [track(1, 'Alpha'), track(2, 'Bravo'), track(3, 'Charlie'), track(4, 'Delta')];

function start(overrides: Record<string, unknown> = {}): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 2, rounds: 2, seed: 'x', ...overrides });
  return reduce(createInitialState(), { type: 'start', settings, tracks: TRACKS, now: 1000 });
}

describe('diffGameEvents', () => {
  it('emits gameStart + roundStart for a fresh game', () => {
    const s = start();
    const events = diffGameEvents(createInitialState(), s).map((e) => e.type);
    expect(events).toEqual(['gameStart', 'roundStart']);
  });

  it('emits a wrong guess with tries left', () => {
    const s = start();
    const n = reduce(s, { type: 'guess', text: 'nope', now: 2000 });
    const events = diffGameEvents(s, n);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'guess', triesLeft: 1 });
  });

  it('emits guess + roundOver when the round is lost, then roundStart after next', () => {
    let s = start();
    s = reduce(s, { type: 'guess', text: 'nope', now: 2000 });
    const lost = reduce(s, { type: 'guess', text: 'nope again', now: 3000 });
    expect(diffGameEvents(s, lost).map((e) => e.type)).toEqual(['guess', 'roundOver']);
    const opened = reduce(lost, { type: 'next', now: 4000 });
    expect(diffGameEvents(lost, opened).map((e) => e.type)).toEqual(['roundStart']);
  });

  it('emits correct guess, roundOver and finished on the last round', () => {
    let s = start({ rounds: 1 });
    const title = s.rounds[0].track.title;
    const won = reduce(s, { type: 'guess', text: title, now: 2000 });
    expect(diffGameEvents(s, won).map((e) => e.type)).toEqual(['guess', 'roundOver']);
    s = won;
    const done = reduce(s, { type: 'next', now: 3000 });
    expect(diffGameEvents(s, done).map((e) => e.type)).toEqual(['finished']);
  });

  it('emits a streak milestone at 3', () => {
    let s = start({ rounds: 5 });
    let prev = s;
    const types: string[] = [];
    for (let i = 0; i < 3; i++) {
      const title = s.rounds[s.currentRound].track.title;
      prev = s;
      s = reduce(s, { type: 'guess', text: title, now: 2000 + i });
      types.push(...diffGameEvents(prev, s).map((e) => e.type));
      prev = s;
      s = reduce(s, { type: 'next', now: 2500 + i });
      types.push(...diffGameEvents(prev, s).map((e) => e.type));
    }
    expect(types.filter((t) => t === 'streak')).toHaveLength(1);
  });

  it('emits buzz for a buzzer duel', () => {
    const s = start({ mode: 'duel', duelStyle: 'buzzer', players: DEFAULT_PLAYERS.slice(0, 2) });
    const buzzed = reduce(s, { type: 'buzz', playerId: 'p2', now: 2000 });
    const events = diffGameEvents(s, buzzed);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'buzz', player: { id: 'p2' } });
  });

  it('blitz: wrong guess yields guess, roundOver and the next roundStart in order', () => {
    const s = start({ mode: 'blitz', blitzDuration: 60, rounds: 0 });
    const n = reduce(s, { type: 'guess', text: 'nope', now: 2000 });
    expect(diffGameEvents(s, n).map((e) => e.type)).toEqual(['guess', 'roundOver', 'roundStart']);
  });

  it('initialGameEvents replays the start of an untouched first round only', () => {
    const s = start();
    expect(initialGameEvents(s).map((e) => e.type)).toEqual(['gameStart', 'roundStart']);
    const played = reduce(s, { type: 'play', now: 2000 });
    expect(initialGameEvents(played)).toEqual([]);
  });
});
