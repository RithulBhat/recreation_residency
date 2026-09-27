import { beforeEach, describe, expect, it } from 'vitest';
import {
  SCOUT_STATS_STORAGE_KEY,
  SCOUT_STATS_VERSION,
  emptyScoutStatsData,
  isScoutRunRecord,
  normalizeScoutStatsData,
  normalizeScoutTotals,
  scoutReportOf,
  selectScoutDailyList,
  selectScoutRank,
  selectScoutSubjectList,
  selectScoutUnlockedIds,
  useScoutStatsStore,
} from './scoutStatsStore';
import { MAX_SCOUT_RUNS, emptyScoutTotals } from '@/scout/scoutStats';
import { finalizeScoutRun, scoutRankFor } from '@/scout/progress';
import {
  ALL_FRANCHISE_IDS,
  dailyRun,
  duelRun,
  gauntletRun,
  makeScoutRun,
  standardRun,
  survivalRun,
} from '@/scout/statsTestFactory';

function store() {
  return useScoutStatsStore.getState();
}

function persisted(): unknown {
  const raw = localStorage.getItem(SCOUT_STATS_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  store().reset();
  localStorage.clear();
});

describe('recordScoutGame', () => {
  it('folds a finished run into lifetime stats and reports the climb', () => {
    const run = standardRun();
    const expected = finalizeScoutRun(run);
    const result = store().recordScoutGame(run);

    expect(result).not.toBeNull();
    expect(result?.duplicate).toBe(false);
    expect(result?.record).toEqual(expected);
    expect(result?.xpGained).toBe(expected?.xp);
    expect(result?.rankBefore.level).toBe(1);
    expect(result?.rankAfter.xp).toBe(expected?.xp);
    expect(result?.daily).toBeUndefined();

    const state = store();
    expect(state.totals.runs).toBe(1);
    expect(state.totals.rounds).toBe(10);
    expect(state.totals.correct).toBe(8);
    expect(state.totals.xp).toBe(expected?.xp);
    expect(state.runs).toHaveLength(1);
    expect(Object.keys(state.subjects)).toHaveLength(10);
    expect(selectScoutRank(state).xp).toBe(expected?.xp);
  });

  it('is idempotent per run id so a React effect can call it freely', () => {
    const run = standardRun();
    const first = store().recordScoutGame(run);
    const totalsAfterFirst = store().totals;
    const second = store().recordScoutGame(run);
    const third = store().recordScoutGame(run);

    expect(second?.duplicate).toBe(true);
    expect(second?.xpGained).toBe(0);
    expect(second?.record).toEqual(first?.record);
    expect(second?.newAchievements).toEqual([]);
    expect(second?.rankBefore).toEqual(second?.rankAfter);
    expect(third?.duplicate).toBe(true);
    expect(store().totals).toEqual(totalsAfterFirst);
    expect(store().runs).toHaveLength(1);
  });

  it('records different runs separately, newest first', () => {
    store().recordScoutGame(standardRun({ id: 'a' }));
    store().recordScoutGame(standardRun({ id: 'b' }));
    expect(store().runs.map((r) => r.id)).toEqual(['b', 'a']);
    expect(store().totals.runs).toBe(2);
  });

  it('refuses an unfinished run', () => {
    expect(store().recordScoutGame(makeScoutRun({ status: 'playing' }))).toBeNull();
    expect(store().recordScoutGame(makeScoutRun({ id: '' }))).toBeNull();
    expect(store().totals.runs).toBe(0);
    expect(store().runs).toEqual([]);
  });

  it('unlocks each achievement once', () => {
    const first = store().recordScoutGame(standardRun({ id: 'a' }));
    const ids = new Set(first?.newAchievements.map((a) => a.id));
    expect(ids.has('first-call')).toBe(true);
    expect(store().achievements.every((a) => a.runId === 'a')).toBe(true);

    const second = store().recordScoutGame(standardRun({ id: 'b' }));
    for (const a of second?.newAchievements ?? []) expect(ids.has(a.id)).toBe(false);
    const allIds = store().achievements.map((a) => a.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(selectScoutUnlockedIds(store()).size).toBe(allIds.length);
  });

  it('records the per-format and per-cut breakdowns a report card needs', () => {
    store().recordScoutGame(survivalRun(6));
    store().recordScoutGame(gauntletRun(8));
    store().recordScoutGame(duelRun(true));
    const totals = store().totals;
    expect(totals.runsByFormat.survival.runs).toBe(1);
    expect(totals.runsByFormat.gauntlet.runs).toBe(1);
    expect(totals.runsByFormat.duel.runs).toBe(1);
    expect(totals.byFormat.gauntlet.seen).toBe(32);
    expect(Object.values(totals.byTeam).filter((c) => c.seen > 0).length).toBe(32);

    const report = scoutReportOf(store());
    expect(report.runs).toBe(3);
    expect(report.teams).toHaveLength(32);
    expect(report.byFormat).toHaveLength(6);
    expect(report.recentForm.map((p) => p.format)).toEqual(['survival', 'gauntlet', 'duel']);
  });

  it('accumulates per-subject history across runs', () => {
    const spec = { subjectId: 'same-1', name: 'Same Guy', teamId: '12' };
    store().recordScoutGame(makeScoutRun({ id: 'a', rounds: [{ ...spec, shape: 'lost' }] }));
    store().recordScoutGame(makeScoutRun({ id: 'b', rounds: [{ ...spec, shape: 'won', rung: 2 }] }));
    const rows = selectScoutSubjectList(store());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ timesSeen: 2, timesCorrect: 1, bestRung: 2, name: 'Same Guy' });
    expect(store().totals.bestCall?.name).toBe('Same Guy');
  });

  it('caps the stored run history', () => {
    for (let i = 0; i < MAX_SCOUT_RUNS + 5; i += 1) {
      store().recordScoutGame(
        makeScoutRun({
          id: `run-${i}`,
          rounds: [{ shape: 'won', subjectId: `s-${i}`, teamId: ALL_FRANCHISE_IDS[i % 32] }],
        }),
      );
    }
    const state = store();
    expect(state.runs).toHaveLength(MAX_SCOUT_RUNS);
    expect(state.runs[0].id).toBe(`run-${MAX_SCOUT_RUNS + 4}`);
    // totals are lifetime — they keep counting after a record is evicted
    expect(state.totals.runs).toBe(MAX_SCOUT_RUNS + 5);
    expect(state.totals.rounds).toBe(MAX_SCOUT_RUNS + 5);
  });
});

describe('dailies', () => {
  it('stores a daily result and remembers it was played', () => {
    const result = store().recordScoutDaily(dailyRun('2026-09-20'));
    expect(result?.daily.date).toBe('2026-09-20');
    expect(result?.daily.correct).toBe(8);
    expect(result?.daily.grid.length).toBeGreaterThan(0);
    expect(store().hasPlayedScoutDaily('2026-09-20')).toBe(true);
    expect(store().hasPlayedScoutDaily('2026-09-21')).toBe(false);
    expect(selectScoutDailyList(store()).map((d) => d.date)).toEqual(['2026-09-20']);
  });

  it('takes an explicit date and is idempotent too', () => {
    const run = standardRun({ id: 'daily-x' });
    const first = store().recordScoutDaily(run, '2026-09-19');
    expect(first?.record.daily).toBe('2026-09-19');
    const again = store().recordScoutDaily(run, '2026-09-19');
    expect(again?.duplicate).toBe(true);
    expect(again?.daily.date).toBe('2026-09-19');
    expect(Object.keys(store().daily)).toEqual(['2026-09-19']);
  });

  it('sorts the daily list newest first', () => {
    store().recordScoutDaily(dailyRun('2026-09-18'));
    store().recordScoutDaily(dailyRun('2026-09-20'));
    store().recordScoutDaily(dailyRun('2026-09-19'));
    expect(selectScoutDailyList(store()).map((d) => d.date)).toEqual([
      '2026-09-20',
      '2026-09-19',
      '2026-09-18',
    ]);
  });

  it('refuses an unfinished daily', () => {
    expect(store().recordScoutDaily(makeScoutRun({ status: 'playing' }), '2026-09-20')).toBeNull();
  });
});

describe('persistence', () => {
  it('writes the slice under the versioned key', () => {
    store().recordScoutGame(standardRun());
    const raw = persisted();
    expect(raw).toMatchObject({ version: SCOUT_STATS_VERSION });
    const state = (raw as { state: Record<string, unknown> }).state;
    expect(Object.keys(state).sort()).toEqual(['achievements', 'daily', 'runs', 'subjects', 'totals']);
  });

  it('round-trips through export and import', () => {
    store().recordScoutGame(standardRun({ id: 'a' }));
    store().recordScoutDaily(dailyRun('2026-09-20'));
    const before = {
      totals: store().totals,
      runs: store().runs,
      subjects: store().subjects,
      achievements: store().achievements,
      daily: store().daily,
    };
    const json = store().export();
    expect(JSON.parse(json)).toMatchObject({ app: 'highlight-scout', v: SCOUT_STATS_VERSION });

    store().reset();
    expect(store().totals.runs).toBe(0);
    expect(store().runs).toEqual([]);

    expect(store().import(json)).toBe(true);
    expect(store().totals).toEqual(before.totals);
    expect(store().runs).toEqual(before.runs);
    expect(store().subjects).toEqual(before.subjects);
    expect(store().achievements).toEqual(before.achievements);
    expect(store().daily).toEqual(before.daily);
    expect(scoutReportOf(store()).runs).toBe(before.totals.runs);
  });

  it('rejects junk imports without touching what is stored', () => {
    store().recordScoutGame(standardRun());
    const keep = store().totals;
    expect(store().import('not json')).toBe(false);
    expect(store().import('[]')).toBe(false);
    expect(store().import('{"app":"highlight-scout"}')).toBe(false);
    expect(store().totals).toEqual(keep);
  });

  it('imports a bare payload with no envelope', () => {
    store().recordScoutGame(standardRun());
    const bare = JSON.stringify({
      totals: store().totals,
      runs: store().runs,
      subjects: store().subjects,
      achievements: store().achievements,
      daily: store().daily,
    });
    store().reset();
    expect(store().import(bare)).toBe(true);
    expect(store().totals.runs).toBe(1);
  });

  it('resets everything', () => {
    store().recordScoutGame(standardRun());
    store().reset();
    expect(store()).toMatchObject(emptyScoutStatsData());
    expect(store().totals.bestCall).toBeNull();
  });
});

describe('normalising unknown JSON', () => {
  it('rebuilds totals with every cut key seeded', () => {
    const totals = normalizeScoutTotals({
      runs: 3,
      rounds: 'nope',
      xp: 1234,
      byGroup: { QB: { seen: 4, correct: 3, rungSum: 6, solved: 3 }, NOPE: 5 },
      runsByFormat: { blitz: { runs: 2, best: 900, avg: 450 }, invented: { runs: 1 } },
      bestCall: { subjectId: '7', name: 'Someone', mode: 'faceZoom', rung: 1, tier: 'any', at: 5 },
    });
    expect(totals.runs).toBe(3);
    expect(totals.rounds).toBe(0);
    expect(totals.xp).toBe(1234);
    expect(totals.byGroup.QB.correct).toBe(3);
    expect(Object.keys(totals.byGroup)).toContain('ST');
    expect(Object.keys(totals.byTeam)).toHaveLength(32);
    expect(totals.runsByFormat.blitz.best).toBe(900);
    expect(totals.runsByFormat.standard.runs).toBe(1);
    expect(totals.bestCall).toMatchObject({ name: 'Someone', rung: 1, tier: 'starter', key: 'player:7' });
  });

  it('drops malformed runs and keeps sound ones', () => {
    const good = finalizeScoutRun(standardRun());
    expect(isScoutRunRecord(good)).toBe(true);
    expect(isScoutRunRecord({ id: '', finishedAt: 1, score: 1, rounds: 1, correct: 1, roundStats: [], mode: 'x' })).toBe(false);
    expect(isScoutRunRecord({ id: 'a', finishedAt: 1, score: 1, rounds: 1, correct: 1, mode: 'x' })).toBe(false);
    expect(isScoutRunRecord(null)).toBe(false);

    const data = normalizeScoutStatsData({
      totals: emptyScoutTotals(),
      runs: [good, { id: 'bad' }, null, 7],
      subjects: { a: { key: 'player:1', id: '1', name: 'X', timesSeen: 2, timesCorrect: 1, bestRung: 0, lastSeen: 9 }, b: { junk: true } },
      achievements: [{ id: 'first-call', at: 1, runId: 'a' }, { nope: 1 }],
      daily: { '2026-09-20': { score: 10, correct: 1, rounds: 2, grid: '🟩' }, bad: 3 },
    });
    expect(data.runs).toHaveLength(1);
    expect(Object.keys(data.subjects)).toEqual(['player:1']);
    expect(data.subjects['player:1'].kind).toBe('player');
    expect(data.achievements).toEqual([{ id: 'first-call', at: 1, runId: 'a' }]);
    expect(Object.keys(data.daily)).toEqual(['2026-09-20']);
    expect(data.daily['2026-09-20'].date).toBe('2026-09-20');
  });

  it('accepts a legacy `records` array in place of `runs`', () => {
    const good = finalizeScoutRun(standardRun());
    const data = normalizeScoutStatsData({ records: [good] });
    expect(data.runs).toHaveLength(1);
  });

  it('survives complete rubbish', () => {
    expect(normalizeScoutStatsData(undefined)).toEqual(emptyScoutStatsData());
    expect(normalizeScoutStatsData('nope')).toEqual(emptyScoutStatsData());
    expect(normalizeScoutTotals(null)).toEqual(emptyScoutTotals());
  });
});

describe('selectors', () => {
  it('derives the rank from lifetime xp', () => {
    store().recordScoutGame(standardRun({ totalScore: 200_000 }));
    const rank = selectScoutRank(store());
    expect(rank).toEqual(scoutRankFor(store().totals.xp));
    expect(rank.level).toBeGreaterThan(1);
  });

  it('sorts subjects by last seen', () => {
    store().recordScoutGame(makeScoutRun({ id: 'a', rounds: [{ subjectId: 'old', name: 'Old' }] }));
    store().recordScoutGame(
      makeScoutRun({ id: 'b', rounds: [{ subjectId: 'new', name: 'New' }], startedAt: Date.now() + 10_000 }),
    );
    expect(selectScoutSubjectList(store())[0].name).toBe('New');
  });
});
