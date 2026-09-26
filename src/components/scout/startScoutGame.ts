/**
 * Start pipeline for Highlight Scout: normalize settings → resolve the subject pool from the baked
 * dataset → hand it to the store. The Songooner equivalent is `src/lib/startGame.ts`, and this keeps
 * the same shape (a `LoadedScoutGame`, a typed error, a DEV handle for the e2e suite).
 *
 * Every run gets a seed even when the caller supplied none, so any finished session can be turned
 * into a challenge link afterwards.
 */

import { useSyncExternalStore } from 'react';
import { createRng } from '@/game/rng';
import { loadScoutBundle, loadScoutPool } from '@/scout/data';
import { matchSubject, subjectVariants } from '@/scout/names';
import { normalizeScoutSettings } from '@/scout/presets';
import { scoutPack } from '@/scout/packs';
import type { ScoutSettings, ScoutSubject } from '@/scout/types';
import { useScoutSettingsStore, useScoutStore } from '@/store/scoutStore';
import { loadSuggestionPools } from './useScoutSuggestions';

export type ScoutPoolReason = 'empty' | 'load';

export class ScoutPoolError extends Error {
  readonly reason: ScoutPoolReason;
  constructor(message: string, reason: ScoutPoolReason) {
    super(message);
    this.name = 'ScoutPoolError';
    this.reason = reason;
  }
}

export interface LoadedScoutGame {
  settings: ScoutSettings;
  subjects: ScoutSubject[];
}

function describePacks(ids: readonly string[]): string {
  const names = ids.map((id) => scoutPack(id)?.name).filter((n): n is string => typeof n === 'string' && n !== '');
  if (names.length === 0) return 'this selection';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

// ---------------------------------------------------------------------------------------------
// "Rolling the tape…" — a tiny external store so any screen can show the loading state
// ---------------------------------------------------------------------------------------------

interface StartState {
  starting: boolean;
  error: string | null;
}

let startState: StartState = { starting: false, error: null };
const listeners = new Set<() => void>();

function setStartState(next: StartState): void {
  startState = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Whether a session is being resolved right now, and the last failure. */
export function useScoutStarting(): StartState {
  return useSyncExternalStore(
    subscribe,
    () => startState,
    () => startState,
  );
}

export function clearScoutStartError(): void {
  if (startState.error !== null) setStartState({ ...startState, error: null });
}

// ---------------------------------------------------------------------------------------------
// Loading + starting
// ---------------------------------------------------------------------------------------------

/** Resolve the pool for a settings draft. Throws {@link ScoutPoolError} when nothing is playable. */
export async function loadScoutGame(input: Partial<ScoutSettings>): Promise<LoadedScoutGame> {
  const reproducible = typeof input.seed === 'string' && input.seed.trim() !== '';
  const settings = normalizeScoutSettings({ ...input, seed: reproducible ? input.seed : createRng().id() });

  let subjects: ScoutSubject[];
  try {
    // The suggestion pools come off the same chunks, so warm them here rather than on first keypress.
    const [pool] = await Promise.all([loadScoutPool(settings), loadSuggestionPools().catch(() => undefined)]);
    subjects = pool;
  } catch (err) {
    console.warn('[scout] could not load the NFL dataset', err);
    throw new ScoutPoolError("Couldn't load the scouting data. Check your connection and try again.", 'load');
  }
  if (subjects.length === 0) {
    throw new ScoutPoolError(`Nothing playable in ${describePacks(settings.packIds)}. Try another pack or difficulty.`, 'empty');
  }
  return { settings, subjects };
}

/** Start a session from an already-resolved pool. */
export function startLoadedScoutGame(loaded: LoadedScoutGame): void {
  useScoutStore.getState().start(loaded.settings, loaded.subjects);
  const prefs = useScoutSettingsStore.getState();
  for (const id of loaded.settings.packIds) prefs.pushRecentPack(id);
}

/** Load the pool and start the session. Resolves with what was started. */
export async function startScoutGame(input: Partial<ScoutSettings>): Promise<LoadedScoutGame> {
  setStartState({ starting: true, error: null });
  try {
    const loaded = await loadScoutGame(input);
    startLoadedScoutGame(loaded);
    setStartState({ starting: false, error: null });
    return loaded;
  } catch (err) {
    const message = err instanceof ScoutPoolError ? err.message : 'Something went wrong starting that session.';
    setStartState({ starting: false, error: message });
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// DEV handle (mirrors `window.__songooner`)
// ---------------------------------------------------------------------------------------------

export interface ScoutAnswer {
  kind: ScoutSubject['kind'];
  id: string;
  name: string;
  accepted: string[];
  mode: string;
  tryIndex: number;
  tries: number;
  visual: number;
}

export interface ScoutDevHandle {
  start: typeof startScoutGame;
  load: typeof loadScoutGame;
  bundle: typeof loadScoutBundle;
  store: typeof useScoutStore;
  settingsStore: typeof useScoutSettingsStore;
  /** The current round's answer. */
  answer: () => ScoutAnswer | null;
  /** A guess the matcher grades `close` for the current round (right surname / right city). */
  closeGuess: () => string | null;
  /** A guess the matcher grades `wrong`. */
  wrongGuess: () => string;
}

function currentSubject(): ScoutSubject | undefined {
  const s = useScoutStore.getState().state;
  return s.rounds[s.currentRound]?.subject;
}

const devHandle: ScoutDevHandle = {
  start: startScoutGame,
  load: loadScoutGame,
  bundle: loadScoutBundle,
  store: useScoutStore,
  settingsStore: useScoutSettingsStore,
  answer: () => {
    const s = useScoutStore.getState().state;
    const round = s.rounds[s.currentRound];
    if (!round) return null;
    const stage = round.stages[Math.min(round.tryIndex, round.stages.length - 1)];
    return {
      kind: round.subject.kind,
      id: round.subject.id,
      name: round.subject.name,
      accepted: round.subject.accepted.slice(),
      mode: round.mode,
      tryIndex: round.tryIndex,
      tries: s.settings.tries,
      visual: stage?.visual ?? 0,
    };
  },
  closeGuess: () => {
    const subject = currentSubject();
    if (!subject) return null;
    const v = subjectVariants(subject);
    const pool = [...useScoutStore.getState().state.rounds.map((r) => r.subject), ...useScoutStore.getState().state.queue];
    // Right surname with a first name nobody has / right city with a nickname nobody has.
    const candidate = subject.kind === 'team' ? `${subject.team?.location ?? v.city} Wombats` : `Zebedee ${v.last}`;
    return matchSubject(candidate, subject, pool).verdict === 'close' ? candidate : null;
  },
  wrongGuess: () => 'Zzyzx Quuxington',
};

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __scout?: Partial<ScoutDevHandle> };
  w.__scout = { ...(w.__scout ?? {}), ...devHandle };
}
