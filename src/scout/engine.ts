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
 * `rng` is only consulted by 'start' (the run id, plus the queue shuffle of unseeded runs).
 * Everything random after that is derived by hashing `state.id` or `settings.seed`, so replaying a
 * seed reproduces the queue, the per-round mode and the crop focus without the rng's state.
 *
 * ## Status transitions
 *   idle ──start──▶ playing ──(round ends)──▶ round-over ──next──▶ playing … ──▶ finished
 *   'start' is accepted from ANY status (it begins a fresh run); 'quit' from playing or round-over.
 *
 * ## Rounds
 *   - 'start' dedupes `subjects` by kind + id, orders them (seeded: by `hashToUnit('<seed>|<key>')`
 *     so a subject missing on one device only removes itself; unseeded: rng shuffle) and opens
 *     round 0. A subject no active mode can render is skipped as the queue is drawn from, so a
 *     stale pool degrades instead of crashing. An empty queue finishes immediately ('queue-empty').
 *   - The round's mode is `settings.mode`, or — when `settings.mixModes` — one of the modes THIS
 *     subject can render, chosen by hashing `state.id`, the round index and the subject id.
 *   - `round.stages` is built once by `buildStages`, with a per-round rng derived from the seed (or
 *     the run id), so stage content never depends on the order rounds were opened in.
 *   - 'guess' runs `matchSubject` against the whole run pool (played subjects + queue) so an
 *     ambiguous surname is judged in context:
 *       correct → round 'won', scored by `scoreScoutRound`, streak and totals updated.
 *       close   → recorded with verdict 'close' (the "so close" UI reads the last guess) and
 *                 consumes a try, exactly like a wrong guess.
 *       wrong   → consumes a try. Out of tries → round 'lost' and the streak resets.
 *     Empty/whitespace text is a no-op.
 *   - 'skip' consumes a try (this is how the next rung unlocks) and records a 'skipped' guess;
 *     on the last try the round is lost.
 *   - 'giveUp' loses the round immediately ('skipped'); 'timeout' likewise ('timeout').
 *   - 'next' (round-over only) finishes the run when `rounds` is reached ('rounds') or the queue is
 *     empty ('queue-empty'); otherwise it opens the next round.
 *   - 'tick' drives the round clock. The clock starts on the FIRST tick a round receives — the
 *     moment the screen actually showed it — not when the round was opened, so a slow headshot
 *     never burns the timer (Songooner's old bug; `timeLeftMs` mirrors this).
 *   - 'quit' → finished with `endReason: 'quit'`; an in-progress round is marked 'skipped'.
 */

import { createRng, hashToUnit, type Rng } from '@/game/rng';
import { matchSubject } from './names';
import { DEFAULT_SCOUT_SETTINGS, normalizeScoutSettings } from './presets';
import { scoreScoutRound } from './scoring';
import { buildStages } from './stages';
import { activeModes, orderSubjects, playableModes } from './subjects';
import type {
  ScoutAction,
  ScoutGuess,
  ScoutMode,
  ScoutRound,
  ScoutState,
  ScoutSubject,
  ScoutVerdict,
} from './types';

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

/** Which mode this round plays. Deterministic: hashed from the run id, index and subject. */
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

function openRound(state: ScoutState, now: number): ScoutState {
  const modes = activeModes(state.settings);
  let queue = state.queue;
  while (queue.length > 0) {
    const subject = queue[0];
    queue = queue.slice(1);
    if (playableModes(subject, modes).length === 0) continue;
    const index = state.rounds.length;
    const base: ScoutState = { ...state, queue };
    const mode = modeForSubject(base, subject, index);
    const round: ScoutRound = {
      index,
      mode,
      subject,
      stages: buildStages(mode, subject, state.settings.tries, stageRng(base, index, subject)),
      tryIndex: 0,
      guesses: [],
      status: 'playing',
      score: 0,
      startedAt: now,
    };
    return { ...base, status: 'playing', rounds: [...state.rounds, round], currentRound: index };
  }
  return finish({ ...state, queue }, 'queue-empty', now);
}

/** Close a round whose status is already won/lost/skipped, and apply score + streaks. */
function finishRound(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  let { streak, bestStreak, totalScore } = state;
  if (round.status === 'won') {
    totalScore += round.score;
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
  } else {
    streak = 0;
  }
  const closed = replaceRound(state, { ...round, endedAt: round.endedAt ?? now });
  return { ...closed, streak, bestStreak, totalScore, status: 'round-over' };
}

function makeGuess(round: ScoutRound, text: string, verdict: ScoutVerdict, now: number): ScoutGuess {
  return { text, verdict, tryIndex: round.tryIndex, at: now };
}

/** Consume one try (wrong / close / skip). Loses the round when none are left. */
function consumeTry(state: ScoutState, round: ScoutRound, now: number): ScoutState {
  const nextTry = round.tryIndex + 1;
  if (nextTry >= state.settings.tries) {
    return finishRound(state, { ...round, status: 'lost', endedAt: now }, now);
  }
  return replaceRound(state, { ...round, tryIndex: nextTry });
}

// ---------------------------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------------------------

function onStart(action: Extract<ScoutAction, { type: 'start' }>, rng?: Rng): ScoutState {
  const settings = normalizeScoutSettings(action.settings);
  const r = rng ?? createRng(settings.seed);
  const seen = new Set<string>();
  const subjects: ScoutSubject[] = [];
  for (const s of action.subjects) {
    const key = subjectKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push(s);
  }
  const base: ScoutState = {
    ...createInitialScoutState(),
    id: r.id(),
    settings,
    queue: orderSubjects(subjects, settings.seed, r),
    startedAt: action.now,
  };
  if (base.queue.length === 0) return finish(base, 'queue-empty', action.now);
  return openRound(base, action.now);
}

function onGuess(state: ScoutState, action: Extract<ScoutAction, { type: 'guess' }>): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const text = action.text.trim();
  if (text === '') return state;

  const match = matchSubject(text, round.subject, runPool(state));
  const guess = makeGuess(round, text, match.verdict, action.now);
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, guess] };

  if (match.verdict === 'correct') {
    const startedAt = roundSeenAt(round) ?? round.startedAt;
    const breakdown = scoreScoutRound({
      mode: round.mode,
      tryIndex: round.tryIndex,
      elapsedMs: Math.max(0, action.now - startedAt),
      streak: state.streak,
      hintsUsed: 0,
    });
    return finishRound(
      state,
      { ...withGuess, status: 'won', score: breakdown.total, endedAt: action.now },
      action.now,
    );
  }
  return consumeTry(state, withGuess, action.now);
}

function onSkip(state: ScoutState, now: number): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, makeGuess(round, '', 'skipped', now)] };
  return consumeTry(state, withGuess, now);
}

function onGiveUp(state: ScoutState, now: number, verdict: 'skipped' | 'timeout'): ScoutState {
  const round = activeRound(state);
  if (!round) return state;
  const withGuess: ScoutRound = { ...round, guesses: [...round.guesses, makeGuess(round, '', verdict, now)] };
  return finishRound(state, { ...withGuess, status: 'lost', endedAt: now }, now);
}

function onNext(state: ScoutState, now: number): ScoutState {
  if (state.status !== 'round-over') return state;
  const { settings } = state;
  if (settings.rounds > 0 && state.rounds.length >= settings.rounds) return finish(state, 'rounds', now);
  if (state.queue.length === 0) return finish(state, 'queue-empty', now);
  return openRound(state, now);
}

function onTick(state: ScoutState, now: number): ScoutState {
  if (state.status !== 'playing') return state;
  const round = activeRound(state);
  if (!round) return state;
  // First tick = the screen has the round on screen: start the clock here.
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
