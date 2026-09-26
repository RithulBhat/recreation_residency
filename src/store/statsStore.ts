/**
 * Stats & progression store — local-first, persisted to localStorage (`sg:stats`).
 *
 * The store is a thin shell: all of the maths lives in `src/stats/*` as pure
 * functions, so it can be unit tested without React or storage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState } from '@/types/game';
import {
  MAX_RECORDS,
  MAX_TRACKS,
  applyGame,
  capTrackRecords,
  emptyTotals,
  summarizeGame,
  updateTrackRecords,
  xpForGame,
} from '@/stats/aggregate';
import {
  evaluateAchievements,
  localDateKey,
  type Achievement,
  type AchievementContext,
} from '@/stats/achievements';
import { rankFor, type Rank } from '@/stats/rank';
import { resultGrid } from '@/stats/share';
import {
  CLIP_BUCKETS,
  GAME_MODES,
  type AchievementUnlock,
  type ClipBucket,
  type DailyResult,
  type GameRecord,
  type PackMeta,
  type StatsTotals,
  type TrackRecord,
} from '@/stats/types';

export const STATS_STORAGE_KEY = 'sg:stats';
/** Bump together with a `migrate` branch below. */
export const STATS_VERSION = 1;

/* ------------------------------------------------------------------ pack meta */

let packMetaRegistry: ReadonlyMap<string, PackMeta> = new Map();

/**
 * Register pack metadata once at boot (`setPackMeta(PACKS)`), so achievements
 * that need tags (languages, decades) can resolve them. Optional: everything
 * else works without it.
 */
export function setPackMeta(packs: readonly PackMeta[]): void {
  packMetaRegistry = new Map(packs.map((p) => [p.id, p]));
}

export function getPackMeta(): ReadonlyMap<string, PackMeta> {
  return packMetaRegistry;
}

/* --------------------------------------------------------------------- shapes */

/** The persisted slice. */
export interface StatsData {
  totals: StatsTotals;
  /** newest first, capped at 200 */
  records: GameRecord[];
  /** keyed by Deezer track id, capped at 1500 by `lastSeen` */
  tracks: Record<number, TrackRecord>;
  achievements: AchievementUnlock[];
  /** keyed by `YYYY-MM-DD` */
  daily: Record<string, DailyResult>;
}

export interface RecordGameResult {
  record: GameRecord;
  newAchievements: Achievement[];
  xpGained: number;
  rankBefore: Rank;
  rankAfter: Rank;
  /** set when the game counted as a daily */
  daily?: DailyResult;
  /** true when this game id was already stored — nothing was changed */
  duplicate: boolean;
}

export interface StatsStore extends StatsData {
  /** Fold a finished game into stats. Idempotent per `GameState.id`. */
  recordGame: (state: GameState) => RecordGameResult;
  /** Record a finished game as the daily for its date (or `dateISO`). */
  recordDaily: (state: GameState, dateISO?: string) => RecordGameResult & { daily: DailyResult };
  hasPlayedDaily: (dateISO: string) => boolean;
  reset: () => void;
  export: () => string;
  import: (json: string) => boolean;
}

/* ------------------------------------------------------------------ normalising */

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A stored game record we can trust downstream: `finishedAt` / `score` / `rounds` are read
 * unguarded (recent form, five-a-day) and `mode` indexes `byMode`, so all four must be sound.
 */
function isGameRecord(value: unknown): value is GameRecord {
  if (!isRecordObject(value) || typeof value.id !== 'string') return false;
  if (!Number.isFinite(value.finishedAt) || !Number.isFinite(value.score) || !Number.isFinite(value.rounds)) {
    return false;
  }
  return typeof value.mode === 'string' && (GAME_MODES as readonly string[]).includes(value.mode);
}

/** Rebuild totals defensively from unknown JSON (import / migrate). */
export function normalizeTotals(input: unknown): StatsTotals {
  const out = emptyTotals();
  if (!isRecordObject(input)) return out;
  out.games = num(input.games);
  out.rounds = num(input.rounds);
  out.correct = num(input.correct);
  out.partial = num(input.partial);
  out.score = num(input.score);
  out.xp = num(input.xp);
  out.timePlayedMs = num(input.timePlayedMs);
  out.bestStreak = num(input.bestStreak);
  out.perfectRounds = num(input.perfectRounds);
  const byMode = input.byMode;
  if (isRecordObject(byMode)) {
    for (const mode of GAME_MODES) {
      const v = byMode[mode];
      if (isRecordObject(v)) {
        out.byMode[mode] = { games: num(v.games), best: num(v.best), avg: num(v.avg) };
      }
    }
  }
  const byPack = input.byPack;
  if (isRecordObject(byPack)) {
    for (const [packId, v] of Object.entries(byPack)) {
      if (isRecordObject(v)) out.byPack[packId] = { seen: num(v.seen), correct: num(v.correct) };
    }
  }
  const byClipBucket = input.byClipBucket;
  if (isRecordObject(byClipBucket)) {
    for (const bucket of CLIP_BUCKETS) {
      const v = byClipBucket[bucket as ClipBucket];
      if (isRecordObject(v)) {
        out.byClipBucket[bucket] = { seen: num(v.seen), correct: num(v.correct) };
      }
    }
  }
  return out;
}

function normalizeData(input: unknown): StatsData {
  const data = emptyData();
  if (!isRecordObject(input)) return data;
  data.totals = normalizeTotals(input.totals);
  if (Array.isArray(input.records)) {
    data.records = input.records.filter(isGameRecord).slice(0, MAX_RECORDS);
  }
  if (isRecordObject(input.tracks)) {
    for (const value of Object.values(input.tracks)) {
      if (isRecordObject(value) && typeof value.trackId === 'number') {
        data.tracks[value.trackId] = value as unknown as TrackRecord;
      }
    }
  }
  if (Array.isArray(input.achievements)) {
    data.achievements = input.achievements.filter(
      (a): a is AchievementUnlock => isRecordObject(a) && typeof a.id === 'string',
    );
  }
  if (isRecordObject(input.daily)) {
    for (const [date, value] of Object.entries(input.daily)) {
      if (isRecordObject(value)) data.daily[date] = { ...(value as unknown as DailyResult), date };
    }
  }
  return data;
}

function emptyData(): StatsData {
  return { totals: emptyTotals(), records: [], tracks: {}, achievements: [], daily: {} };
}

function toTrackMap(tracks: Record<number, TrackRecord>): Map<number, TrackRecord> {
  const map = new Map<number, TrackRecord>();
  for (const track of Object.values(tracks)) {
    if (track && typeof track.trackId === 'number') map.set(track.trackId, track);
  }
  return map;
}

function fromTrackMap(map: ReadonlyMap<number, TrackRecord>): Record<number, TrackRecord> {
  const out: Record<number, TrackRecord> = {};
  for (const [id, track] of map) out[id] = track;
  return out;
}

/* ---------------------------------------------------------------------- store */

export const useStatsStore = create<StatsStore>()(
  persist(
    (set, get) => {
      const ingest = (state: GameState, dateISO?: string): RecordGameResult => {
        const prev = get();
        const rankBefore = rankFor(prev.totals.xp);
        const existing = prev.records.find((r) => r.id === state.id);
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

        const record = summarizeGame(state);
        const dailyKey = dateISO ?? record.daily;
        if (dailyKey) record.daily = dailyKey;

        const totals = applyGame(prev.totals, record, state);
        const xpGained = xpForGame(record);
        const trackMap = capTrackRecords(updateTrackRecords(toTrackMap(prev.tracks), state), MAX_TRACKS);
        const records = [record, ...prev.records].slice(0, MAX_RECORDS);

        const daily = { ...prev.daily };
        let dailyResult: DailyResult | undefined;
        if (dailyKey) {
          dailyResult = {
            date: dailyKey,
            score: record.score,
            correct: record.correct,
            rounds: record.rounds,
            grid: resultGrid(state),
          };
          daily[dailyKey] = dailyResult;
        }

        const ctx: AchievementContext = {
          state,
          record,
          totals,
          tracks: trackMap,
          packs: packMetaRegistry,
          dailies: Object.keys(daily).length,
          records,
        };
        const unlockedIds = new Set(prev.achievements.map((a) => a.id));
        const newAchievements = evaluateAchievements(ctx, unlockedIds);
        const at = record.finishedAt > 0 ? record.finishedAt : Date.now();
        const achievements = [
          ...prev.achievements,
          ...newAchievements.map((a) => ({ id: a.id, at, gameId: record.id })),
        ];

        set({ totals, records, tracks: fromTrackMap(trackMap), achievements, daily });
        return {
          record,
          newAchievements,
          xpGained,
          rankBefore,
          rankAfter: rankFor(totals.xp),
          duplicate: false,
          ...(dailyResult ? { daily: dailyResult } : {}),
        };
      };

      return {
        ...emptyData(),

        recordGame: (state) => ingest(state),

        recordDaily: (state, dateISO) => {
          const key =
            dateISO ??
            state.settings.daily ??
            localDateKey(state.finishedAt ?? state.startedAt ?? Date.now());
          const result = ingest(state, key);
          const daily: DailyResult =
            result.daily ??
            get().daily[key] ?? {
              date: key,
              score: result.record.score,
              correct: result.record.correct,
              rounds: result.record.rounds,
              grid: resultGrid(state),
            };
          return { ...result, daily };
        },

        hasPlayedDaily: (dateISO) => get().daily[dateISO] !== undefined,

        reset: () => set(emptyData()),

        export: () =>
          JSON.stringify({
            app: 'songooner',
            v: STATS_VERSION,
            exportedAt: Date.now(),
            data: {
              totals: get().totals,
              records: get().records,
              tracks: get().tracks,
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
              !Array.isArray(payload.records) &&
              !isRecordObject(payload.daily)
            ) {
              return false;
            }
            set(normalizeData(payload));
            return true;
          } catch {
            return false;
          }
        },
      };
    },
    {
      name: STATS_STORAGE_KEY,
      version: STATS_VERSION,
      partialize: (state): StatsData => ({
        totals: state.totals,
        records: state.records,
        tracks: state.tracks,
        achievements: state.achievements,
        daily: state.daily,
      }),
      migrate: (persisted, version) => {
        // v1 is the first shape; anything older/unknown is normalised in place.
        if (version === STATS_VERSION) return normalizeData(persisted);
        return normalizeData(persisted);
      },
      merge: (persisted, current) => ({ ...current, ...normalizeData(persisted) }),
    },
  ),
);

/* ------------------------------------------------------------------ selectors */

export const selectRank = (state: StatsStore): Rank => rankFor(state.totals.xp);

export const selectUnlockedIds = (state: StatsStore): Set<string> =>
  new Set(state.achievements.map((a) => a.id));

/** Per-track history as a Map, newest-seen first. */
export const selectTrackList = (state: StatsStore): TrackRecord[] =>
  Object.values(state.tracks).sort((a, b) => b.lastSeen - a.lastSeen);

export const selectDailyList = (state: StatsStore): DailyResult[] =>
  Object.values(state.daily).sort((a, b) => (a.date < b.date ? 1 : -1));
