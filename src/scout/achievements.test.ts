import { describe, expect, it } from 'vitest';
import {
  SCOUT_ACHIEVEMENTS,
  SCOUT_RARITIES,
  evaluateScoutAchievements,
  scoutAchievementById,
  scoutAchievementsByRarity,
  scoutLocalDateKey,
  type ScoutAchievement,
  type ScoutAchievementContext,
} from './achievements';
import { finalizeScoutRun } from './progress';
import { applyScoutRun, emptyScoutTotals, updateScoutSubjects, type ScoutStatsTotals, type ScoutSubjectRecord } from './scoutStats';
import {
  ALL_FRANCHISE_IDS,
  SCOUT_BASE_TIME,
  blitzRun,
  dailyRun,
  divisionTeamIds,
  duelRun,
  everyModeRun,
  gauntletRun,
  makeScoutRun,
  partyRun,
  standardRun,
  survivalRun,
  type ScoutRoundSpec,
} from './statsTestFactory';
import type { PositionGroup, ScoutState } from './types';

/**
 * Build a context by folding real runs into real totals — the LAST run is the one being judged, the
 * earlier ones are the lifetime history. No hand-written totals anywhere, so a badge can only pass
 * if the aggregation genuinely produces the numbers it claims to need.
 */
function ctx(
  runs: ScoutState | ScoutState[],
  opts: { dailies?: number } = {},
): ScoutAchievementContext {
  const list = Array.isArray(runs) ? runs : [runs];
  let totals: ScoutStatsTotals = emptyScoutTotals();
  let subjects: ReadonlyMap<string, ScoutSubjectRecord> = new Map();
  const records = [];
  for (const state of list) {
    const record = finalizeScoutRun(state);
    if (!record) throw new Error(`unfinished run ${state.id}`);
    totals = applyScoutRun(totals, record);
    subjects = updateScoutSubjects(subjects, record);
    records.unshift(record);
  }
  const last = records[0];
  return {
    state: list[list.length - 1],
    record: last,
    totals,
    subjects,
    dailies: opts.dailies ?? (last.daily ? 1 : 0),
    records,
  };
}

const wonRounds = (n: number, spec: ScoutRoundSpec = {}): ScoutRoundSpec[] =>
  Array.from({ length: n }, (_unused, i) => ({
    shape: 'won' as const,
    rung: 1,
    teamId: ALL_FRANCHISE_IDS[i % ALL_FRANCHISE_IDS.length],
    subjectId: `bulk-${i}`,
    name: `Bulk ${i}`,
    ...spec,
  }));

/** A finished run that graded one missed round: the universal "nothing happened" negative. */
const missOnly = (): ScoutState => makeScoutRun({ id: 'miss', rounds: [{ shape: 'lost' }], totalScore: 0 });
/** A finished run with nothing graded at all. */
const nothing = (): ScoutState => makeScoutRun({ id: 'none', rounds: [], totalScore: 0 });

const MIDNIGHT = new Date(2026, 8, 21, 2, 15, 0, 0).getTime();

interface Case {
  pos: () => ScoutAchievementContext;
  neg: () => ScoutAchievementContext;
}

const CASES: Record<string, Case> = {
  'first-call': {
    pos: () => ctx(standardRun()),
    neg: () => ctx(missOnly()),
  },
  'on-the-clock': {
    pos: () => ctx(standardRun()),
    neg: () => ctx(nothing()),
  },
  'film-hours': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(100) })),
    neg: () => ctx(standardRun()),
  },
  'tape-grinder': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(500) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(100) })),
  },
  'thousand-yard-eye': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(1000) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(500) })),
  },
  'pure-shadow': {
    pos: () => ctx(makeScoutRun({ rounds: [{ mode: 'silhouette', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ mode: 'silhouette', rung: 1 }] })),
  },
  'lights-out': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(3, { mode: 'silhouette', rung: 0 }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(2, { mode: 'silhouette', rung: 0 }) })),
  },
  'one-eyebrow': {
    pos: () => ctx(makeScoutRun({ rounds: [{ mode: 'faceZoom', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ mode: 'faceZoom', rung: 2 }] })),
  },
  'film-room-read': {
    pos: () => ctx(makeScoutRun({ rounds: [{ mode: 'highlight', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ mode: 'highlight', rung: 1 }] })),
  },
  'stat-sheet-savant': {
    pos: () => ctx(makeScoutRun({ rounds: [{ mode: 'statLine', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ mode: 'statLine', rung: 3 }] })),
  },
  'paper-trail': {
    pos: () => ctx(makeScoutRun({ rounds: [{ mode: 'careerPath', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ mode: 'careerPath', rung: 1 }] })),
  },
  'three-pixels': {
    pos: () => ctx(makeScoutRun({ rounds: [{ team: 'KC', mode: 'logoZoom', rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ team: 'KC', mode: 'logoZoom', rung: 2 }] })),
  },
  'franchise-iq': {
    pos: () =>
      ctx(
        makeScoutRun({
          settings: { mode: 'teamTrivia' },
          rounds: ['KC', 'SF', 'GB', 'BUF', 'MIN'].map((team) => ({ team, mode: 'teamTrivia' as const })),
        }),
      ),
    neg: () =>
      ctx(
        makeScoutRun({
          settings: { mode: 'teamTrivia' },
          rounds: ['KC', 'SF', 'GB', 'BUF', 'MIN'].map((team, i) => ({
            team,
            mode: 'teamTrivia' as const,
            shape: (i === 4 ? 'lost' : 'won') as 'lost' | 'won',
          })),
        }),
      ),
  },
  'every-angle': {
    pos: () => ctx(everyModeRun()),
    neg: () => ctx(standardRun()),
  },
  'deep-cut': {
    pos: () => ctx(makeScoutRun({ rounds: [{ fame: 12 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ fame: 95 }] })),
  },
  'practice-squad-scout': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(5, { fame: 12 }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(4, { fame: 12 }) })),
  },
  'nobody-knows-him': {
    pos: () => ctx(makeScoutRun({ rounds: [{ fame: 12, rung: 0 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ fame: 12, rung: 1 }] })),
  },
  'rookie-eye': {
    pos: () => ctx(makeScoutRun({ rounds: [{ exp: 1 }] })),
    neg: () => ctx(makeScoutRun({ rounds: [{ exp: 8 }] })),
  },
  'rookie-class': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(3, { exp: 0 }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(2, { exp: 0 }) })),
  },
  'division-sweep': {
    pos: () =>
      ctx(makeScoutRun({ rounds: divisionTeamIds('AFC', 'West').map((teamId) => ({ teamId })) })),
    neg: () =>
      ctx(makeScoutRun({ rounds: divisionTeamIds('AFC', 'West').slice(0, 3).map((teamId) => ({ teamId })) })),
  },
  'half-the-league': {
    pos: () =>
      ctx(makeScoutRun({ rounds: ALL_FRANCHISE_IDS.slice(0, 16).map((teamId) => ({ teamId })) })),
    neg: () =>
      ctx(makeScoutRun({ rounds: ALL_FRANCHISE_IDS.slice(0, 15).map((teamId) => ({ teamId })) })),
  },
  'league-wide': {
    pos: () => ctx(gauntletRun(32)),
    neg: () => ctx(gauntletRun(31)),
  },
  'every-room': {
    pos: () =>
      ctx(
        makeScoutRun({
          rounds: (['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'] as PositionGroup[]).map(
            (group, i) => ({ group, subjectId: `g-${i}` }),
          ),
        }),
      ),
    neg: () =>
      ctx(
        makeScoutRun({
          rounds: (['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'] as PositionGroup[]).map((group, i) => ({
            group,
            subjectId: `g-${i}`,
          })),
        }),
      ),
  },
  'trench-eyes': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(10, { group: 'OL' }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(9, { group: 'OL' }) })),
  },
  'respect-the-kickers': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(5, { group: 'ST' }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(4, { group: 'ST' }) })),
  },
  'both-conferences': {
    pos: () =>
      ctx([
        makeScoutRun({ id: 'afc', rounds: wonRounds(25, { teamId: '12' }) }),
        makeScoutRun({ id: 'nfc', rounds: wonRounds(25, { teamId: '9' }) }),
      ]),
    neg: () =>
      ctx([
        makeScoutRun({ id: 'afc', rounds: wonRounds(25, { teamId: '12' }) }),
        makeScoutRun({ id: 'nfc', rounds: wonRounds(24, { teamId: '9' }) }),
      ]),
  },
  'survivor-10': {
    pos: () => ctx(survivalRun(10)),
    neg: () => ctx(survivalRun(9)),
  },
  'survivor-20': {
    pos: () => ctx(survivalRun(20)),
    neg: () => ctx(survivalRun(19)),
  },
  'gauntlet-run': {
    pos: () => ctx(gauntletRun(20)),
    neg: () => ctx(gauntletRun(20, { endReason: 'quit' })),
  },
  'clean-board': {
    pos: () => ctx(gauntletRun(28)),
    neg: () => ctx(gauntletRun(27)),
  },
  'duel-won': {
    pos: () => ctx(duelRun(true)),
    neg: () => ctx(duelRun(false)),
  },
  'blitz-package': {
    pos: () => ctx(blitzRun(0, 0, { rounds: wonRounds(5, { group: 'QB' }), settings: { format: 'blitz' } })),
    neg: () => ctx(blitzRun(0, 0, { rounds: wonRounds(4, { group: 'QB' }), settings: { format: 'blitz' } })),
  },
  'twenty-in-ninety': {
    pos: () => ctx(blitzRun(20, 2)),
    neg: () => ctx(blitzRun(19, 2)),
  },
  'host-with-the-most': {
    pos: () => ctx(partyRun(3, true)),
    neg: () => ctx(partyRun(3, false)),
  },
  'format-tourist': {
    pos: () =>
      ctx([
        standardRun({ id: 'f1' }),
        blitzRun(3, 1, { id: 'f2' }),
        survivalRun(3, { id: 'f3' }),
        gauntletRun(3, { id: 'f4' }),
        duelRun(true, { id: 'f5' }),
        partyRun(3, true, { id: 'f6' }),
      ]),
    neg: () =>
      ctx([
        standardRun({ id: 'f1' }),
        blitzRun(3, 1, { id: 'f2' }),
        survivalRun(3, { id: 'f3' }),
        gauntletRun(3, { id: 'f4' }),
        duelRun(true, { id: 'f5' }),
      ]),
  },
  'streak-5': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(5) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(4) })),
  },
  'streak-10': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(10) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(9) })),
  },
  'streak-25': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(25) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(24) })),
  },
  'clean-sheet': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(5) })),
    neg: () => ctx(standardRun()),
  },
  'flawless-eye': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(5, { rung: 0 }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(5, { rung: 1 }) })),
  },
  'no-passes': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(10) })),
    neg: () =>
      ctx(makeScoutRun({ rounds: [...wonRounds(9), { shape: 'skipped', subjectId: 'skip-1' }] })),
  },
  'first-ballot': {
    pos: () => ctx(makeScoutRun({ rounds: wonRounds(25, { rung: 0 }) })),
    neg: () => ctx(makeScoutRun({ rounds: wonRounds(24, { rung: 0 }) })),
  },
  'daily-debut': {
    pos: () => ctx(dailyRun('2026-09-20')),
    neg: () => ctx(standardRun()),
  },
  'daily-seven': {
    pos: () => ctx(dailyRun('2026-09-20'), { dailies: 7 }),
    neg: () => ctx(dailyRun('2026-09-20'), { dailies: 6 }),
  },
  'pro-bowl-nod': {
    pos: () => ctx(standardRun({ totalScore: 200_000 })),
    neg: () => ctx(standardRun()),
  },
  'gold-jacket': {
    pos: () => ctx(standardRun({ totalScore: 700_000 })),
    neg: () => ctx(standardRun({ totalScore: 200_000 })),
  },
  'midnight-film': {
    pos: () => ctx(standardRun({ startedAt: MIDNIGHT, finishedAt: MIDNIGHT + 120_000 })),
    neg: () => ctx(standardRun()),
  },
};

describe('the roster', () => {
  it('has more than thirty badges with unique ids and complete copy', () => {
    expect(SCOUT_ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SCOUT_ACHIEVEMENTS.map((a) => a.id)).size).toBe(SCOUT_ACHIEVEMENTS.length);
    expect(new Set(SCOUT_ACHIEVEMENTS.map((a) => a.name)).size).toBe(SCOUT_ACHIEVEMENTS.length);
    for (const a of SCOUT_ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.emoji.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(8);
      expect(a.description.endsWith('.')).toBe(true);
      expect(SCOUT_RARITIES).toContain(a.rarity);
    }
  });

  it('spreads across all four rarities', () => {
    for (const rarity of SCOUT_RARITIES) {
      expect(scoutAchievementsByRarity(rarity).length).toBeGreaterThan(0);
    }
  });

  it('looks a badge up by id', () => {
    expect(scoutAchievementById('pure-shadow')?.name).toBe('Pure Shadow');
    expect(scoutAchievementById('nope')).toBeUndefined();
  });
});

describe('every achievement has a positive and a negative case', () => {
  it('covers the whole roster', () => {
    expect(Object.keys(CASES).sort()).toEqual(SCOUT_ACHIEVEMENTS.map((a) => a.id).sort());
  });

  for (const achievement of SCOUT_ACHIEVEMENTS) {
    it(`${achievement.id} unlocks when earned and stays locked when not`, () => {
      const testCase = CASES[achievement.id];
      expect(achievement.check(testCase.pos())).toBe(true);
      expect(achievement.check(testCase.neg())).toBe(false);
    });
  }
});

describe('evaluateScoutAchievements', () => {
  it('returns newly earned badges in roster order', () => {
    const unlocked = evaluateScoutAchievements(ctx(standardRun()));
    const ids = unlocked.map((a) => a.id);
    expect(ids).toContain('first-call');
    expect(ids).toContain('on-the-clock');
    expect(ids).toContain('streak-5');
    const order = SCOUT_ACHIEVEMENTS.map((a) => a.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('skips what is already unlocked', () => {
    const context = ctx(standardRun());
    const first = evaluateScoutAchievements(context);
    const again = evaluateScoutAchievements(context, new Set(first.map((a) => a.id)));
    expect(again).toEqual([]);
  });

  it('treats a throwing predicate as not earned', () => {
    const exploding: ScoutAchievement = {
      id: 'boom',
      name: 'Boom',
      emoji: '💥',
      description: 'Never unlocks.',
      rarity: 'common',
      check: () => {
        throw new Error('bad predicate');
      },
    };
    expect(() => exploding.check(ctx(standardRun()))).toThrow();
    const safe = evaluateScoutAchievements(ctx(standardRun()));
    expect(safe.some((a) => a.id === 'boom')).toBe(false);
  });

  it('keys dailies by local date', () => {
    expect(scoutLocalDateKey(SCOUT_BASE_TIME)).toBe('2026-09-20');
    expect(scoutLocalDateKey(new Date(2026, 0, 5, 9, 0, 0).getTime())).toBe('2026-01-05');
  });
});
