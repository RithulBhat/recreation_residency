import { describe, expect, it } from 'vitest';
import {
  BLIND_ACCURACY,
  MIN_CUT_SEEN,
  MIN_SCOUT_REPORT_ROUNDS,
  SCOUT_GROUP_LABELS,
  buildScoutReport,
  scoutBestCall,
  scoutFormatCuts,
  scoutGroupLabel,
  scoutRecentForm,
  scoutTeamHeatmap,
  scoutWeakestSubjects,
  type ScoutCut,
  type ScoutReportInput,
} from './report';
import { finalizeScoutRun } from './progress';
import {
  applyScoutRun,
  emptyScoutTotals,
  updateScoutSubjects,
  type ScoutRunRecord,
  type ScoutStatsTotals,
  type ScoutSubjectRecord,
} from './scoutStats';
import {
  ALL_FRANCHISE_IDS,
  blitzRun,
  divisionTeamIds,
  everyModeRun,
  gauntletRun,
  makeScoutRun,
  standardRun,
  survivalRun,
  type ScoutRoundSpec,
} from './statsTestFactory';
import type { PositionGroup, ScoutState } from './types';

function fold(states: ScoutState[]): ScoutReportInput {
  let totals: ScoutStatsTotals = emptyScoutTotals();
  let subjects: ReadonlyMap<string, ScoutSubjectRecord> = new Map();
  const records: ScoutRunRecord[] = [];
  for (const state of states) {
    const record = finalizeScoutRun(state);
    if (!record) throw new Error(`unfinished ${state.id}`);
    totals = applyScoutRun(totals, record);
    subjects = updateScoutSubjects(subjects, record);
    records.unshift(record);
  }
  return { totals, records, subjects: [...subjects.values()] };
}

function groupRun(id: string, group: PositionGroup, won: number, lost: number): ScoutState {
  const rounds: ScoutRoundSpec[] = [
    ...Array.from({ length: won }, (_u, i) => ({
      shape: 'won' as const,
      rung: 1,
      group,
      subjectId: `${id}-w${i}`,
      teamId: ALL_FRANCHISE_IDS[i % 32],
    })),
    ...Array.from({ length: lost }, (_u, i) => ({
      shape: 'lost' as const,
      group,
      subjectId: `${id}-l${i}`,
      teamId: ALL_FRANCHISE_IDS[i % 32],
    })),
  ];
  return makeScoutRun({ id, rounds });
}

const cutFor = (cuts: ScoutCut[], key: string): ScoutCut => {
  const found = cuts.find((c) => c.key === key);
  if (!found) throw new Error(`no cut ${key}`);
  return found;
};

describe('cuts', () => {
  it('always returns the full ordered axis, zero rows included', () => {
    const report = buildScoutReport(fold([standardRun()]));
    expect(report.byGroup).toHaveLength(9);
    expect(report.byGroup.map((c) => c.key)).toEqual(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST']);
    expect(report.byConference.map((c) => c.key)).toEqual(['AFC', 'NFC']);
    expect(report.byDivision).toHaveLength(8);
    expect(report.byDivision[0].key).toBe('AFC East');
    expect(report.byDivision[0].short).toBe('AFC E');
    expect(report.byTier.map((c) => c.key)).toEqual(['star', 'starter', 'rotation', 'deepCut']);
    expect(report.byMode).toHaveLength(7);
    expect(report.byFormat).toHaveLength(6);
    expect(report.teams).toHaveLength(32);
    for (const cut of [...report.byGroup, ...report.byMode, ...report.byFormat]) {
      expect(cut.label.length).toBeGreaterThan(1);
      expect(cut.emoji.length).toBeGreaterThan(0);
    }
  });

  it('computes accuracy and mean rung per cut', () => {
    const report = buildScoutReport(fold([groupRun('qb', 'QB', 8, 2)]));
    const qb = cutFor(report.byGroup, 'QB');
    expect(qb).toMatchObject({ seen: 10, correct: 8 });
    expect(qb.accuracy).toBeCloseTo(0.8, 5);
    expect(qb.avgRung).toBe(2);
    const rb = cutFor(report.byGroup, 'RB');
    expect(rb).toMatchObject({ seen: 0, correct: 0, accuracy: 0, avgRung: 0 });
  });

  it('cuts by puzzle type and by session format', () => {
    const report = buildScoutReport(fold([everyModeRun(), blitzRun(4, 1), survivalRun(6)]));
    expect(cutFor(report.byMode, 'silhouette').correct).toBeGreaterThan(0);
    expect(cutFor(report.byMode, 'teamTrivia').seen).toBe(1);
    expect(cutFor(report.byFormat, 'blitz').seen).toBe(5);
    expect(cutFor(report.byFormat, 'survival').seen).toBe(9);
    expect(cutFor(report.byFormat, 'gauntlet').seen).toBe(0);
    expect(scoutFormatCuts(emptyScoutTotals()).every((c) => c.seen === 0)).toBe(true);
  });

  it('cuts by conference and division', () => {
    const afcWest = divisionTeamIds('AFC', 'West');
    const report = buildScoutReport(
      fold([makeScoutRun({ rounds: afcWest.map((teamId, i) => ({ teamId, subjectId: `t${i}` })) })]),
    );
    expect(cutFor(report.byConference, 'AFC').seen).toBe(4);
    expect(cutFor(report.byConference, 'NFC').seen).toBe(0);
    expect(cutFor(report.byDivision, 'AFC West').correct).toBe(4);
    expect(report.divisionsSwept).toEqual(['AFC West']);
  });

  it('cuts by fame tier — the real skill curve', () => {
    const report = buildScoutReport(
      fold([
        makeScoutRun({
          id: 'tiers',
          rounds: [
            { fame: 95, subjectId: 'a' },
            { fame: 60, subjectId: 'b' },
            { fame: 40, subjectId: 'c' },
            { fame: 10, subjectId: 'd', shape: 'lost' },
          ],
        }),
      ]),
    );
    expect(cutFor(report.byTier, 'star').correct).toBe(1);
    expect(cutFor(report.byTier, 'starter').correct).toBe(1);
    expect(cutFor(report.byTier, 'rotation').correct).toBe(1);
    expect(cutFor(report.byTier, 'deepCut')).toMatchObject({ seen: 1, correct: 0 });
  });
});

describe('team heatmap', () => {
  it('covers all 32 franchises in league order with heat relative to the most-seen', () => {
    const input = fold([gauntletRun(20), makeScoutRun({ id: 'extra', rounds: [{ teamId: '12' }, { teamId: '12' }] })]);
    const teams = scoutTeamHeatmap(input.totals);
    expect(teams).toHaveLength(32);
    expect(new Set(teams.map((t) => t.teamId)).size).toBe(32);
    const kc = teams.find((t) => t.abbr === 'KC');
    expect(kc).toBeDefined();
    expect(kc?.seen).toBe(3);
    expect(kc?.heat).toBe(1);
    expect(kc?.name).toBe('Kansas City Chiefs');
    expect(kc?.divisionKey).toBe('AFC West');
    expect(kc?.accent).toMatch(/^#[0-9a-f]{6}$/i);
    for (const team of teams) {
      expect(team.heat).toBeGreaterThanOrEqual(0);
      expect(team.heat).toBeLessThanOrEqual(1);
      expect(team.correct).toBeLessThanOrEqual(team.seen);
    }
    expect(teams.filter((t) => t.seen > 0).length).toBe(32);
  });

  it('is all cold with no history', () => {
    const teams = scoutTeamHeatmap(emptyScoutTotals());
    expect(teams.every((t) => t.seen === 0 && t.heat === 0 && t.accuracy === 0)).toBe(true);
  });

  it('counts franchises seen and franchises known separately', () => {
    const report = buildScoutReport(
      fold([
        makeScoutRun({
          rounds: [
            { teamId: '12', subjectId: 'a' },
            { teamId: '9', subjectId: 'b', shape: 'lost' },
          ],
        }),
      ]),
    );
    expect(report.teamsSeen).toBe(2);
    expect(report.teamsKnown).toBe(1);
  });
});

describe('the verdict', () => {
  it('admits there is not enough tape yet, and says how much is missing', () => {
    const report = buildScoutReport(fold([makeScoutRun({ rounds: [{ shape: 'won' }] })]));
    expect(report.enoughData).toBe(false);
    expect(report.roundsToVerdict).toBe(MIN_SCOUT_REPORT_ROUNDS - 1);
    expect(report.verdict[0].tone).toBe('insufficient');
    expect(report.verdict[0].text).toContain('Not enough tape');
    expect(report.verdictLine).toContain('Not enough tape');
  });

  it('says nothing at all with no history', () => {
    const report = buildScoutReport({ totals: emptyScoutTotals() });
    expect(report.runs).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.verdict[0].tone).toBe('insufficient');
    expect(report.verdict[0].text).toContain('No tape on you yet');
    expect(report.bestCall).toBeNull();
    expect(report.nemeses).toEqual([]);
    expect(report.recentForm).toEqual([]);
  });

  it('names the strongest room and the blind spot', () => {
    const report = buildScoutReport(
      fold([groupRun('qb', 'QB', 10, 0), groupRun('db', 'DB', 0, 10), groupRun('wr', 'WR', 5, 5)]),
    );
    expect(report.enoughData).toBe(true);
    expect(report.verdictLine).toBe('Elite on quarterbacks. You cannot name a defensive back.');
    expect(report.verdict[0]).toMatchObject({ tone: 'strength', key: 'QB' });
    expect(report.verdict[1]).toMatchObject({ tone: 'weakness', key: 'DB' });
    expect(report.strongest?.key).toBe('QB');
    expect(report.weakest?.key).toBe('DB');
  });

  it('will not call a small sample elite', () => {
    const report = buildScoutReport(
      fold([groupRun('qb', 'QB', MIN_CUT_SEEN - 1, 0), groupRun('wr', 'WR', 8, 8)]),
    );
    expect(report.verdict.some((l) => l.key === 'QB')).toBe(false);
    expect(report.strongest?.key).not.toBe('QB');
  });

  it('softens praise it cannot fully back, and criticism it cannot either', () => {
    const report = buildScoutReport(fold([groupRun('qb', 'QB', 7, 3), groupRun('ol', 'OL', 4, 6)]));
    const strength = report.verdict.find((l) => l.tone === 'strength');
    const weakness = report.verdict.find((l) => l.tone === 'weakness');
    expect(strength?.text).toBe('Quarterbacks are your strongest room.');
    expect(weakness?.text).toBe('Offensive linemen are a blind spot.');
  });

  it('stays balanced when nothing stands out', () => {
    const report = buildScoutReport(
      fold([groupRun('qb', 'QB', 6, 4), groupRun('wr', 'WR', 6, 4), groupRun('db', 'DB', 6, 4)]),
    );
    const balanced = report.verdict.find((l) => l.tone === 'balanced');
    expect(balanced).toBeDefined();
    expect(balanced?.text).toContain('60%');
    expect(report.verdict.some((l) => l.tone === 'strength' || l.tone === 'weakness')).toBe(false);
  });

  it('credits a genuine deep-cut eye', () => {
    const report = buildScoutReport(
      fold([
        makeScoutRun({
          id: 'deep',
          rounds: Array.from({ length: 24 }, (_u, i) => ({
            shape: (i % 2 === 0 ? 'won' : 'lost') as 'won' | 'lost',
            fame: 12,
            subjectId: `d${i}`,
            teamId: ALL_FRANCHISE_IDS[i % 32],
          })),
        }),
      ]),
    );
    const line = report.verdict.find((l) => l.key === 'deepCut');
    expect(line?.text).toContain('deep cuts');
    expect(line?.text).toContain("not a fan's eye");
  });

  it('calls out losing the household names', () => {
    const report = buildScoutReport(
      fold([
        makeScoutRun({
          id: 'stars',
          rounds: Array.from({ length: 24 }, (_u, i) => ({
            shape: (i % 4 === 0 ? 'won' : 'lost') as 'won' | 'lost',
            fame: 95,
            group: 'WR' as PositionGroup,
            subjectId: `s${i}`,
            teamId: ALL_FRANCHISE_IDS[i % 32],
          })),
        }),
      ]),
    );
    expect(report.verdict.some((l) => l.text === 'Even the household names get away from you.')).toBe(true);
  });

  it('always closes with the league-map coverage line', () => {
    const report = buildScoutReport(fold([gauntletRun(32)]));
    const coverage = report.verdict.find((l) => l.tone === 'coverage');
    expect(coverage?.text).toContain('32 of 32 franchises');
    expect(coverage?.text).toContain('divisions swept');
    expect(report.verdictLine).not.toContain('franchises on your map');
  });

  it('keeps the blind-spot threshold honest', () => {
    expect(BLIND_ACCURACY).toBeLessThan(0.5);
    const labels = SCOUT_GROUP_LABELS.map((g) => g.one);
    expect(labels).toContain('a defensive back');
    expect(scoutGroupLabel('OL').many).toBe('offensive linemen');
  });
});

describe('best call', () => {
  it('reports the shortest rung ever, with who it was', () => {
    const report = buildScoutReport(
      fold([
        standardRun(),
        makeScoutRun({
          id: 'sharp',
          rounds: [{ shape: 'won', rung: 0, name: 'Shadow Man', fame: 12, teamId: '12', mode: 'silhouette' }],
        }),
      ]),
    );
    expect(report.bestCall).toMatchObject({
      name: 'Shadow Man',
      rung: 0,
      tier: 'deepCut',
      mode: 'silhouette',
      teamAbbr: 'KC',
      runId: 'sharp',
    });
  });

  it('falls back to per-subject history when totals have no best call', () => {
    const subjects: ScoutSubjectRecord[] = [
      {
        key: 'player:9',
        kind: 'player',
        id: '9',
        name: 'Old Record',
        tier: 'rotation',
        timesSeen: 3,
        timesCorrect: 1,
        bestRung: 1,
        bestRungMode: 'faceZoom',
        lastSeen: 5,
        teamAbbr: 'GB',
      },
    ];
    const call = scoutBestCall({ totals: emptyScoutTotals(), subjects });
    expect(call).toMatchObject({ name: 'Old Record', rung: 1, mode: 'faceZoom', teamAbbr: 'GB' });
  });
});

describe('extras', () => {
  it('lists the subjects that keep beating you', () => {
    const subjects: ScoutSubjectRecord[] = [
      { key: 'a', kind: 'player', id: 'a', name: 'Nemesis', tier: 'deepCut', timesSeen: 4, timesCorrect: 0, bestRung: null, lastSeen: 3 },
      { key: 'b', kind: 'player', id: 'b', name: 'Twice Missed', tier: 'rotation', timesSeen: 2, timesCorrect: 0, bestRung: null, lastSeen: 2 },
      { key: 'c', kind: 'player', id: 'c', name: 'Once Missed', tier: 'rotation', timesSeen: 1, timesCorrect: 0, bestRung: null, lastSeen: 1 },
      { key: 'd', kind: 'player', id: 'd', name: 'Known', tier: 'star', timesSeen: 9, timesCorrect: 9, bestRung: 0, lastSeen: 4 },
    ];
    expect(scoutWeakestSubjects(subjects).map((s) => s.name)).toEqual(['Nemesis', 'Twice Missed']);
    expect(scoutWeakestSubjects(subjects, 1).map((s) => s.name)).toEqual(['Nemesis']);
    expect(scoutWeakestSubjects(undefined)).toEqual([]);
  });

  it('returns recent form oldest first', () => {
    const input = fold([standardRun({ id: 'old' }), standardRun({ id: 'new' })]);
    const form = scoutRecentForm(input.records);
    expect(form.map((p) => p.runId)).toEqual(['old', 'new']);
    expect(form[0].accuracy).toBeCloseTo(0.8, 5);
    expect(form[0].clean).toBe(false);
    expect(scoutRecentForm(undefined)).toEqual([]);
  });

  it('carries the headline numbers', () => {
    const report = buildScoutReport(fold([standardRun(), standardRun({ id: 'b' })]));
    expect(report.runs).toBe(2);
    expect(report.rounds).toBe(20);
    expect(report.correct).toBe(16);
    expect(report.accuracy).toBeCloseTo(0.8, 5);
    expect(report.xp).toBeGreaterThan(0);
    expect(report.bestStreak).toBe(8);
    expect(report.bestScore).toBeGreaterThan(0);
  });
});
