/**
 * Pure stats aggregation. No React, no storage, no clocks — every function is
 * a deterministic transform over `GameState` / `GameRecord` / `StatsTotals`.
 */

import type { GameMode, GameSettings, GameState, Guess, Round } from '@/types/game';
import {
  CLIP_BUCKETS,
  GAME_MODES,
  type ClipBucket,
  type ClipBucketStanding,
  type GameRecord,
  type ModeTotals,
  type PackMeta,
  type PackStanding,
  type RecentFormPoint,
  type StatsTotals,
  type TrackRecord,
} from './types';

/** Float slack for clip-length comparisons (audio lengths are decimals). */
const EPS = 1e-6;

/** XP awarded per mode on top of score/10 + 20·correct. */
export const MODE_XP_BONUS: Record<GameMode, number> = {
  classic: 10,
  fixed: 5,
  blitz: 25,
  survival: 25,
  duel: 30,
  party: 15,
};

/** Hard cap on stored game records (newest first). */
export const MAX_RECORDS = 200;
/** Hard cap on stored per-track history (evicted by `lastSeen`). */
export const MAX_TRACKS = 1500;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** A zeroed lifetime totals object. Safe to mutate — it is freshly built. */
export function emptyTotals(): StatsTotals {
  const byMode = {} as Record<GameMode, ModeTotals>;
  for (const mode of GAME_MODES) byMode[mode] = { games: 0, best: 0, avg: 0 };
  const byClipBucket = {} as Record<ClipBucket, { seen: number; correct: number }>;
  for (const bucket of CLIP_BUCKETS) byClipBucket[bucket] = { seen: 0, correct: 0 };
  return {
    games: 0,
    rounds: 0,
    correct: 0,
    partial: 0,
    score: 0,
    xp: 0,
    timePlayedMs: 0,
    bestStreak: 0,
    byMode,
    byPack: {},
    byClipBucket,
    perfectRounds: 0,
  };
}

/** The shortest clip length a game could be won at, from its settings. */
export function shortestClip(settings: GameSettings): number {
  if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    return Math.min(...settings.stages);
  }
  return settings.clipLength;
}

/** Attempts available per round (escalating mode is driven by `stages`). */
export function triesAvailable(settings: GameSettings): number {
  if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    return settings.stages.length;
  }
  return Math.max(1, settings.tries);
}

/**
 * Rounds that count towards stats: anything resolved, plus an unresolved round
 * the player already guessed on (blitz can end mid-round). A round the engine
 * auto-marked `skipped` before any guess — the blitz clock ran out, or the
 * player quit — was never attempted and must not lower accuracy.
 */
export function playedRounds(state: GameState): Round[] {
  return state.rounds.filter(
    (r) => (r.status !== 'playing' && r.status !== 'skipped') || r.guesses.length > 0,
  );
}

/** Every guess of every played round, in order. */
export function allGuesses(state: GameState): Guess[] {
  return playedRounds(state).flatMap((r) => r.guesses);
}

/** The winning guess of a round, if it was won. */
export function winningGuess(round: Round): Guess | undefined {
  return round.guesses.find((g) => g.verdict === 'correct');
}

export interface RoundOutcome {
  index: number;
  won: boolean;
  /** unwon but earned partial credit */
  hadPartial: boolean;
  correctGuess?: Guess;
  /** winning try (1-based) when won, else attempts made */
  triesUsed: number;
  /** clip length at the winning guess, else the longest clip heard (0 = none) */
  clipHeard: number;
  /** distinct clip buckets heard this round */
  buckets: ClipBucket[];
  wonFirstTry: boolean;
  /** first try, shortest clip available */
  perfect: boolean;
  hintsUsed: number;
}

/** Condense one round. Pure; `settings` only decides what "shortest clip" means. */
export function roundOutcome(round: Round, settings: GameSettings): RoundOutcome {
  const correctGuess = winningGuess(round);
  const won = round.status === 'won' || correctGuess !== undefined;
  const hadPartial = !won && round.guesses.some((g) => g.verdict === 'partial');
  const heard = round.guesses.map((g) => g.clipLength).filter((n) => Number.isFinite(n));
  const buckets: ClipBucket[] = [];
  for (const len of heard) {
    const b = bucketClip(len);
    if (!buckets.includes(b)) buckets.push(b);
  }
  const clipHeard = correctGuess
    ? correctGuess.clipLength
    : heard.length > 0
      ? Math.max(...heard)
      : 0;
  const triesUsed = correctGuess
    ? correctGuess.tryIndex + 1
    : Math.max(round.guesses.length, round.tryIndex);
  const min = shortestClip(settings);
  return {
    index: round.index,
    won,
    hadPartial,
    correctGuess,
    triesUsed,
    clipHeard,
    buckets,
    wonFirstTry: won && (correctGuess?.tryIndex ?? 0) === 0,
    perfect:
      won && (correctGuess?.tryIndex ?? 0) === 0 && (correctGuess?.clipLength ?? 99) <= min + EPS,
    hintsUsed: round.hintsUsed.length,
  };
}

/** Which clip bucket a heard clip length falls into. */
export function bucketClip(len: number): ClipBucket {
  const l = Number.isFinite(len) ? Math.max(0, len) : 0;
  if (l <= 0.1 + EPS) return '0.1';
  if (l <= 0.25 + EPS) return '0.25';
  if (l <= 0.5 + EPS) return '0.5';
  if (l <= 1 + EPS) return '1';
  if (l <= 2 + EPS) return '2';
  if (l <= 5 + EPS) return '5';
  return '10';
}

/** Pack a round's track belongs to, falling back to the game's single pack. */
export function packIdOf(round: Round, settings: GameSettings): string {
  return round.track.packId ?? settings.packIds[0] ?? 'unknown';
}

function playersOf(state: GameState): { name: string; score: number }[] | undefined {
  if (state.players.length < 2) return undefined;
  return state.players.map((p) => ({ name: p.name, score: p.score }));
}

function winnerNameOf(state: GameState): string | undefined {
  if (state.players.length < 2) return undefined;
  let best = state.players[0];
  let tied = false;
  for (const p of state.players.slice(1)) {
    if (!best || p.score > best.score) {
      best = p;
      tied = false;
    } else if (p.score === best.score) {
      tied = true;
    }
  }
  if (!best || tied) return undefined;
  return best.name;
}

function durationOf(state: GameState): number {
  const ends = state.rounds.map((r) => r.endedAt ?? r.startedAt).filter((n): n is number => !!n);
  const starts = state.rounds.map((r) => r.startedAt).filter((n) => !!n);
  const from = state.startedAt ?? (starts.length > 0 ? Math.min(...starts) : 0);
  const to = state.finishedAt ?? (ends.length > 0 ? Math.max(...ends) : from);
  return Math.max(0, to - from);
}

/** Condense a finished game into a storable record. */
export function summarizeGame(state: GameState): GameRecord {
  const s = state.settings;
  const played = playedRounds(state);
  let correct = 0;
  let partial = 0;
  let triesSum = 0;
  let clipSum = 0;
  for (const round of played) {
    const o = roundOutcome(round, s);
    if (o.won) {
      correct += 1;
      triesSum += o.triesUsed;
      clipSum += o.clipHeard;
    } else if (o.hadPartial) {
      partial += 1;
    }
  }
  const playerBest = state.players.reduce((m, p) => Math.max(m, p.bestStreak), 0);
  const lastEnd = played.reduce((m, r) => Math.max(m, r.endedAt ?? r.startedAt ?? 0), 0);
  const record: GameRecord = {
    id: state.id,
    finishedAt: state.finishedAt ?? lastEnd ?? state.startedAt ?? 0,
    mode: s.mode,
    packIds: [...s.packIds],
    difficulty: s.difficulty,
    clipMode: s.clipMode,
    clipLength: s.clipLength,
    stages: [...s.stages],
    rounds: played.length,
    correct,
    partial,
    score: state.totalScore,
    bestStreak: Math.max(state.bestStreak, playerBest),
    avgTries: correct > 0 ? round2(triesSum / correct) : 0,
    avgClipLengthHeard: correct > 0 ? round3(clipSum / correct) : 0,
    durationMs: durationOf(state),
  };
  if (s.daily) record.daily = s.daily;
  const players = playersOf(state);
  if (players) record.players = players;
  const winner = winnerNameOf(state);
  if (winner) record.winnerName = winner;
  return record;
}

/** XP for one game: score/10 + 20 per correct + a per-mode bonus. */
export function xpForGame(record: GameRecord): number {
  const bonus = MODE_XP_BONUS[record.mode] ?? 0;
  return Math.max(0, Math.round(record.score / 10 + 20 * record.correct + bonus));
}

/**
 * Fold a finished game into lifetime totals. Returns a new object; `totals` is
 * never mutated. `state` is needed for the per-round detail (packs, buckets).
 */
export function applyGame(totals: StatsTotals, record: GameRecord, state: GameState): StatsTotals {
  const s = state.settings;
  const next: StatsTotals = {
    ...totals,
    games: totals.games + 1,
    rounds: totals.rounds + record.rounds,
    correct: totals.correct + record.correct,
    partial: totals.partial + record.partial,
    score: totals.score + record.score,
    xp: totals.xp + xpForGame(record),
    timePlayedMs: totals.timePlayedMs + record.durationMs,
    bestStreak: Math.max(totals.bestStreak, record.bestStreak),
    byMode: { ...totals.byMode },
    byPack: { ...totals.byPack },
    byClipBucket: { ...totals.byClipBucket },
    perfectRounds: totals.perfectRounds,
  };

  const prevMode = totals.byMode[record.mode] ?? { games: 0, best: 0, avg: 0 };
  const games = prevMode.games + 1;
  next.byMode[record.mode] = {
    games,
    best: Math.max(prevMode.best, record.score),
    avg: round2((prevMode.avg * prevMode.games + record.score) / games),
  };

  for (const round of playedRounds(state)) {
    const o = roundOutcome(round, s);
    const packId = packIdOf(round, s);
    const pack = next.byPack[packId] ?? { seen: 0, correct: 0 };
    next.byPack[packId] = { seen: pack.seen + 1, correct: pack.correct + (o.won ? 1 : 0) };

    const winBucket = o.correctGuess ? bucketClip(o.correctGuess.clipLength) : undefined;
    for (const bucket of o.buckets) {
      const prev = next.byClipBucket[bucket] ?? { seen: 0, correct: 0 };
      next.byClipBucket[bucket] = {
        seen: prev.seen + 1,
        correct: prev.correct + (bucket === winBucket ? 1 : 0),
      };
    }
    if (o.perfect) next.perfectRounds += 1;
  }
  return next;
}

/**
 * Merge a finished game into per-track history. Returns a new Map; the input is
 * never mutated.
 */
export function updateTrackRecords(
  map: ReadonlyMap<number, TrackRecord>,
  state: GameState,
): Map<number, TrackRecord> {
  const next = new Map(map);
  const s = state.settings;
  for (const round of playedRounds(state)) {
    const o = roundOutcome(round, s);
    const t = round.track;
    const seenAt = round.endedAt ?? round.startedAt ?? state.finishedAt ?? 0;
    const prev = next.get(t.id);
    const fastestPrev = prev?.fastestClip ?? null;
    const winClip = o.correctGuess?.clipLength ?? null;
    const fastestClip =
      winClip === null
        ? fastestPrev
        : fastestPrev === null
          ? winClip
          : Math.min(fastestPrev, winClip);
    const entry: TrackRecord = {
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      cover: t.cover,
      timesSeen: (prev?.timesSeen ?? 0) + 1,
      timesCorrect: (prev?.timesCorrect ?? 0) + (o.won ? 1 : 0),
      fastestClip,
      lastSeen: Math.max(prev?.lastSeen ?? 0, seenAt),
    };
    const packId = t.packId ?? prev?.packId ?? s.packIds[0];
    if (packId) entry.packId = packId;
    next.set(t.id, entry);
  }
  return next;
}

/** Evict the least-recently-seen tracks down to `cap`. Returns a new Map. */
export function capTrackRecords(
  map: ReadonlyMap<number, TrackRecord>,
  cap: number = MAX_TRACKS,
): Map<number, TrackRecord> {
  if (map.size <= cap) return new Map(map);
  const kept = [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, cap);
  return new Map(kept.map((t) => [t.trackId, t]));
}

/** Lifetime round accuracy, 0..1. */
export function accuracy(totals: StatsTotals): number {
  return totals.rounds > 0 ? totals.correct / totals.rounds : 0;
}

/**
 * Packs the player is worst at, weakest first. Packs with fewer than `minSeen`
 * rounds are ignored — unless that would return nothing, in which case the
 * threshold drops to 1 so the UI always has something to show.
 */
export function weakestPacks(
  totals: StatsTotals,
  packsMeta: readonly PackMeta[],
  opts: { limit?: number; minSeen?: number } = {},
): PackStanding[] {
  const limit = opts.limit ?? 3;
  const minSeen = opts.minSeen ?? 3;
  const meta = new Map(packsMeta.map((p) => [p.id, p]));
  const build = (threshold: number): PackStanding[] =>
    Object.entries(totals.byPack)
      .filter(([, v]) => v.seen >= threshold)
      .map(([packId, v]) => {
        const m = meta.get(packId);
        return {
          packId,
          name: m?.name ?? packId,
          emoji: m?.emoji ?? '🎵',
          seen: v.seen,
          correct: v.correct,
          accuracy: v.seen > 0 ? v.correct / v.seen : 0,
        };
      })
      .sort((a, b) => a.accuracy - b.accuracy || b.seen - a.seen || a.packId.localeCompare(b.packId))
      .slice(0, limit);
  const strict = build(minSeen);
  return strict.length > 0 ? strict : build(1);
}

/**
 * The shortest clip bucket the player has ever been correct in — the brag stat.
 * null until there is a single correct guess.
 */
export function bestClipBucket(totals: StatsTotals): ClipBucketStanding | null {
  for (const bucket of CLIP_BUCKETS) {
    const v = totals.byClipBucket[bucket];
    if (v && v.correct > 0) {
      return {
        bucket,
        seen: v.seen,
        correct: v.correct,
        accuracy: v.seen > 0 ? v.correct / v.seen : 0,
      };
    }
  }
  return null;
}

/**
 * Last `n` games as sparkline points, oldest → newest.
 * `records` is expected newest-first (as stored).
 */
export function recentForm(records: readonly GameRecord[], n = 10): RecentFormPoint[] {
  return records
    .slice(0, Math.max(0, n))
    .map((r) => ({
      gameId: r.id,
      at: r.finishedAt,
      mode: r.mode,
      score: r.score,
      rounds: r.rounds,
      correct: r.correct,
      accuracy: r.rounds > 0 ? r.correct / r.rounds : 0,
      clean: r.rounds > 0 && r.correct === r.rounds,
    }))
    .reverse();
}
