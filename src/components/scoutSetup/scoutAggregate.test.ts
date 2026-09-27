import { describe, expect, it } from 'vitest';
import { createInitialScoutState, reduce } from '@/scout/engine';
import { SCOUT_MODES } from '@/scout/packs';
import { normalizeScoutSettings } from '@/scout/presets';
import { buildPool } from '@/scout/subjects';
import { fixtureBundle } from '@/scout/fixtures';
import { headshotUrl, logoUrl } from '@/data/nfl';
import { summarizeScoutGame, type ScoutGameRecord } from '@/store/scoutResultStore';
import type { ScoutSettings, ScoutState } from '@/scout/types';
import {
  emptyScoutTotals,
  scoutAccuracy,
  scoutAvgScore,
  scoutDailyRecord,
  scoutDailyResults,
  scoutDailyShareText,
  scoutModeStandings,
  scoutNemeses,
  scoutPackStandings,
  scoutSubjects,
  scoutTotals,
  sharpestScoutMode,
  strongestScoutPacks,
  subjectImage,
  weakestScoutPacks,
  type ScoutSubjectRecord,
} from './scoutAggregate';

const bundle = fixtureBundle();

function settingsFor(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return normalizeScoutSettings({
    mode: 'silhouette',
    packIds: ['conf-afc', 'conf-nfc'],
    difficulty: 'any',
    tries: 3,
    rounds: 3,
    seed: 'aggregate-test',
    ...over,
  });
}

/** Win round 0 on the first rung, lose round 1 on wrong guesses, give up round 2. */
function playRun(settings: ScoutSettings = settingsFor()): ScoutState {
  const subjects = buildPool(bundle, settings);
  expect(subjects.length).toBeGreaterThanOrEqual(3);
  let s = reduce(createInitialScoutState(), { type: 'start', settings, subjects, now: 1_000 });
  s = reduce(s, { type: 'guess', text: s.rounds[0]!.subject.name, now: 2_000 });
  s = reduce(s, { type: 'next', now: 2_100 });
  for (let i = 0; i < settings.tries; i++) {
    s = reduce(s, { type: 'guess', text: 'definitely not a real football player', now: 3_000 + i });
  }
  s = reduce(s, { type: 'next', now: 4_000 });
  s = reduce(s, { type: 'giveUp', now: 5_000 });
  s = reduce(s, { type: 'next', now: 6_000 });
  expect(s.status).toBe('finished');
  return s;
}

function recordOf(settings?: ScoutSettings): ScoutGameRecord {
  const record = summarizeScoutGame(playRun(settings));
  expect(record).not.toBeNull();
  return record!;
}

describe('scoutTotals', () => {
  it('is empty for an empty ledger', () => {
    const totals = scoutTotals([]);
    expect(totals).toEqual(emptyScoutTotals());
    expect(scoutAccuracy(totals)).toBe(0);
    expect(scoutAvgScore(totals)).toBe(0);
  });

  it('folds a real session the play screen would have stored', () => {
    const record = recordOf();
    const totals = scoutTotals([record]);
    expect(totals.games).toBe(1);
    expect(totals.rounds).toBe(3);
    expect(totals.correct).toBe(1);
    expect(totals.firstTry).toBe(1); // the one win landed on rung one
    expect(totals.score).toBe(record.score);
    expect(totals.byMode.silhouette.rounds).toBe(3);
    expect(totals.byMode.silhouette.correct).toBe(1);
    expect(totals.byMode.silhouette.bestRound).toBeGreaterThan(0);
    expect(totals.byMode.logoZoom.rounds).toBe(0);
    // a mixed-pack run counts towards every pack it drew from
    expect(totals.byPack['conf-afc']).toEqual({ seen: 3, correct: 1 });
    expect(totals.byPack['conf-nfc']).toEqual({ seen: 3, correct: 1 });
    expect(scoutAccuracy(totals)).toBeCloseTo(1 / 3, 5);
  });

  it('accumulates across sessions and keeps the best streak', () => {
    const a = recordOf();
    const b: ScoutGameRecord = { ...a, id: 'second', bestStreak: 9 };
    const totals = scoutTotals([a, b]);
    expect(totals.games).toBe(2);
    expect(totals.rounds).toBe(6);
    expect(totals.bestStreak).toBe(9);
    expect(scoutAvgScore(totals)).toBe(Math.round(totals.score / 2));
  });
});

describe('scoutSubjects', () => {
  it('builds a lifetime row per subject, with a CDN image derived from the id', () => {
    const record = recordOf();
    const subjects = scoutSubjects([record]);
    expect(Object.keys(subjects)).toHaveLength(3);
    const won = record.rounds.find((r) => r.verdict === 'correct')!;
    const row = subjects[`player:${won.subjectId}`]!;
    expect(row).toMatchObject({ timesSeen: 1, timesCorrect: 1, name: won.name, kind: 'player' });
    expect(row.image).toBe(headshotUrl(won.subjectId));
    expect(row.lastSeen).toBe(record.finishedAt);
  });

  it('adds up repeat sightings', () => {
    const a = recordOf();
    const b: ScoutGameRecord = { ...a, id: 'second', finishedAt: a.finishedAt + 1000 };
    const subjects = scoutSubjects([a, b]);
    const won = a.rounds.find((r) => r.verdict === 'correct')!;
    expect(subjects[`player:${won.subjectId}`]).toMatchObject({ timesSeen: 2, timesCorrect: 2 });
    expect(subjects[`player:${won.subjectId}`]!.lastSeen).toBe(b.finishedAt);
  });

  it('resolves a franchise logo from the team id', () => {
    expect(subjectImage('team', '12')).toBe(logoUrl('KC'));
    expect(subjectImage('player', '3139477')).toBe(headshotUrl('3139477'));
    expect(subjectImage('team', 'not-a-team')).toBe('');
  });
});

describe('the daily archive', () => {
  it('keys sessions by date in the shape the calendar strip speaks', () => {
    const record = recordOf(settingsFor({ daily: '2026-09-26' }));
    const daily = scoutDailyResults([record]);
    expect(daily['2026-09-26']).toEqual({
      date: '2026-09-26',
      score: record.score,
      correct: 1,
      rounds: 3,
      grid: record.grid,
    });
    expect(scoutDailyRecord([record], '2026-09-26')).toBe(record);
    expect(scoutDailyRecord([record], '2026-09-25')).toBeUndefined();
  });

  it('ignores sessions that were not dailies', () => {
    expect(scoutDailyResults([recordOf()])).toEqual({});
  });

  it('keeps the best score when a date somehow has two sessions', () => {
    const a = recordOf(settingsFor({ daily: '2026-09-26' }));
    const worse: ScoutGameRecord = { ...a, id: 'worse', score: a.score - 100 };
    expect(scoutDailyResults([a, worse])['2026-09-26']!.score).toBe(a.score);
    expect(scoutDailyResults([worse, a])['2026-09-26']!.score).toBe(a.score);
  });

  it('writes share text with the headline, the grid and the link', () => {
    const record = recordOf(settingsFor({ daily: '2026-09-26' }));
    const text = scoutDailyShareText(record, 'https://example.test/#/scout/daily');
    expect(text).toContain('Highlight Scout · Daily 2026-09-26 · 1/3');
    expect(text).toContain(record.grid);
    expect(text).toContain('https://example.test/#/scout/daily');
  });
});

describe('standings', () => {
  const totals = {
    ...emptyScoutTotals(),
    byMode: {
      ...emptyScoutTotals().byMode,
      silhouette: { rounds: 10, correct: 8, score: 5000, bestRound: 900 },
      logoZoom: { rounds: 10, correct: 2, score: 900, bestRound: 300 },
    },
    byPack: {
      superstars: { seen: 20, correct: 16 },
      'deep-cuts': { seen: 20, correct: 3 },
      unplayed: { seen: 0, correct: 0 },
    },
  };

  it('keeps every mode on the axis and finds the sharpest', () => {
    const standings = scoutModeStandings(totals);
    // One row per puzzle type, however many there are — `SCOUT_MODES` grows.
    expect(standings).toHaveLength(SCOUT_MODES.length);
    expect(standings.find((s) => s.mode === 'statLine')!.rounds).toBe(0);
    expect(sharpestScoutMode(standings)!.mode).toBe('silhouette');
    expect(sharpestScoutMode(scoutModeStandings(emptyScoutTotals()))).toBeNull();
  });

  it('names packs and ranks them both ways', () => {
    const rows = scoutPackStandings(totals);
    expect(rows.map((r) => r.packId).sort()).toEqual(['deep-cuts', 'superstars']);
    expect(rows.find((r) => r.packId === 'superstars')!.name).toBe('Superstars');
    expect(strongestScoutPacks(rows)[0]!.packId).toBe('superstars');
    expect(weakestScoutPacks(rows)[0]!.packId).toBe('deep-cuts');
  });
});

describe('scoutNemeses', () => {
  it('ranks by misses, then by accuracy, and ignores the ones you always get', () => {
    const subjects: Record<string, ScoutSubjectRecord> = {
      a: { key: 'a', kind: 'player', id: 'a', name: 'Alpha', image: '', timesSeen: 5, timesCorrect: 1, lastSeen: 1 },
      b: { key: 'b', kind: 'player', id: 'b', name: 'Bravo', image: '', timesSeen: 2, timesCorrect: 0, lastSeen: 2 },
      c: { key: 'c', kind: 'player', id: 'c', name: 'Charlie', image: '', timesSeen: 3, timesCorrect: 3, lastSeen: 3 },
    };
    const rows = scoutNemeses(subjects);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b']);
    expect(rows[0]!.misses).toBe(4);
    expect(rows[0]!.accuracy).toBeCloseTo(0.2, 5);
  });
});
