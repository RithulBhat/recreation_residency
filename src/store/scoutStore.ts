/**
 * Highlight Scout stores.
 *
 * `useScoutStore` is a thin zustand wrapper over the pure reducer in `@/scout/engine` — the same
 * shape as `gameStore` for Songooner. `dispatch` stamps `now = Date.now()` when omitted and passes
 * the rng memoized at `start`. All rules live in the reducer; read its header for the semantics.
 *
 * SESSION FORMATS need nothing from the store beyond two extra dispatchers, `guessAs` and `buzz`
 * (duel / party). Everything else — the blitz clock, lives, the gauntlet board, whose turn it is —
 * lives in the state the reducer returns and is read through `@/scout/selectors`. The screens drive
 * every clock the same way they already do, by dispatching `tick`.
 *
 * `useScoutSettingsStore` persists the Scout setup draft under `sg:scout` (Songooner's
 * `settingsStore` is a different agent's file and is not touched). Everything that comes out of
 * storage goes back through `normalizeScoutSettings`.
 *
 * Subscription helpers are prefixed (`onScoutRoundOver`, `onScoutFinished`) so `src/store/index.ts`
 * can `export *` from both game stores without an ambiguous re-export.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createRng, type Rng } from '@/game/rng';
import { createInitialScoutState, reduce } from '@/scout/engine';
import { DEFAULT_SCOUT_SETTINGS, applyScoutPreset, normalizeScoutSettings } from '@/scout/presets';
import type { ScoutAction, ScoutRound, ScoutSettings, ScoutState, ScoutSubject } from '@/scout/types';

/** `ScoutAction` with `now` optional (the store stamps `Date.now()`). */
export type ScoutInput = ScoutAction extends infer A
  ? A extends { now: number }
    ? Omit<A, 'now'> & { now?: number }
    : A
  : never;

export interface ScoutStore {
  state: ScoutState;
  dispatch(action: ScoutInput): void;
  start(settings: ScoutSettings, subjects: readonly ScoutSubject[], now?: number): void;
  guess(text: string, now?: number): void;
  /**
   * A guess attributed to one player — duel and party. In a buzzer duel this doubles as the buzz
   * when nobody has buzzed yet, and is ignored when that player is locked out or it is not their
   * turn (exactly like Songooner's `guess(text, playerId)`).
   */
  guessAs(playerId: string, text: string, now?: number): void;
  /** Duel buzzer: claim the round. A no-op in every other format. */
  buzz(playerId: string, now?: number): void;
  skip(now?: number): void;
  giveUp(now?: number): void;
  timeout(now?: number): void;
  next(now?: number): void;
  tick(now?: number): void;
  quit(now?: number): void;
  /** Back to idle (drops the current run). */
  reset(): void;
}

function withNow(action: ScoutInput, now: number): ScoutAction {
  return { ...action, now: action.now ?? now } as ScoutAction;
}

let rng: Rng | undefined;

/** The rng created at the last `start` (seeded from `settings.seed`). Exposed for tests/tools. */
export function currentScoutRng(): Rng | undefined {
  return rng;
}

export const useScoutStore = create<ScoutStore>()((set, get) => {
  const dispatch = (input: ScoutInput): void => {
    const action = withNow(input, Date.now());
    if (action.type === 'start') rng = createRng(action.settings.seed);
    const prev = get().state;
    const next = reduce(prev, action, rng);
    if (next !== prev) set({ state: next });
  };
  return {
    state: createInitialScoutState(),
    dispatch,
    start: (settings, subjects, now) => dispatch({ type: 'start', settings, subjects: subjects.slice(), now }),
    guess: (text, now) => dispatch({ type: 'guess', text, now }),
    guessAs: (playerId, text, now) => dispatch({ type: 'guess', text, playerId, now }),
    buzz: (playerId, now) => dispatch({ type: 'buzz', playerId, now }),
    skip: (now) => dispatch({ type: 'skip', now }),
    giveUp: (now) => dispatch({ type: 'giveUp', now }),
    timeout: (now) => dispatch({ type: 'timeout', now }),
    next: (now) => dispatch({ type: 'next', now }),
    tick: (now) => dispatch({ type: 'tick', now }),
    quit: (now) => dispatch({ type: 'quit', now }),
    reset: () => {
      rng = undefined;
      set({ state: createInitialScoutState() });
    },
  };
});

/** Rounds that just ended between two states (a round whose status left 'playing'). */
export function newlyEndedScoutRounds(prev: ScoutState, next: ScoutState): ScoutRound[] {
  if (prev === next || prev.rounds === next.rounds) return [];
  const sameRun = prev.id === next.id;
  const out: ScoutRound[] = [];
  for (const r of next.rounds) {
    if (r.status === 'playing') continue;
    const before = sameRun ? prev.rounds[r.index] : undefined;
    if (!before || before.status === 'playing') out.push(r);
  }
  return out;
}

/** Subscribe to round completions (won / lost / skipped). Returns an unsubscribe function. */
export function onScoutRoundOver(cb: (round: ScoutRound, state: ScoutState) => void): () => void {
  return useScoutStore.subscribe((s, prev) => {
    for (const r of newlyEndedScoutRounds(prev.state, s.state)) cb(r, s.state);
  });
}

/** Subscribe to run completion. Returns an unsubscribe function. */
export function onScoutFinished(cb: (state: ScoutState) => void): () => void {
  return useScoutStore.subscribe((s, prev) => {
    if (s.state.status === 'finished' && (prev.state.status !== 'finished' || prev.state.id !== s.state.id)) {
      cb(s.state);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Persisted setup draft
// ---------------------------------------------------------------------------------------------

export const SCOUT_SETTINGS_STORAGE_KEY = 'sg:scout';
export const SCOUT_SETTINGS_VERSION = 1;

export interface ScoutSettingsState {
  settings: ScoutSettings;
  /** Most recent first, max 8. */
  recentPackIds: string[];
}

export interface ScoutSettingsActions {
  update(partial: Partial<ScoutSettings>): void;
  applyPreset(id: string): void;
  reset(): void;
  pushRecentPack(id: string): void;
}

export type ScoutSettingsStore = ScoutSettingsState & ScoutSettingsActions;

export const MAX_RECENT_SCOUT_PACKS = 8;

function pushUnique(list: readonly string[], id: string, max: number): string[] {
  const out = [id, ...list.filter((x) => x !== id)];
  return out.slice(0, max);
}

/** Sanitize whatever came out of storage (or a migration). */
export function sanitizePersistedScout(raw: unknown): ScoutSettingsState {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ScoutSettingsState, unknown>>;
  const recent = Array.isArray(p.recentPackIds)
    ? p.recentPackIds.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT_SCOUT_PACKS)
    : [];
  return {
    settings: normalizeScoutSettings(p.settings as Partial<ScoutSettings> | undefined),
    recentPackIds: recent,
  };
}

export const useScoutSettingsStore = create<ScoutSettingsStore>()(
  persist(
    (set, get) => ({
      settings: normalizeScoutSettings(DEFAULT_SCOUT_SETTINGS),
      recentPackIds: [],

      update: (partial) => set({ settings: normalizeScoutSettings({ ...get().settings, ...partial }) }),
      applyPreset: (id) => set({ settings: applyScoutPreset(get().settings, id) }),
      reset: () => set({ settings: normalizeScoutSettings(DEFAULT_SCOUT_SETTINGS) }),
      pushRecentPack: (id) =>
        set({ recentPackIds: pushUnique(get().recentPackIds, id, MAX_RECENT_SCOUT_PACKS) }),
    }),
    {
      name: SCOUT_SETTINGS_STORAGE_KEY,
      version: SCOUT_SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ScoutSettingsState => ({ settings: s.settings, recentPackIds: s.recentPackIds }),
      migrate: (persisted) => sanitizePersistedScout(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedScout(persisted) }),
    },
  ),
);
