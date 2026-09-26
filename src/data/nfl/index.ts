/**
 * Highlight Scout dataset loader.
 *
 * The JSON in this folder is baked by `scripts/sync-nfl.mjs` (ESPN's APIs send no CORS headers, so
 * the browser can never call them). Everything here loads through `import()` so the payloads land
 * in lazy chunks instead of the entry bundle, and every loader is memoised: concurrent callers
 * share one in-flight promise and repeat calls are free.
 *
 * Images are NOT baked — `a.espncdn.com` sends `Access-Control-Allow-Origin: *`, so headshots and
 * logos are fetched at runtime and can be drawn to a canvas (`headshotUrl` / `logoUrl`).
 */

import type { HighlightPlay, NflDataset, NflPlayer, NflTeam, StatLine } from '@/scout/types';

/**
 * One official highlight video per player, keyed by ESPN athlete id. Harvested by web search,
 * verified through YouTube's keyless oEmbed (official "NFL" or team channels only), and every
 * entry confirmed to genuinely embed via the IFrame API. Used ONLY as the post-guess reveal:
 * a cross-origin YouTube iframe is pixel-isolated, so nothing can be drawn over its content,
 * and YouTube's terms forbid obscuring the player.
 *
 * Some clips live on a former team's channel or name an older season, so a clip must never be
 * used to imply a player's CURRENT team — show its own title and channel beside it.
 */
export interface PlayerClip {
  /** ESPN athlete id. */
  id: string;
  /** 11-character YouTube video id. */
  videoId: string;
  /** Official channel that published it, e.g. 'NFL' or 'Detroit Lions'. */
  channel: string;
  title: string;
}

/** What `meta.json` records about the last sync. */
export interface NflMeta {
  /** ISO date the sync ran. */
  syncedAt: string;
  /** Season ESPN considers current. */
  season: number;
  /** Seasons whose play-by-play was walked for `highlights.json`. */
  seasonsWalked: number[];
  counts: { teams: number; players: number; highlights: number; statlines: number };
}

/**
 * Memoise a loader on its promise, so N simultaneous callers trigger exactly one chunk fetch.
 * A rejected load is forgotten, letting a later call retry.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
    return pending;
  };
}

/**
 * TypeScript widens an imported JSON literal (`conference: string`, not `'AFC' | 'NFC'`), so each
 * payload is asserted to its contract type once, here. `scripts/verify-nfl.mjs` and the tests in
 * `players.test.ts` are what actually police the shapes.
 */
const asType = <T>(value: unknown): T => value as T;

export const loadTeams = once(
  async (): Promise<NflTeam[]> => asType<NflTeam[]>((await import('./teams.json')).default),
);

export const loadPlayers = once(
  async (): Promise<NflPlayer[]> => asType<NflPlayer[]>((await import('./players.json')).default),
);

export const loadHighlights = once(
  async (): Promise<HighlightPlay[]> =>
    asType<HighlightPlay[]>((await import('./highlights.json')).default),
);

export const loadStatLines = once(
  async (): Promise<StatLine[]> => asType<StatLine[]>((await import('./statlines.json')).default),
);

export const loadMeta = once(
  async (): Promise<NflMeta> => asType<NflMeta>((await import('./meta.json')).default),
);

/** Teams + players + sync stamp in one await; the two payloads load in parallel. */
export const loadDataset = once(async (): Promise<NflDataset> => {
  const [meta, teams, players] = await Promise.all([loadMeta(), loadTeams(), loadPlayers()]);
  return { syncedAt: meta.syncedAt, season: meta.season, teams, players };
});

// --- Convenience indexes (optional; build your own if you need a different shape) --------------

export const loadTeamsById = once(async (): Promise<ReadonlyMap<string, NflTeam>> => {
  const teams = await loadTeams();
  return new Map(teams.map((t) => [t.id, t]));
});

export const loadPlayersById = once(async (): Promise<ReadonlyMap<string, NflPlayer>> => {
  const players = await loadPlayers();
  return new Map(players.map((p) => [p.id, p]));
});

// --- Sync image helpers (no data needed) -------------------------------------------------------

/**
 * Transparent-background RGBA PNG, 600×436, served with `Access-Control-Allow-Origin: *`.
 * The transparency is what makes the silhouette mode possible.
 *
 * Prefer `player.headshot` when you have the record: for a handful of fringe players ESPN has no
 * NFL asset and `players.json` points at their college headshot instead (same format, other path).
 * This helper is for when all you hold is an id.
 */
export const headshotUrl = (playerId: string): string =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png`;

/** 500×500 team logo PNG, also CORS-enabled. `dark` is the variant for light backgrounds. */
export const logoUrl = (teamAbbr: string, variant: 'default' | 'dark' = 'default'): string =>
  `https://a.espncdn.com/i/teamlogos/nfl/500${variant === 'dark' ? '-dark' : ''}/` +
  `${teamAbbr.toLowerCase()}.png`;

export const loadClips = once(
  async (): Promise<PlayerClip[]> => (await import('./clips.json')).default as PlayerClip[],
);

/** Player id → its verified highlight clip. Players without one simply have no clip. */
export const loadClipsById = once(async (): Promise<ReadonlyMap<string, PlayerClip>> => {
  const clips = await loadClips();
  return new Map(clips.map((c) => [c.id, c]));
});

/** Privacy-friendly embed origin for the reveal player. */
export const clipEmbedUrl = (videoId: string, opts: { autoplay?: boolean } = {}): string =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1${opts.autoplay ? '&autoplay=1' : ''}`;
