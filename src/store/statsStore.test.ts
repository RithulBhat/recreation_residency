import { beforeEach, describe, expect, it } from 'vitest';
import {
  STATS_STORAGE_KEY,
  STATS_VERSION,
  getPackMeta,
  normalizeTotals,
  selectDailyList,
  selectRank,
  selectTrackList,
  selectUnlockedIds,
  setPackMeta,
  useStatsStore,
} from './statsStore';
import { emptyTotals, summarizeGame } from '@/stats/aggregate';
import { rankFor } from '@/stats/rank';
import {
  BASE_TIME,
  blitzGame,
  classicGame,
  dailyGame,
  duelGame,
  makeGame,
  type RoundSpec,
} from '@/stats/testFactory';

function store() {
  return useStatsStore.getState();
}

function persisted(): unknown {
  const raw = localStorage.getItem(STATS_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  store().reset();
  localStorage.clear();
  setPackMeta([]);
});

describe('recordGame', () => {
  it('folds a finished game into totals and returns the summary', () => {
    const game = classicGame();
    const result = store().recordGame(game);

    expect(result.duplicate).toBe(false);
    expect(result.record).toEqual(summarizeGame(game));
    expect(result.xpGained).toBe(734);
    expect(result.rankBefore.level).toBe(1);
    expect(result.rankAfter.level).toBe(2);
    expect(result.daily).toBeUndefined();

    const state = store();
    expect(state.totals.games).toBe(1);
    expect(state.totals.correct).toBe(8);
    expect(state.totals.xp).toBe(734);
    expect(state.records).toHaveLength(1);
    expect(state.records[0].id).toBe('game-1');
    expect(Object.keys(state.tracks)).toHaveLength(10);
    expect(selectRank(state).level).toBe(2);
  });

  it('unlocks achievements once', () => {
    const first = store().recordGame(classicGame());
    expect(first.newAchievements.map((a) => a.id)).toContain('needle-drop');
    expect(store().achievements.every((u) => u.gameId === 'game-1')).toBe(true);

    const second = store().recordGame(classicGame({ id: 'game-2' }));
    const overlap = second.newAchievements.filter((a) =>
      first.newAchievements.some((b) => b.id === a.id),
    );
    expect(overlap).toEqual([]);
    const ids = store().achievements.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(selectUnlockedIds(store()).has('needle-drop')).toBe(true);
  });

  it('is idempotent per game id', () => {
    const game = classicGame();
    store().recordGame(game);
    const again = store().recordGame(game);
    expect(again.duplicate).toBe(true);
    expect(again.xpGained).toBe(0);
    expect(again.rankBefore).toEqual(again.rankAfter);
    expect(store().totals.games).toBe(1);
    expect(store().records).toHaveLength(1);
  });

  it('accumulates across modes', () => {
    store().recordGame(classicGame());
    store().recordGame(blitzGame(18, 3, { id: 'game-2' }));
    store().recordGame(duelGame([1800, 900], { id: 'game-3' }));
    const totals = store().totals;
    expect(totals.games).toBe(3);
    expect(totals.byMode.classic.games).toBe(1);
    expect(totals.byMode.blitz.games).toBe(1);
    expect(totals.byMode.duel.games).toBe(1);
    expect(totals.byMode.party.games).toBe(0);
    expect(store().records.map((r) => r.id)).toEqual(['game-3', 'game-2', 'game-1']);
  });

  it('writes through to localStorage with a version', () => {
    store().recordGame(classicGame());
    const raw = persisted() as { version?: number; state?: { records?: unknown[] } } | null;
    expect(raw).not.toBeNull();
    expect(raw?.version).toBe(STATS_VERSION);
    expect(raw?.state?.records).toHaveLength(1);
  });

  it('merges per-track history across games', () => {
    const a = makeGame({ rounds: [{ shape: 'lost', track: { id: 77 } }] });
    const b = makeGame({ id: 'g2', rounds: [{ shape: 'won', clip: 0.1, track: { id: 77 } }] });
    store().recordGame(a);
    store().recordGame(b);
    expect(store().tracks[77]).toMatchObject({
      timesSeen: 2,
      timesCorrect: 1,
      fastestClip: 0.1,
    });
    expect(selectTrackList(store())).toHaveLength(1);
  });
});

describe('dailies', () => {
  it('records a daily from the settings date', () => {
    const result = store().recordGame(dailyGame('2026-09-20'));
    expect(result.daily).toMatchObject({ date: '2026-09-20', correct: 4, rounds: 5, score: 3080 });
    expect(result.daily?.grid.split('\n')).toHaveLength(5);
    expect(store().hasPlayedDaily('2026-09-20')).toBe(true);
    expect(store().hasPlayedDaily('2026-09-21')).toBe(false);
  });

  it('recordDaily always returns a daily result', () => {
    const game = makeGame({ id: 'plain', rounds: [{ shape: 'won' }] });
    const result = store().recordDaily(game, '2026-09-26');
    expect(result.daily.date).toBe('2026-09-26');
    expect(result.record.daily).toBe('2026-09-26');
    expect(store().hasPlayedDaily('2026-09-26')).toBe(true);
  });

  it('derives the date when none is given', () => {
    const game = makeGame({ id: 'plain', rounds: [{ shape: 'won' }] });
    const result = store().recordDaily(game);
    expect(result.daily.date).toBe('2026-09-20');
    expect(selectDailyList(store()).map((d) => d.date)).toEqual(['2026-09-20']);
  });

  it('keeps the first result for a date on a replay', () => {
    const game = dailyGame('2026-09-20');
    store().recordDaily(game);
    const again = store().recordDaily(game);
    expect(again.duplicate).toBe(true);
    expect(again.daily.score).toBe(3080);
    expect(Object.keys(store().daily)).toEqual(['2026-09-20']);
  });

  it('sorts the daily list newest first', () => {
    store().recordGame(dailyGame('2026-09-18', { id: 'd1' }));
    store().recordGame(dailyGame('2026-09-20', { id: 'd2' }));
    expect(selectDailyList(store()).map((d) => d.date)).toEqual(['2026-09-20', '2026-09-18']);
  });
});

describe('caps', () => {
  it('keeps at most 200 records, newest first', () => {
    for (let i = 0; i < 210; i += 1) {
      store().recordGame(makeGame({ id: `g${i}`, rounds: [{ shape: 'won' }] }));
    }
    const records = store().records;
    expect(records).toHaveLength(200);
    expect(records[0].id).toBe('g209');
    expect(records[199].id).toBe('g10');
    expect(store().totals.games).toBe(210);
  });

  it('keeps at most 1500 tracks, newest seen first', () => {
    const bulk = (id: string, from: number, count: number, startedAt: number) =>
      makeGame({
        id,
        startedAt,
        rounds: Array.from({ length: count }, (_unused, i) => ({
          shape: 'won',
          track: { id: from + i },
        })) as RoundSpec[],
      });
    store().recordGame(bulk('g1', 100_000, 800, BASE_TIME));
    store().recordGame(bulk('g2', 200_000, 800, BASE_TIME + 30 * 86_400_000));
    const ids = Object.keys(store().tracks).map(Number);
    expect(ids).toHaveLength(1500);
    // the second game is more recent, so all of its tracks survive
    expect(ids.filter((id) => id >= 200_000)).toHaveLength(800);
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    store().recordGame(classicGame());
    store().recordGame(dailyGame('2026-09-20', { id: 'daily-1' }));
    const before = {
      totals: store().totals,
      records: store().records,
      tracks: store().tracks,
      achievements: store().achievements,
      daily: store().daily,
    };
    const json = store().export();

    store().reset();
    expect(store().totals).toEqual(emptyTotals());
    expect(store().records).toEqual([]);

    expect(store().import(json)).toBe(true);
    expect(store().totals).toEqual(before.totals);
    expect(store().records).toEqual(before.records);
    expect(store().tracks).toEqual(before.tracks);
    expect(store().achievements).toEqual(before.achievements);
    expect(store().daily).toEqual(before.daily);
  });

  it('exports a labelled envelope', () => {
    store().recordGame(classicGame());
    const parsed: unknown = JSON.parse(store().export());
    expect(parsed).toMatchObject({ app: 'songooner', v: STATS_VERSION });
  });

  it('accepts a bare data payload', () => {
    const totals = { ...emptyTotals(), games: 3, xp: 900 };
    expect(store().import(JSON.stringify({ totals, records: [], daily: {} }))).toBe(true);
    expect(store().totals.games).toBe(3);
    expect(selectRank(store()).level).toBe(rankFor(900).level);
  });

  it('rejects junk', () => {
    store().recordGame(classicGame());
    expect(store().import('not json')).toBe(false);
    expect(store().import('42')).toBe(false);
    expect(store().import('{"hello":1}')).toBe(false);
    expect(store().totals.games).toBe(1);
  });

  it('heals a partial payload', () => {
    expect(
      store().import(
        JSON.stringify({
          data: {
            totals: { games: 2, byMode: { classic: { games: 2, best: 10, avg: 5 } }, junk: true },
            records: [{ id: 'ok', finishedAt: 1, score: 10, rounds: 1, correct: 1, mode: 'classic' }, { id: 'bare' }, { nope: true }],
            tracks: { 5: { trackId: 5, title: 't', artist: 'a', cover: '', timesSeen: 1, timesCorrect: 1, fastestClip: 0.1, lastSeen: 1 } },
            achievements: [{ id: 'needle-drop', at: 1, gameId: 'ok' }, 'garbage'],
            daily: { '2026-09-20': { score: 10, correct: 1, rounds: 1, grid: '🟩 0.1s' } },
          },
        }),
      ),
    ).toBe(true);
    const state = store();
    expect(state.totals.games).toBe(2);
    expect(state.totals.byMode.classic).toEqual({ games: 2, best: 10, avg: 5 });
    expect(state.totals.byMode.blitz).toEqual({ games: 0, best: 0, avg: 0 });
    expect(state.records.map((r) => r.id)).toEqual(['ok']);
    expect(state.achievements).toHaveLength(1);
    expect(state.daily['2026-09-20'].date).toBe('2026-09-20');
    expect(state.tracks[5].fastestClip).toBe(0.1);
  });
});

describe('record validation', () => {
  const good = { id: 'good', finishedAt: 1_700_000_000_000, score: 500, rounds: 5, correct: 3, mode: 'classic' };
  const bad = [
    { id: 'bare' },
    { id: 'no-date', score: 1, rounds: 1, mode: 'classic' },
    { id: 'nan-score', finishedAt: 1, score: Number.NaN, rounds: 1, mode: 'classic' },
    { id: 'string-rounds', finishedAt: 1, score: 1, rounds: '5', mode: 'classic' },
    { id: 'bad-mode', finishedAt: 1, score: 1, rounds: 1, mode: 'karaoke' },
  ];

  it('import drops records without numeric finishedAt/score/rounds or with an unknown mode (P3-12)', () => {
    expect(store().import(JSON.stringify({ totals: {}, records: [bad[0], good, ...bad.slice(1)], daily: {} }))).toBe(true);
    expect(store().records.map((r) => r.id)).toEqual(['good']);
  });

  it('rehydrating a tampered localStorage payload drops them too', async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({ state: { totals: {}, records: [...bad, good], tracks: {}, achievements: [], daily: {} }, version: STATS_VERSION }),
    );
    await useStatsStore.persist.rehydrate();
    expect(store().records.map((r) => r.id)).toEqual(['good']);
  });
});

describe('reset and misc', () => {
  it('reset clears everything', () => {
    store().recordGame(classicGame());
    store().reset();
    const state = store();
    expect(state.totals).toEqual(emptyTotals());
    expect(state.records).toEqual([]);
    expect(state.tracks).toEqual({});
    expect(state.achievements).toEqual([]);
    expect(state.daily).toEqual({});
  });

  it('normalizeTotals fills every bucket', () => {
    const totals = normalizeTotals(null);
    expect(totals).toEqual(emptyTotals());
    expect(normalizeTotals({ games: Number.NaN }).games).toBe(0);
  });

  it('registers pack metadata for achievement checks', () => {
    setPackMeta([{ id: 'kpop', name: 'K-Pop', emoji: '🇰🇷', tags: ['korean'] }]);
    expect(getPackMeta().get('kpop')?.name).toBe('K-Pop');
  });
});
