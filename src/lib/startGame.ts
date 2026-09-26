/**
 * Start-game pipeline shared by every screen that launches a game (Setup, Packs, Daily,
 * Challenge, Duel lobby, Results "play again"): normalize settings → resolve the track pool →
 * drop recently played tracks when affordable → hand the pool to the game store.
 */
import { buildPool, getPack } from '@/lib/catalog';
import { loadCustomPacks } from '@/lib/customPacks';
import { getTrack } from '@/lib/deezer';
import { normalizeSettings } from '@/game/presets';
import { createRng } from '@/game/rng';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { GameSettings, Track } from '@/types';

export type PoolErrorReason = 'no-packs' | 'empty' | 'network';

export class PoolError extends Error {
  readonly reason: PoolErrorReason;
  constructor(message: string, reason: PoolErrorReason) {
    super(message);
    this.name = 'PoolError';
    this.reason = reason;
  }
}

export interface LoadedGame {
  settings: GameSettings;
  tracks: Track[];
}

/** `Pop Hits`, `Pop Hits and Burna Boy`, `Pop Hits and 2 more` — pack names for error copy. */
function describePacks(ids: readonly string[]): string {
  const names = ids.map((id) => getPack(id)?.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
  if (names.length === 0) return 'these packs';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

/** Minimum pool size we insist on after excluding recent tracks. */
function minPoolFor(settings: GameSettings): number {
  const rounds = settings.rounds > 0 ? settings.rounds : 20;
  return Math.max(12, rounds * 2);
}

/**
 * Resolve the pool for a settings draft. Every game gets a seed (so it can always be turned into a
 * challenge link afterwards). Recently played tracks are excluded unless the run must be
 * reproducible (daily / challenge, i.e. a seed was supplied by the caller).
 */
export async function loadPool(input: Partial<GameSettings>): Promise<LoadedGame> {
  loadCustomPacks();
  const reproducible = typeof input.seed === 'string' && input.seed.length > 0;
  const settings = normalizeSettings({ ...input, seed: reproducible ? input.seed : createRng().id() });
  if (settings.packIds.length === 0) throw new PoolError('Pick at least one pack to play.', 'no-packs');

  let tracks: Track[];
  try {
    tracks = await buildPool({
      packIds: settings.packIds,
      difficulty: settings.difficulty,
      explicitFilter: settings.explicitFilter,
    });
  } catch (e) {
    // The technical reason stays in the console; the player gets a sentence they can act on.
    console.warn('[songooner] could not resolve the track pool', settings.packIds, e);
    throw new PoolError(`Couldn't load songs for ${describePacks(settings.packIds)}. Check your connection and try again.`, 'network');
  }
  if (tracks.length === 0) throw new PoolError('No playable songs match this selection. Try other packs or difficulty.', 'empty');

  if (!reproducible) {
    const recent = useSettingsStore.getState().recentTrackIds;
    if (recent.length > 0) {
      const skip = new Set(recent);
      const fresh = tracks.filter((t) => !skip.has(t.id));
      if (fresh.length >= minPoolFor(settings)) tracks = fresh;
    }
  }
  return { settings, tracks };
}

/** Resolve exact tracks by id (challenge links). Missing/unplayable ids are dropped. */
export async function loadTracksByIds(ids: readonly number[]): Promise<Track[]> {
  const settled = await Promise.allSettled(ids.map((id) => getTrack(id)));
  const out: Track[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.preview) out.push(r.value);
  }
  return out;
}

/** Load the pool and start the game in the store. Resolves with what was started. */
export async function startGameFromSettings(input: Partial<GameSettings>): Promise<LoadedGame> {
  const loaded = await loadPool(input);
  startLoadedGame(loaded);
  return loaded;
}

/** Start a game from an already-resolved pool (online duel / challenge). */
export function startLoadedGame(loaded: LoadedGame): void {
  useGameStore.getState().start(loaded.settings, loaded.tracks);
  const prefs = useSettingsStore.getState();
  for (const id of loaded.settings.packIds) prefs.pushRecentPack(id);
}

// Dev-only handle for e2e tests: window.__songooner.start({...})
declare global {
  interface Window {
    __songooner?: {
      start: typeof startGameFromSettings;
      loadPool: typeof loadPool;
      gameStore: typeof useGameStore;
      settingsStore: typeof useSettingsStore;
    };
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__songooner = { start: startGameFromSettings, loadPool, gameStore: useGameStore, settingsStore: useSettingsStore };
}
