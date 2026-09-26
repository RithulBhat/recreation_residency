import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialScoutState, reduce } from '@/scout/engine';
import { buildPlayerSubject } from '@/scout/subjects';
import { FIXTURE_PLAYERS, findFixtureTeam } from '@/scout/fixtures';
import { normalizeScoutSettings } from '@/scout/presets';
import type { ScoutState, ScoutSubject } from '@/scout/types';
import {
  MAX_SCOUT_RECORDS,
  isScoutGameRecord,
  roundGlyph,
  sanitizePersistedScoutResults,
  scoutGrid,
  summarizeScoutGame,
  useScoutResultStore,
} from './scoutResultStore';

const kc = findFixtureTeam('KC');

function subjects(n: number): ScoutSubject[] {
  return FIXTURE_PLAYERS.slice(0, n).map((p) => buildPlayerSubject(p, kc));
}

type Outcome = 'win' | 'skip' | 'miss' | 'close';

/** Play a scripted session, one outcome per round, then let it finish. */
function playSession(script: readonly Outcome[], seed = 'test-seed'): ScoutState {
  const settings = normalizeScoutSettings({
    mode: 'silhouette',
    packIds: ['superstars'],
    tries: 3,
    rounds: script.length,
    seed,
  });
  let now = 1_000;
  let state = reduce(createInitialScoutState(), {
    type: 'start',
    settings,
    subjects: subjects(script.length + 2),
    now,
  });
  for (const outcome of script) {
    now += 500;
    state = reduce(state, { type: 'tick', now });
    const round = state.rounds[state.currentRound];
    now += 1_200;
    if (outcome === 'win') {
      state = reduce(state, { type: 'guess', text: round.subject.name, now });
    } else if (outcome === 'close') {
      const last = round.subject.player?.last ?? round.subject.name;
      state = reduce(state, { type: 'guess', text: `Zebedee ${last}`, now });
      state = reduce(state, { type: 'giveUp', now: now + 100 });
    } else if (outcome === 'miss') {
      // burn every try on wrong guesses
      for (let i = 0; i < settings.tries; i++) {
        state = reduce(state, { type: 'guess', text: 'Zzyzx Quuxington', now: now + i });
      }
    } else {
      state = reduce(state, { type: 'giveUp', now });
    }
    state = reduce(state, { type: 'next', now: now + 200 });
  }
  return state;
}

describe('summarizeScoutGame', () => {
  it('refuses anything that is not a finished run', () => {
    expect(summarizeScoutGame(createInitialScoutState())).toBeNull();
  });

  it('folds a finished session into the numbers a stats screen needs', () => {
    const state = playSession(['win', 'skip', 'win']);
    const record = summarizeScoutGame(state);
    expect(record).not.toBeNull();
    expect(record!.id).toBe(state.id);
    expect(record!.played).toBe(3);
    expect(record!.correct).toBe(2);
    expect(record!.score).toBe(state.totalScore);
    expect(record!.bestStreak).toBe(state.bestStreak);
    expect(record!.mode).toBe('silhouette');
    expect(record!.seed).toBe('test-seed');
    expect(record!.rounds).toHaveLength(3);
    expect(record!.rounds[0].verdict).toBe('correct');
    expect(record!.rounds[1].verdict).toBe('skipped');
    expect(record!.durationMs).toBeGreaterThan(0);
    expect(isScoutGameRecord(record)).toBe(true);
  });

  it('counts the rounds you were one name away from', () => {
    const record = summarizeScoutGame(playSession(['close', 'win']));
    expect(record!.close).toBe(1);
  });

  it('averages the winning rung only over the rounds that were won', () => {
    const record = summarizeScoutGame(playSession(['win', 'skip']));
    expect(record!.avgTryWhenRight).toBe(1);
    const none = summarizeScoutGame(playSession(['skip']));
    expect(none!.avgTryWhenRight).toBe(0);
  });
});

describe('scoutGrid', () => {
  it('gives every finished round one glyph, wrapped every ten', () => {
    const state = playSession(['win', 'miss', 'close', 'skip']);
    const grid = scoutGrid(state);
    expect([...grid].filter((c) => c !== '\n')).toHaveLength(4);
    expect(grid).toContain('🟩');
    expect(grid).toContain('🟥');
    expect(grid).toContain('🟨');
    expect(grid).toContain('⬜');
    expect(grid.split('\n')).toHaveLength(1);
  });

  it('marks a skipped round differently from a missed one', () => {
    const state = playSession(['skip', 'win']);
    expect(roundGlyph(state.rounds[0])).toBe('⬜');
    expect(roundGlyph(state.rounds[1])).toBe('🟩');
  });
});

describe('useScoutResultStore', () => {
  beforeEach(() => {
    useScoutResultStore.setState({ gameId: null, record: null, challenger: null, records: [] });
  });

  it('records a finished session exactly once per session id', () => {
    const state = playSession(['win', 'win']);
    const first = useScoutResultStore.getState().recordGame(state);
    const second = useScoutResultStore.getState().recordGame(state);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(useScoutResultStore.getState().records).toHaveLength(1);
  });

  it('keeps a history newest first', () => {
    const a = playSession(['win'], 'seed-a');
    const b = playSession(['skip', 'win'], 'seed-b');
    useScoutResultStore.getState().recordGame(a);
    useScoutResultStore.getState().recordGame(b);
    const { records } = useScoutResultStore.getState();
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(b.id);
  });

  it('never records an unfinished run', () => {
    expect(useScoutResultStore.getState().recordGame(createInitialScoutState())).toBeNull();
    expect(useScoutResultStore.getState().records).toHaveLength(0);
  });

  it('keeps the challenger out of the hand-off when it is cleared', () => {
    useScoutResultStore.getState().setChallenger({ by: 'Maya', score: 6420 });
    expect(useScoutResultStore.getState().challenger?.by).toBe('Maya');
    useScoutResultStore.getState().clear();
    expect(useScoutResultStore.getState().challenger).toBeNull();
  });

  it('answers the daily question from its own history', () => {
    const state = playSession(['win']);
    const withDaily: ScoutState = { ...state, settings: { ...state.settings, daily: '2026-09-26' } };
    useScoutResultStore.getState().recordGame(withDaily);
    expect(useScoutResultStore.getState().hasPlayedDaily('2026-09-26')).toBe(true);
    expect(useScoutResultStore.getState().hasPlayedDaily('2026-09-25')).toBe(false);
  });
});

describe('sanitizePersistedScoutResults', () => {
  it('drops junk rather than trusting storage', () => {
    expect(sanitizePersistedScoutResults(null).records).toEqual([]);
    expect(sanitizePersistedScoutResults({ records: 'nope' }).records).toEqual([]);
    expect(sanitizePersistedScoutResults({ records: [{ id: '' }, { nope: 1 }] }).records).toEqual([]);
  });

  it('keeps well-formed records and caps the history', () => {
    const good = summarizeScoutGame(playSession(['win']))!;
    const many = Array.from({ length: MAX_SCOUT_RECORDS + 20 }, (_, i) => ({ ...good, id: `r${i}` }));
    const out = sanitizePersistedScoutResults({ records: many }).records;
    expect(out).toHaveLength(MAX_SCOUT_RECORDS);
    expect(out[0].id).toBe('r0');
  });
});
