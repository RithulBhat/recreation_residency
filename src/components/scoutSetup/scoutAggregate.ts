/**
 * Highlight Scout's stats maths — lifetime totals, per-mode accuracy, pack standings, the subjects
 * you keep missing, and the daily archive.
 *
 * There is ONE Scout ledger and it is not this file: `@/store/scoutResultStore` persists a
 * `ScoutGameRecord[]` (written by the play and results screens). Everything here is a pure
 * derivation over that array, so the stats screen can never drift from what was actually played,
 * and nothing here has to be written to.
 *
 * Songooner's `@/store/statsStore` is welded to `GameState` (clip buckets, track ids, 53
 * song-shaped achievements), which is why Scout aggregates its own. `DailyResult` is reused
 * verbatim from `@/stats/types`, so the calendar strip and streak maths in `@/components/daily`
 * work on Scout data unchanged.
 *
 * NOTE: `@/scout` exposes no achievement engine, so there is deliberately no trophy cabinet.
 */

import { SCOUT_MODES, SCOUT_TEAM_META, scoutPack } from '@/scout/packs';
import { ALL_SCOUT_MODES } from '@/scout/subjects';
import { headshotUrl, logoUrl } from '@/data/nfl';
import { formatScore } from '@/stats/share';
import type { DailyResult } from '@/stats/types';
import type { ScoutGameRecord, ScoutRoundRecord } from '@/store/scoutResultStore';
import type { ScoutMode, SubjectKind } from '@/scout/types';

/** Grid legend — matches the glyphs `scoutResultStore.roundGlyph` writes. */
export const SCOUT_GRID_LEGEND: readonly { emoji: string; label: string }[] = [
  { emoji: '🟩', label: 'named' },
  { emoji: '🟨', label: 'one name away' },
  { emoji: '🟥', label: 'missed' },
  { emoji: '⬜', label: 'skipped' },
];

export interface ScoutModeTotals {
  rounds: number;
  correct: number;
  score: number;
  /** Best single round scored in this mode. */
  bestRound: number;
}

export interface ScoutPackTotals {
  seen: number;
  correct: number;
}

export interface ScoutTotals {
  games: number;
  rounds: number;
  correct: number;
  score: number;
  timePlayedMs: number;
  bestStreak: number;
  /** Rounds solved on the very first rung. */
  firstTry: number;
  byMode: Record<ScoutMode, ScoutModeTotals>;
  byPack: Record<string, ScoutPackTotals>;
}

/** Lifetime history for one player or franchise, derived from every stored round. */
export interface ScoutSubjectRecord {
  /** `player:3139477` / `team:12` */
  key: string;
  kind: SubjectKind;
  id: string;
  name: string;
  image: string;
  teamAbbr?: string;
  timesSeen: number;
  timesCorrect: number;
  lastSeen: number;
}

export function emptyScoutModeTotals(): Record<ScoutMode, ScoutModeTotals> {
  const out = {} as Record<ScoutMode, ScoutModeTotals>;
  for (const mode of ALL_SCOUT_MODES) out[mode] = { rounds: 0, correct: 0, score: 0, bestRound: 0 };
  return out;
}

export function emptyScoutTotals(): ScoutTotals {
  return {
    games: 0,
    rounds: 0,
    correct: 0,
    score: 0,
    timePlayedMs: 0,
    bestStreak: 0,
    firstTry: 0,
    byMode: emptyScoutModeTotals(),
    byPack: {},
  };
}

function isWon(round: ScoutRoundRecord): boolean {
  return round.verdict === 'correct';
}

/** Lifetime totals across every stored session. Pure. */
export function scoutTotals(records: readonly ScoutGameRecord[]): ScoutTotals {
  const totals = emptyScoutTotals();
  for (const record of records) {
    totals.games += 1;
    totals.rounds += record.played;
    totals.correct += record.correct;
    totals.score += record.score;
    totals.timePlayedMs += record.durationMs;
    totals.bestStreak = Math.max(totals.bestStreak, record.bestStreak);

    for (const round of record.rounds) {
      const prev = totals.byMode[round.mode] ?? { rounds: 0, correct: 0, score: 0, bestRound: 0 };
      const won = isWon(round);
      totals.byMode[round.mode] = {
        rounds: prev.rounds + 1,
        correct: prev.correct + (won ? 1 : 0),
        score: prev.score + round.score,
        bestRound: Math.max(prev.bestRound, round.score),
      };
      if (won && round.triesUsed <= 1) totals.firstTry += 1;
    }

    // A mixed-pack run counts towards every pack it drew from.
    for (const packId of record.packIds) {
      const prev = totals.byPack[packId] ?? { seen: 0, correct: 0 };
      totals.byPack[packId] = { seen: prev.seen + record.played, correct: prev.correct + record.correct };
    }
  }
  return totals;
}

const TEAM_ABBR: ReadonlyMap<string, string> = new Map(SCOUT_TEAM_META.map((t) => [t.id, t.abbr]));

/**
 * The picture for a stored round. The ledger keeps ids, not URLs — both CDN paths are pure
 * functions of the id (headshots) or the abbreviation (logos), so nothing has to be persisted.
 */
export function subjectImage(kind: SubjectKind, id: string): string {
  if (kind === 'team') {
    const abbr = TEAM_ABBR.get(id);
    return abbr ? logoUrl(abbr) : '';
  }
  return headshotUrl(id);
}

/** Per-subject lifetime history, keyed `<kind>:<id>`. Pure. */
export function scoutSubjects(records: readonly ScoutGameRecord[]): Record<string, ScoutSubjectRecord> {
  const out: Record<string, ScoutSubjectRecord> = {};
  for (const record of records) {
    for (const round of record.rounds) {
      const key = `${round.kind}:${round.subjectId}`;
      const prev = out[key];
      const next: ScoutSubjectRecord = {
        key,
        kind: round.kind,
        id: round.subjectId,
        name: round.name,
        image: prev?.image ?? subjectImage(round.kind, round.subjectId),
        timesSeen: (prev?.timesSeen ?? 0) + 1,
        timesCorrect: (prev?.timesCorrect ?? 0) + (isWon(round) ? 1 : 0),
        lastSeen: Math.max(prev?.lastSeen ?? 0, record.finishedAt),
      };
      const abbr = round.kind === 'team' ? TEAM_ABBR.get(round.subjectId) : prev?.teamAbbr;
      if (abbr) next.teamAbbr = abbr;
      out[key] = next;
    }
  }
  return out;
}

/** The daily archive keyed by `YYYY-MM-DD`, in the shape `@/components/daily` already speaks. */
export function scoutDailyResults(records: readonly ScoutGameRecord[]): Record<string, DailyResult> {
  const out: Record<string, DailyResult> = {};
  for (const record of records) {
    const date = record.daily;
    if (!date) continue;
    const existing = out[date];
    // Keep the first (newest) result for a date — the store lists newest first.
    if (existing && existing.score >= record.score) continue;
    out[date] = { date, score: record.score, correct: record.correct, rounds: record.played, grid: record.grid };
  }
  return out;
}

/** Today's stored daily session, if it was played. */
export function scoutDailyRecord(
  records: readonly ScoutGameRecord[],
  dateISO: string,
): ScoutGameRecord | undefined {
  return records.find((r) => r.daily === dateISO);
}

// ---------------------------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------------------------

export interface ScoutModeStanding {
  mode: ScoutMode;
  name: string;
  emoji: string;
  rounds: number;
  correct: number;
  score: number;
  /** 0..1 */
  accuracy: number;
}

/** All seven modes in display order; zero-sample modes stay so the chart's axis never moves. */
export function scoutModeStandings(totals: ScoutTotals): ScoutModeStanding[] {
  return SCOUT_MODES.map((m) => {
    const v = totals.byMode[m.id] ?? { rounds: 0, correct: 0, score: 0, bestRound: 0 };
    return {
      mode: m.id,
      name: m.name,
      emoji: m.emoji,
      rounds: v.rounds,
      correct: v.correct,
      score: v.score,
      accuracy: v.rounds > 0 ? v.correct / v.rounds : 0,
    };
  });
}

export interface ScoutPackStanding {
  packId: string;
  name: string;
  emoji: string;
  accent: string;
  seen: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}

export function scoutPackStandings(totals: ScoutTotals): ScoutPackStanding[] {
  return Object.entries(totals.byPack)
    .filter(([, v]) => v.seen > 0)
    .map(([packId, v]) => {
      const pack = scoutPack(packId);
      return {
        packId,
        name: pack?.name ?? packId,
        emoji: pack?.emoji ?? '🏈',
        accent: pack?.accent ?? '#a855f7',
        seen: v.seen,
        correct: v.correct,
        accuracy: v.seen > 0 ? v.correct / v.seen : 0,
      };
    });
}

function rankPacks(list: readonly ScoutPackStanding[], best: boolean, limit: number, minSeen: number) {
  const sort = (rows: readonly ScoutPackStanding[]) =>
    [...rows].sort(
      (a, b) =>
        (best ? b.accuracy - a.accuracy : a.accuracy - b.accuracy) ||
        b.seen - a.seen ||
        a.packId.localeCompare(b.packId),
    );
  const strict = sort(list.filter((p) => p.seen >= minSeen));
  return (strict.length > 0 ? strict : sort(list)).slice(0, limit);
}

export function strongestScoutPacks(list: readonly ScoutPackStanding[], limit = 3, minSeen = 4) {
  return rankPacks(list, true, limit, minSeen);
}

export function weakestScoutPacks(list: readonly ScoutPackStanding[], limit = 3, minSeen = 4) {
  return rankPacks(list, false, limit, minSeen);
}

export interface ScoutNemesis extends ScoutSubjectRecord {
  misses: number;
  /** 0..1 */
  accuracy: number;
}

/** The subjects that keep beating you: most misses first, then worst accuracy. */
export function scoutNemeses(
  subjects: Readonly<Record<string, ScoutSubjectRecord>>,
  limit = 8,
): ScoutNemesis[] {
  return Object.values(subjects)
    .map((s) => ({
      ...s,
      misses: Math.max(0, s.timesSeen - s.timesCorrect),
      accuracy: s.timesSeen > 0 ? s.timesCorrect / s.timesSeen : 0,
    }))
    .filter((s) => s.misses > 0)
    .sort((a, b) => b.misses - a.misses || a.accuracy - b.accuracy || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function scoutAccuracy(totals: ScoutTotals): number {
  return totals.rounds > 0 ? totals.correct / totals.rounds : 0;
}

/** Mean score per completed run. */
export function scoutAvgScore(totals: ScoutTotals): number {
  return totals.games > 0 ? Math.round(totals.score / totals.games) : 0;
}

/** The mode with the best accuracy over a real sample (null until something is played). */
export function sharpestScoutMode(
  standings: readonly ScoutModeStanding[],
  minRounds = 4,
): ScoutModeStanding | null {
  const pick = (threshold: number): ScoutModeStanding | null => {
    let best: ScoutModeStanding | null = null;
    for (const s of standings) {
      if (s.rounds < threshold || s.correct === 0) continue;
      if (!best || s.accuracy > best.accuracy) best = s;
    }
    return best;
  };
  return pick(minRounds) ?? pick(1);
}

// ---------------------------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------------------------

/**
 * `Highlight Scout · Daily 2026-09-26 · 6/8 · 4,210 pts` plus the glyph grid and an optional link.
 * Uses Songooner's `formatScore` so both games' shared numbers are formatted identically.
 */
export function scoutDailyShareText(
  record: Pick<ScoutGameRecord, 'correct' | 'played' | 'score' | 'grid'> & { daily?: string },
  url?: string,
): string {
  const date = record.daily ?? '';
  const parts = [
    `Highlight Scout · Daily ${date} · ${record.correct}/${record.played} · ${formatScore(record.score)} pts`,
    record.grid,
  ].filter((p) => p.length > 0);
  if (url) parts.push(url);
  return parts.join('\n\n');
}
