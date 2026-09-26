import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, reduce } from './engine';
import { normalizeScoutSettings } from './presets';
import { buildPool, buildPlayerSubject } from './subjects';
import { fixtureBundle, findFixturePlayer, findFixtureTeam } from './fixtures';
import {
  accuracy,
  allGuesses,
  canGuess,
  completedRounds,
  currentRound,
  currentStage,
  elapsedMs,
  isFinished,
  isRoundOver,
  lastGuess,
  lastVerdict,
  newlyRevealedClues,
  progress,
  revealedClues,
  stageAt,
  timeLeftMs,
  triesLeft,
  visualLevel,
  wasClose,
  wonRounds,
} from './selectors';
import type { ScoutSettings, ScoutState } from './types';

const T0 = 500_000;

function start(over: Partial<ScoutSettings> = {}): ScoutState {
  const settings = normalizeScoutSettings(over);
  const subjects = buildPool(fixtureBundle(), settings, createRng('pool'));
  return reduce(createInitialScoutState(), { type: 'start', settings, subjects, now: T0 }, createRng('run'));
}

describe('selectors on an idle state', () => {
  const idle = createInitialScoutState();
  it('never throws and returns empty defaults', () => {
    expect(currentRound(idle)).toBeUndefined();
    expect(currentStage(idle)).toBeUndefined();
    expect(revealedClues(idle)).toEqual([]);
    expect(newlyRevealedClues(idle)).toEqual([]);
    expect(visualLevel(idle)).toBe(0);
    expect(triesLeft(idle)).toBe(0);
    expect(canGuess(idle)).toBe(false);
    expect(isRoundOver(idle)).toBe(false);
    expect(isFinished(idle)).toBe(false);
    expect(timeLeftMs(idle, T0)).toBeNull();
    expect(elapsedMs(idle, T0)).toBe(0);
    expect(lastGuess(idle)).toBeUndefined();
    expect(lastVerdict(idle)).toBeUndefined();
    expect(wasClose(idle)).toBe(false);
    expect(completedRounds(idle)).toEqual([]);
    expect(wonRounds(idle)).toBe(0);
    expect(accuracy(idle)).toBe(0);
    expect(allGuesses(idle)).toEqual([]);
    expect(progress(idle)).toEqual({ round: 0, total: 10 });
  });
});

describe('stage selectors', () => {
  it('reads the current rung and clamps out-of-range indices', () => {
    const st = start({ tries: 4 });
    const round = currentRound(st)!;
    expect(currentStage(st)).toBe(round.stages[0]);
    expect(stageAt(round, -5)).toBe(round.stages[0]);
    expect(stageAt(round, 99)).toBe(round.stages[3]);
    expect(stageAt({ ...round, stages: [] }, 0)).toBeUndefined();
  });

  it('accumulates clues and reports only what a rung added', () => {
    // six tries = exactly one new clue per rung for the silhouette ladder
    let st = start({ tries: 6 });
    expect(revealedClues(st)).toEqual([]);
    expect(newlyRevealedClues(st)).toEqual([]);
    st = reduce(st, { type: 'skip', now: T0 + 1 });
    expect(revealedClues(st)).toHaveLength(1);
    expect(newlyRevealedClues(st)).toHaveLength(1);
    st = reduce(st, { type: 'skip', now: T0 + 2 });
    expect(revealedClues(st)).toHaveLength(2);
    expect(newlyRevealedClues(st).map((c) => c.label)).toEqual(['Conference']);
    expect(visualLevel(st)).toBeGreaterThan(0);
  });
});

describe('verdict selectors', () => {
  it('surfaces the last guess and the close nudge', () => {
    const justin = buildPlayerSubject(findFixturePlayer('Justin Jefferson'), findFixtureTeam('MIN'));
    const van = buildPlayerSubject(findFixturePlayer('Van Jefferson'), findFixtureTeam('SEA'));
    const settings = normalizeScoutSettings({ tries: 4 });
    let st = reduce(
      createInitialScoutState(),
      { type: 'start', settings, subjects: [justin, van], now: T0 },
      createRng('r'),
    );
    st = reduce(st, { type: 'guess', text: 'jefferson', now: T0 + 1 });
    expect(lastVerdict(st)).toBe('close');
    expect(wasClose(st)).toBe(true);
    expect(lastGuess(st)?.text).toBe('jefferson');
    st = reduce(st, { type: 'guess', text: 'nobody at all', now: T0 + 2 });
    expect(lastVerdict(st)).toBe('wrong');
    expect(wasClose(st)).toBe(false);
  });
});

describe('progress and totals', () => {
  it('counts rounds against the limit, or the pool when endless', () => {
    const limited = start({ rounds: 3 });
    expect(progress(limited).total).toBe(3);
    const endless = start({ rounds: 0 });
    expect(progress(endless).total).toBe(0);
    const pool = endless.rounds.length + endless.queue.length;
    const capped = start({ rounds: 500 });
    expect(progress(capped).total).toBeLessThanOrEqual(pool);
  });

  it('tracks wins, accuracy and every guess', () => {
    let st = start({ rounds: 3, tries: 3 });
    const target = currentRound(st)!.subject.name;
    st = reduce(st, { type: 'guess', text: 'wrong one', now: T0 + 1 });
    st = reduce(st, { type: 'guess', text: target, now: T0 + 2 });
    expect(wonRounds(st)).toBe(1);
    expect(accuracy(st)).toBe(1);
    expect(allGuesses(st)).toHaveLength(2);
    st = reduce(st, { type: 'next', now: T0 + 3 });
    st = reduce(st, { type: 'giveUp', now: T0 + 4 });
    expect(wonRounds(st)).toBe(1);
    expect(accuracy(st)).toBe(0.5);
    expect(completedRounds(st)).toHaveLength(2);
    expect(isRoundOver(st)).toBe(true);
  });

  it('elapsedMs measures from the first tick and freezes when the round ends', () => {
    let st = start({ roundTimer: 60 });
    expect(elapsedMs(st, T0 + 9_000)).toBe(9_000);
    st = reduce(st, { type: 'tick', now: T0 + 30_000 });
    expect(elapsedMs(st, T0 + 31_000)).toBe(1_000);
    st = reduce(st, { type: 'giveUp', now: T0 + 32_000 });
    expect(elapsedMs(st, T0 + 99_000)).toBe(2_000);
  });

  it('timeLeftMs stops once the run is over', () => {
    const st = reduce(start({ roundTimer: 30 }), { type: 'quit', now: T0 + 1 });
    expect(timeLeftMs(st, T0 + 2)).toBeNull();
    expect(isFinished(st)).toBe(true);
  });
});
