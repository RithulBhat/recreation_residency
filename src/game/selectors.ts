/**
 * Read-only selectors over GameState. All pure; safe to call every render.
 */

import type { GameSettings, GameState, PlayerState, Round } from '@/types';

export const SURVIVAL_SHRINK = 0.85;
export const MIN_CLIP_LENGTH = 0.1;

export function currentRound(s: GameState): Round | undefined {
  return s.rounds[s.currentRound];
}

export function wonRounds(s: GameState): number {
  let n = 0;
  for (const r of s.rounds) if (r.status === 'won') n++;
  return n;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Clip length for a given try. fixed: clipLength; escalating: stages[tryIndex] (last stage beyond
 * the end); blitz: clipLength; survival: the above shrunk 15% per round already won (min 0.1 s).
 */
export function clipLengthFor(settings: GameSettings, tryIndex: number, wonCount = 0): number {
  let base: number;
  if (settings.mode === 'blitz') base = settings.clipLength;
  else if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    const i = Math.min(Math.max(0, tryIndex), settings.stages.length - 1);
    base = settings.stages[i];
  } else base = settings.clipLength;
  if (settings.mode === 'survival') {
    base = Math.max(MIN_CLIP_LENGTH, base * Math.pow(SURVIVAL_SHRINK, Math.max(0, wonCount)));
  }
  return round2(base);
}

export function currentClipLength(s: GameState): number {
  const r = currentRound(s);
  return clipLengthFor(s.settings, r?.tryIndex ?? 0, wonRounds(s));
}

/** Clip length the next try would get, or undefined when there is no next try. */
export function nextClipLength(s: GameState): number | undefined {
  const r = currentRound(s);
  if (!r || r.status !== 'playing') return undefined;
  if (s.settings.mode === 'blitz') return undefined;
  const next = r.tryIndex + 1;
  if (next >= s.settings.tries) return undefined;
  return clipLengthFor(s.settings, next, wonRounds(s));
}

export function triesLeft(s: GameState): number {
  const r = currentRound(s);
  if (!r || r.status !== 'playing' || s.status !== 'playing') return 0;
  if (s.settings.mode === 'blitz') return 1;
  return Math.max(0, s.settings.tries - r.tryIndex);
}

export function isRoundOver(s: GameState): boolean {
  const r = currentRound(s);
  return s.status === 'round-over' || (r !== undefined && r.status !== 'playing');
}

/** True when a guess would be accepted right now (buzzer duels need an active buzzer). */
export function canGuess(s: GameState): boolean {
  if (s.status !== 'playing') return false;
  const r = currentRound(s);
  if (!r || r.status !== 'playing') return false;
  if (s.settings.mode === 'duel' && s.settings.duelStyle === 'buzzer') return r.activePlayerId !== undefined;
  return true;
}

export function activePlayer(s: GameState): PlayerState | undefined {
  const r = currentRound(s);
  if (r?.activePlayerId) {
    const p = s.players.find((pl) => pl.id === r.activePlayerId);
    if (p) return p;
  }
  return s.players[s.activePlayerIndex];
}

/** Players sorted by score (desc), then correct count, then original order. */
export function standings(s: GameState): PlayerState[] {
  return s.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || b.p.correct - a.p.correct || a.i - b.i)
    .map((x) => x.p);
}

/** Top player (first in original order on ties); undefined with no players. */
export function leader(s: GameState): PlayerState | undefined {
  return standings(s)[0];
}

/** True when the top two players are tied on score. */
export function isTie(s: GameState): boolean {
  const st = standings(s);
  return st.length >= 2 && st[0].score === st[1].score;
}

/** 1-based current round and total (0 = endless: blitz, or rounds = 0). Total is capped by the pool. */
export function progress(s: GameState): { round: number; total: number } {
  const played = s.rounds.length;
  const round = s.status === 'idle' ? 0 : Math.min(played, s.currentRound + 1);
  if (s.settings.mode === 'blitz') return { round, total: 0 };
  const pool = played + s.queue.length;
  const limit = s.settings.rounds;
  const total = s.status === 'idle' ? limit : limit > 0 ? Math.min(limit, pool) : 0;
  return { round, total };
}

/**
 * True once the player has listened to (or otherwise acted on) the round: a play on this try, an
 * earlier try consumed, or a guess recorded. The round clock only runs from that moment — the
 * engine resets `startedAt` on the first play and refuses to time out before it.
 */
export function hasListened(round: Pick<Round, 'playsThisTry' | 'tryIndex' | 'guesses'>): boolean {
  return round.playsThisTry > 0 || round.tryIndex > 0 || round.guesses.length > 0;
}

/**
 * Milliseconds left on the active clock (blitz game clock, else the round timer), or null when
 * nothing is ticking. Before the first listen the round timer reads as full (it has not started).
 */
export function timeLeftMs(s: GameState, now: number): number | null {
  if (s.status !== 'playing') return null;
  if (s.settings.mode === 'blitz' && s.blitzEndsAt !== undefined) return Math.max(0, s.blitzEndsAt - now);
  const r = currentRound(s);
  if (s.settings.roundTimer > 0 && r && r.status === 'playing') {
    const full = s.settings.roundTimer * 1000;
    if (!hasListened(r)) return full;
    return Math.max(0, r.startedAt + full - now);
  }
  return null;
}

/** Milliseconds since the current round's clock started. */
export function elapsedMs(s: GameState, now: number): number {
  const r = currentRound(s);
  if (!r) return 0;
  return Math.max(0, (r.endedAt ?? now) - r.startedAt);
}

export function isFinished(s: GameState): boolean {
  return s.status === 'finished';
}

/** Rounds that ended (won/lost/skipped), oldest first. */
export function completedRounds(s: GameState): Round[] {
  return s.rounds.filter((r) => r.status !== 'playing');
}

export function livesLeft(s: GameState): number | undefined {
  if (s.settings.mode !== 'survival') return undefined;
  const p = activePlayer(s) ?? s.players[0];
  return p?.lives;
}
