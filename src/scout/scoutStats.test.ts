import { describe, expect, it } from 'vitest';
import {
  MAX_SCOUT_SUBJECTS,
  applyScoutRun,
  asScoutFameTier,
  asScoutFormat,
  bestCallOfRun,
  capScoutSubjects,
  emptyScoutTotals,
  gradedScoutRounds,
  isBetterScoutCall,
  scoutCutAccuracy,
  scoutCutAvgRung,
  scoutDivisionTeamsKnown,
  scoutDivisionsSwept,
  scoutDuelResultOf,
  scoutRoundGlyph,
  scoutRunFormat,
  scoutRunGrid,
  scoutTeamsKnown,
  scoutTotalsAccuracy,
  scoutWinnerName,
  summarizeScoutRun,
  updateScoutSubjects,
  type ScoutRunRecord,
  type ScoutSubjectRecord,
} from './scoutStats';
import { finalizeScoutRun } from './progress';
import {
  ALL_FRANCHISE_IDS,
  SCOUT_BASE_TIME,
  blitzRun,
  divisionTeamIds,
  duelRun,
  everyModeRun,
  gauntletRun,
  makeScoutRun,
  partyRun,
  standardRun,
  survivalRun,
} from './statsTestFactory';

function record(state = standardRun()): ScoutRunRecord {
  const r = finalizeScoutRun(state);
  if (!r) throw new Error('expected a finished run');
  return r;
}

describe('gradedScoutRounds', () => {
  it('counts resolved rounds and an unresolved round the player already guessed on', () => {
    const state = makeScoutRun({
      rounds: [{ shape: 'won' }, { shape: 'lost' }, { shape: 'unresolved' }],
    });
    expect(gradedScoutRounds(state)).toHaveLength(3);
  });

  it('ignores a round auto-skipped before any guess (a quit or a dry queue)', () => {
    const state = makeScoutRun({ rounds: [{ shape: 'won' }] });
    const ghost = { ...state.rounds[0], index: 1, status: 'skipped' as const, guesses: [], score: 0 };
    const withGhost = { ...state, rounds: [...state.rounds, ghost] };
    expect(gradedScoutRounds(withGhost)).toHaveLength(1);
  });

  it('keeps a skipped round the player actually passed on', () => {
    const state = makeScoutRun({ rounds: [{ shape: 'skipped' }] });
    expect(gradedScoutRounds(state)).toHaveLength(1);
    expect(record(state).skipped).toBe(1);
  });
});

describe('grid', () => {
  it('uses one glyph per outcome and wraps every ten rounds', () => {
    const state = makeScoutRun({
      rounds: [
        { shape: 'won' },
        { shape: 'close' },
        { shape: 'lost' },
        { shape: 'skipped' },
        ...Array.from({ length: 7 }, () => ({ shape: 'won' as const })),
      ],
    });
    const grid = scoutRunGrid(state);
    expect(grid.split('\n')).toHaveLength(2);
    expect(grid.startsWith('🟩🟨🟥⬜')).toBe(true);
    expect(scoutRoundGlyph(state.rounds[0])).toBe('🟩');
    expect(scoutRoundGlyph(state.rounds[1])).toBe('🟨');
    expect(scoutRoundGlyph(state.rounds[2])).toBe('🟥');
    expect(scoutRoundGlyph(state.rounds[3])).toBe('⬜');
  });
});

describe('summarizeScoutRun', () => {
  it('refuses an unfinished run and a run with no id', () => {
    expect(summarizeScoutRun(makeScoutRun({ status: 'playing' }))).toBeNull();
    expect(summarizeScoutRun(makeScoutRun({ id: '' }))).toBeNull();
  });

  it('condenses a standard run', () => {
    const r = record(standardRun());
    expect(r.rounds).toBe(10);
    expect(r.correct).toBe(8);
    expect(r.close).toBe(1);
    expect(r.format).toBe('standard');
    expect(r.mode).toBe('silhouette');
    expect(r.score).toBeGreaterThan(0);
    expect(r.avgRung).toBe(2);
    expect(r.firstRungSolves).toBe(0);
    expect(r.perfect).toBe(false);
    expect(r.noSkips).toBe(true);
    expect(r.bestStreak).toBe(8);
    expect(r.durationMs).toBeGreaterThan(0);
    expect(r.roundStats).toHaveLength(10);
    expect(r.xp).toBeGreaterThan(0);
  });

  it('records every cut axis on a round stat', () => {
    const state = makeScoutRun({
      rounds: [{ shape: 'won', rung: 0, teamId: '12', group: 'QB', fame: 95, exp: 1, name: 'Deep Shadow' }],
    });
    const stat = record(state).roundStats[0];
    expect(stat).toMatchObject({
      group: 'QB',
      teamId: '12',
      teamAbbr: 'KC',
      conference: 'AFC',
      division: 'West',
      divisionKey: 'AFC West',
      tier: 'star',
      rookie: true,
      won: true,
      rung: 0,
      triesUsed: 1,
    });
    expect(stat.key).toMatch(/^player:/);
    expect(stat.ms).toBeGreaterThan(0);
  });

  it('marks a perfect run and a first-rung sweep', () => {
    const r = record(everyModeRun());
    expect(r.rounds).toBe(7);
    expect(r.correct).toBe(7);
    expect(r.firstRungSolves).toBe(7);
    expect(r.perfect).toBe(true);
    expect(r.avgRung).toBe(1);
  });

  it('derives team subjects from the franchise itself', () => {
    const r = record(makeScoutRun({ rounds: [{ team: 'GB', mode: 'logoZoom', shape: 'won' }] }));
    const stat = r.roundStats[0];
    expect(stat.kind).toBe('team');
    expect(stat.key).toBe('team:9');
    expect(stat.divisionKey).toBe('NFC North');
    expect(stat.group).toBeUndefined();
  });

  it('prices formats from the settings, and lets extras override', () => {
    expect(record(blitzRun()).format).toBe('blitz');
    expect(record(survivalRun()).format).toBe('survival');
    expect(record(gauntletRun()).format).toBe('gauntlet');
    const state = standardRun();
    expect(scoutRunFormat(state.settings, { format: 'party' })).toBe('party');
    const forced = finalizeScoutRun(state, { format: 'party' });
    expect(forced?.format).toBe('party');
  });

  it('defaults survival depth to the correct count and honours an override', () => {
    expect(record(survivalRun(12)).survived).toBe(12);
    const forced = finalizeScoutRun(survivalRun(12), { survived: 21 });
    expect(forced?.survived).toBe(21);
  });

  it('reads the gauntlet board off the state', () => {
    const r = record(gauntletRun(30));
    expect(r.gauntletCleared).toBe(true);
    expect(r.franchisesCleared).toBe(30);
    expect(r.rounds).toBe(32);
    const quit = record(gauntletRun(5, { endReason: 'quit' }));
    expect(quit.gauntletCleared).toBe(false);
  });

  it('summarises multiplayer seats and the owner result', () => {
    const won = record(duelRun(true));
    expect(won.players).toHaveLength(2);
    expect(won.winnerName).toBe('You');
    expect(won.duel).toEqual({ mine: 4200, theirs: 2100, won: true, opponent: 'Maanu' });

    const lost = record(duelRun(false));
    expect(lost.duel?.won).toBe(false);
    expect(lost.winnerName).toBe('Maanu');
  });

  it('leaves solo runs without seats', () => {
    const r = record(standardRun());
    expect(r.players).toBeUndefined();
    expect(r.duel).toBeUndefined();
    expect(r.winnerName).toBeUndefined();
  });

  it('calls a tie no win', () => {
    const seats = [
      { id: 'p1', name: 'You', emoji: '🏈', score: 100, correct: 1, bestStreak: 1 },
      { id: 'p2', name: 'Them', emoji: '🎯', score: 100, correct: 1, bestStreak: 1 },
    ];
    expect(scoutWinnerName(seats)).toBeUndefined();
    expect(scoutDuelResultOf(seats)?.won).toBe(false);
    expect(scoutDuelResultOf([seats[0]])).toBeNull();
  });
});

describe('applyScoutRun', () => {
  it('folds a run into every cut without mutating the input', () => {
    const before = emptyScoutTotals();
    const frozen = JSON.stringify(before);
    const r = record(standardRun());
    const totals = applyScoutRun(before, r);

    expect(JSON.stringify(before)).toBe(frozen);
    expect(totals.runs).toBe(1);
    expect(totals.rounds).toBe(10);
    expect(totals.correct).toBe(8);
    expect(totals.xp).toBe(r.xp);
    expect(totals.bestScore).toBe(r.score);
    expect(totals.byGroup.QB.seen).toBe(1);
    expect(totals.byGroup.WR.seen).toBe(2);
    expect(totals.byMode.silhouette.seen).toBe(10);
    expect(totals.byFormat.standard.seen).toBe(10);
    expect(totals.runsByFormat.standard).toEqual({ runs: 1, best: r.score, avg: r.score });
    expect(scoutTotalsAccuracy(totals)).toBeCloseTo(0.8, 5);

    const seenTeams = Object.values(totals.byTeam).filter((c) => c.seen > 0);
    expect(seenTeams).toHaveLength(10);
  });

  it('accumulates over runs and tracks best score, streak and format averages', () => {
    const a = record(standardRun());
    const b = record(standardRun({ id: 'run-2', totalScore: 99_000, bestStreak: 12 }));
    const totals = applyScoutRun(applyScoutRun(emptyScoutTotals(), a), b);
    expect(totals.runs).toBe(2);
    expect(totals.rounds).toBe(20);
    expect(totals.bestScore).toBe(99_000);
    expect(totals.bestStreak).toBe(12);
    expect(totals.runsByFormat.standard.runs).toBe(2);
    expect(totals.runsByFormat.standard.best).toBe(99_000);
    expect(totals.runsByFormat.standard.avg).toBeCloseTo((a.score + 99_000) / 2, 2);
  });

  it('keeps every cut key seeded so a chart never reflows', () => {
    const totals = emptyScoutTotals();
    expect(Object.keys(totals.byGroup)).toHaveLength(9);
    expect(Object.keys(totals.byDivision)).toHaveLength(8);
    expect(Object.keys(totals.byMode)).toHaveLength(7);
    expect(Object.keys(totals.byTeam)).toHaveLength(32);
    expect(Object.keys(totals.byTier)).toHaveLength(4);
  });

  it('computes cut accuracy and mean rung', () => {
    const totals = applyScoutRun(emptyScoutTotals(), record(standardRun()));
    expect(scoutCutAccuracy(totals.byGroup.QB)).toBe(1);
    expect(scoutCutAvgRung(totals.byGroup.QB)).toBe(2);
    expect(scoutCutAccuracy(totals.byGroup.QB)).toBeGreaterThan(scoutCutAccuracy(totals.byGroup.ST));
    expect(scoutCutAccuracy(undefined)).toBe(0);
    expect(scoutCutAvgRung(undefined)).toBe(0);
  });

  it('counts franchises and swept divisions', () => {
    const afcWest = divisionTeamIds('AFC', 'West');
    const state = makeScoutRun({
      rounds: afcWest.map((teamId) => ({ shape: 'won' as const, teamId })),
    });
    const totals = applyScoutRun(emptyScoutTotals(), record(state));
    expect(scoutTeamsKnown(totals)).toBe(4);
    expect(scoutDivisionTeamsKnown(totals, 'AFC West')).toBe(4);
    expect(scoutDivisionsSwept(totals)).toEqual(['AFC West']);
  });

  it('does not credit a division the player only saw and missed', () => {
    const afcWest = divisionTeamIds('AFC', 'West');
    const state = makeScoutRun({ rounds: afcWest.map((teamId) => ({ shape: 'lost' as const, teamId })) });
    const totals = applyScoutRun(emptyScoutTotals(), record(state));
    expect(scoutTeamsKnown(totals)).toBe(0);
    expect(scoutDivisionsSwept(totals)).toEqual([]);
  });
});

describe('best call', () => {
  it('picks the shortest rung in a run', () => {
    const state = makeScoutRun({
      rounds: [
        { shape: 'won', rung: 3, name: 'Late Call' },
        { shape: 'won', rung: 0, name: 'Early Call', fame: 10 },
        { shape: 'won', rung: 2, name: 'Middle Call' },
      ],
    });
    const call = bestCallOfRun(record(state));
    expect(call?.name).toBe('Early Call');
    expect(call?.rung).toBe(0);
    expect(call?.tier).toBe('deepCut');
  });

  it('breaks a rung tie towards the harder subject', () => {
    const base = { key: 'player:1', subjectId: '1', name: 'A', mode: 'silhouette' as const, rung: 1, runId: 'r', at: 1 };
    expect(isBetterScoutCall({ ...base, tier: 'deepCut' }, { ...base, tier: 'star' })).toBe(true);
    expect(isBetterScoutCall({ ...base, tier: 'star' }, { ...base, tier: 'deepCut' })).toBe(false);
    expect(isBetterScoutCall({ ...base, rung: 0, tier: 'star' }, { ...base, tier: 'deepCut' })).toBe(true);
    expect(isBetterScoutCall({ ...base, tier: 'star' }, null)).toBe(true);
  });

  it('only improves the lifetime best call', () => {
    const good = record(makeScoutRun({ id: 'a', rounds: [{ shape: 'won', rung: 0, name: 'Sharp' }] }));
    const worse = record(makeScoutRun({ id: 'b', rounds: [{ shape: 'won', rung: 3, name: 'Slow' }] }));
    const totals = applyScoutRun(applyScoutRun(emptyScoutTotals(), good), worse);
    expect(totals.bestCall?.name).toBe('Sharp');
    expect(totals.bestCall?.runId).toBe('a');
  });

  it('stays null for a run that named nobody', () => {
    const totals = applyScoutRun(emptyScoutTotals(), record(makeScoutRun({ rounds: [{ shape: 'lost' }] })));
    expect(totals.bestCall).toBeNull();
  });
});

describe('subject history', () => {
  it('accumulates sightings, correct counts and the best rung', () => {
    const first = record(makeScoutRun({ id: 'a', rounds: [{ shape: 'won', rung: 3, name: 'Repeat Guy' }] }));
    const second = record(
      makeScoutRun({
        id: 'b',
        rounds: [{ shape: 'won', rung: 1, name: 'Repeat Guy', subjectId: 'syn-x', mode: 'faceZoom' }],
      }),
    );
    // same subject id in both runs
    const one = record(
      makeScoutRun({ id: 'c', rounds: [{ shape: 'won', rung: 3, name: 'Fixed', subjectId: 'fix-1' }] }),
    );
    const two = record(
      makeScoutRun({
        id: 'd',
        rounds: [{ shape: 'lost', name: 'Fixed', subjectId: 'fix-1' }],
        finishedAt: SCOUT_BASE_TIME + 900_000,
      }),
    );
    const map = updateScoutSubjects(updateScoutSubjects(new Map(), one), two);
    const row = map.get('player:fix-1') as ScoutSubjectRecord;
    expect(row.timesSeen).toBe(2);
    expect(row.timesCorrect).toBe(1);
    expect(row.bestRung).toBe(3);
    expect(row.lastSeen).toBe(SCOUT_BASE_TIME + 900_000);
    expect(first.roundStats[0].name).toBe('Repeat Guy');
    expect(second.roundStats[0].mode).toBe('faceZoom');
  });

  it('never worsens a best rung, and remembers the mode it happened in', () => {
    const sharp = record(
      makeScoutRun({
        id: 'a',
        rounds: [{ shape: 'won', rung: 0, subjectId: 's1', name: 'S', mode: 'highlight' }],
      }),
    );
    const slow = record(
      makeScoutRun({ id: 'b', rounds: [{ shape: 'won', rung: 4, subjectId: 's1', name: 'S' }] }),
    );
    const map = updateScoutSubjects(updateScoutSubjects(new Map(), sharp), slow);
    const row = map.get('player:s1') as ScoutSubjectRecord;
    expect(row.bestRung).toBe(0);
    expect(row.bestRungMode).toBe('highlight');
  });

  it('caps by last seen', () => {
    const rows = new Map<string, ScoutSubjectRecord>();
    for (let i = 0; i < 12; i += 1) {
      const key = `player:${i}`;
      rows.set(key, {
        key,
        kind: 'player',
        id: String(i),
        name: `P${i}`,
        tier: 'starter',
        timesSeen: 1,
        timesCorrect: 0,
        bestRung: null,
        lastSeen: i,
      });
    }
    const capped = capScoutSubjects(rows, 5);
    expect(capped.size).toBe(5);
    expect([...capped.keys()].sort()).toEqual(['player:11', 'player:10', 'player:9', 'player:8', 'player:7'].sort());
    expect(capScoutSubjects(rows, MAX_SCOUT_SUBJECTS).size).toBe(12);
  });
});

describe('coercions', () => {
  it('folds an unreal fame tier onto a starter and an unknown format onto standard', () => {
    expect(asScoutFameTier('any')).toBe('starter');
    expect(asScoutFameTier('deepCut')).toBe('deepCut');
    expect(asScoutFormat('gauntlet')).toBe('gauntlet');
    expect(asScoutFormat('sudden-death')).toBe('standard');
    expect(asScoutFormat(42)).toBe('standard');
  });

  it('records the party seats and a blitz at its fixed rung', () => {
    const party = record(partyRun(4));
    expect(party.players).toHaveLength(4);
    expect(party.format).toBe('party');
    const blitz = record(blitzRun(6, 2));
    expect(blitz.correct).toBe(6);
    expect(blitz.rounds).toBe(8);
    expect(blitz.roundStats[0].rung).toBe(2);
    expect(ALL_FRANCHISE_IDS).toHaveLength(32);
  });
});
