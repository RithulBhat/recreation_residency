/**
 * Game store: a thin zustand wrapper over the pure reducer in `@/game/engine`.
 * `dispatch` fills in `now = Date.now()` when omitted and passes the rng memoized at `start`.
 * All rules live in the reducer — read its header for the state semantics.
 */

import { create } from 'zustand';
import type { GameAction, GameSettings, GameState, HintKind, Round, Track } from '@/types';
import { createInitialState, reduce } from '@/game/engine';
import { createRng, type Rng } from '@/game/rng';

/** GameAction with `now` optional (the store stamps Date.now()). */
export type GameInput = GameAction extends infer A
  ? A extends { now: number }
    ? Omit<A, 'now'> & { now?: number }
    : A
  : never;

export interface GameStore {
  state: GameState;
  dispatch(action: GameInput): void;
  start(settings: GameSettings, tracks: readonly Track[], now?: number): void;
  play(now?: number): void;
  guess(text: string, playerId?: string, now?: number): void;
  skip(now?: number): void;
  giveUp(now?: number): void;
  hint(kind: HintKind, now?: number): void;
  timeout(now?: number): void;
  next(now?: number): void;
  buzz(playerId: string, now?: number): void;
  tick(now?: number): void;
  quit(now?: number): void;
  /** Back to idle (drops the current game). */
  reset(): void;
}

function withNow(action: GameInput, now: number): GameAction {
  return { ...action, now: action.now ?? now } as GameAction;
}

let rng: Rng | undefined;

/** The rng created at the last `start` (seeded from `settings.seed`). Exposed for tests/tools. */
export function currentRng(): Rng | undefined {
  return rng;
}

export const useGameStore = create<GameStore>()((set, get) => {
  const dispatch = (input: GameInput): void => {
    const action = withNow(input, Date.now());
    if (action.type === 'start') rng = createRng(action.settings.seed);
    const prev = get().state;
    const next = reduce(prev, action, rng);
    if (next !== prev) set({ state: next });
  };
  return {
    state: createInitialState(),
    dispatch,
    start: (settings, tracks, now) => dispatch({ type: 'start', settings, tracks: tracks.slice(), now }),
    play: (now) => dispatch({ type: 'play', now }),
    guess: (text, playerId, now) => dispatch({ type: 'guess', text, playerId, now }),
    skip: (now) => dispatch({ type: 'skip', now }),
    giveUp: (now) => dispatch({ type: 'giveUp', now }),
    hint: (kind, now) => dispatch({ type: 'hint', kind, now }),
    timeout: (now) => dispatch({ type: 'timeout', now }),
    next: (now) => dispatch({ type: 'next', now }),
    buzz: (playerId, now) => dispatch({ type: 'buzz', playerId, now }),
    tick: (now) => dispatch({ type: 'tick', now }),
    quit: (now) => dispatch({ type: 'quit', now }),
    reset: () => {
      rng = undefined;
      set({ state: createInitialState() });
    },
  };
});

/** Rounds that just ended between two states (a round whose status left 'playing'). */
export function newlyEndedRounds(prev: GameState, next: GameState): Round[] {
  if (prev === next || prev.rounds === next.rounds) return [];
  const sameGame = prev.id === next.id;
  const out: Round[] = [];
  for (const r of next.rounds) {
    if (r.status === 'playing') continue;
    const before = sameGame ? prev.rounds[r.index] : undefined;
    if (!before || before.status === 'playing') out.push(r);
  }
  return out;
}

/**
 * Subscribe to round completions (won / lost / skipped) — fires for blitz rounds too, which never
 * pass through 'round-over'. Returns an unsubscribe function.
 */
export function onRoundOver(cb: (round: Round, state: GameState) => void): () => void {
  return useGameStore.subscribe((s, prev) => {
    for (const r of newlyEndedRounds(prev.state, s.state)) cb(r, s.state);
  });
}

/** Subscribe to game completion. Returns an unsubscribe function. */
export function onFinished(cb: (state: GameState) => void): () => void {
  return useGameStore.subscribe((s, prev) => {
    if (s.state.status === 'finished' && (prev.state.status !== 'finished' || prev.state.id !== s.state.id)) {
      cb(s.state);
    }
  });
}
