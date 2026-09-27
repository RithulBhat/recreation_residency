import { beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { buildPool, buildPlayerSubject } from '@/scout/subjects';
import { DEFAULT_SCOUT_SETTINGS, normalizeScoutSettings } from '@/scout/presets';
import { fixtureBundle, findFixturePlayer, findFixtureTeam } from '@/scout/fixtures';
import {
  awaitingBuzz,
  currentFormat,
  currentRound,
  franchisesTotal,
  handover,
  livesLeft,
  lockedOutPlayerIds,
  runPlayers,
  timeLeftMs,
  triesLeft,
} from '@/scout/selectors';
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

describe('session formats through the store', () => {
  const DUELISTS = [
    { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
    { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
  ];

  it('buzzes, locks out and scores per player', () => {
    const s = settings({
      format: 'duel',
      duelStyle: 'buzzer',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 3,
      rounds: 2,
      players: DUELISTS.map((p) => ({ ...p })),
    });
    const store = useScoutStore.getState();
    store.start(s, subjects(s), 1000);
    expect(runPlayers(state())).toHaveLength(2);
    expect(awaitingBuzz(state())).toBe(true);

    // an unattributed guess does nothing while the buzzer is open
    const before = state();
    store.guess('mahomes', 1100);
    expect(state()).toBe(before);

    store.buzz('p1', 1200);
    expect(currentRound(state())?.activePlayerId).toBe('p1');
    store.guess('nowhere near it', 1300);
    expect(lockedOutPlayerIds(state())).toEqual(['p1']);
    expect(awaitingBuzz(state())).toBe(true);

    store.guessAs('p2', currentRound(state())!.subject.name, 1400);
    expect(currentRound(state())?.status).toBe('won');
    expect(runPlayers(state()).find((p) => p.id === 'p2')?.score).toBeGreaterThan(0);
    expect(runPlayers(state()).find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('ignores a buzz outside a buzzer duel', () => {
    const s = settings({ rounds: 2 });
    useScoutStore.getState().start(s, subjects(s), 1000);
    const before = state();
    useScoutStore.getState().buzz('p1', 1100);
    expect(state()).toBe(before);
  });

  it('runs a blitz off one clock, with the store stamping the times', () => {
    const s = settings({ format: 'blitz', mode: 'silhouette', packIds: ['superstars'], blitzDuration: 30 });
    const store = useScoutStore.getState();
    store.start(s, subjects(s), 1000);
    expect(currentFormat(state())).toBe('blitz');
    expect(timeLeftMs(state(), 1000)).toBe(30_000);
    store.guess(currentRound(state())!.subject.name, 2000);
    // blitz never pauses: the next subject is already up
    expect(state().status).toBe('playing');
    expect(state().rounds).toHaveLength(2);
    store.tick(40_000);
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('time');
  });

  it('runs a survival to zero lives', () => {
    const s = settings({ format: 'survival', mode: 'silhouette', packIds: ['superstars'], lives: 1, tries: 2 });
    const store = useScoutStore.getState();
    store.start(s, subjects(s), 1000);
    expect(livesLeft(state())).toBe(1);
    store.giveUp(1100);
    expect(livesLeft(state())).toBe(0);
    store.next(1200);
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('lives');
  });

  it('runs a gauntlet to the end of the board', () => {
    const s = settings({ format: 'gauntlet', mode: 'silhouette', seed: 'store-board', tries: 3 });
    const store = useScoutStore.getState();
    store.start(s, subjects(s), 1000);
    const total = franchisesTotal(state());
    expect(total).toBeGreaterThan(1);
    for (let i = 0; i < total + 1 && state().status !== 'finished'; i++) {
      store.giveUp(2000 + i * 10);
      store.next(2001 + i * 10);
    }
    expect(state().status).toBe('finished');
    expect(state().endReason).toBe('gauntlet');
  });

  it('rotates a party and reports the handover', () => {
    const s = settings({
      format: 'party',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 2,
      rounds: 4,
      players: DUELISTS.map((p) => ({ ...p })),
    });
    const store = useScoutStore.getState();
    store.start(s, subjects(s), 1000);
    expect(currentRound(state())?.activePlayerId).toBe('p1');
    store.giveUp(1100);
    expect(handover(state())).toMatchObject({ from: { id: 'p1' }, to: { id: 'p2' } });
    store.next(1200);
    expect(currentRound(state())?.activePlayerId).toBe('p2');
  });

  it('keeps a pre-format persisted draft and applies a format preset over it', () => {
    const legacy = sanitizePersistedScout({
      settings: { mode: 'faceZoom', packIds: ['pos-qb'], tries: 4, rounds: 12 },
      recentPackIds: ['pos-qb'],
    });
    expect(legacy.settings.format).toBe('standard');
    expect(legacy.settings.mode).toBe('faceZoom');
    expect(legacy.settings.lives).toBe(3);

    useScoutSettingsStore.setState({ settings: legacy.settings });
    useScoutSettingsStore.getState().applyPreset('around-the-league');
    expect(useScoutSettingsStore.getState().settings.format).toBe('gauntlet');
    expect(useScoutSettingsStore.getState().settings.rounds).toBe(0);
    useScoutSettingsStore.getState().update({ format: 'blitz', blitzDuration: 9999 });
    expect(useScoutSettingsStore.getState().settings.blitzDuration).toBe(300);
    expect(useScoutSettingsStore.getState().settings.format).toBe('blitz');
  });
});
