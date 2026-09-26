/**
 * Stats & progression contracts.
 *
 * Everything here is local-first: the shapes below are exactly what gets
 * serialised into localStorage under `sg:stats` (see `src/store/statsStore.ts`).
 * Keep them JSON-safe — no Maps, Sets, Dates or class instances.
 */

import type { ClipMode, GameMode } from '@/types/game';
import type { Difficulty } from '@/types/catalog';

/** Clip-length histogram buckets, shortest → longest. */
export type ClipBucket = '0.1' | '0.25' | '0.5' | '1' | '2' | '5' | '10';

/** Ordered bucket list (shortest first) — safe to iterate for charts. */
export const CLIP_BUCKETS: readonly ClipBucket[] = ['0.1', '0.25', '0.5', '1', '2', '5', '10'];

/** All game modes, in display order. Mirrors `GameMode`. */
export const GAME_MODES: readonly GameMode[] = [
  'classic',
  'fixed',
  'blitz',
  'survival',
  'duel',
  'party',
];

/** Per-player line on a multiplayer record. */
export interface GamePlayerResult {
  name: string;
  score: number;
}

/** One finished game, condensed. Newest-first in the store (capped at 200). */
export interface GameRecord {
  /** Same id as the `GameState` it came from — used to de-duplicate writes. */
  id: string;
  finishedAt: number;
  mode: GameMode;
  packIds: string[];
  difficulty: Difficulty;
  clipMode: ClipMode;
  /** Settings snapshot: fixed clip length (seconds). */
  clipLength: number;
  /** Settings snapshot: escalating stage lengths (seconds). */
  stages: number[];
  /** Rounds actually played. */
  rounds: number;
  /** Rounds won. */
  correct: number;
  /** Rounds that ended unwon but earned partial credit (artist only). */
  partial: number;
  score: number;
  bestStreak: number;
  /** Mean tries used on won rounds (2dp). 0 when nothing was won. */
  avgTries: number;
  /** Mean clip length (seconds) heard at the moment of a correct guess (3dp). */
  avgClipLengthHeard: number;
  durationMs: number;
  /** `YYYY-MM-DD` when this was a daily run. */
  daily?: string;
  /** Present for 2+ player games (duel / party). */
  players?: GamePlayerResult[];
  /** Unique top scorer of a 2+ player game. */
  winnerName?: string;
}

/** Per-track lifetime history (capped at 1500 by `lastSeen`). */
export interface TrackRecord {
  trackId: number;
  title: string;
  artist: string;
  cover: string;
  packId?: string;
  timesSeen: number;
  timesCorrect: number;
  /** Shortest clip (seconds) this track was ever guessed at. null = never guessed. */
  fastestClip: number | null;
  lastSeen: number;
}

export interface ModeTotals {
  games: number;
  /** Best single-game score in this mode. */
  best: number;
  /** Mean score per game in this mode. */
  avg: number;
}

export interface PackTotals {
  seen: number;
  correct: number;
}

export interface BucketTotals {
  seen: number;
  correct: number;
}

/** Lifetime aggregates. */
export interface StatsTotals {
  games: number;
  rounds: number;
  correct: number;
  partial: number;
  score: number;
  xp: number;
  timePlayedMs: number;
  bestStreak: number;
  byMode: Record<GameMode, ModeTotals>;
  byPack: Record<string, PackTotals>;
  /** Keyed by the clip length heard at the time of the guess. */
  byClipBucket: Record<ClipBucket, BucketTotals>;
  /** Rounds won on the first try at the shortest available clip length. */
  perfectRounds: number;
}

/** A completed daily, keyed by ISO date in the store. */
export interface DailyResult {
  /** `YYYY-MM-DD` */
  date: string;
  score: number;
  correct: number;
  rounds: number;
  /** Shareable emoji grid (see `src/stats/share.ts`). */
  grid: string;
}

export interface AchievementUnlock {
  id: string;
  at: number;
  gameId: string;
}

/**
 * Minimal pack metadata the stats layer needs. Structurally satisfied by
 * `Pack` from `@/types/catalog`, so callers can pass packs straight through
 * without the stats module depending on the catalog.
 */
export interface PackMeta {
  id: string;
  name: string;
  emoji: string;
  tags: readonly string[];
  accent?: string;
}

/** A pack standing row, as used by `weakestPacks`. */
export interface PackStanding {
  packId: string;
  name: string;
  emoji: string;
  seen: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}

/** One point of the recent-form sparkline (oldest → newest). */
export interface RecentFormPoint {
  gameId: string;
  at: number;
  mode: GameMode;
  score: number;
  rounds: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
  /** true when every played round was won. */
  clean: boolean;
}

/** Accuracy for a single clip bucket. */
export interface ClipBucketStanding {
  bucket: ClipBucket;
  seen: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}
