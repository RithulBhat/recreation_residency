/**
 * The per-format copy is what the player actually reads at the end of a run, so it is pinned here
 * against REAL engine states rather than hand-built objects: start a run, play it out, read the line.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { createInitialScoutState, reduce } from '@/scout/engine';
import { normalizeScoutSettings } from '@/scout/presets';
import { currentRound } from '@/scout/selectors';
import { buildPool } from '@/scout/subjects';
import { fixtureBundle } from '@/scout/fixtures';
import { makePuzzleDataset } from '@/scout/puzzleTestFactory';
import { puzzleCards } from '@/scout/puzzles';
import type { ScoutSettings, ScoutState, ScoutSubject } from '@/scout/types';
import { BLITZ_PENALTY_SECONDS, pickedCardIds, scoutOutcome } from './formatCopy';

const T0 = 3_000_000;

function start(over: Partial<ScoutSettings>, subjects?: readonly ScoutSubject[], now = T0): ScoutState {
  const settings = normalizeScoutSettings({ seed: 'copy-seed', ...over });
  const pool = subjects ?? buildPool(fixtureBundle(), settings, createRng('copy-pool'));
  return reduce(
    createInitialScoutState(),
    { type: 'start', settings, subjects: pool.slice(), now },
    createRng('copy-run'),
  );
}

function name(state: ScoutState): string {
  const r = currentRound(state);
  if (!r) throw new Error('no live round');
  return r.subject.name;
}

function solve(state: ScoutState, now: number): ScoutState {
  return reduce(reduce(state, { type: 'guess', text: name(state), now }), { type: 'next', now: now + 1 });
}

describe('scoutOutcome', () => {
  it('blitz reads as a count against the clock', () => {
    let state = start({ format: 'blitz', mode: 'silhouette', blitzDuration: 90 });
    let now = T0;
    for (let i = 0; i < 3; i++) {
      state = reduce(state, { type: 'guess', text: name(state), now: (now += 100) });
    }
    state = reduce(state, { type: 'quit', now: now + 1 });
    const out = scoutOutcome(state);
    expect(out.format).toBe('blitz');
    expect(out.headline).toBe('3 in 90 seconds');
    expect(out.statLabel).toBe('named in 90s');
  });

  it('blitz names the price of the misses when the clock runs out', () => {
    let state = start({ format: 'blitz', mode: 'silhouette', blitzDuration: 60 });
    state = reduce(state, { type: 'giveUp', now: T0 + 100 });
    state = reduce(state, { type: 'tick', now: T0 + 120_000 });
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('time');
    const out = scoutOutcome(state);
    expect(out.headline).toBe('0 in 60 seconds');
    expect(out.detail).toContain(`${BLITZ_PENALTY_SECONDS}s`);
  });

  it('survival says how far you got and what got you', () => {
    let state = start({ format: 'survival', mode: 'silhouette', lives: 1, tries: 4 });
    let now = T0;
    state = solve(state, (now += 1000));
    state = reduce(state, { type: 'giveUp', now: (now += 1000) });
    state = reduce(state, { type: 'next', now: (now += 1) });
    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('lives');
    const out = scoutOutcome(state);
    expect(out.headline).toBe('You got to round 2 before the household names got you');
    expect(out.statLabel).toBe('rounds survived');
  });

  it('gauntlet counts franchises, not rounds', () => {
    let state = start({ format: 'gauntlet', mode: 'logoZoom', tries: 3 });
    let now = T0;
    state = solve(state, (now += 1000));
    state = reduce(state, { type: 'quit', now: now + 1 });
    const out = scoutOutcome(state);
    const total = state.gauntletTeamIds?.length ?? 0;
    expect(total).toBeGreaterThan(1);
    expect(out.headline).toBe(`1 of ${total} franchises`);
    expect(out.stat).toBe(`1/${total}`);
  });

  it('a duel ends on a winner and a margin', () => {
    let state = start({
      format: 'duel',
      duelStyle: 'turns',
      mode: 'silhouette',
      rounds: 2,
      players: [
        { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
        { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
      ],
    });
    let now = T0;
    // Seat one takes round one; seat two misses round two.
    state = reduce(state, { type: 'guess', text: name(state), playerId: 'p1', now: (now += 500) });
    state = reduce(state, { type: 'next', now: (now += 1) });
    state = reduce(state, { type: 'giveUp', now: (now += 500) });
    state = reduce(state, { type: 'next', now: (now += 1) });
    expect(state.status).toBe('finished');
    const out = scoutOutcome(state);
    expect(out.headline).toBe('Fox wins it');
    expect(out.detail).toContain('clear');
  });

  it('a level party is called level, not won', () => {
    const state = start({
      format: 'party',
      mode: 'silhouette',
      rounds: 2,
      players: [
        { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
        { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
      ],
    });
    const quit = reduce(state, { type: 'quit', now: T0 + 10 });
    const out = scoutOutcome(quit);
    expect(out.headline).toBe('Dead level at 0');
  });

  it('standard keeps its verdict headline (there is no format line to add)', () => {
    const state = start({ format: 'standard', mode: 'silhouette', rounds: 3 });
    const quit = reduce(state, { type: 'quit', now: T0 + 10 });
    expect(scoutOutcome(quit).headline).toBeNull();
  });
});

describe('pickedCardIds', () => {
  it('lists the cards a choice round was burned on, in order', () => {
    const dataset = makePuzzleDataset();
    const settings = normalizeScoutSettings({ mode: 'oddOneOut', seed: 'picks', tries: 4, rounds: 3 });
    const pool = buildPool(dataset, settings, createRng('picks-pool'));
    expect(pool.length).toBeGreaterThan(0);
    let state = reduce(
      createInitialScoutState(),
      { type: 'start', settings, subjects: pool.slice(), now: T0 },
      createRng('picks-run'),
    );
    const round = currentRound(state);
    const puzzle = round?.subject.puzzle;
    if (!round || !puzzle || puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut round');
    expect(pickedCardIds(round)).toEqual([]);

    const wrong = puzzleCards(puzzle).find((c) => c.playerId !== puzzle.answerPlayerId);
    if (!wrong) throw new Error('expected a wrong card');
    state = reduce(state, { type: 'guess', text: wrong.name, now: T0 + 500 });
    const after = currentRound(state);
    if (!after) throw new Error('round gone');
    expect(pickedCardIds(after)).toEqual([wrong.playerId]);
  });
});
