import { describe, expect, it } from 'vitest';
import type { GameAction, GameSettings, GameState, Track } from '@/types';
import { createInitialState, reduce } from '@/game/engine';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import { currentRound } from '@/game/selectors';
import { finishedFrom, leadFrom, outcome, progressFrom } from './progress';
import type { FinishedMsg } from './protocol';

const T0 = 1_700_000_000_000;

const pool: Track[] = [
  makeTrack({ id: 1, title: 'Blinding Lights', artist: 'The Weeknd' }),
  makeTrack({ id: 2, title: 'Levitating', artist: 'Dua Lipa' }),
  makeTrack({ id: 3, title: 'Hello', artist: 'Adele' }),
];

function start(over: Partial<GameSettings> = {}): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', tries: 2, rounds: 3, seed: 'duel-seed', ...over });
  return reduce(createInitialState(), { type: 'start', settings, tracks: pool, now: T0 });
}

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce((s, a) => reduce(s, a), state);
}

describe('progressFrom', () => {
  it('reports a fresh game', () => {
    const s = start();
    expect(progressFrom(s, T0)).toEqual({
      type: 'progress',
      round: 1,
      score: 0,
      streak: 0,
      correct: 0,
      status: 'playing',
      lastVerdict: null,
      at: T0,
    });
  });

  it('reports an idle state as round 0', () => {
    expect(progressFrom(createInitialState(), T0).round).toBe(0);
  });

  it('carries score, streak, correct count and the last verdict after a win', () => {
    const s0 = start();
    const s = run(s0, { type: 'play', now: T0 }, { type: 'guess', text: currentRound(s0)!.track.title, now: T0 + 1200 });
    const msg = progressFrom(s, T0 + 1200);
    expect(msg.status).toBe('round-over');
    expect(msg.round).toBe(1);
    expect(msg.correct).toBe(1);
    expect(msg.streak).toBe(1);
    expect(msg.score).toBeGreaterThan(0);
    expect(msg.lastVerdict).toBe('correct');
    expect(Number.isInteger(msg.score)).toBe(true);
  });

  it('reports a wrong guess without inventing progress', () => {
    const s = run(start(), { type: 'play', now: T0 }, { type: 'guess', text: 'definitely not it', now: T0 + 500 });
    const msg = progressFrom(s, T0 + 500);
    expect(msg.lastVerdict).toBe('wrong');
    expect(msg.correct).toBe(0);
    expect(msg.streak).toBe(0);
    expect(msg.score).toBe(0);
  });

  it('advances the round number as the race goes on', () => {
    let s = start();
    s = run(s, { type: 'giveUp', now: T0 + 10 }, { type: 'next', now: T0 + 20 });
    expect(progressFrom(s, T0 + 20).round).toBe(2);
    expect(progressFrom(s, T0 + 20).lastVerdict).toBe('skipped');
  });
});

describe('finishedFrom', () => {
  it('summarises a completed game', () => {
    let s = start({ rounds: 1 });
    s = run(s, { type: 'play', now: T0 }, { type: 'guess', text: currentRound(s)!.track.title, now: T0 + 900 });
    s = run(s, { type: 'next', now: T0 + 1000 });
    expect(s.status).toBe('finished');
    const msg = finishedFrom(s, T0 + 1000);
    expect(msg.type).toBe('finished');
    expect(msg.rounds).toBe(1);
    expect(msg.correct).toBe(1);
    expect(msg.score).toBe(s.totalScore);
    expect(msg.durationMs).toBe(1000);
  });

  it('never reports a negative duration', () => {
    expect(finishedFrom(createInitialState(), T0).durationMs).toBe(0);
  });
});

describe('outcome', () => {
  const mine: FinishedMsg = { type: 'finished', score: 5000, correct: 5, rounds: 10, durationMs: 60_000 };

  it('is pending until both sides finish', () => {
    expect(outcome(null, null)).toBe('pending');
    expect(outcome(mine, null)).toBe('pending');
    expect(outcome(null, mine)).toBe('pending');
  });

  it('goes to the higher score', () => {
    expect(outcome(mine, { ...mine, score: 4999 })).toBe('win');
    expect(outcome(mine, { ...mine, score: 5001 })).toBe('loss');
  });

  it('breaks a score tie on correct answers, then on the faster run', () => {
    expect(outcome(mine, { ...mine, correct: 4 })).toBe('win');
    expect(outcome(mine, { ...mine, correct: 6 })).toBe('loss');
    expect(outcome(mine, { ...mine, durationMs: 70_000 })).toBe('win');
    expect(outcome(mine, { ...mine, durationMs: 50_000 })).toBe('loss');
  });

  it('is a tie only when everything matches', () => {
    expect(outcome(mine, { ...mine })).toBe('tie');
  });
});

describe('leadFrom', () => {
  it('compares live scores', () => {
    const p = progressFrom(start(), T0);
    expect(leadFrom(null, null)).toBe(0);
    expect(leadFrom({ ...p, score: 100 }, { ...p, score: 100 })).toBe(0);
    expect(leadFrom({ ...p, score: 200 }, { ...p, score: 100 })).toBe(1);
    expect(leadFrom({ ...p, score: 100 }, { ...p, score: 200 })).toBe(-1);
    expect(leadFrom({ ...p, score: 10 }, null)).toBe(1);
  });
});
