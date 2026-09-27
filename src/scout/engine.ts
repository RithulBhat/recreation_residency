/**
 * Highlight Scout engine — a pure reducer over `ScoutState`. Semantics mirror Songooner's
 * (`src/game/engine.ts`) so the two games feel identical to play and to wire up.
 *
 * ## Usage
 *   state = createInitialScoutState()
 *   state = reduce(state, { type: 'start', settings, subjects, now }, rng?)
 *   state = reduce(state, { type: 'guess', text, now })  …
 *
 * `reduce` never mutates, and an action that is invalid for the current status returns the SAME
 * state reference, so `next === prev` is a reliable "nothing happened" check.
 * `rng` is only consulted by 'start' (the run id, the queue shuffle of unseeded runs, and the
 * gauntlet's franchise order when unseeded). Everything random after that is derived by hashing
 * `state.id` or `settings.seed`, so replaying a seed reproduces the queue, the per-round puzzle type
 * and the crop focus without the rng's state.
 *
 * ## Two axes: puzzle type and session format
 *   `settings.mode` (+ `mixModes`) is the PUZZLE TYPE — what a round shows. `settings.format` is the
 *   SESSION FORMAT — the shape of the run. See `./formats` for the format rules and metadata; this
 *   file is where they take effect. `standard` is the default and behaves exactly as the engine did
 *   before formats existed (`engine.standard.test.ts` is the characterisation test that proves it).
 *
 * ## Status transitions
 *   idle ──start──▶ playing ──(round ends)──▶ round-over ──next──▶ playing … ──▶ finished
 *   'start' is accepted from ANY status (it begins a fresh run); 'quit' from playing or round-over.
 *   BLITZ never enters round-over: a finished round advances immediately, and 'tick' ends the run.
 *
 * ## Rounds
 *   - 'start' dedupes `subjects` by kind + id, orders them (seeded: by `hashToUnit('<seed>|<key>')`
 *     so a subject missing on one device only removes itself; unseeded: rng shuffle), builds the
 *     player roster, and opens round 0. A subject no active mode can render is skipped as the queue
 *     is drawn from, so a stale pool degrades instead of crashing. An empty queue finishes
 *     immediately ('queue-empty').
 *   - The round's puzzle type is `settings.mode`, or — when `settings.mixModes` — one of the modes
 *     THIS subject can render, chosen by hashing `state.id`, the round index and the subject id.
 *   - `round.stages` is built once by `buildStages`, with a per-round rng derived from the seed (or
 *     the run id), so stage content never depends on the order rounds were opened in. How many rungs
 *     the ladder has is the format's business (see {@link ladderRungs}).
 *   - 'guess' runs `matchSubject` against the whole run pool (played subjects + queue) so an
 *     ambiguous surname is judged in context:
 *       correct → round 'won', scored by `scoreScoutRound`, streak and totals updated.
 *       close   → recorded with verdict 'close' (the "so close" UI reads the last guess) and
 *                 consumes a try, exactly like a wrong guess.
 *       wrong   → consumes a try. Out of rungs → round 'lost' and the streak resets.
 *     Empty/whitespace text is a no-op, and so is a `playerId` that is not the one allowed to guess.
 *   - 'skip' consumes a try (this is how the next rung unlocks) and records a 'skipped' guess;
 *     on the last rung the round is lost.
 *   - 'giveUp' loses the round immediately ('skipped'); 'timeout' likewise ('timeout').
 *   - 'next' (round-over only) finishes the run when the format says so (see below); otherwise it
 *     rotates the active player (party / duel-turns) and opens the next round.
 *   - 'tick' drives the clocks. The ROUND clock starts on the FIRST tick a round receives — the
 *     moment the screen actually showed it — not when the round was opened, so a slow headshot never
 *     burns the timer (Songooner's old bug; `timeLeftMs` mirrors this). The BLITZ clock is absolute
 *     (`blitzEndsAt`) and runs from 'start'.
 *   - 'buzz' claims a buzzer-duel round; it is a no-op in every other format.
 *   - 'quit' → finished with `endReason: 'quit'`; an in-progress round is marked 'skipped'.
 *
 * ## Formats
 *   standard  N rounds, `tries` rungs each, optional round timer. Ends: 'rounds' / 'queue-empty'.
 *   blitz     `blitzEndsAt = start + blitzDuration`. Every round opens at the single fixed rung
 *             `BLITZ_RUNG` of a `BLITZ_LADDER_RUNGS`-rung ladder and never advances it: a correct
 *             answer opens the next subject instantly, a miss or a skip costs
 *             `BLITZ_MISS_PENALTY_MS` and also opens the next subject. Ends: 'time' (or
 *             'queue-empty'). `rounds` and `roundTimer` are ignored (normalization zeroes them).
 *   survival  Each player starts with `lives`; a lost round costs one, and 'next' with none left
 *             finishes 'lives'. The league ESCALATES: the target tier walks star → starter →
 *             rotation → deepCut every `SURVIVAL_TIER_STEP` correct answers, the queue is searched
 *             for a subject in that tier, and the ladder loses a rung per step (`survivalTriesFor`).
 *             Scoring adds a depth bonus for the same reason.
 *   gauntlet  'start' reduces the pool to ONE subject per franchise and orders those franchises by
 *             `hashToUnit('<seed>|gauntlet|<teamId>')` (rng shuffle when unseeded), capped at
 *             `GAUNTLET_SIZE`. `gauntletTeamIds` is the board, `clearedTeamIds` the franchises whose
 *             round was won. Ends: 'gauntlet' when the board is played out, or 'quit'.
 *   duel      Exactly two players on one device. `buzzer`: `round.activePlayerId` is undefined until
 *             'buzz'; a wrong (or 'close') guess adds the buzzer to `lockedOutPlayerIds` and clears
 *             the buzzer WITHOUT consuming a rung; when both players are locked out the round is
 *             lost. A 'guess' carrying a valid, un-locked `playerId` while nobody has buzzed counts
 *             as buzz + guess. `turns`: `activePlayerIndex` rotates on 'next'.
 *   party     2–8 players, same rotation as duel-turns. The between-rounds handover is a SCREEN
 *             concern driven by the `handover` selector — the reducer just rotates on 'next'.
 *   The solo formats get one implicit player with id 'you' (`SOLO_SCOUT_PLAYER`), and their rounds
 *   carry no `activePlayerId` / `lockedOutPlayerIds` / `winnerPlayerId` at all, so a solo round is
 *   byte-identical to a pre-format one.
 */

import { createRng, hashToUnit, type Rng } from '@/game/rng';
import {
  BLITZ_LADDER_RUNGS,
  BLITZ_MISS_PENALTY_MS,
  BLITZ_RUNG,
  GAUNTLET_SIZE,
  franchiseIdOf,
  isScoutBuzzerDuel,
  isScoutMultiplayer,
  resolveScoutPlayers,
  rotatesScoutPlayers,
  scoutBlitzDuration,
  scoutFormat,
  scoutLives,
  survivalTierFor,
  survivalTriesFor,
} from './formats';
import { matchSubject } from './names';
import { DEFAULT_SCOUT_SETTINGS, normalizeScoutSettings } from './presets';
import { scoreScoutRound } from './scoring';
import { buildStages } from './stages';
import { activeModes, orderSubjects, playableModes } from './subjects';
import type {
  ScoutAction,
  ScoutGuess,
  ScoutMode,
  ScoutPlayerState,
  ScoutRound,
  ScoutSettings,
  ScoutState,
  ScoutSubject,
  ScoutVerdict,
} from './types';

export { BLITZ_MISS_PENALTY_MS };

/**
 * `ScoutRound` plus the engine's internal "the screen has shown this round" stamp. This is an
 * OPTIONAL additive field (the frozen contract has no room for it and no 'seen' action exists):
 * the round clock is rebased to the first tick, which is what makes the timer honest.
 */
export interface ScoutSeenRound extends ScoutRound {
  seenAt?: number;
}

/** When the screen first ticked this round, or undefined while it has never been on screen. */
export function roundSeenAt(round: ScoutRound): number | undefined {
  return (round as ScoutSeenRound).seenAt;
}

export function hasSeenRound(round: ScoutRound): boolean {
  return roundSeenAt(round) !== undefined;
}

export function createInitialScoutState(): ScoutState {
  return {
    id: '',
    settings: { ...DEFAULT_SCOUT_SETTINGS, packIds: [...DEFAULT_SCOUT_SETTINGS.packIds] },
    status: 'idle',
    rounds: [],
    currentRound: 0,
    queue: [],
    totalScore: 0,
    streak: 0,
    bestStreak: 0,
    players: [],
    activePlayerIndex: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function subjectKey(subject: ScoutSubject): string {
  return `${subject.kind}:${subject.id}`;
}

function replaceRound(state: ScoutState, round: ScoutRound): ScoutState {
  const rounds = state.rounds.slice();
  rounds[round.index] = round;
  return { ...state, rounds };
}

function activeRound(state: ScoutState): ScoutRound | undefined {
  if (state.status !== 'playing') return undefined;
  const r = state.rounds[state.currentRound];
  return r && r.status === 'playing' ? r : undefined;
}

function finish(state: ScoutState, endReason: NonNullable<ScoutState['endReason']>, now: number): ScoutState {
  let s = state;
  const r = s.rounds[s.currentRound];
  if (r && r.status === 'playing') s = replaceRound(s, { ...r, status: 'skipped', endedAt: now });
  return { ...s, status: 'finished', endReason, finishedAt: now };
}

/** The roster, defaulted so a state persisted before formats existed still reads. */
function statePlayers(state: ScoutState): ScoutPlayerState[] {
  return state.players ?? [];
}

function activeIndex(state: ScoutState): number {
  return state.activePlayerIndex ?? 0;
}

function lockouts(round: ScoutRound): string[] {
  return round.lockedOutPlayerIds ?? [];
}

/** Rungs this round actually has (the format decides; `buildStages` always returns at least one). */
function roundRungs(round: ScoutRound): number {
  return Math.max(1, round.stages.length);
}

function wonCount(state: ScoutState): number {
  let n = 0;
  for (const r of state.rounds) if (r.status === 'won') n++;
  return n;
}

function buildScoutPlayers(settings: ScoutSettings): ScoutPlayerState[] {
  const survival = scoutFormat(settings) === 'survival';
  return resolveScoutPlayers(settings).map((c) => {
    const p: ScoutPlayerState = { ...c, score: 0, streak: 0, bestStreak: 0, correct: 0 };
    if (survival) p.lives = scoutLives(settings);
    return p;
  });
}

function updatePlayer(
  players: ScoutPlayerState[],
  id: string | undefined,
  fn: (p: ScoutPlayerState) => ScoutPlayerState,
): ScoutPlayerState[] {
  if (id === undefined) return players;
  return players.map((p) => (p.id === id ? fn(p) : p));
}

/** Which puzzle type this round plays. Deterministic: hashed from the run id, index and subject. */
export function modeForSubject(state: ScoutState, subject: ScoutSubject, index: number): ScoutMode {
  const allowed = playableModes(subject, activeModes(state.settings));
  if (allowed.length === 0) return state.settings.mode;
  if (!state.settings.mixModes) return allowed[0];
  const u = hashToUnit(`${state.id}|mode|${index}|${subjectKey(subject)}`);
  return allowed[Math.min(allowed.length - 1, Math.floor(u * allowed.length))];
}

/** A per-round rng so stage content never depends on the order rounds were opened in. */
function stageRng(state: ScoutState, index: number, subject: ScoutSubject): Rng {
  return createRng(`${state.settings.seed ?? state.id}|stage|${index}|${subjectKey(subject)}`);
}

/** The subjects a guess is judged against (played + upcoming) — used for ambiguity. */
export function runPool(state: ScoutState): ScoutSubject[] {
  return [...state.rounds.map((r) => r.subject), ...state.queue];
}

/**
 * How many rungs the next round's ladder gets.
 *   blitz    a fixed-depth ladder, frozen at one rung — `settings.tries` plays no part.
 *   survival `settings.tries` minus one per difficulty tier already climbed through.
 *   others   `settings.tries`, i.e. exactly what it always was.
 */
export function ladderRungs(state: ScoutState): number {
  const format = scoutFormat(state.settings);
  if (format === 'blitz') return BLITZ_LADDER_RUNGS;
  if (format === 'survival') return survivalTriesFor(state.settings.tries, wonCount(state));
  return state.settings.tries;
}

// ---------------------------------------------------------------------------------------------
// Opening a round
// ---------------------------------------------------------------------------------------------

function openWith(state: ScoutState, queue: ScoutSubject[], subject: ScoutSubject, now: number): ScoutState {
  const index = state.rounds.length;
  const base: ScoutState = { ...state, queue };
  const format = scoutFormat(state.settings);
  const mode = modeForSubject(base, subject, index);
  const stages = buildStages(mode, subject, ladderRungs(base), stageRng(base, index, subject));
  const round: ScoutRound = {
    index,
    mode,
    subject,
    stages,
    // Blitz shows ONE rung, the same one for every subject, and never moves off it.
    tryIndex: format === 'blitz' ? Math.min(BLITZ_RUNG, Math.max(0, stages.length - 1)) : 0,
    guesses: [],
    status: 'playing',
    score: 0,
    startedAt: now,
  };
  if (isScoutMultiplayer(state.settings)) {
    round.lockedOutPlayerIds = [];
    // A buzzer duel has nobody on the buzzer until someone buzzes; turns/party start on the roster.
    if (!isScoutBuzzerDuel(state.settings)) {
      const p = statePlayers(base)[activeIndex(base)];
      if (p) round.activePlayerId = p.id;
    }
  }
  return { ...base, status: 'playing', rounds: [...state.rounds, round], currentRound: index };
}

/**
 * Survival hunts for a subject in the tier its escalation has reached, falling back to the first
 * playable subject when that tier is exhausted (a small pool must still be playable).
 */
function openSurvivalRound(state: ScoutState, modes: readonly ScoutMode[], now: number): ScoutState {
  const target = survivalTierFor(wonCount(state));
  let fallback = -1;
  let chosen = -1;
  for (let i = 0; i < state.queue.length; i++) {
    if (playableModes(state.queue[i], modes).length === 0) continue;
    if (fallback < 0) fallback = i;
    if (state.queue[i].tier === target) {
      chosen = i;
      break;
    }
  }
  const pick = chosen >= 0 ? chosen : fallback;
  if (pick < 0) return finish({ ...state, queue: [] }, 'queue-empty', now);
  return openWith(
    state,
    state.queue.filter((_, i) => i !== pick),
    state.queue[pick],
    now,
  );
}

function openRound(state: ScoutState, now: number): ScoutState {
  const modes = activeModes(state.settings);
  if (scoutFormat(state.settings) === 'survival') return openSurvivalRound(state, modes, now);
  let queue = state.queue;
  while (queue.length > 0) {
    const subject = queue[0];
    queue = queue.slice(1);
    if (playableModes(subject, modes).length === 0) continue;
    return openWith(state, queue, subject, now);
  }
  return finish({ ...state, queue }, 'queue-empty', now);
}

// ---------------------------------------------------------------------------------------------
// Closing a round
// ---------------------------------------------------------------------------------------------

/** Close a round whose status is already won/lost/skipped, and apply score, streaks and lives. */
function finishRound(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  const format = scoutFormat(state.settings);
  let { streak, bestStreak, totalScore } = state;
  let players = statePlayers(state);
  let clearedTeamIds = state.clearedTeamIds;

  if (round.status === 'won') {
    totalScore += round.score;
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    players = updatePlayer(players, round.winnerPlayerId ?? players[0]?.id, (p) => {
      const ps = p.streak + 1;
      return {
        ...p,
        score: p.score + round.score,
        streak: ps,
        bestStreak: Math.max(p.bestStreak, ps),
        correct: p.correct + 1,
      };
    });
    if (format === 'gauntlet') {
      const fid = franchiseIdOf(round.subject);
      const already = clearedTeamIds ?? [];
      if (fid !== undefined && !already.includes(fid)) clearedTeamIds = [...already, fid];
    }
  } else {
    streak = 0;
    // Everyone who is on the hook for the loss drops their personal streak. In a buzzer duel that is
    // whoever got locked out (or both, if the round died some other way).
    const losers = isScoutBuzzerDuel(state.settings)
      ? lockouts(round).length > 0
        ? lockouts(round)
        : players.map((p) => p.id)
      : [round.activePlayerId ?? players[activeIndex(state)]?.id ?? players[0]?.id].filter(
          (id): id is string => id !== undefined,
        );
    players = players.map((p) => (losers.includes(p.id) ? { ...p, streak: 0 } : p));
    if (format === 'survival' && round.status === 'lost') {
      players = updatePlayer(players, round.activePlayerId ?? players[0]?.id, (p) => ({
        ...p,
        lives: Math.max(0, (p.lives ?? scoutLives(state.settings)) - 1),
      }));
    }
  }

  const closed = replaceRound(state, { ...round, endedAt: round.endedAt ?? now });
  const next: ScoutState = { ...closed, players, streak, bestStreak, totalScore, status: 'round-over' };
  if (clearedTeamIds !== state.clearedTeamIds) next.clearedTeamIds = clearedTeamIds;
  // Blitz never pauses on a reveal: the clock is the whole game.
  if (format === 'blitz') return advanceBlitz(next, now);
  return next;
}

function advanceBlitz(state: ScoutState, now: number): ScoutState {
  if (state.blitzEndsAt !== undefined && now >= state.blitzEndsAt) return finish(state, 'time', now);
  if (state.queue.length === 0) return finish(state, 'queue-empty', now);
  return openRound({ ...state, status: 'playing' }, now);
}

/** A blitz miss: the clock pays for it, and the subject is gone. */
function blitzMiss(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  const penalized: ScoutState =
    state.blitzEndsAt === undefined ? state : { ...state, blitzEndsAt: state.blitzEndsAt - BLITZ_MISS_PENALTY_MS };
  return finishRound(penalized, { ...round, status: 'lost', endedAt: now }, now);
}

function makeGuess(
  round: ScoutRound,
  text: string,
  verdict: ScoutVerdict,
  now: number,
  playerId?: string,
): ScoutGuess {
  const g: ScoutGuess = { text, verdict, tryIndex: round.tryIndex, at: now };
  if (playerId !== undefined) g.playerId = playerId;
  return g;
}

/** Consume one rung (wrong / close / skip). Loses the round when none are left. */
function consumeTry(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  if (scoutFormat(state.settings) === 'blitz') return blitzMiss(state, round, now);
  const nextTry = round.tryIndex + 1;
  if (nextTry >= roundRungs(round)) {
    return finishRound(state, { ...round, status: 'lost', endedAt: now }, now);
  }
  return replaceRound(state, { ...round, tryIndex: nextTry });
}

/** Lose the round outright (give up / timeout / both duellists locked out). */
function loseRound(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  if (scoutFormat(state.settings) === 'blitz') return blitzMiss(state, round, now);
  return finishRound(state, { ...round, status: 'lost', endedAt: now }, now);
}

/** A wrong buzz: lock that player out, clear the buzzer, and lose the round once nobody is left. */
function buzzerWrong(state: ScoutState, round: ScoutRound, playerId: string | undefined, now: number): ScoutState {
  const locked =
    playerId !== undefined && !lockouts(round).includes(playerId) ? [...lockouts(round), playerId] : lockouts(round);
  const cleared: ScoutRound = { ...round, lockedOutPlayerIds: locked, activePlayerId: undefined };
  const players = statePlayers(state);
  if (players.length > 0 && players.every((p) => locked.includes(p.id))) {
    return finishRound(state, { ...cleared, status: 'lost', endedAt: now }, now);
  }
  return replaceRound(state, cleared);
}

/** Resolve who is guessing; undefined when the action must be ignored. */
function resolveGuesser(state: ScoutState, round: ScoutRound, playerId: string | undefined): string | undefined {
  if (isScoutBuzzerDuel(state.settings)) {
    if (round.activePlayerId !== undefined) {
      if (playerId !== undefined && playerId !== round.activePlayerId) return undefined;
      return round.activePlayerId;
    }
    if (playerId === undefined) return undefined;
    if (!statePlayers(state).some((p) => p.id === playerId)) return undefined;
    if (lockouts(round).includes(playerId)) return undefined;
    return playerId;
  }
  const active = round.activePlayerId ?? statePlayers(state)[activeIndex(state)]?.id;
  if (playerId !== undefined && active !== undefined && playerId !== active) return undefined;
  return active;
}

// ---------------------------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------------------------

/** One subject per franchise, in a seeded-but-shuffled franchise order, capped at 32. */
function gauntletBoard(
  ordered: readonly ScoutSubject[],
  seed: string | undefined,
  rng: Rng,
  modes: readonly ScoutMode[],
): { queue: ScoutSubject[]; teamIds: string[] } {
  const byFranchise = new Map<string, ScoutSubject>();
  for (const subject of ordered) {
    if (playableModes(subject, modes).length === 0) continue;
    const fid = franchiseIdOf(subject);
    if (fid === undefined || byFranchise.has(fid)) continue;
    byFranchise.set(fid, subject);
  }
  const picked = [...byFranchise.entries()];
  const order =
    seed === undefined
      ? rng.shuffle(picked)
      : picked
          .slice()
          .sort(
            (a, b) =>
              hashToUnit(`${seed}|gauntlet|${a[0]}`) - hashToUnit(`${seed}|gauntlet|${b[0]}`) ||
              a[0].localeCompare(b[0]),
          );
  const capped = order.slice(0, GAUNTLET_SIZE);
  return { queue: capped.map(([, subject]) => subject), teamIds: capped.map(([fid]) => fid) };
}

function onStart(action: Extract<ScoutAction, { type: 'start' }>, rng?: Rng): ScoutState {
  const settings = normalizeScoutSettings(action.settings);
  const format = scoutFormat(settings);
  const r = rng ?? createRng(settings.seed);
  const seen = new Set<string>();
  const subjects: ScoutSubject[] = [];
  for (const s of action.subjects) {
    const key = subjectKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push(s);
  }
  // NOTE: `r.id()` is drawn BEFORE `orderSubjects` (which only touches the rng for unseeded runs),
  // and the gauntlet board after both — keeping every pre-format run id and queue order intact.
  const seeded: ScoutState = {
    ...createInitialScoutState(),
    id: r.id(),
    settings,
    queue: orderSubjects(subjects, settings.seed, r),
    startedAt: action.now,
  };
  let base: ScoutState = { ...seeded, players: buildScoutPlayers(settings), activePlayerIndex: 0 };
  if (format === 'blitz') {
    base = { ...base, blitzEndsAt: action.now + scoutBlitzDuration(settings) * 1000 };
  }
  if (format === 'gauntlet') {
    const board = gauntletBoard(base.queue, settings.seed, r, activeModes(settings));
    base = { ...base, queue: board.queue, gauntletTeamIds: board.teamIds, clearedTeamIds: [] };
  }
  if (base.queue.length === 0) return finish(base, 'queue-empty', action.now);
  return openRound(base, action.now);
}

function onGuess(state: ScoutState, action: Extract<ScoutAction, { type: 'guess' }>): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const text = action.text.trim();
  if (text === '') return state;
  const playerId = resolveGuesser(state, round, action.playerId);
  // A buzzer duel needs somebody on the buzzer; a named player who is not allowed to guess is ignored.
  if (isScoutBuzzerDuel(state.settings) && playerId === undefined) return state;
  if (action.playerId !== undefined && playerId === undefined) return state;

  const multiplayer = isScoutMultiplayer(state.settings);
  const match = matchSubject(text, round.subject, runPool(state));
  const guess = makeGuess(round, text, match.verdict, action.now, multiplayer ? playerId : undefined);
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, guess] };

  if (match.verdict === 'correct') {
    const startedAt = roundSeenAt(round) ?? round.startedAt;
    const player = statePlayers(state).find((p) => p.id === playerId);
    const breakdown = scoreScoutRound({
      mode: round.mode,
      tryIndex: round.tryIndex,
      elapsedMs: Math.max(0, action.now - startedAt),
      streak: multiplayer ? (player?.streak ?? state.streak) : state.streak,
      hintsUsed: 0,
      format: scoutFormat(state.settings),
      depth: wonCount(state),
    });
    const won: ScoutRound = { ...withGuess, status: 'won', score: breakdown.total, endedAt: action.now };
    if (multiplayer && playerId !== undefined) {
      won.winnerPlayerId = playerId;
      won.activePlayerId = playerId;
    }
    return finishRound(state, won, action.now);
  }
  // 'close' costs a rung exactly like 'wrong' — and in a buzzer duel it locks you out, as it does in
  // Songooner, where a partial guess is treated as a miss.
  if (isScoutBuzzerDuel(state.settings)) return buzzerWrong(state, withGuess, playerId, action.now);
  return consumeTry(state, withGuess, action.now);
}

function onSkip(state: ScoutState, now: number): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const playerId = isScoutBuzzerDuel(state.settings) ? undefined : round.activePlayerId;
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, makeGuess(round, '', 'skipped', now, playerId)] };
  return consumeTry(state, withGuess, now);
}

function onGiveUp(state: ScoutState, now: number, verdict: 'skipped' | 'timeout'): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const playerId = isScoutBuzzerDuel(state.settings) ? undefined : round.activePlayerId;
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, makeGuess(round, '', verdict, now, playerId)] };
  return loseRound(state, withGuess, now);
}

function onBuzz(state: ScoutState, action: Extract<ScoutAction, { type: 'buzz' }>): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  if (!isScoutBuzzerDuel(state.settings)) return state;
  if (round.activePlayerId !== undefined) return state;
  if (!statePlayers(state).some((p) => p.id === action.playerId)) return state;
  if (lockouts(round).includes(action.playerId)) return state;
  return replaceRound(state, { ...round, activePlayerId: action.playerId });
}

function onNext(state: ScoutState, now: number): ScoutState {
  if (state.status !== 'round-over') return state;
  const { settings } = state;
  const format = scoutFormat(settings);
  if (format === 'survival') {
    const players = statePlayers(state);
    if (players.length > 0 && players.every((p) => (p.lives ?? 0) <= 0)) return finish(state, 'lives', now);
  }
  const board = state.gauntletTeamIds?.length ?? 0;
  if (format === 'gauntlet' && board > 0 && state.rounds.length >= board) return finish(state, 'gauntlet', now);
  if (settings.rounds > 0 && state.rounds.length >= settings.rounds) return finish(state, 'rounds', now);
  if (state.queue.length === 0) return finish(state, format === 'gauntlet' ? 'gauntlet' : 'queue-empty', now);
  const players = statePlayers(state);
  const rotated =
    rotatesScoutPlayers(settings) && players.length > 0
      ? { ...state, activePlayerIndex: (activeIndex(state) + 1) % players.length }
      : state;
  return openRound(rotated, now);
}

function onTick(state: ScoutState, now: number): ScoutState {
  if (state.status !== 'playing') return state;
  // The blitz clock is absolute and outranks everything else.
  if (state.blitzEndsAt !== undefined && now >= state.blitzEndsAt) return finish(state, 'time', now);
  const round = activeRound(state);
  if (!round) return state;
  // First tick = the screen has the round on screen: start the round clock here.
  if (!hasSeenRound(round)) {
    const marked: ScoutSeenRound = { ...round, seenAt: now, startedAt: now > round.startedAt ? now : round.startedAt };
    return replaceRound(state, marked);
  }
  const timer = state.settings.roundTimer;
  if (timer > 0 && now >= round.startedAt + timer * 1000) return onGiveUp(state, now, 'timeout');
  return state;
}

function onQuit(state: ScoutState, now: number): ScoutState {
  if (state.status !== 'playing' && state.status !== 'round-over') return state;
  return finish(state, 'quit', now);
}

// ---------------------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------------------

export function reduce(state: ScoutState, action: ScoutAction, rng?: Rng): ScoutState {
  switch (action.type) {
    case 'start':
      return onStart(action, rng);
    case 'guess':
      return onGuess(state, action);
    case 'skip':
      return onSkip(state, action.now);
    case 'giveUp':
      return onGiveUp(state, action.now, 'skipped');
    case 'timeout':
      return onGiveUp(state, action.now, 'timeout');
    case 'buzz':
      return onBuzz(state, action);
    case 'next':
      return onNext(state, action.now);
    case 'tick':
      return onTick(state, action.now);
    case 'quit':
      return onQuit(state, action.now);
    default:
      return state;
  }
}
