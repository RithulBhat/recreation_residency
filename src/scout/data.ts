/**
 * Loading the baked NFL dataset.
 *
 * `scripts/sync-nfl.mjs` writes `src/data/nfl/*.json` (ESPN sends no CORS headers, so the browser
 * can never call it). Those files are imported LAZILY here, so they land in their own chunk and
 * nothing about them is in the initial bundle.
 *
 * The loader is injectable: `setScoutLoader` lets the app swap in `src/data/nfl`'s own loader
 * (`loadDataset()` + `loadHighlights()` + `loadStatLines()`) once that module exists, or feed
 * fixtures in a test, without this module hard-depending on it.
 */

import { createRng, type Rng } from '@/game/rng';
import { buildPool, type ScoutPoolSource } from './subjects';
import type { HighlightPlay, NflPlayer, NflTeam, ScoutSettings, ScoutSubject, StatLine } from './types';

export type ScoutLoader = () => Promise<ScoutPoolSource>;

interface JsonModule {
  default: unknown;
}

interface MetaJson {
  syncedAt?: unknown;
  season?: unknown;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * The default loader: four lazy JSON imports, assembled into one bundle.
 * The files are produced by the sync script and already match `@/scout/types`.
 */
export const loadBakedDataset: ScoutLoader = async () => {
  const [teams, players, highlights, statLines, meta] = await Promise.all([
    import('@/data/nfl/teams.json') as Promise<JsonModule>,
    import('@/data/nfl/players.json') as Promise<JsonModule>,
    import('@/data/nfl/highlights.json') as Promise<JsonModule>,
    import('@/data/nfl/statlines.json') as Promise<JsonModule>,
    import('@/data/nfl/meta.json') as Promise<JsonModule>,
  ]);
  const m = (meta.default ?? {}) as MetaJson;
  return {
    syncedAt: typeof m.syncedAt === 'string' ? m.syncedAt : '',
    season: typeof m.season === 'number' ? m.season : new Date().getFullYear(),
    teams: asArray<NflTeam>(teams.default),
    players: asArray<NflPlayer>(players.default),
    plays: asArray<HighlightPlay>(highlights.default),
    statLines: asArray<StatLine>(statLines.default),
  };
};

let loader: ScoutLoader = loadBakedDataset;
let cached: Promise<ScoutPoolSource> | undefined;

/** Swap the loader (the data module's own loader, or fixtures in a test). Clears the cache. */
export function setScoutLoader(next: ScoutLoader): void {
  loader = next;
  cached = undefined;
}

export function resetScoutLoader(): void {
  loader = loadBakedDataset;
  cached = undefined;
}

/** The dataset, loaded once per session. A failure is not cached, so a retry can succeed. */
export function loadScoutBundle(): Promise<ScoutPoolSource> {
  if (!cached) {
    cached = loader().catch((err: unknown) => {
      cached = undefined;
      throw err;
    });
  }
  return cached;
}

/** Load the dataset and resolve it into a playable pool — the whole start pipeline. */
export async function loadScoutPool(
  settings: ScoutSettings,
  rng: Rng = createRng(settings.seed),
): Promise<ScoutSubject[]> {
  const dataset = await loadScoutBundle();
  return buildPool(dataset, settings, rng);
}

/** Transparent-background headshot PNG (600 px, CORS-enabled — canvas-safe). */
export function headshotUrl(playerId: string): string {
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png`;
}

/** 500 px team logo PNG (CORS-enabled). */
export function logoUrl(abbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
}
