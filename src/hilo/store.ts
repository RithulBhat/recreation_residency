/**
 * Higher or Lower store — a thin zustand wrapper over the pure engine.
 *
 * Holds the state, the pool and the clock. Every rule lives in `engine.ts` so the party layer
 * can drive the same reducer without a second implementation of anything.
 */

import { create } from 'zustand';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { resolveRunPool } from './pool';
import { createInitialState, reduce, type HiloAction } from './engine';
import { DEFAULT_SETTINGS } from './settings';
import type { HiloSettings, HiloState } from './types';

interface HiloStore {
  state: HiloState;
  settings: HiloSettings;
  roundStartedAt: number;
  setSettings: (s: HiloSettings) => void;
  start: (settings?: HiloSettings) => void;
  dispatch: (a: HiloAction) => void;
  pick: (p: 'higher' | 'lower' | 'same') => void;
}

/**
 * The items one run will use. Always a single unit — see `pool.ts` for why mixing them makes a
 * round unanswerable rather than merely odd.
 */
export function poolFor(settings: HiloSettings): readonly ContentItem[] {
  return resolveRunPool(settings.packIds, createRng(settings.seed)).items;
}

function build(settings: HiloSettings): HiloState {
  return createInitialState(settings, poolFor(settings), createRng(settings.seed));
}

export const useHiloStore = create<HiloStore>((set, get) => ({
  state: createInitialState(DEFAULT_SETTINGS, []),
  settings: DEFAULT_SETTINGS,
  roundStartedAt: 0,

  setSettings: (settings) => set({ settings }),

  start: (settings) => {
    const next = settings ?? get().settings;
    set({
      settings: next,
      state: reduce(build(next), { type: 'start' }),
      roundStartedAt: Date.now(),
    });
  },

  dispatch: (action) => {
    const before = get().state;
    const after = reduce(before, action);
    const advanced =
      after.index !== before.index || (before.status !== 'playing' && after.status === 'playing');
    set({ state: after, ...(advanced ? { roundStartedAt: Date.now() } : {}) });
  },

  pick: (p) => {
    const { roundStartedAt, dispatch } = get();
    dispatch({ type: 'pick', pick: p, elapsedMs: Date.now() - roundStartedAt });
  },
}));
