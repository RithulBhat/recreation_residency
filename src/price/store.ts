/**
 * Price Guess store — a thin zustand wrapper over the pure engine.
 *
 * All rules live in `engine.ts`; this holds the current state, the clock and the item pool, and
 * forwards actions. Keeping the store thin is what lets the party layer drive the same reducer
 * later without a second implementation of any rule.
 */

import { create } from 'zustand';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { poolFrom } from '@/arcade/content';
import { pricePool } from '@/data/price';
import { createInitialState, reduce, selectItems, type PriceAction } from './engine';
import { DEFAULT_SETTINGS } from './settings';
import type { PriceSettings, PriceState } from './types';

interface PriceStore {
  state: PriceState;
  /** When the current round started, for the speed bonus. */
  roundStartedAt: number;
  settings: PriceSettings;
  setSettings: (s: PriceSettings) => void;
  /** Build a fresh game from the settings and start it. */
  start: (settings?: PriceSettings) => void;
  dispatch: (action: PriceAction) => void;
  /** Guess for the solo player, timing it automatically. */
  guess: (value: number, playerId?: string) => void;
  reset: () => void;
}

function buildState(settings: PriceSettings): PriceState {
  const packs = pricePool(settings.packIds);
  const pool: readonly ContentItem[] = poolFrom(packs);
  const items = selectItems(pool, settings, createRng(settings.seed));
  return createInitialState(settings, items);
}

export const usePriceStore = create<PriceStore>((set, get) => ({
  state: createInitialState(DEFAULT_SETTINGS, []),
  roundStartedAt: 0,
  settings: DEFAULT_SETTINGS,

  setSettings: (settings) => set({ settings }),

  start: (settings) => {
    const next = settings ?? get().settings;
    set({
      settings: next,
      state: reduce(buildState(next), { type: 'start' }),
      roundStartedAt: Date.now(),
    });
  },

  dispatch: (action) => {
    const before = get().state;
    const after = reduce(before, action);
    // Restart the clock whenever a new round begins.
    const advanced = after.index !== before.index || (before.status !== 'playing' && after.status === 'playing');
    set({ state: after, ...(advanced ? { roundStartedAt: Date.now() } : {}) });
  },

  guess: (value, playerId) => {
    const { state, roundStartedAt, dispatch } = get();
    const id = playerId ?? state.settings.players[0]?.id ?? 'you';
    dispatch({ type: 'guess', playerId: id, value, elapsedMs: Date.now() - roundStartedAt });
  },

  reset: () =>
    set({ state: createInitialState(get().settings, []), roundStartedAt: 0 }),
}));
