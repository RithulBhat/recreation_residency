import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { buildPool, buildPlayerSubject } from '@/scout/subjects';
import { DEFAULT_SCOUT_SETTINGS, normalizeScoutSettings } from '@/scout/presets';
import { fixtureBundle, findFixturePlayer, findFixtureTeam } from '@/scout/fixtures';
import { currentRound, triesLeft } from '@/scout/selectors';
import type { ScoutRound, ScoutSettings, ScoutState, ScoutSubject } from '@/scout/types';
import {
  MAX_RECENT_SCOUT_PACKS,
  currentScoutRng,
  newlyEndedScoutRounds,
  onScoutFinished,
  onScoutRoundOver,
  sanitizePersistedScout,
  useScoutSettingsStore,
  useScoutStore,
} from './scoutStore';

function settings(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return normalizeScoutSettings(over);
}

function subjects(s: ScoutSettings): ScoutSubject[] {
  return buildPool(fixtureBundle(), s, createRng('pool'));
}

function state(): ScoutState {
  return useScoutStore.getState().state;
}

beforeEach(() => {
  useScoutStore.getState().reset();
  useScoutSettingsStore.getState().reset();
});

describe('useScoutStore', () => {
  it('starts idle', () => {
    expect(state().status).toBe('idle');
    expect(currentScoutRng()).toBeUndefined();
  });

  it('plays a round through the store API', () => {
    const s = settings({ tries: 4, rounds: 2 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    expect(state().status).toBe('playing');
    expect(currentScoutRng()).toBeDefined();
    const target = currentRound(state())!.subject.name;

    useScoutStore.getState().skip(1100);
    expect(triesLeft(state())).toBe(3);

    useScoutStore.getState().guess(target, 1200);
    expect(state().status).toBe('round-over');
    expect(state().totalScore).toBeGreaterThan(0);

    useScoutStore.getState().next(1300);
    expect(state().status).toBe('playing');
    expect(state().rounds).toHaveLength(2);

    useScoutStore.getState().giveUp(1400);
    useScoutStore.getState().next(1500);
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('rounds');
  });

  it('drives the clock and times out', () => {
    const s = settings({ roundTimer: 5, tries: 3 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    useScoutStore.getState().tick(2000);
    useScoutStore.getState().tick(3000);
    expect(state().status).toBe('playing');
    useScoutStore.getState().tick(8000);
    expect(currentRound(state())?.guesses.at(-1)?.verdict).toBe('timeout');
  });

  it('quits and resets', () => {
    const s = settings();
    useScoutStore.getState().start(s, subjects(s), 1000);
    useScoutStore.getState().quit(1100);
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('quit');
    useScoutStore.getState().reset();
    expect(state().status).toBe('idle');
    expect(currentScoutRng()).toBeUndefined();
  });

  it('stamps `now` when omitted and ignores no-op actions', () => {
    const s = settings();
    useScoutStore.getState().start(s, subjects(s));
    expect(currentRound(state())!.startedAt).toBeGreaterThan(0);
    const before = state();
    useScoutStore.getState().guess('   ');
    expect(state()).toBe(before);
    useScoutStore.getState().dispatch({ type: 'next' });
    expect(state()).toBe(before);
  });

  it('accepts a raw dispatch', () => {
    const s = settings({ tries: 2 });
    useScoutStore.getState().dispatch({ type: 'start', settings: s, subjects: subjects(s), now: 10 });
    expect(state().status).toBe('playing');
    useScoutStore.getState().dispatch({ type: 'timeout', now: 20 });
    expect(currentRound(state())?.status).toBe('lost');
  });
});

describe('subscription helpers', () => {
  it('fires onScoutRoundOver for each finished round', () => {
    const seen: ScoutRound[] = [];
    const off = onScoutRoundOver((round) => seen.push(round));
    const s = settings({ rounds: 2, tries: 2 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    useScoutStore.getState().guess(currentRound(state())!.subject.name, 1100);
    useScoutStore.getState().next(1200);
    useScoutStore.getState().giveUp(1300);
    off();
    expect(seen).toHaveLength(2);
    expect(seen[0].status).toBe('won');
    expect(seen[1].status).toBe('lost');
  });

  it('fires onScoutFinished once per run', () => {
    let hits = 0;
    const off = onScoutFinished(() => {
      hits += 1;
    });
    const s = settings({ rounds: 1, tries: 1 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    useScoutStore.getState().giveUp(1100);
    useScoutStore.getState().next(1200);
    expect(state().status).toBe('finished');
    useScoutStore.getState().tick(1300);
    off();
    expect(hits).toBe(1);
  });

  it('newlyEndedScoutRounds compares two states', () => {
    const s = settings({ rounds: 2, tries: 1 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    const before = state();
    useScoutStore.getState().giveUp(1100);
    const after = state();
    expect(newlyEndedScoutRounds(before, after)).toHaveLength(1);
    expect(newlyEndedScoutRounds(after, after)).toEqual([]);
    expect(newlyEndedScoutRounds(after, before)).toEqual([]);
  });
});

describe('useScoutSettingsStore', () => {
  it('normalizes every update', () => {
    useScoutSettingsStore.getState().update({ tries: 99, rounds: -3 });
    expect(useScoutSettingsStore.getState().settings.tries).toBe(6);
    expect(useScoutSettingsStore.getState().settings.rounds).toBe(0);
  });

  it('applies and forgets presets', () => {
    useScoutSettingsStore.getState().applyPreset('film-room');
    expect(useScoutSettingsStore.getState().settings.mode).toBe('highlight');
    useScoutSettingsStore.getState().applyPreset('nope');
    expect(useScoutSettingsStore.getState().settings.mode).toBe('highlight');
    useScoutSettingsStore.getState().reset();
    expect(useScoutSettingsStore.getState().settings).toEqual(DEFAULT_SCOUT_SETTINGS);
  });

  it('tracks recent packs, newest first, without duplicates', () => {
    const store = useScoutSettingsStore.getState();
    store.pushRecentPack('pos-qb');
    store.pushRecentPack('team-kc');
    store.pushRecentPack('pos-qb');
    expect(useScoutSettingsStore.getState().recentPackIds).toEqual(['pos-qb', 'team-kc']);
    for (let i = 0; i < 20; i++) useScoutSettingsStore.getState().pushRecentPack(`p${i}`);
    expect(useScoutSettingsStore.getState().recentPackIds.length).toBe(MAX_RECENT_SCOUT_PACKS);
  });

  it('sanitizes whatever storage hands back', () => {
    expect(sanitizePersistedScout(null).settings).toEqual(DEFAULT_SCOUT_SETTINGS);
    expect(sanitizePersistedScout({ settings: { tries: 999 } }).settings.tries).toBe(6);
    expect(sanitizePersistedScout({ recentPackIds: ['a', 2, null] }).recentPackIds).toEqual(['a']);
    expect(sanitizePersistedScout('garbage').recentPackIds).toEqual([]);
  });
});

describe('store + a hand-built pool', () => {
  it('plays a single-subject run to the end', () => {
    const subject = buildPlayerSubject(findFixturePlayer('Patrick Mahomes'), findFixtureTeam('KC'));
    const s = settings({ rounds: 0, tries: 3 });
    useScoutStore.getState().start(s, [subject], 1000);
    useScoutStore.getState().guess('mahomes', 1100);
    expect(currentRound(state())?.status).toBe('won');
    useScoutStore.getState().next(1200);
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('queue-empty');
  });
});
