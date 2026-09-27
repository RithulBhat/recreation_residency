/**
 * CHARACTERISATION TEST for the `standard` session format.
 *
 * Written against the engine as it behaved BEFORE session formats existed, and kept as the
 * regression guard for them: `standard` is the default, so every assertion here must stay true no
 * matter what `blitz` / `survival` / `gauntlet` / `duel` / `party` need.
 *
 * `trace()` produces a one-line-per-step digest of a scripted, seeded run. The expected string is
 * the engine's own pre-format output — if a format refactor shifts a score, a rung, a streak or a
 * status by one, this test fails with a readable diff instead of a vague "something changed".
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, hasSeenRound, reduce } from './engine';
import { DEFAULT_SCOUT_SETTINGS, normalizeScoutSettings } from './presets';
import { buildPool } from './subjects';
import { fixtureBundle } from './fixtures';
import { canGuess, currentRound, isRoundOver, progress, timeLeftMs, triesLeft } from './selectors';
import type { ScoutAction, ScoutSettings, ScoutState, ScoutSubject } from './types';

const T0 = 1_000_000;

function s(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return normalizeScoutSettings(over);
}

function pool(settings: ScoutSettings): ScoutSubject[] {
  return buildPool(fixtureBundle(), settings, createRng(settings.seed ?? 'pool-rng'));
}

function start(over: Partial<ScoutSettings> = {}, now = T0, subjects?: ScoutSubject[]): ScoutState {
  const settings = s(over);
  return reduce(
    createInitialScoutState(),
    { type: 'start', settings, subjects: subjects ?? pool(settings), now },
    createRng(settings.seed ?? 'run-rng'),
  );
}

function answer(state: ScoutState): string {
  const r = currentRound(state);
  if (!r) throw new Error('no round');
  return r.subject.name;
}

/** One digest line per step: what the screens would be showing after it. */
function line(state: ScoutState): string {
  const r = currentRound(state);
  const parts = [
    state.status,
    `r=${state.currentRound}`,
    `try=${r?.tryIndex ?? '-'}`,
    `rungs=${r?.stages.length ?? '-'}`,
    `left=${triesLeft(state)}`,
    `st=${r?.status ?? '-'}`,
    `score=${r?.score ?? '-'}`,
    `total=${state.totalScore}`,
    `streak=${state.streak}/${state.bestStreak}`,
    `end=${state.endReason ?? '-'}`,
  ];
  return parts.join(' ');
}

/**
 * A scripted seeded run: miss, skip, solve, give up, time out, solve again, to the round limit.
 * Times are fixed so the time bonus is part of the golden numbers.
 */
function trace(): string {
  const settings = s({ seed: 'characterise', mode: 'silhouette', packIds: ['superstars'], tries: 4, rounds: 4, roundTimer: 20 });
  let st = reduce(
    createInitialScoutState(),
    { type: 'start', settings, subjects: pool(settings), now: T0 },
    createRng(settings.seed),
  );
  const out: string[] = [`start ${line(st)}`];
  const step = (label: string, action: ScoutAction): void => {
    const before = st;
    st = reduce(st, action);
    out.push(`${label}${st === before ? ' [noop]' : ''} ${line(st)}`);
  };

  // round 0: wrong, skip, then solve on rung 2
  step('tick', { type: 'tick', now: T0 + 1_000 });
  step('wrong', { type: 'guess', text: 'nobody at all', now: T0 + 2_000 });
  step('skip', { type: 'skip', now: T0 + 3_000 });
  step('solve', { type: 'guess', text: answer(st), now: T0 + 4_000 });
  step('next', { type: 'next', now: T0 + 5_000 });

  // round 1: solved instantly, on the streak
  step('tick', { type: 'tick', now: T0 + 6_000 });
  step('solve', { type: 'guess', text: answer(st), now: T0 + 6_100 });
  step('next', { type: 'next', now: T0 + 7_000 });

  // round 2: given up
  step('giveUp', { type: 'giveUp', now: T0 + 8_000 });
  step('next', { type: 'next', now: T0 + 9_000 });

  // round 3: timed out by the clock, which ends the run at the round limit
  step('tick', { type: 'tick', now: T0 + 10_000 });
  step('tick', { type: 'tick', now: T0 + 31_000 });
  step('next', { type: 'next', now: T0 + 32_000 });
  return out.join('\n');
}

const GOLDEN_TRACE = [
  'start playing r=0 try=0 rungs=4 left=4 st=playing score=0 total=0 streak=0/0 end=-',
  'tick playing r=0 try=0 rungs=4 left=4 st=playing score=0 total=0 streak=0/0 end=-',
  'wrong playing r=0 try=1 rungs=4 left=3 st=playing score=0 total=0 streak=0/0 end=-',
  'skip playing r=0 try=2 rungs=4 left=2 st=playing score=0 total=0 streak=0/0 end=-',
  'solve round-over r=0 try=2 rungs=4 left=0 st=won score=934 total=934 streak=1/1 end=-',
  'next playing r=1 try=0 rungs=4 left=4 st=playing score=0 total=934 streak=1/1 end=-',
  'tick playing r=1 try=0 rungs=4 left=4 st=playing score=0 total=934 streak=1/1 end=-',
  'solve round-over r=1 try=0 rungs=4 left=0 st=won score=1495 total=2429 streak=2/2 end=-',
  'next playing r=2 try=0 rungs=4 left=4 st=playing score=0 total=2429 streak=2/2 end=-',
  'giveUp round-over r=2 try=0 rungs=4 left=0 st=lost score=0 total=2429 streak=0/2 end=-',
  'next playing r=3 try=0 rungs=4 left=4 st=playing score=0 total=2429 streak=0/2 end=-',
  'tick playing r=3 try=0 rungs=4 left=4 st=playing score=0 total=2429 streak=0/2 end=-',
  'tick round-over r=3 try=0 rungs=4 left=0 st=lost score=0 total=2429 streak=0/2 end=-',
  'next finished r=3 try=0 rungs=4 left=0 st=lost score=0 total=2429 streak=0/2 end=rounds',
].join('\n');

describe('standard format — golden trace', () => {
  it('replays the pre-format engine step for step', () => {
    expect(trace()).toBe(GOLDEN_TRACE);
  });

  it('is stable across repeats', () => {
    expect(trace()).toBe(trace());
  });
});

describe('standard format — invariants that must never regress', () => {
  it('defaults to the standard shape: N rounds, T tries, no clock', () => {
    expect(DEFAULT_SCOUT_SETTINGS.tries).toBe(5);
    expect(DEFAULT_SCOUT_SETTINGS.rounds).toBe(10);
    expect(DEFAULT_SCOUT_SETTINGS.roundTimer).toBe(0);
    const st = start();
    expect(st.rounds[0].stages).toHaveLength(5);
    expect(st.rounds[0].tryIndex).toBe(0);
    // `total` is capped by the pool, so it is derived rather than hard-coded.
    expect(progress(st)).toEqual({ round: 1, total: Math.min(10, pool(s()).length) });
  });

  it('builds exactly `tries` rungs and loses on the `tries`-th miss', () => {
    for (const tries of [1, 2, 3, 4, 5, 6]) {
      let st = start({ tries, rounds: 1 });
      expect(st.rounds[0].stages).toHaveLength(tries);
      for (let i = 0; i < tries; i++) {
        expect(triesLeft(st)).toBe(tries - i);
        st = reduce(st, { type: 'guess', text: 'wrong every time', now: T0 + i });
      }
      expect(st.status).toBe('round-over');
      expect(currentRound(st)?.status).toBe('lost');
      expect(currentRound(st)?.guesses).toHaveLength(tries);
    }
  });

  it('goes through round-over between every round (never auto-advances)', () => {
    let st = start({ rounds: 3, tries: 2 });
    for (let i = 0; i < 3; i++) {
      expect(st.status).toBe('playing');
      st = reduce(st, { type: 'giveUp', now: T0 + i * 10 });
      expect(st.status).toBe('round-over');
      expect(isRoundOver(st)).toBe(true);
      expect(canGuess(st)).toBe(false);
      st = reduce(st, { type: 'next', now: T0 + i * 10 + 1 });
    }
    expect(st.status).toBe('finished');
    expect(st.endReason).toBe('rounds');
  });

  it('keeps one implicit scoreboard: totalScore, streak, bestStreak', () => {
    let st = start({ rounds: 3, tries: 2 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 1 });
    const first = st.totalScore;
    expect(first).toBeGreaterThan(0);
    expect(st.streak).toBe(1);
    st = reduce(st, { type: 'next', now: T0 + 2 });
    st = reduce(st, { type: 'guess', text: answer(st), now: T0 + 3 });
    expect(st.totalScore).toBeGreaterThan(first);
    expect(st.streak).toBe(2);
    expect(st.bestStreak).toBe(2);
    st = reduce(st, { type: 'next', now: T0 + 4 });
    st = reduce(st, { type: 'giveUp', now: T0 + 5 });
    expect(st.streak).toBe(0);
    expect(st.bestStreak).toBe(2);
  });

  it('has no clock of its own; the round timer starts on the first tick', () => {
    const noTimer = start({ roundTimer: 0 });
    expect(timeLeftMs(noTimer, T0)).toBeNull();
    const timed = start({ roundTimer: 15 });
    expect(hasSeenRound(timed.rounds[0])).toBe(false);
    expect(timeLeftMs(timed, T0 + 500_000)).toBe(15_000);
    const seen = reduce(timed, { type: 'tick', now: T0 + 500_000 });
    expect(timeLeftMs(seen, T0 + 500_000)).toBe(15_000);
    expect(timeLeftMs(seen, T0 + 505_000)).toBe(10_000);
  });

  it('returns the same reference for every invalid action', () => {
    const idle = createInitialScoutState();
    const invalid: ScoutAction[] = [
      { type: 'guess', text: 'x', now: T0 },
      { type: 'skip', now: T0 },
      { type: 'giveUp', now: T0 },
      { type: 'timeout', now: T0 },
      { type: 'next', now: T0 },
      { type: 'tick', now: T0 },
      { type: 'quit', now: T0 },
    ];
    for (const a of invalid) expect(reduce(idle, a)).toBe(idle);
    const playing = start();
    expect(reduce(playing, { type: 'guess', text: '  ', now: T0 })).toBe(playing);
    expect(reduce(playing, { type: 'next', now: T0 })).toBe(playing);
    const finished = reduce(playing, { type: 'quit', now: T0 + 1 });
    for (const a of invalid) expect(reduce(finished, a)).toBe(finished);
  });

  it('ends for exactly three reasons', () => {
    const byRounds = (): ScoutState => {
      let st = start({ rounds: 1, tries: 1 });
      st = reduce(st, { type: 'giveUp', now: T0 + 1 });
      return reduce(st, { type: 'next', now: T0 + 2 });
    };
    expect(byRounds().endReason).toBe('rounds');
    expect(reduce(start(), { type: 'quit', now: T0 + 1 }).endReason).toBe('quit');
    expect(start({}, T0, []).endReason).toBe('queue-empty');
  });

  it('replays a seeded run byte for byte', () => {
    const run = (): ScoutState => {
      let st = start({ seed: 'replay-me', rounds: 3, tries: 3 });
      for (let i = 0; i < 3 && st.status !== 'finished'; i++) {
        st = reduce(st, { type: 'skip', now: T0 + i * 100 });
        st = reduce(st, { type: 'guess', text: answer(st), now: T0 + i * 100 + 5 });
        st = reduce(st, { type: 'next', now: T0 + i * 100 + 10 });
      }
      return st;
    };
    expect(run()).toEqual(run());
  });
});
