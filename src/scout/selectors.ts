/**
 * Derived reads over `ScoutState`. Pure, cheap, and safe to call on an idle state.
 * Screens should never dig into `state.rounds[...]` themselves — everything they need is here.
 *
 * The bottom half of this file is the SESSION FORMAT surface: the roster, the clocks, the lives, the
 * buzzer, the gauntlet board, and `formatProgress` — one summary a top bar can render for any format.
 */

import { hasSeenRound, roundSeenAt } from './engine';
import {
  DUEL_BUZZ_KEYS,
  franchiseIdOf,
  isScoutBuzzerDuel,
  isScoutMultiplayer,
  rotatesScoutPlayers,
  scoutFormat,
  scoutFormatInfo,
  survivalTierFor,
  type ScoutFormatInfo,
} from './formats';
import type {
  ScoutClue,
  ScoutDifficulty,
  ScoutFormat,
  ScoutGuess,
  ScoutPlayerState,
  ScoutRound,
  ScoutStage,
  ScoutState,
  ScoutVerdict,
} from './types';

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

/** How many rungs this round's ladder has. The FORMAT sets it, not `settings.tries`. */
export function roundRungs(round: ScoutRound): number {
  return Math.max(1, round.stages.length);
}

/**
 * Attempts left on the live round. Blitz always reads 1: it shows one fixed rung and a miss ends the
 * subject, so there is never a second attempt.
 */
export function triesLeft(s: ScoutState): number {
  const r = currentRound(s);
  if (!r || r.status !== 'playing' || s.status !== 'playing') return 0;
  if (currentFormat(s) === 'blitz') return 1;
  return Math.max(0, roundRungs(r) - r.tryIndex);
}

export function isRoundOver(s: ScoutState): boolean {
  if (s.status === 'round-over') return true;
  const r = currentRound(s);
  return Boolean(r && r.status !== 'playing');
}

/** True when a guess would be accepted right now (a buzzer duel needs somebody on the buzzer). */
export function canGuess(s: ScoutState): boolean {
  if (s.status !== 'playing') return false;
  const r = currentRound(s);
  if (!r || r.status !== 'playing' || triesLeft(s) <= 0) return false;
  if (isScoutBuzzerDuel(s.settings)) return r.activePlayerId !== undefined;
  return true;
}

export function isFinished(s: ScoutState): boolean {
  return s.status === 'finished';
}

/**
 * 1-based current round and total (0 = open-ended). Total is capped by the pool; the gauntlet reads
 * its 32-club board instead of `settings.rounds`.
 */
export function progress(s: ScoutState): { round: number; total: number } {
  const played = s.rounds.length;
  const round = s.status === 'idle' ? 0 : Math.min(played, s.currentRound + 1);
  if (currentFormat(s) === 'gauntlet') return { round, total: franchisesTotal(s) };
  const pool = played + s.queue.length;
  const limit = s.settings.rounds;
  const total = s.status === 'idle' ? limit : limit > 0 ? Math.min(limit, pool) : 0;
  return { round, total };
}

/**
 * Milliseconds left on whichever clock is running, or null when nothing is ticking. The blitz RUN
 * clock outranks the round timer. Before a round has been seen (its first 'tick') the round timer
 * reads as full — it has not started yet.
 */
export function timeLeftMs(s: ScoutState, now: number): number | null {
  if (s.status !== 'playing') return null;
  if (s.blitzEndsAt !== undefined) return Math.max(0, s.blitzEndsAt - now);
  const r = currentRound(s);
  if (!r || r.status !== 'playing') return null;
  const timer = s.settings.roundTimer;
  if (timer <= 0) return null;
  const full = timer * 1000;
  if (!hasSeenRound(r)) return full;
  return Math.max(0, r.startedAt + full - now);
}

/** Milliseconds left on the blitz run clock specifically, or null outside a live blitz run. */
export function blitzTimeLeftMs(s: ScoutState, now: number): number | null {
  if (s.blitzEndsAt === undefined || s.status !== 'playing') return null;
  return Math.max(0, s.blitzEndsAt - now);
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

// ---------------------------------------------------------------------------------------------
// Session format
// ---------------------------------------------------------------------------------------------

/** The session format this run is playing ('standard' for a state saved before formats existed). */
export function currentFormat(s: ScoutState): ScoutFormat {
  return scoutFormat(s.settings);
}

/** Name, emoji, blurb, "how it plays", which settings it uses. */
export function currentFormatInfo(s: ScoutState): ScoutFormatInfo | undefined {
  return scoutFormatInfo(currentFormat(s));
}

/** True when more than one human is playing: duel or party. */
export function isMultiplayerRun(s: ScoutState): boolean {
  return isScoutMultiplayer(s.settings);
}

// --- players ---------------------------------------------------------------------------------

/** The roster. One implicit 'you' in the solo formats, 2 in a duel, 2–8 in a party. */
export function runPlayers(s: ScoutState): ScoutPlayerState[] {
  return s.players ?? [];
}

export function playerById(s: ScoutState, id: string): ScoutPlayerState | undefined {
  return runPlayers(s).find((p) => p.id === id);
}

/** Whoever the round belongs to: the buzzer holder, else the player whose turn it is. */
export function activePlayer(s: ScoutState): ScoutPlayerState | undefined {
  const r = currentRound(s);
  const held = r?.activePlayerId;
  if (held !== undefined) {
    const p = playerById(s, held);
    if (p) return p;
  }
  return runPlayers(s)[s.activePlayerIndex ?? 0];
}

/** Whose turn it is — the same as {@link activePlayer}, named for the turn-based formats. */
export function whoseTurn(s: ScoutState): ScoutPlayerState | undefined {
  return activePlayer(s);
}

/** Who 'next' will hand the device to, or undefined when the format never rotates. */
export function nextPlayer(s: ScoutState): ScoutPlayerState | undefined {
  const players = runPlayers(s);
  if (!rotatesScoutPlayers(s.settings) || players.length === 0) return undefined;
  return players[((s.activePlayerIndex ?? 0) + 1) % players.length];
}

/**
 * The pass-and-play handover, or null when there is nothing to hand over. Present only while the run
 * is between rounds in a rotating format and is not over.
 *
 * The SCREEN owns the curtain: while this is non-null it must show the handover card ALONE — not the
 * reveal panel, not the answer, not the previous round's subject image — so the next player cannot
 * read the last answer off the screen before their own turn starts. Dispatch 'next' when they tap.
 */
export function handover(s: ScoutState): { from: ScoutPlayerState; to: ScoutPlayerState } | null {
  if (s.status !== 'round-over') return null;
  // The next 'next' will finish the run, so there is nobody to hand to — show the results instead.
  if (s.settings.rounds > 0 && s.rounds.length >= s.settings.rounds) return null;
  if (s.queue.length === 0) return null;
  const from = activePlayer(s);
  const to = nextPlayer(s);
  if (!from || !to || from.id === to.id) return null;
  return { from, to };
}

/** Players sorted by score (desc), then correct count, then roster order. */
export function standings(s: ScoutState): ScoutPlayerState[] {
  return runPlayers(s)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || b.p.correct - a.p.correct || a.i - b.i)
    .map((x) => x.p);
}

/** Top player (first in roster order on ties); undefined with no players. */
export function leader(s: ScoutState): ScoutPlayerState | undefined {
  return standings(s)[0];
}

/** True when the top two players are tied on score. */
export function isTie(s: ScoutState): boolean {
  const st = standings(s);
  return st.length >= 2 && st[0].score === st[1].score;
}

// --- buzzer ---------------------------------------------------------------------------------

/** Players locked out of the CURRENT round by a wrong buzz. */
export function lockedOutPlayerIds(s: ScoutState): string[] {
  return currentRound(s)?.lockedOutPlayerIds ?? [];
}

export function isLockedOut(s: ScoutState, playerId: string): boolean {
  return lockedOutPlayerIds(s).includes(playerId);
}

/** True while a buzzer duel is live and nobody has claimed the round yet. */
export function awaitingBuzz(s: ScoutState): boolean {
  if (!isScoutBuzzerDuel(s.settings) || s.status !== 'playing') return false;
  const r = currentRound(s);
  return Boolean(r && r.status === 'playing' && r.activePlayerId === undefined);
}

/** True when this player may buzz in right now. */
export function canPlayerBuzz(s: ScoutState, playerId: string): boolean {
  return awaitingBuzz(s) && playerById(s, playerId) !== undefined && !isLockedOut(s, playerId);
}

/**
 * True when this player's INPUT BOX should be live. In a buzzer duel that means they hold the
 * buzzer — use {@link canPlayerBuzz} for the buzz itself. (The reducer is more permissive: a guess
 * carrying an un-locked `playerId` while nobody has buzzed counts as buzz + guess, which is how a
 * keyboard shortcut can answer in one keystroke.)
 */
export function canPlayerGuess(s: ScoutState, playerId: string): boolean {
  if (!canGuess(s)) return false;
  if (isScoutBuzzerDuel(s.settings)) return currentRound(s)?.activePlayerId === playerId;
  return (activePlayer(s)?.id ?? playerId) === playerId;
}

/** The keyboard key this player buzzes with: player 1 → 'a', player 2 → 'l'. */
export function buzzKeyFor(s: ScoutState, playerId: string): string | undefined {
  const i = runPlayers(s).findIndex((p) => p.id === playerId);
  return i >= 0 ? DUEL_BUZZ_KEYS[i] : undefined;
}

// --- survival -------------------------------------------------------------------------------

/** Lives left for whoever is playing, or null when the format has no lives. */
export function livesLeft(s: ScoutState): number | null {
  if (currentFormat(s) !== 'survival') return null;
  const p = activePlayer(s) ?? runPlayers(s)[0];
  return p?.lives ?? null;
}

/** The difficulty tier survival is currently hunting, or null in every other format. */
export function survivalTier(s: ScoutState): ScoutDifficulty | null {
  if (currentFormat(s) !== 'survival') return null;
  return survivalTierFor(wonRounds(s));
}

// --- gauntlet -------------------------------------------------------------------------------

/** Franchise ids whose round has been won. */
export function franchisesCleared(s: ScoutState): string[] {
  return s.clearedTeamIds ?? [];
}

/** How many franchises this gauntlet board holds (0 in every other format). */
export function franchisesTotal(s: ScoutState): number {
  return s.gauntletTeamIds?.length ?? 0;
}

/** The whole board, in play order, each flagged cleared / played / upcoming. */
export function franchiseBoard(s: ScoutState): Array<{ teamId: string; cleared: boolean; played: boolean }> {
  const cleared = new Set(franchisesCleared(s));
  const played = new Set(
    s.rounds.filter((r) => r.status !== 'playing').map((r) => franchiseIdOf(r.subject) ?? ''),
  );
  return (s.gauntletTeamIds ?? []).map((teamId) => ({
    teamId,
    cleared: cleared.has(teamId),
    played: cleared.has(teamId) || played.has(teamId),
  }));
}

// --- one summary for the top bar ------------------------------------------------------------

export interface ScoutFormatProgress {
  format: ScoutFormat;
  /** 1-based current round (0 before a run starts). */
  round: number;
  /** Total rounds, or 0 when the format is open-ended. */
  total: number;
  /** The headline counter for the top bar: '3 / 10', '7 named', '4 / 32'. */
  label: string;
  /** Rounds won so far. */
  correct: number;
  /** Lives remaining, or null when the format has none. */
  livesLeft: number | null;
  /** Milliseconds on whichever clock is running, or null when nothing ticks. */
  timeLeftMs: number | null;
  /** Gauntlet board, both 0 elsewhere. */
  franchisesCleared: number;
  franchisesTotal: number;
  /** Whose turn it is, when the format seats more than one player. */
  activePlayerId?: string;
  /** True when the screen should be prompting for a buzz with nobody on the buzzer. */
  awaitingBuzz: boolean;
}

/** One object a top bar can render for ANY format. */
export function formatProgress(s: ScoutState, now: number): ScoutFormatProgress {
  const format = currentFormat(s);
  const { round, total } = progress(s);
  const correct = wonRounds(s);
  const cleared = franchisesCleared(s).length;
  const boardSize = franchisesTotal(s);
  let label: string;
  switch (format) {
    case 'blitz':
      label = `${correct} named`;
      break;
    case 'survival':
      label = `${correct} cleared`;
      break;
    case 'gauntlet':
      label = `${cleared} / ${boardSize}`;
      break;
    default:
      label = total > 0 ? `${round} / ${total}` : `Round ${round}`;
      break;
  }
  const out: ScoutFormatProgress = {
    format,
    round,
    total,
    label,
    correct,
    livesLeft: livesLeft(s),
    timeLeftMs: timeLeftMs(s, now),
    franchisesCleared: cleared,
    franchisesTotal: boardSize,
    awaitingBuzz: awaitingBuzz(s),
  };
  // A buzzer duel has nobody active until somebody buzzes — do not imply a turn that does not exist.
  const active = isScoutMultiplayer(s.settings) && !out.awaitingBuzz ? activePlayer(s)?.id : undefined;
  if (active !== undefined) out.activePlayerId = active;
  return out;
}
