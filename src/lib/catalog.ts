/**
 * Catalog layer — turns `Pack`s into playable `Track` pools.
 *
 * Responsibilities:
 *  - resolve a pack's Deezer sources (in parallel, behind the shared rate limiter)
 *  - dedupe by track id *and* by normalized "title|artist" (same song, different release)
 *  - union multiple packs into one pool, apply the explicit filter
 *  - slice the pool into difficulty tiers by `rank` percentile
 *  - custom packs from an artist / playlist / Deezer url / free-text search
 *
 * Picking the round order is the engine's job (`src/game`), not ours.
 */

import type {
  ArtistSummary,
  CatalogFilter,
  Difficulty,
  Pack,
  PackCategory,
  PackSource,
  PlaylistSummary,
  Track,
} from '@/types/catalog';
import { PACKS, PACKS_BY_ID } from '@/data/packs';
import {
  getAlbumTracks,
  getArtistTop,
  getChartTracks,
  getPlaylistTracks,
  searchTracks,
} from '@/lib/deezer';

export { PACKS };

/** A tier needs at least this many tracks to be usable on its own. */
export const MIN_TIER_SIZE = 12;

/* -------------------------------------------------------------- normalizing */

/** Lowercase, strip diacritics and punctuation — for duplicate detection. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Dedupe key: same song by the same artist, regardless of release/version. */
export function trackKey(track: Track): string {
  return `${normalizeText(track.title)}|${normalizeText(track.artist)}`;
}

/**
 * Drop duplicates (by id, then by normalized title+artist) and tracks without a preview.
 * Input order is preserved, so earlier sources win.
 */
export function dedupeTracks(tracks: Track[]): Track[] {
  const ids = new Set<number>();
  const keys = new Set<string>();
  const out: Track[] = [];
  for (const track of tracks) {
    if (!track.preview) continue;
    if (ids.has(track.id)) continue;
    const key = trackKey(track);
    if (keys.has(key)) continue;
    ids.add(track.id);
    keys.add(key);
    out.push(track);
  }
  return out;
}

/* ----------------------------------------------------------------- resolving */

function resolveSource(source: PackSource): Promise<Track[]> {
  switch (source.kind) {
    case 'playlist':
      return getPlaylistTracks(source.id, 300);
    case 'chart':
      return getChartTracks(source.genreId, 100);
    case 'artist':
      return getArtistTop(source.id, 100);
    case 'album':
      return getAlbumTracks(source.id);
    case 'search':
      return searchTracks(source.q, 100);
  }
}

const packCache = new Map<string, Promise<Track[]>>();

/**
 * Resolve every source of a pack into a deduped, preview-only `Track[]` tagged with `packId`.
 * Sources run in parallel (the Deezer client queues them); a single failing source is
 * tolerated, but a pack whose every source fails rejects.
 */
export function resolvePack(pack: Pack): Promise<Track[]> {
  const cached = packCache.get(pack.id);
  if (cached) return cached;

  const pending = (async (): Promise<Track[]> => {
    const settled = await Promise.allSettled(pack.sources.map(resolveSource));
    const merged: Track[] = [];
    let failures = 0;
    for (const result of settled) {
      if (result.status === 'fulfilled') merged.push(...result.value);
      else failures += 1;
    }
    if (merged.length === 0 && failures > 0) {
      throw new Error(`Pack "${pack.id}": all ${failures} source(s) failed to resolve`);
    }
    return dedupeTracks(merged).map((track) => ({ ...track, packId: pack.id }));
  })();

  packCache.set(pack.id, pending);
  // A rejected pack should be retryable on the next attempt.
  pending.catch(() => packCache.delete(pack.id));
  return pending;
}

/** Forget memoized pools (e.g. after 6 h, when preview urls are stale). */
export function clearPackCache(packId?: string): void {
  if (packId === undefined) packCache.clear();
  else packCache.delete(packId);
}

/* --------------------------------------------------------------- difficulty */

/** Percentile window per tier, measured from the most popular track downwards. */
const TIERS: ReadonlyArray<{ tier: Exclude<Difficulty, 'any'>; lo: number; hi: number }> = [
  { tier: 'easy', lo: 0, hi: 0.25 },
  { tier: 'medium', lo: 0.25, hi: 0.5 },
  { tier: 'hard', lo: 0.5, hi: 0.75 },
  { tier: 'expert', lo: 0.75, hi: 0.95 },
  { tier: 'impossible', lo: 0.95, hi: 1 },
];

/** Most popular first; ties broken by id so ordering is deterministic. */
function byPopularity(a: Track, b: Track): number {
  return b.rank - a.rank || a.id - b.id;
}

/** Which difficulty tier a track falls into, given the pool it belongs to. */
export function tierOf(track: Track, pool: Track[]): Difficulty {
  if (pool.length === 0) return 'any';
  const ranked = [...pool].sort(byPopularity);
  const index = ranked.findIndex((t) => t.id === track.id);
  if (index < 0) return 'any';
  const pct = index / ranked.length;
  for (const { tier, lo, hi } of TIERS) {
    if (pct >= lo && pct < hi) return tier;
  }
  return 'impossible';
}

/**
 * Slice a pool down to one difficulty tier. If the tier is thinner than
 * `MIN_TIER_SIZE`, the percentile window grows into the neighbouring tiers.
 */
export function applyDifficulty(pool: Track[], difficulty: Difficulty): Track[] {
  if (difficulty === 'any' || pool.length === 0) return pool;
  const spec = TIERS.find((t) => t.tier === difficulty);
  if (!spec) return pool;

  const ranked = [...pool].sort(byPopularity);
  const n = ranked.length;
  let lo = Math.floor(spec.lo * n);
  let hi = Math.max(lo + 1, Math.ceil(spec.hi * n));

  // Widen symmetrically into neighbouring tiers until the slice is playable.
  while (hi - lo < MIN_TIER_SIZE && (lo > 0 || hi < n)) {
    if (lo > 0) lo -= 1;
    if (hi - lo < MIN_TIER_SIZE && hi < n) hi += 1;
  }
  return ranked.slice(lo, hi);
}

/* --------------------------------------------------------------- pool build */

/**
 * Union the selected packs into one pool, then apply the explicit filter and the
 * difficulty tier. Unknown pack ids are ignored; packs that fail to resolve are skipped
 * unless none resolve at all.
 */
export async function buildPool(
  filter: CatalogFilter,
  opts?: { exclude?: number[] },
): Promise<Track[]> {
  const packs = filter.packIds.map((id) => PACKS_BY_ID.get(id)).filter((p): p is Pack => p !== undefined);
  if (packs.length === 0) return [];

  const settled = await Promise.allSettled(packs.map(resolvePack));
  const merged: Track[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') merged.push(...result.value);
  }
  if (merged.length === 0) {
    const reason = settled.find((r) => r.status === 'rejected');
    if (reason && reason.status === 'rejected') throw reason.reason;
    return [];
  }

  let pool = dedupeTracks(merged);
  if (filter.explicitFilter) pool = pool.filter((t) => !t.explicit);
  const exclude = opts?.exclude;
  if (exclude && exclude.length > 0) {
    const skip = new Set(exclude);
    pool = pool.filter((t) => !skip.has(t.id));
  }
  return applyDifficulty(pool, filter.difficulty);
}

/* ------------------------------------------------------------ pack browsing */

export function getPack(id: string): Pack | undefined {
  return PACKS_BY_ID.get(id);
}

export const PACK_CATEGORIES: ReadonlyArray<{
  id: PackCategory;
  name: string;
  emoji: string;
  blurb: string;
}> = [
  { id: 'chart', name: 'Charts', emoji: '📈', blurb: 'What the world is streaming right now' },
  { id: 'genre', name: 'Genres', emoji: '🎚️', blurb: 'From boom bap to amapiano' },
  { id: 'decade', name: 'Decades', emoji: '🕰️', blurb: 'Sixty years of hits, decade by decade' },
  { id: 'region', name: 'Around the World', emoji: '🌍', blurb: 'Bollywood, K-pop, Afrobeats and more' },
  { id: 'artist', name: 'Artists', emoji: '⭐', blurb: 'One artist, their whole catalog' },
  { id: 'vibe', name: 'Vibes', emoji: '🫠', blurb: 'Gym, road trip, sad girl hours' },
  { id: 'soundtrack', name: 'Soundtracks', emoji: '🎬', blurb: 'Film, TV, games and Disney' },
  { id: 'custom', name: 'Your Packs', emoji: '✨', blurb: 'Built from any Deezer artist or playlist' },
];

/** Every tag used across the catalog, alphabetically. */
export function allTags(): string[] {
  const tags = new Set<string>();
  for (const pack of PACKS) for (const tag of pack.tags) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * Fuzzy pack search over name, tagline and tags. Optional `category` / `tags` narrow the
 * result; an empty query returns everything matching those filters.
 */
export function searchPacks(
  query: string,
  opts?: { category?: PackCategory; tags?: string[] },
): Pack[] {
  const needle = normalizeText(query);
  const wanted = opts?.tags?.map((t) => t.toLowerCase());

  const scored: Array<{ pack: Pack; score: number }> = [];
  for (const pack of PACKS) {
    if (opts?.category !== undefined && pack.category !== opts.category) continue;
    if (wanted && wanted.length > 0) {
      const own = pack.tags.map((t) => t.toLowerCase());
      if (!wanted.every((t) => own.includes(t))) continue;
    }
    if (needle.length === 0) {
      scored.push({ pack, score: pack.featured === true ? 1 : 0 });
      continue;
    }
    const name = normalizeText(pack.name);
    const tagline = normalizeText(pack.tagline);
    const tags = pack.tags.map(normalizeText);

    let score = 0;
    if (name === needle) score = 100;
    else if (name.startsWith(needle)) score = 80;
    else if (name.includes(needle)) score = 60;
    else if (tags.some((t) => t === needle)) score = 50;
    else if (tags.some((t) => t.includes(needle))) score = 30;
    else if (tagline.includes(needle)) score = 20;
    else if (normalizeText(pack.id).includes(needle)) score = 15;
    if (score === 0) continue;
    if (pack.featured === true) score += 5;
    scored.push({ pack, score });
  }

  scored.sort((a, b) => b.score - a.score || a.pack.name.localeCompare(b.pack.name));
  return scored.map((s) => s.pack);
}

/* ------------------------------------------------------------- daily rotation */

/** FNV-1a — small, stable, and identical across browsers. */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Packs eligible for the daily: featured crowd-pleasers plus every genre pack. */
function dailyPool(): Pack[] {
  const pool = PACKS.filter((p) => p.featured === true || p.category === 'genre');
  return [...pool].sort((a, b) => a.id.localeCompare(b.id));
}

/** Deterministic pack-of-the-day for a `YYYY-MM-DD` date. Same date → same pack, always. */
export function getDailyPack(dateISO: string): Pack {
  const pool = dailyPool();
  const fallback = PACKS[0];
  if (pool.length === 0) {
    if (!fallback) throw new Error('No packs available');
    return fallback;
  }
  const pick = pool[hashString(`songooner-daily:${dateISO}`) % pool.length];
  return pick ?? pool[0]!;
}

/* ---------------------------------------------------------------- custom packs */

const CUSTOM_ACCENTS = ['#a855f7', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185'] as const;

function accentFor(seed: string): string {
  const accent = CUSTOM_ACCENTS[hashString(seed) % CUSTOM_ACCENTS.length];
  return accent ?? '#a855f7';
}

function slugify(value: string): string {
  const slug = normalizeText(value).replace(/\s+/g, '-');
  return slug.length > 0 ? slug.slice(0, 48) : 'custom';
}

export function packFromArtist(artist: ArtistSummary): Pack {
  return {
    id: `custom-artist-${artist.id}`,
    name: artist.name,
    emoji: '⭐',
    tagline: `Top tracks by ${artist.name}`.slice(0, 60),
    category: 'custom',
    tags: ['custom', 'artist', slugify(artist.name)],
    accent: accentFor(`artist:${artist.id}`),
    sources: [{ kind: 'artist', id: artist.id }],
    approxSize: 100,
  };
}

export function packFromPlaylist(playlist: PlaylistSummary): Pack {
  return {
    id: `custom-playlist-${playlist.id}`,
    name: playlist.title,
    emoji: '🎵',
    tagline: (playlist.author ? `Playlist by ${playlist.author}` : 'Deezer playlist').slice(0, 60),
    category: 'custom',
    tags: ['custom', 'playlist'],
    accent: accentFor(`playlist:${playlist.id}`),
    sources: [{ kind: 'playlist', id: playlist.id }],
    approxSize: Math.min(playlist.trackCount, 300),
  };
}

export function packFromSearch(q: string): Pack {
  const query = q.trim();
  return {
    id: `custom-search-${slugify(query)}`,
    name: query.length > 0 ? query : 'Search',
    emoji: '🔎',
    tagline: `Deezer search: ${query}`.slice(0, 60),
    category: 'custom',
    tags: ['custom', 'search'],
    accent: accentFor(`search:${query.toLowerCase()}`),
    sources: [{ kind: 'search', q: query }],
    approxSize: 100,
  };
}

export function packFromAlbum(albumId: number, title?: string): Pack {
  return {
    id: `custom-album-${albumId}`,
    name: title ?? `Album ${albumId}`,
    emoji: '💽',
    tagline: 'Every track on the album'.slice(0, 60),
    category: 'custom',
    tags: ['custom', 'album'],
    accent: accentFor(`album:${albumId}`),
    sources: [{ kind: 'album', id: albumId }],
    approxSize: 20,
  };
}

/**
 * Parse a Deezer share url into a source descriptor. Handles locale prefixes
 * (`/en/`, `/fr/`, `/pt-br/`), `www.`, and trailing query strings.
 */
export function parseDeezerUrl(
  url: string,
): { kind: 'playlist' | 'artist' | 'album'; id: number } | null {
  const match = /(?:^|\/\/|\.)deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|artist|album)\/(\d+)/i.exec(
    url.trim(),
  );
  if (!match) return null;
  const kind = match[1]?.toLowerCase();
  const id = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (kind !== 'playlist' && kind !== 'artist' && kind !== 'album') return null;
  return { kind, id };
}

export const catalog = {
  resolvePack,
  buildPool,
  tierOf,
  applyDifficulty,
  dedupeTracks,
  getPack,
  searchPacks,
  allTags,
  getDailyPack,
  packFromArtist,
  packFromPlaylist,
  packFromAlbum,
  packFromSearch,
  parseDeezerUrl,
  clearPackCache,
  PACKS,
  PACK_CATEGORIES,
};
