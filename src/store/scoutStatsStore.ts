/**
 * Highlight Scout stats & progression store — local-first, persisted to `sg:scout-stats`.
 *
 * A thin shell over the pure layer: `@/scout/scoutStats` does the aggregation, `@/scout/progress`
 * the XP and ranks, `@/scout/achievements` the badges, `@/scout/report` the Report Card. Nothing in
 * this file does maths, so all of it is unit-testable without React or storage.
 *
 * Why this is separate from `src/store/scoutResultStore.ts`: that store is the play → results
 * hand-off (one session, plus a short history for the results screen). This one is the LIFETIME
 * record — totals, ranks, badges, dailies, per-subject history — and it is the only thing the Stats
 * screen reads.
 *
 * `recordScoutGame` is idempotent per `ScoutState.id`, so a React effect may call it on every render
 * of the results screen: the second call returns the stored record with `duplicate: true` and writes
 * nothing. It returns `null` only when the run is not finished (nothing to record).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  MAX_SCOUT_RUNS,
  MAX_SCOUT_SUBJECTS,
  applyScoutRun,
  asScoutFameTier,
  asScoutFormat,
  capScoutSubjects,
  emptyScoutTotals,
  updateScoutSubjects,
  type ScoutAchievementUnlock,
  type ScoutCutTotals,
  type ScoutDailyResult,
  type ScoutRunExtras,
  type ScoutRunRecord,
  type ScoutStatsTotals,
  type ScoutSubjectRecord,
} from '@/scout/scoutStats';
import {
  evaluateScoutAchievements,
  scoutLocalDateKey,
  type ScoutAchievement,
  type ScoutAchievementContext,
} from '@/scout/achievements';
import { finalizeScoutRun, scoutRankFor, type ScoutRank } from '@/scout/progress';
import { buildScoutReport, type ScoutReport } from '@/scout/report';
import type { ScoutDifficulty, ScoutMode, ScoutState } from '@/scout/types';

export const SCOUT_STATS_STORAGE_KEY = 'sg:scout-stats';
/** Bump together with a `migrate` branch below. */
export const SCOUT_STATS_VERSION = 1;

/* --------------------------------------------------------------------------------- shapes */

/** The persisted slice. */
export interface ScoutStatsData {
  totals: ScoutStatsTotals;
  /** Newest first, capped at `MAX_SCOUT_RUNS`. */
  runs: ScoutRunRecord[];
  /** Keyed `'player:3139477'`, capped at `MAX_SCOUT_SUBJECTS` by `lastSeen`. */
  subjects: Record<string, ScoutSubjectRecord>;
  achievements: ScoutAchievementUnlock[];
  /** Keyed `YYYY-MM-DD`. */
  daily: Record<string, ScoutDailyResult>;
}

export interface RecordScoutGameResult {
  record: ScoutRunRecord;
  newAchievements: ScoutAchievement[];
  xpGained: number;
  rankBefore: ScoutRank;
  rankAfter: ScoutRank;
  /** Set when the run counted as a daily. */
  daily?: ScoutDailyResult;
  /** True when this run id was already stored — nothing changed. */
  duplicate: boolean;
}

export interface ScoutStatsStore extends ScoutStatsData {
  /** Fold a finished run into lifetime stats. Idempotent per `ScoutState.id`; null when unfinished. */
  recordScoutGame: (state: ScoutState, extras?: ScoutRunExtras) => RecordScoutGameResult | null;
  /** Record a finished run as the daily for its date (or `dateISO`). */
  recordScoutDaily: (
    state: ScoutState,
    dateISO?: string,
    extras?: ScoutRunExtras,
  ) => (RecordScoutGameResult & { daily: ScoutDailyResult }) | null;
  hasPlayedScoutDaily: (dateISO: string) => boolean;
  reset: () => void;
  export: () => string;
  import: (json: string) => boolean;
}

/* ---------------------------------------------------------------------------- normalising */

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCut(value: unknown): ScoutCutTotals {
  if (!isRecordObject(value)) return { seen: 0, correct: 0, rungSum: 0, solved: 0 };
  return {
    seen: num(value.seen),
    correct: num(value.correct),
    rungSum: num(value.rungSum),
    solved: num(value.solved),
  };
}

function normalizeCuts(
  input: unknown,
  seeded: Record<string, ScoutCutTotals>,
): Record<string, ScoutCutTotals> {
  const out: Record<string, ScoutCutTotals> = { ...seeded };
  if (!isRecordObject(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    if (isRecordObject(value)) out[key] = normalizeCut(value);
  }
  return out;
}

/**
 * A stored run record we can trust downstream: the four numbers the screens read unguarded plus a
 * usable `roundStats` array, whose rows the cuts iterate.
 */
export function isScoutRunRecord(value: unknown): value is ScoutRunRecord {
  if (!isRecordObject(value) || typeof value.id !== 'string' || value.id === '') return false;
  for (const key of ['finishedAt', 'score', 'rounds', 'correct'] as const) {
    if (!Number.isFinite(value[key])) return false;
  }
  return Array.isArray(value.roundStats) && typeof value.mode === 'string';
}

/** Rebuild totals defensively from unknown JSON (import / migrate). */
export function normalizeScoutTotals(input: unknown): ScoutStatsTotals {
  const out = emptyScoutTotals();
  if (!isRecordObject(input)) return out;
  out.runs = num(input.runs);
  out.rounds = num(input.rounds);
  out.correct = num(input.correct);
  out.close = num(input.close);
  out.skipped = num(input.skipped);
  out.score = num(input.score);
  out.xp = num(input.xp);
  out.timePlayedMs = num(input.timePlayedMs);
  out.bestStreak = num(input.bestStreak);
  out.bestScore = num(input.bestScore);
  out.perfectRuns = num(input.perfectRuns);
  out.firstRungSolves = num(input.firstRungSolves);
  out.byGroup = normalizeCuts(input.byGroup, out.byGroup);
  out.byConference = normalizeCuts(input.byConference, out.byConference);
  out.byDivision = normalizeCuts(input.byDivision, out.byDivision);
  out.byTier = normalizeCuts(input.byTier, out.byTier);
  out.byMode = normalizeCuts(input.byMode, out.byMode);
  out.byFormat = normalizeCuts(input.byFormat, out.byFormat);
  out.byTeam = normalizeCuts(input.byTeam, out.byTeam);
  if (isRecordObject(input.runsByFormat)) {
    for (const [key, value] of Object.entries(input.runsByFormat)) {
      if (!isRecordObject(value)) continue;
      out.runsByFormat[asScoutFormat(key)] = {
        runs: num(value.runs),
        best: num(value.best),
        avg: num(value.avg),
      };
    }
  }
  const call = input.bestCall;
  if (isRecordObject(call) && typeof call.name === 'string' && Number.isFinite(call.rung)) {
    out.bestCall = {
      key: str(call.key, `${str(call.kind, 'player')}:${str(call.subjectId)}`),
      subjectId: str(call.subjectId),
      name: call.name,
      mode: str(call.mode, 'silhouette') as ScoutMode,
      rung: num(call.rung),
      tier: asScoutFameTier(str(call.tier, 'starter') as ScoutDifficulty),
      runId: str(call.runId),
      at: num(call.at),
      ...(typeof call.teamAbbr === 'string' ? { teamAbbr: call.teamAbbr } : {}),
    };
  }
  return out;
}

function normalizeSubject(value: unknown): ScoutSubjectRecord | null {
  if (!isRecordObject(value)) return null;
  const key = str(value.key);
  const id = str(value.id);
  if (key === '' || id === '') return null;
  const row: ScoutSubjectRecord = {
    key,
    kind: value.kind === 'team' ? 'team' : 'player',
    id,
    name: str(value.name, id),
    tier: asScoutFameTier(str(value.tier, 'starter') as ScoutDifficulty),
    timesSeen: num(value.timesSeen),
    timesCorrect: num(value.timesCorrect),
    bestRung: Number.isFinite(value.bestRung) ? num(value.bestRung) : null,
    lastSeen: num(value.lastSeen),
  };
  if (typeof value.teamId === 'string') row.teamId = value.teamId;
  if (typeof value.teamAbbr === 'string') row.teamAbbr = value.teamAbbr;
  if (typeof value.group === 'string') row.group = value.group as ScoutSubjectRecord['group'];
  if (typeof value.bestRungMode === 'string') row.bestRungMode = value.bestRungMode as ScoutMode;
  return row;
}

export function normalizeScoutStatsData(input: unknown): ScoutStatsData {
  const data = emptyScoutStatsData();
  if (!isRecordObject(input)) return data;
  data.totals = normalizeScoutTotals(input.totals);
  const runs = Array.isArray(input.runs) ? input.runs : Array.isArray(input.records) ? input.records : [];
  data.runs = runs.filter(isScoutRunRecord).slice(0, MAX_SCOUT_RUNS);
  if (isRecordObject(input.subjects)) {
    const rows: ScoutSubjectRecord[] = [];
    for (const value of Object.values(input.subjects)) {
      const row = normalizeSubject(value);
      if (row) rows.push(row);
    }
    data.subjects = fromSubjectMap(capScoutSubjects(new Map(rows.map((r) => [r.key, r]))));
  }
  if (Array.isArray(input.achievements)) {
    data.achievements = input.achievements
      .filter((a): a is Record<string, unknown> => isRecordObject(a) && typeof a.id === 'string')
      .map((a) => ({ id: str(a.id), at: num(a.at), runId: str(a.runId) }));
  }
  if (isRecordObject(input.daily)) {
    for (const [date, value] of Object.entries(input.daily)) {
      if (!isRecordObject(value)) continue;
      data.daily[date] = {
        date,
        score: num(value.score),
        correct: num(value.correct),
        rounds: num(value.rounds),
        grid: str(value.grid),
      };
    }
  }
  return data;
}

export function emptyScoutStatsData(): ScoutStatsData {
  return { totals: emptyScoutTotals(), runs: [], subjects: {}, achievements: [], daily: {} };
}

function toSubjectMap(subjects: Record<string, ScoutSubjectRecord>): Map<string, ScoutSubjectRecord> {
  const map = new Map<string, ScoutSubjectRecord>();
  for (const row of Object.values(subjects)) {
    if (row && typeof row.key === 'string') map.set(row.key, row);
  }
  return map;
}

function fromSubjectMap(map: ReadonlyMap<string, ScoutSubjectRecord>): Record<string, ScoutSubjectRecord> {
  const out: Record<string, ScoutSubjectRecord> = {};
  for (const [key, row] of map) out[key] = row;
  return out;
}

/* ------------------------------------------------------------------------------------ store */

export const useScoutStatsStore = create<ScoutStatsStore>()(
  persist(
    (set, get) => {
      const ingest = (
        state: ScoutState,
        dateISO?: string,
        extras?: ScoutRunExtras,
      ): RecordScoutGameResult | null => {
        const prev = get();
        const rankBefore = scoutRankFor(prev.totals.xp);
        const existing = prev.runs.find((r) => r.id === state.id);
        if (existing) {
          const storedDaily = existing.daily ? prev.daily[existing.daily] : undefined;
          return {
            record: existing,
            newAchievements: [],
            xpGained: 0,
            rankBefore,
            rankAfter: rankBefore,
            duplicate: true,
            ...(storedDaily ? { daily: storedDaily } : {}),
          };
        }

        const record = finalizeScoutRun(state, extras ?? {});
        if (!record) return null;
        const dailyKey = dateISO ?? record.daily;
        if (dailyKey) record.daily = dailyKey;

        const totals = applyScoutRun(prev.totals, record);
        const subjectMap = capScoutSubjects(
          updateScoutSubjects(toSubjectMap(prev.subjects), record),
          MAX_SCOUT_SUBJECTS,
        );
        const runs = [record, ...prev.runs].slice(0, MAX_SCOUT_RUNS);

        const daily = { ...prev.daily };
        let dailyResult: ScoutDailyResult | undefined;
        if (dailyKey) {
          dailyResult = {
            date: dailyKey,
            score: record.score,
            correct: record.correct,
            rounds: record.rounds,
            grid: record.grid,
          };
          daily[dailyKey] = dailyResult;
        }

        const ctx: ScoutAchievementContext = {
          state,
          record,
          totals,
          subjects: subjectMap,
          dailies: Object.keys(daily).length,
          records: runs,
        };
        const unlockedIds = new Set(prev.achievements.map((a) => a.id));
        const newAchievements = evaluateScoutAchievements(ctx, unlockedIds);
        const at = record.finishedAt > 0 ? record.finishedAt : Date.now();
        const achievements = [
          ...prev.achievements,
          ...newAchievements.map((a) => ({ id: a.id, at, runId: record.id })),
        ];

        set({ totals, runs, subjects: fromSubjectMap(subjectMap), achievements, daily });
        return {
          record,
          newAchievements,
          xpGained: record.xp,
          rankBefore,
          rankAfter: scoutRankFor(totals.xp),
          duplicate: false,
          ...(dailyResult ? { daily: dailyResult } : {}),
        };
      };

      return {
        ...emptyScoutStatsData(),

        recordScoutGame: (state, extras) => ingest(state, undefined, extras),

        recordScoutDaily: (state, dateISO, extras) => {
          const key =
            dateISO ??
            state.settings.daily ??
            scoutLocalDateKey(state.finishedAt ?? state.startedAt ?? Date.now());
          const result = ingest(state, key, extras);
          if (!result) return null;
          const daily: ScoutDailyResult =
            result.daily ??
            get().daily[key] ?? {
              date: key,
              score: result.record.score,
              correct: result.record.correct,
              rounds: result.record.rounds,
              grid: result.record.grid,
            };
          return { ...result, daily };
        },

        hasPlayedScoutDaily: (dateISO) => get().daily[dateISO] !== undefined,

        reset: () => set(emptyScoutStatsData()),

        export: () =>
          JSON.stringify({
            app: 'highlight-scout',
            v: SCOUT_STATS_VERSION,
            exportedAt: Date.now(),
            data: {
              totals: get().totals,
              runs: get().runs,
              subjects: get().subjects,
              achievements: get().achievements,
              daily: get().daily,
            },
          }),

        import: (json) => {
          try {
            const parsed: unknown = JSON.parse(json);
            if (!isRecordObject(parsed)) return false;
            const payload = isRecordObject(parsed.data) ? parsed.data : parsed;
            if (
              !isRecordObject(payload.totals) &&
              !Array.isArray(payload.runs) &&
              !isRecordObject(payload.daily)
            ) {
              return false;
            }
            set(normalizeScoutStatsData(payload));
            return true;
          } catch {
            return false;
          }
        },
      };
    },
    {
      name: SCOUT_STATS_STORAGE_KEY,
      version: SCOUT_STATS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): ScoutStatsData => ({
        totals: state.totals,
        runs: state.runs,
        subjects: state.subjects,
        achievements: state.achievements,
        daily: state.daily,
      }),
      migrate: (persisted, version) => {
        // v1 is the first shape; anything older or unknown is normalised in place. A future v2 adds
        // its branch here and leaves this one alone.
        if (version === SCOUT_STATS_VERSION) return normalizeScoutStatsData(persisted);
        return normalizeScoutStatsData(persisted);
      },
      merge: (persisted, current) => ({ ...current, ...normalizeScoutStatsData(persisted) }),
    },
  ),
);

/* -------------------------------------------------------------------------------- selectors */

export const selectScoutRank = (state: ScoutStatsStore): ScoutRank => scoutRankFor(state.totals.xp);

export const selectScoutUnlockedIds = (state: ScoutStatsStore): Set<string> =>
  new Set(state.achievements.map((a) => a.id));

/** Per-subject history, most recently seen first. */
export const selectScoutSubjectList = (state: ScoutStatsStore): ScoutSubjectRecord[] =>
  Object.values(state.subjects).sort((a, b) => b.lastSeen - a.lastSeen);

export const selectScoutDailyList = (state: ScoutStatsStore): ScoutDailyResult[] =>
  Object.values(state.daily).sort((a, b) => (a.date < b.date ? 1 : -1));

/**
 * The whole Report Card. This builds a fresh object every call, so a component should either
 * subscribe to the slices it needs and memoise this, or call it once per render — never use it as a
 * `useScoutStatsStore(selectScoutReport)` equality-checked selector.
 */
export function scoutReportOf(state: ScoutStatsData): ScoutReport {
  return buildScoutReport({
    totals: state.totals,
    records: state.runs,
    subjects: Object.values(state.subjects),
  });
}
