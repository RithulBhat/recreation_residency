/**
 * Result hand-off between the Highlight Scout play and results screens — the Scout twin of
 * `src/store/resultStore.ts`.
 *
 * Why this exists rather than reusing `statsStore`: `useStatsStore.recordGame` takes a Songooner
 * `GameState` and `summarizeGame` reads track ids, clip lengths and clip buckets off it. A
 * `ScoutState` has none of those, and `src/store/statsStore.ts` belongs to another agent, so Scout
 * folds its own finished sessions in here instead. Everything a Scout stats screen needs is
 * exported: `ScoutGameRecord`, `summarizeScoutGame`, and a persisted, capped history.
 *
 * `record(state)` is idempotent per `ScoutState.id`, exactly like the Songooner store, so Play and a
 * direct visit to /scout/results can both call it.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { roundSeenAt } from '@/scout/engine';
import type { ScoutDifficulty, ScoutMode, ScoutRound, ScoutState } from '@/scout/types';

export const SCOUT_RESULTS_STORAGE_KEY = 'sg:scout-results';
export const SCOUT_RESULTS_VERSION = 1;
/** Sessions kept in local storage, newest first. */
export const MAX_SCOUT_RECORDS = 100;

export interface ScoutRoundRecord {
  index: number;
  mode: ScoutMode;
  kind: 'player' | 'team';
  subjectId: string;
  name: string;
  /** 'correct' | 'close' | 'wrong' | 'skipped' | 'timeout' */
  verdict: ScoutRound['guesses'][number]['verdict'];
  triesUsed: number;
  score: number;
  ms: number;
}

export interface ScoutGameRecord {
  id: string;
  finishedAt: number;
  durationMs: number;
  /** `settings.mode`; with `mixModes` the per-round modes live in `rounds`. */
  mode: ScoutMode;
  mixModes: boolean;
  packIds: string[];
  difficulty: ScoutDifficulty;
  tries: number;
  /** Rounds that actually finished. */
  played: number;
  correct: number;
  close: number;
  score: number;
  bestStreak: number;
  /** Average try index (1-based) of the rounds that were solved; 0 when none were. */
  avgTryWhenRight: number;
  endReason?: ScoutState['endReason'];
  seed?: string;
  daily?: string;
  /** Emoji summary, one glyph per round. */
  grid: string;
  rounds: ScoutRoundRecord[];
}

export interface ScoutChallenger {
  by: string;
  score: number;
}

/** One glyph per round: solved, one name away, missed, skipped. */
export function roundGlyph(round: ScoutRound): string {
  if (round.status === 'won') return '🟩';
  if (round.guesses.some((g) => g.verdict === 'close')) return '🟨';
  if (round.guesses.length > 0 && round.guesses.every((g) => g.verdict === 'skipped')) return '⬜';
  return '🟥';
}

/** `🟩🟩🟨🟥🟩` — wrapped every ten rounds so it pastes tidily. */
export function scoutGrid(state: ScoutState): string {
  const glyphs = state.rounds.filter((r) => r.status !== 'playing').map(roundGlyph);
  const lines: string[] = [];
  for (let i = 0; i < glyphs.length; i += 10) lines.push(glyphs.slice(i, i + 10).join(''));
  return lines.join('\n');
}

function triesUsedIn(round: ScoutRound): number {
  const win = round.guesses.find((g) => g.verdict === 'correct');
  if (win) return win.tryIndex + 1;
  return Math.max(round.tryIndex, round.guesses.length > 0 ? 1 : 0);
}

/** Fold a finished session into a storable record. Returns null when the run is not finished. */
export function summarizeScoutGame(state: ScoutState): ScoutGameRecord | null {
  if (state.status !== 'finished' || state.id === '') return null;
  const done = state.rounds.filter((r) => r.status !== 'playing');
  const correctRounds = done.filter((r) => r.status === 'won');
  const finishedAt = state.finishedAt ?? Date.now();
  const rounds: ScoutRoundRecord[] = done.map((r) => {
    const from = roundSeenAt(r) ?? r.startedAt;
    const last = r.guesses[r.guesses.length - 1];
    const verdict = r.status === 'won' ? 'correct' : (last?.verdict ?? 'skipped');
    return {
      index: r.index,
      mode: r.mode,
      kind: r.subject.kind,
      subjectId: r.subject.id,
      name: r.subject.name,
      verdict,
      triesUsed: triesUsedIn(r),
      score: r.score,
      ms: Math.max(0, (r.endedAt ?? finishedAt) - from),
    };
  });
  const record: ScoutGameRecord = {
    id: state.id,
    finishedAt,
    durationMs: Math.max(0, finishedAt - (state.startedAt ?? finishedAt)),
    mode: state.settings.mode,
    mixModes: state.settings.mixModes,
    packIds: state.settings.packIds.slice(),
    difficulty: state.settings.difficulty,
    tries: state.settings.tries,
    played: done.length,
    correct: correctRounds.length,
    close: done.filter((r) => r.status !== 'won' && r.guesses.some((g) => g.verdict === 'close')).length,
    score: state.totalScore,
    bestStreak: state.bestStreak,
    avgTryWhenRight:
      correctRounds.length === 0
        ? 0
        : Math.round((correctRounds.reduce((n, r) => n + triesUsedIn(r), 0) / correctRounds.length) * 100) / 100,
    grid: scoutGrid(state),
    rounds,
  };
  if (state.endReason) record.endReason = state.endReason;
  if (state.settings.seed) record.seed = state.settings.seed;
  if (state.settings.daily) record.daily = state.settings.daily;
  return record;
}

export interface ScoutResultState {
  /** Session id the stored `record` belongs to. */
  gameId: string | null;
  record: ScoutGameRecord | null;
  challenger: ScoutChallenger | null;
  /** Finished sessions, newest first (persisted). */
  records: ScoutGameRecord[];
}

export interface ScoutResultActions {
  /** Fold a finished session in (idempotent per session id). Null when it is not finished. */
  recordGame(state: ScoutState): ScoutGameRecord | null;
  setChallenger(challenger: ScoutChallenger | null): void;
  /** Drop the hand-off (not the history). */
  clear(): void;
  /** Wipe the stored history too. */
  resetHistory(): void;
  hasPlayedDaily(dateISO: string): boolean;
}

export type ScoutResultStore = ScoutResultState & ScoutResultActions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A stored record we can trust downstream (id + the four numbers a stats screen reads unguarded). */
export function isScoutGameRecord(value: unknown): value is ScoutGameRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return false;
  for (const key of ['finishedAt', 'score', 'played', 'correct'] as const) {
    if (!Number.isFinite(value[key])) return false;
  }
  return Array.isArray(value.rounds) && typeof value.mode === 'string';
}

export function sanitizePersistedScoutResults(raw: unknown): Pick<ScoutResultState, 'records'> {
  const p = isRecord(raw) ? raw : {};
  const records = Array.isArray(p.records) ? p.records.filter(isScoutGameRecord).slice(0, MAX_SCOUT_RECORDS) : [];
  return { records };
}

export const useScoutResultStore = create<ScoutResultStore>()(
  persist(
    (set, get) => ({
      gameId: null,
      record: null,
      challenger: null,
      records: [],

      recordGame: (state) => {
        const next = summarizeScoutGame(state);
        if (!next) return null;
        const { gameId, record, records } = get();
        if (gameId === next.id && record) return record;
        const history = records.some((r) => r.id === next.id)
          ? records
          : [next, ...records].slice(0, MAX_SCOUT_RECORDS);
        set({ gameId: next.id, record: next, records: history });
        return next;
      },

      setChallenger: (challenger) => set({ challenger }),

      clear: () => set({ gameId: null, record: null, challenger: null }),

      resetHistory: () => set({ records: [] }),

      hasPlayedDaily: (dateISO) => get().records.some((r) => r.daily === dateISO),
    }),
    {
      name: SCOUT_RESULTS_STORAGE_KEY,
      version: SCOUT_RESULTS_VERSION,
      storage: createJSONStorage(() => localStorage),
      // The hand-off (current session + challenger) is deliberately in-memory only.
      partialize: (s) => ({ records: s.records }),
      migrate: (persisted) => sanitizePersistedScoutResults(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedScoutResults(persisted) }),
    },
  ),
);
