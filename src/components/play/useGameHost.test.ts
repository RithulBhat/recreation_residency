import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { DEFAULT_PLAYERS, normalizeSettings } from '@/game/presets';
import { useGameStore } from '@/store/gameStore';
import type { GameState, Track } from '@/types';
import { diffGameEvents } from './gameEvents';
import { hostEventFor, useGameHost } from './useGameHost';

function track(id: number, title: string, artist: string): Track {
  return { id, title, titleFull: title, artist, artistId: id, album: 'A', albumId: id, cover: '', coverBig: '', preview: 'x', previewFetchedAt: 0, duration: 200, rank: 1, explicit: false };
}
const TRACKS = [track(1, 'Alpha', 'Ann'), track(2, 'Bravo', 'Bob'), track(3, 'Charlie', 'Cy')];

function start(overrides: Record<string, unknown> = {}): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 2, rounds: 2, seed: 'h', ...overrides });
  return reduce(createInitialState(), { type: 'start', settings, tracks: TRACKS, now: 1000 });
}

function kinds(prev: GameState, next: GameState): string[] {
  return diffGameEvents(prev, next)
    .map(hostEventFor)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => e.kind);
}

describe('hostEventFor', () => {
  it('announces game + round start', () => {
    expect(kinds(createInitialState(), start())).toEqual(['gameStart', 'roundStart']);
  });

  it('wrong with tries left → wrong; last wrong → reveal only', () => {
    const s = start();
    const one = reduce(s, { type: 'guess', text: 'nope', now: 2000 });
    expect(kinds(s, one)).toEqual(['wrong']);
    const two = reduce(one, { type: 'guess', text: 'nope', now: 3000 });
    expect(kinds(one, two)).toEqual(['reveal']);
  });

  it('correct → correct (with streak), then gameOver after the last next', () => {
    let s = start({ rounds: 1 });
    const won = reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 2000 });
    const events = diffGameEvents(s, won).map(hostEventFor);
    expect(events[0]).toMatchObject({ kind: 'correct', title: s.rounds[0].track.title, streak: 1, tryIndex: 0 });
    s = won;
    const done = reduce(s, { type: 'next', now: 3000 });
    expect(diffGameEvents(s, done).map(hostEventFor)).toEqual([{ kind: 'gameOver', score: won.totalScore, correct: 1, total: 1 }]);
  });

  it('partial, skip and timeout have their own lines', () => {
    const s = start({ guessTarget: 'both', tries: 3 });
    const partial = reduce(s, { type: 'guess', text: s.rounds[0].track.artist, now: 2000 });
    expect(kinds(s, partial)).toEqual(['partial']);
    const skipped = reduce(partial, { type: 'skip', now: 2500 });
    expect(kinds(partial, skipped)).toEqual(['skip']);
    const timeout = reduce(skipped, { type: 'timeout', now: 3000 });
    expect(kinds(skipped, timeout)).toEqual(['timeout', 'reveal']);
  });

  it('buzz names the player and the winner is announced at game over', () => {
    const s = start({ mode: 'duel', duelStyle: 'buzzer', rounds: 1, players: DEFAULT_PLAYERS.slice(0, 2) });
    const buzzed = reduce(s, { type: 'buzz', playerId: 'p2', now: 2000 });
    expect(diffGameEvents(s, buzzed).map(hostEventFor)).toEqual([{ kind: 'buzz', playerName: 'Octo' }]);
    const won = reduce(buzzed, { type: 'guess', text: s.rounds[0].track.title, playerId: 'p2', now: 2500 });
    const over = reduce(won, { type: 'next', now: 3000 });
    expect(diffGameEvents(won, over).map(hostEventFor)[0]).toMatchObject({ kind: 'gameOver', winnerName: 'Octo' });
  });

  it('blitz never asks the host to reveal', () => {
    const s = start({ mode: 'blitz', blitzDuration: 60, rounds: 0 });
    const n = reduce(s, { type: 'guess', text: 'nope', now: 2000 });
    expect(kinds(s, n)).toEqual(['wrong', 'roundStart']);
  });
});

/* ------------------------------ the hook itself ------------------------------ */

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text = '') {
    this.text = text;
  }
}

class FakeSynth extends EventTarget {
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  getVoices(): SpeechSynthesisVoice[] {
    return [];
  }
  speak(u: SpeechSynthesisUtterance): void {
    this.spoken.push(u as unknown as FakeUtterance);
  }
  cancel(): void {
    this.cancelCalls += 1;
  }
  pause(): void {}
  resume(): void {}
}

describe('useGameHost', () => {
  let synth: FakeSynth;

  beforeEach(() => {
    synth = new FakeSynth();
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    window.SpeechSynthesisUtterance = FakeUtterance as unknown as typeof SpeechSynthesisUtterance;
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });

  it('speaks the opening lines through the host that survives a StrictMode remount, then keeps reacting', () => {
    const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 2, rounds: 2, seed: 'strict', voiceHost: true });
    act(() => useGameStore.getState().start(settings, TRACKS, 1000));

    const { result } = renderHook(() => useGameHost(), { wrapper: StrictMode });
    expect(result.current.enabled).toBe(true);
    const opening = result.current.line;
    expect(opening).not.toBe('');
    // The controller created by the simulated remount is the one talking — so the line is audible,
    // not cancelled by the simulated unmount (audit P3-11).
    expect(result.current.speaking).toBe(true);
    expect(synth.spoken.at(-1)?.text).toBe(opening);

    // The fake synth never finishes on its own; end the opening line so the next one can be spoken.
    act(() => synth.spoken.at(-1)?.onend?.());
    act(() => useGameStore.getState().skip(2000));
    expect(result.current.line).not.toBe(opening);
    expect(synth.spoken.at(-1)?.text).toBe(result.current.line);
  });

  it('stays quiet when the game has the host off', () => {
    const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 2, rounds: 2, seed: 'quiet', voiceHost: false });
    act(() => useGameStore.getState().start(settings, TRACKS, 1000));
    const { result } = renderHook(() => useGameHost(), { wrapper: StrictMode });
    expect(result.current.enabled).toBe(false);
    expect(result.current.line).toBe('');
    expect(synth.spoken).toHaveLength(0);
  });
});
