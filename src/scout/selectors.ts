/**
 * Derived reads over `ScoutState`. Pure, cheap, and safe to call on an idle state.
 * Screens should never dig into `state.rounds[...]` themselves — everything they need is here.
 */

import { hasSeenRound, roundSeenAt } from './engine';
import type { ScoutClue, ScoutGuess, ScoutRound, ScoutStage, ScoutState, ScoutVerdict } from './types';

export function currentRound(s: ScoutState): ScoutRound | undefined {
  return s.rounds[s.currentRound];
}

/** The rung a round is on (clamped, so a short ladder never reads out of bounds). */
export function stageAt(round: ScoutRound, tryIndex: number): ScoutStage | undefined {
  if (round.stages.length === 0) return undefined;
  const i = Math.max(0, Math.min(round.stages.length - 1, tryIndex));
  return round.stages[i];
}

/** The rung currently on screen. */
export function currentStage(s: ScoutState): ScoutStage | undefined {
  const r = currentRound(s);
  return r ? stageAt(r, r.tryIndex) : undefined;
}

/** Everything unlocked so far (cumulative, newest last). */
export function revealedClues(s: ScoutState): ScoutClue[] {
  return currentStage(s)?.clues.slice() ?? [];
}

/** Only what the latest rung added — for the "new clue" flash. */
export function newlyRevealedClues(s: ScoutState): ScoutClue[] {
  const r = currentRound(s);
  if (!r) return [];
  const cur = stageAt(r, r.tryIndex)?.clues ?? [];
  const prev = r.tryIndex > 0 ? (stageAt(r, r.tryIndex - 1)?.clues ?? []) : [];
  return cur.slice(prev.length);
}

/** 0 → 1 visual reveal for the current rung (0 for text modes). */
export function visualLevel(s: ScoutState): number {
  return currentStage(s)?.visual ?? 0;
}

export function triesLeft(s: ScoutState): number {
  const r = currentRound(s);
  if (!r || r.status !== 'playing') return 0;
  return Math.max(0, s.settings.tries - r.tryIndex);
}

export function isRoundOver(s: ScoutState): boolean {
  if (s.status === 'round-over') return true;
  const r = currentRound(s);
  return Boolean(r && r.status !== 'playing');
}

export function canGuess(s: ScoutState): boolean {
  if (s.status !== 'playing') return false;
  const r = currentRound(s);
  return Boolean(r && r.status === 'playing' && triesLeft(s) > 0);
}

export function isFinished(s: ScoutState): boolean {
  return s.status === 'finished';
}

/** 1-based current round and total (0 = endless, i.e. `rounds: 0`). Total is capped by the pool. */
export function progress(s: ScoutState): { round: number; total: number } {
  const played = s.rounds.length;
  const round = s.status === 'idle' ? 0 : Math.min(played, s.currentRound + 1);
  const pool = played + s.queue.length;
  const limit = s.settings.rounds;
  const total = s.status === 'idle' ? limit : limit > 0 ? Math.min(limit, pool) : 0;
  return { round, total };
}

/**
 * Milliseconds left on the round clock, or null when no clock is running. Before the round has been
 * seen (its first 'tick') the timer reads as full — it has not started yet.
 */
export function timeLeftMs(s: ScoutState, now: number): number | null {
  if (s.status !== 'playing') return null;
  const r = currentRound(s);
  if (!r || r.status !== 'playing') return null;
  const timer = s.settings.roundTimer;
  if (timer <= 0) return null;
  const full = timer * 1000;
  if (!hasSeenRound(r)) return full;
  return Math.max(0, r.startedAt + full - now);
}

/** Milliseconds since the current round's clock started (0 before it was seen). */
export function elapsedMs(s: ScoutState, now: number): number {
  const r = currentRound(s);
  if (!r) return 0;
  const from = roundSeenAt(r) ?? r.startedAt;
  return Math.max(0, (r.endedAt ?? now) - from);
}

export function lastGuess(s: ScoutState): ScoutGuess | undefined {
  const r = currentRound(s);
  if (!r || r.guesses.length === 0) return undefined;
  return r.guesses[r.guesses.length - 1];
}

export function lastVerdict(s: ScoutState): ScoutVerdict | undefined {
  return lastGuess(s)?.verdict;
}

/** True right after a `close` guess — the "so close" nudge. */
export function wasClose(s: ScoutState): boolean {
  return lastVerdict(s) === 'close';
}

/** Rounds that ended (won / lost / skipped), oldest first. */
export function completedRounds(s: ScoutState): ScoutRound[] {
  return s.rounds.filter((r) => r.status !== 'playing');
}

export function wonRounds(s: ScoutState): number {
  return s.rounds.reduce((n, r) => n + (r.status === 'won' ? 1 : 0), 0);
}

/** Won ÷ completed, 0..1 (0 when nothing has finished). */
export function accuracy(s: ScoutState): number {
  const done = completedRounds(s).length;
  return done === 0 ? 0 : wonRounds(s) / done;
}

/** Guesses across the whole run, oldest first. */
export function allGuesses(s: ScoutState): ScoutGuess[] {
  return s.rounds.flatMap((r) => r.guesses);
}
