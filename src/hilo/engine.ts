/**
 * Higher or Lower — the pure engine.
 *
 * The whole chain is planned from the seed before play starts (`arcade/pairing.buildSequence`),
 * which is what makes the daily run, seeded duels and party races comparable between players —
 * and what guarantees no outcome can reach back into what comes next. See
 * `arcade/statelessness.test.ts` for why that matters.
 *
 * Framework-free; the store, the party layer and the tests all drive this same reducer.
 */

import { createRng, type Rng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { buildSequence, directionOf, isTooClose } from '@/arcade/pairing';
import { MAX_STREAK_FACTOR, STREAK_STEP } from './settings';
import type {
  HiloOutcome,
  HiloPick,
  HiloPowerUp,
  HiloRound,
  HiloSettings,
  HiloState,
} from './types';

/** Points for one correct answer before the streak multiplier. */
export const BASE_POINTS = 100;
/** Extra for calling a round the pairing had to relax — those are the awkward ones. */
export const DOUBLE_DOWN_MULTIPLIER = 2;

export type HiloAction =
  | { type: 'start' }
  | { type: 'pick'; pick: HiloPick; elapsedMs: number }
  | { type: 'powerUp'; powerUp: 'skip' | 'peek' | 'doubleDown' }
  | { type: 'timeout' }
  | { type: 'tick'; ms: number }
  | { type: 'next' }
  | { type: 'finish' };

/** How many links a run needs, given its format. */
export function chainLength(settings: HiloSettings): number {
  switch (settings.format) {
    case 'rounds':
      return settings.rounds + 1;
    case 'timed':
      // generous: a fast player in 300s will not run out
      return Math.min(200, Math.ceil(settings.duration * 1.5) + 10);
    default:
      return 120;
  }
}

export function streakFactor(streak: number, curve: HiloSettings['streakCurve']): number {
  if (curve === 'off' || streak <= 1) return 1;
  return Math.min(MAX_STREAK_FACTOR[curve], 1 + (streak - 1) * STREAK_STEP[curve]);
}

export function createInitialState(
  settings: HiloSettings,
  pool: readonly ContentItem[],
  rng: Rng = createRng(settings.seed),
): HiloState {
  const built = buildSequence(pool, settings.difficulty, chainLength(settings), rng);
  return {
    status: 'idle',
    settings,
    chain: built.steps.map((s) => s.item),
    degradations: built.steps.map((s) => s.degraded),
    rounds: [],
    index: 0,
    livesLeft: settings.lives,
    streak: 0,
    bestStreak: 0,
    totalScore: 0,
    powerUpsLeft: settings.powerUps,
    pendingDouble: false,
    peeking: false,
    msLeft: settings.format === 'timed' ? settings.duration * 1000 : 0,
    exhausted: built.exhausted,
  };
}

/**
 * Power-ups the player may actually spend right now.
 *
 * Double Down risks a second life, so with one life left it would be pure upside — double points
 * for a miss that was already fatal. Gated here rather than stripped from the settings, so a
 * player moving between formats keeps the preference they chose.
 */
export function availablePowerUps(state: HiloState): readonly HiloPowerUp[] {
  return state.powerUpsLeft.filter((p) => p !== 'doubleDown' || state.livesLeft > 1);
}

/** The pair on the table right now, or `null` when the chain is spent. */
export function currentPair(state: HiloState): { from: ContentItem; to: ContentItem } | null {
  const from = state.chain[state.index];
  const to = state.chain[state.index + 1];
  return from && to ? { from, to } : null;
}

/** The right answer for the live round. */
export function correctPick(state: HiloState): HiloPick | null {
  const pair = currentPair(state);
  if (!pair) return null;
  const { settings } = state;
  if (settings.allowSame && isTooClose(pair.from.value, pair.to.value, settings.sameTolerance)) {
    return 'same';
  }
  const direction = directionOf(pair.from.value, pair.to.value);
  // With `allowSame` off, exactly equal values cannot be wrong either way — treat as higher,
  // which is the direction the reveal animation runs. Pairing makes this vanishingly rare.
  return direction === 'same' ? 'higher' : direction;
}

function isOver(state: HiloState): boolean {
  if (state.livesLeft <= 0) return true;
  if (state.settings.format === 'timed' && state.msLeft <= 0) return true;
  if (state.settings.format === 'rounds' && state.rounds.length >= state.settings.rounds) {
    return true;
  }
  return currentPair(state) === null;
}

function settle(
  state: HiloState,
  pick: HiloPick | null,
  outcome: HiloOutcome,
  elapsedMs: number,
): HiloState {
  const pair = currentPair(state);
  if (!pair) return { ...state, status: 'finished' };
  return { ...settleWith(state, pair, pick, outcome, elapsedMs, state.pendingDouble), pendingDouble: false };
}

function settleWith(
  state: HiloState,
  pair: { from: ContentItem; to: ContentItem },
  pick: HiloPick | null,
  outcome: HiloOutcome,
  elapsedMs: number,
  doubled: boolean,
): HiloState {
  const correct = outcome === 'correct';
  const streak = correct ? state.streak + 1 : 0;
  const factor = streakFactor(streak, state.settings.streakCurve);
  const score = correct
    ? Math.round(BASE_POINTS * factor * (doubled ? DOUBLE_DOWN_MULTIPLIER : 1))
    : 0;

  // Double Down costs a life on a miss; an ordinary miss costs one too, a skip costs none.
  const lifeCost = outcome === 'skipped' ? 0 : correct ? 0 : doubled ? 2 : 1;

  const round: HiloRound = {
    from: pair.from,
    to: pair.to,
    degraded: state.degradations[state.index + 1] ?? 0,
    pick,
    outcome,
    doubled,
    peeked: state.peeking,
    score,
    elapsedMs,
  };

  return {
    ...state,
    status: 'revealing',
    rounds: [...state.rounds, round],
    livesLeft: Math.max(0, state.livesLeft - lifeCost),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    totalScore: state.totalScore + score,
  };
}

export function reduce(state: HiloState, action: HiloAction): HiloState {
  switch (action.type) {
    case 'start': {
      if (currentPair(state) === null) return { ...state, status: 'finished', exhausted: true };
      return { ...state, status: 'playing' };
    }

    case 'pick': {
      if (state.status !== 'playing') return state;
      const pair = currentPair(state);
      if (!pair) return { ...state, status: 'finished' };
      const answer = correctPick(state);
      const outcome: HiloOutcome = action.pick === answer ? 'correct' : 'wrong';
      const doubled = state.pendingDouble;
      return {
        ...settleWith(state, pair, action.pick, outcome, Math.max(0, action.elapsedMs), doubled),
        pendingDouble: false,
      };
    }

    case 'powerUp': {
      if (state.status !== 'playing') return state;
      if (!availablePowerUps(state).includes(action.powerUp)) return state;
      const left = state.powerUpsLeft.filter((p) => p !== action.powerUp);

      if (action.powerUp === 'skip') {
        const pair = currentPair(state);
        if (!pair) return state;
        return { ...settleWith(state, pair, null, 'skipped', 0, false), powerUpsLeft: left };
      }
      if (action.powerUp === 'peek') {
        return { ...state, powerUpsLeft: left, peeking: true };
      }
      return { ...state, powerUpsLeft: left, pendingDouble: true };
    }

    case 'timeout': {
      if (state.status !== 'playing') return state;
      return settle(state, null, 'timeout', 0);
    }

    case 'tick': {
      if (state.status !== 'playing' || state.settings.format !== 'timed') return state;
      const msLeft = Math.max(0, state.msLeft - Math.max(0, action.ms));
      if (msLeft === 0) return { ...state, msLeft, status: 'finished' };
      return { ...state, msLeft };
    }

    case 'next': {
      if (state.status !== 'revealing') return state;
      const index = state.index + 1;
      const advanced: HiloState = { ...state, index, peeking: false };
      if (isOver(advanced)) {
        return { ...advanced, status: 'finished', exhausted: currentPair(advanced) === null };
      }
      return { ...advanced, status: 'playing' };
    }

    case 'finish':
      return { ...state, status: 'finished' };

    default:
      return state;
  }
}

export function reduceAll(state: HiloState, actions: readonly HiloAction[]): HiloState {
  return actions.reduce(reduce, state);
}
