/**
 * Result hand-off between the Play and Results screens (in-memory, never persisted).
 *
 * - `record(state)` folds a finished game into the stats store exactly once per game id and keeps
 *   the `RecordGameResult` (XP, rank before/after, new achievements) so Results can celebrate it.
 * - `challenger` is stashed by the Challenge screen before it starts a game, so Results can say
 *   "You beat Maya's 6,420!".
 */

import { create } from 'zustand';
import type { GameState } from '@/types';
import { useStatsStore, type RecordGameResult } from '@/store/statsStore';

export interface Challenger {
  by: string;
  score: number;
}

export interface ResultStore {
  /** Game id the stored `result` belongs to. */
  gameId: string | null;
  result: RecordGameResult | null;
  challenger: Challenger | null;
  /** Record a finished game (idempotent per game id). Returns null when the game is not finished. */
  record(state: GameState): RecordGameResult | null;
  setChallenger(challenger: Challenger | null): void;
  clear(): void;
}

export const useResultStore = create<ResultStore>()((set, get) => ({
  gameId: null,
  result: null,
  challenger: null,

  record: (state) => {
    if (state.status !== 'finished' || !state.id) return null;
    const { gameId, result } = get();
    if (gameId === state.id && result) return result;
    const next = useStatsStore.getState().recordGame(state);
    set({ gameId: state.id, result: next });
    return next;
  },

  setChallenger: (challenger) => set({ challenger }),

  clear: () => set({ gameId: null, result: null, challenger: null }),
}));
