/**
 * Deezer public API client (no key required).
 *
 * The API does NOT send `Access-Control-Allow-Origin`, so every browser call goes through
 * JSONP (`&output=jsonp&callback=<fn>` + injected <script>). The preview CDN *does* send
 * CORS `*`, so previews can be fetched and decoded by the audio engine.
 *
 * Preview urls are short-lived — see `PREVIEW_TTL_SEC`. Always gate playback on
 * `isPreviewFresh()` and refresh with `refreshPreview()` / `refreshPreviews()`.
 *
 * Everything is funnelled through a token-bucket rate limiter (Deezer allows 50 requests
 * per 5 s per IP) and a two-tier cache (in-memory Map + localStorage, 6 h TTL).
 */

import type { ArtistSummary, PlaylistSummary, Track } from '@/types/catalog';

const API = 'https://api.deezer.com';

/* ------------------------------------------------------------------ errors */

export class DeezerError extends Error {
  readonly code: number;
  /** Deezer's own error type, e.g. 'DataException'. */
  readonly kind: string;

  constructor(message: string, code = 0, kind = 'DeezerError') {
    super(message);
    this.name = 'DeezerError';
    this.code = code;
    this.kind = kind;
  }
}

/* ------------------------------------------------- raw Deezer payload types */

interface DzArtistRef {
  id?: number;
  name?: string;
  picture_medium?: string;
  picture_big?: string;
  nb_fan?: number;
}

interface DzAlbumRef {
  id?: number;
  title?: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  md5_image?: string;
}

interface DzTrack {
  id: number;
  readable?: boolean;
  title?: string;
  title_short?: string;
  duration?: number;
  rank?: number;
  explicit_lyrics?: boolean;
  preview?: string;
  md5_image?: string;
  artist?: DzArtistRef;
  album?: DzAlbumRef;
  release_date?: string;
  bpm?: number;
}

interface DzList<T> {
  data?: T[];
  total?: number;
  next?: string;
}

interface DzPlaylist {
  id?: number;
  title?: string;
  picture_medium?: string;
  picture_big?: string;
  nb_tracks?: number;
  user?: { name?: string };
  creator?: { name?: string };
  tracks?: DzList<DzTrack>;
}

interface DzAlbum extends DzAlbumRef {
  artist?: DzArtistRef;
  tracks?: DzList<DzTrack>;
}

interface DzErrorEnvelope {
  error?: { type?: string; message?: string; code?: number };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Deezer signals failure with a 200 + `{"error":{...}}` body. */
function errorOf(payload: unknown): DeezerError | null {
  if (!isRecord(payload)) return null;
  const env = payload as DzErrorEnvelope;
  if (!env.error || !isRecord(env.error)) return null;
  const { type, message, code } = env.error;
  return new DeezerError(message ?? 'Deezer request failed', Number(code ?? 0), type ?? 'DeezerError');
}

/* ------------------------------------------------------------------- jsonp */

let callbackSeq = 0;

type CallbackHost = Record<string, unknown>;

export const JSONP_TIMEOUT_MS = 15_000;

/** After a timeout the callback global stays around as a no-op this long, so a late script never throws. */
export const LATE_CALLBACK_GRACE_MS = 30_000;

const LATE_CALLBACK_NOOP = (): void => {};

/**
 * Call a Deezer endpoint via JSONP. Cleans up the script tag *and* the global callback on
 * success, error and timeout (after a timeout the callback is replaced by a no-op stub for
 * `LATE_CALLBACK_GRACE_MS`, since a slow response would otherwise call a deleted global and
 * throw a ReferenceError). Rejects with `DeezerError` for `{error}` payloads.
 */
export function jsonp<T>(url: string, opts?: { timeoutMs?: number }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new DeezerError('JSONP needs a DOM; use plain fetch from Node', -1, 'EnvironmentError'));
      return;
    }

    const name = `__sgdz_${++callbackSeq}`;
    const host = globalThis as unknown as CallbackHost;
    const script = document.createElement('script');
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      delete host[name];
      script.onerror = null;
      script.remove();
    };

    timer = setTimeout(() => {
      cleanup();
      host[name] = LATE_CALLBACK_NOOP;
      setTimeout(() => {
        if (host[name] === LATE_CALLBACK_NOOP) delete host[name];
      }, LATE_CALLBACK_GRACE_MS);
      reject(new DeezerError(`Deezer request timed out after ${opts?.timeoutMs ?? JSONP_TIMEOUT_MS}ms`, -2, 'TimeoutError'));
    }, opts?.timeoutMs ?? JSONP_TIMEOUT_MS);

    host[name] = (payload: unknown): void => {
      cleanup();
      const err = errorOf(payload);
      if (err) reject(err);
      else resolve(payload as T);
    };

    script.onerror = () => {
      cleanup();
      reject(new DeezerError(`Deezer script load failed: ${url}`, -3, 'NetworkError'));
    };

    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}output=jsonp&callback=${name}`;
    script.async = true;
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------ rate limiter */

/** Deezer allows 50 req / 5 s per IP — stay just under it. */
const RATE_LIMIT = 45;
const RATE_WINDOW_MS = 5_000;
const MAX_IN_FLIGHT = 6;

let stamps: number[] = [];
let inFlight = 0;
const queue: Array<() => void> = [];
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePump(delay: number): void {
  if (pumpTimer !== null) return;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    pump();
  }, delay);
}

function pump(): void {
  while (queue.length > 0) {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (inFlight >= MAX_IN_FLIGHT) return; // released tasks re-pump
    if (stamps.length >= RATE_LIMIT) {
      const oldest = stamps[0] ?? now;
      schedulePump(Math.max(25, RATE_WINDOW_MS - (now - oldest)));
      return;
    }
    const run = queue.shift();
    if (!run) return;
    stamps.push(now);
    inFlight += 1;
    run();
  }
}

/** FIFO-queue a request behind the token bucket. Exported for other Deezer-backed modules. */
export function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => {
        inFlight -= 1;
        schedulePump(0);
      });
    });
    pump();
  });
}

/* ------------------------------------------------------------------- cache */

const CACHE_PREFIX = 'sg:dz:';
/**
 * How long a cached list response is reused. Track metadata (title/artist/rank/cover) is
 * stable for far longer than this; the `preview` urls inside it are not — see
 * `PREVIEW_TTL_SEC`. CLAUDE.md caps persisted preview urls at 6 h.
 */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_BYTES = 3 * 1024 * 1024;

interface CacheEntry<T> {
  /** written-at epoch ms */
  t: number;
  v: T;
}

const memory = new Map<string, CacheEntry<unknown>>();

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
}

function cacheGet<T>(key: string, ttlMs: number, persist: boolean): T | null {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  if (hit) memory.delete(key);
  if (!persist) return null;

  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_PREFIX + key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.t !== 'number') {
      store.removeItem(CACHE_PREFIX + key);
      return null;
    }
    const entry = parsed as unknown as CacheEntry<T>;
    if (Date.now() - entry.t >= ttlMs) {
      store.removeItem(CACHE_PREFIX + key);
      return null;
    }
    memory.set(key, entry);
    return entry.v;
  } catch {
    return null;
  }
}

/** Drop the oldest persisted entries until the prefix fits under `budget` bytes. */
function evictTo(budget: number): void {
  const store = storage();
  if (!store) return;
  try {
    const rows: Array<{ key: string; t: number; bytes: number }> = [];
    let total = 0;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key === null || !key.startsWith(CACHE_PREFIX)) continue;
      const raw = store.getItem(key) ?? '';
      const bytes = key.length + raw.length;
      total += bytes;
      let t = 0;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && typeof parsed.t === 'number') t = parsed.t;
      } catch {
        t = 0; // unparseable → evict first
      }
      rows.push({ key, t, bytes });
    }
    if (total <= budget) return;
    rows.sort((a, b) => a.t - b.t);
    for (const row of rows) {
      if (total <= budget) break;
      store.removeItem(row.key);
      memory.delete(row.key.slice(CACHE_PREFIX.length));
      total -= row.bytes;
    }
  } catch {
    /* storage unavailable — memory cache still works */
  }
}

function cacheSet<T>(key: string, value: T, persist: boolean): void {
  memory.set(key, { t: Date.now(), v: value });
  if (!persist) return;
  const store = storage();
  if (!store) return;
  const payload = JSON.stringify({ t: Date.now(), v: value });
  try {
    store.setItem(CACHE_PREFIX + key, payload);
  } catch {
    // Quota exceeded (or storage disabled) — make room once, then give up quietly.
    evictTo(MAX_CACHE_BYTES / 2);
    try {
      store.setItem(CACHE_PREFIX + key, payload);
    } catch {
      /* never throw on cache writes */
    }
  }
  if (payload.length > 4096) evictTo(MAX_CACHE_BYTES);
}

/** Remove every cached Deezer response (memory + localStorage). */
export function clearCache(): void {
  memory.clear();
  const store = storage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith(CACHE_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Rate-limited + cached GET. */
async function get<T>(path: string, cacheKey: string | null, ttlMs = CACHE_TTL_MS, persist = true): Promise<T> {
  if (cacheKey !== null) {
    const hit = cacheGet<T>(cacheKey, ttlMs, persist);
    if (hit !== null) return hit;
  }
  const value = await schedule(() => jsonp<T>(`${API}${path}`));
  if (cacheKey !== null) cacheSet(cacheKey, value, persist);
  return value;
}

/* ----------------------------------------------------------------- mapping */

function coverFromMd5(md5: string | undefined, size: number): string {
  return md5 ? `https://cdn-images.dzcdn.net/images/cover/${md5}/${size}x${size}-000000-80-0-0.jpg` : '';
}

function yearOf(releaseDate: string | undefined): number | undefined {
  if (!releaseDate) return undefined;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1900 ? year : undefined;
}

/**
 * Map a raw Deezer track to `Track`. Returns null for entries that are unplayable
 * (`readable === false` or no preview url).
 *
 * `fallback` fills in artist/album for endpoints that omit them — `/album/{id}/tracks`
 * returns no `album` object, for instance.
 */
export function mapTrack(
  raw: DzTrack,
  fallback?: { artist?: DzArtistRef; album?: DzAlbumRef },
): Track | null {
  if (raw.readable === false) return null;
  const preview = typeof raw.preview === 'string' ? raw.preview : '';
  if (preview.length === 0) return null;

  const artist = raw.artist ?? fallback?.artist;
  const album = raw.album ?? fallback?.album;
  const md5 = album?.md5_image ?? raw.md5_image;
  const title = raw.title_short ?? raw.title ?? '';
  const releaseYear = yearOf(raw.release_date);
  const bpm = typeof raw.bpm === 'number' && raw.bpm > 0 ? raw.bpm : undefined;

  return {
    id: raw.id,
    title,
    titleFull: raw.title ?? title,
    artist: artist?.name ?? '',
    artistId: artist?.id ?? 0,
    album: album?.title ?? '',
    albumId: album?.id ?? 0,
    cover: album?.cover_medium ?? coverFromMd5(md5, 250),
    coverBig: album?.cover_big ?? album?.cover_xl ?? coverFromMd5(md5, 500),
    preview,
    previewFetchedAt: Date.now(),
    duration: raw.duration ?? 0,
    rank: raw.rank ?? 0,
    explicit: raw.explicit_lyrics === true,
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(bpm !== undefined ? { bpm } : {}),
  };
}

function mapTracks(rows: DzTrack[] | undefined, fallback?: { artist?: DzArtistRef; album?: DzAlbumRef }): Track[] {
  const out: Track[] = [];
  for (const raw of rows ?? []) {
    const track = mapTrack(raw, fallback);
    if (track) out.push(track);
  }
  return out;
}

/* ------------------------------------------------------- preview freshness */

/**
 * Measured 2026-09-26: Deezer signs preview urls for only ~15 minutes (not the ~24 h the
 * docs suggest). Track *metadata* stays valid far longer, which is why list responses are
 * still cached for 6 h — but anything about to be played must go through
 * `isPreviewFresh()` and, if stale, `refreshPreview()` / `refreshPreviews()`.
 */
export const PREVIEW_TTL_SEC = 900;

/** Deezer preview urls carry `hdnea=exp=<unix seconds>`. */
export function previewExpiry(previewUrl: string): number | null {
  const direct = /hdnea=exp=(\d+)/.exec(previewUrl);
  if (direct?.[1]) return Number.parseInt(direct[1], 10);
  const loose = /[?&~]exp=(\d+)/.exec(previewUrl);
  if (loose?.[1]) return Number.parseInt(loose[1], 10);
  return null;
}

/** True while the preview url is still usable (with `marginSec` of slack). */
export function isPreviewFresh(track: Track, marginSec = 300): boolean {
  if (!track.preview) return false;
  const exp = previewExpiry(track.preview);
  if (exp !== null) return exp - marginSec > Date.now() / 1000;
  // No expiry in the url — fall back to how long ago we fetched it, assuming the usual signed
  // lifetime (PREVIEW_TTL_SEC) minus the same safety margin. Never the 6 h list-cache TTL.
  return Date.now() - track.previewFetchedAt < (PREVIEW_TTL_SEC - marginSec) * 1000;
}

/* --------------------------------------------------------- public endpoints */

export async function getPlaylist(id: number): Promise<PlaylistSummary> {
  const raw = await get<DzPlaylist>(`/playlist/${id}`, `playlist:${id}`);
  return {
    id: raw.id ?? id,
    title: raw.title ?? '',
    picture: raw.picture_medium ?? raw.picture_big ?? '',
    trackCount: raw.nb_tracks ?? raw.tracks?.data?.length ?? 0,
    author: raw.creator?.name ?? raw.user?.name ?? '',
  };
}

/** Paginated playlist tracks, 100 per page. */
export async function getPlaylistTracks(id: number, max = 300): Promise<Track[]> {
  const key = `pltracks:${id}:${max}`;
  const cached = cacheGet<Track[]>(key, CACHE_TTL_MS, true);
  if (cached !== null) return cached;

  const out: Track[] = [];
  for (let index = 0; index < max; index += 100) {
    const limit = Math.min(100, max - index);
    const page = await get<DzList<DzTrack>>(
      `/playlist/${id}/tracks?index=${index}&limit=${limit}`,
      null,
    );
    const rows = page.data ?? [];
    out.push(...mapTracks(rows));
    if (rows.length < limit || !page.next) break;
  }
  cacheSet(key, out, true);
  return out;
}

export async function getChartTracks(genreId: number, limit = 100): Promise<Track[]> {
  const key = `chart:${genreId}:${limit}`;
  const cached = cacheGet<Track[]>(key, CACHE_TTL_MS, true);
  if (cached !== null) return cached;
  const page = await get<DzList<DzTrack>>(`/chart/${genreId}/tracks?limit=${limit}`, null);
  const tracks = mapTracks(page.data);
  cacheSet(key, tracks, true);
  return tracks;
}

export async function getArtistTop(id: number, limit = 100): Promise<Track[]> {
  const key = `artisttop:${id}:${limit}`;
  const cached = cacheGet<Track[]>(key, CACHE_TTL_MS, true);
  if (cached !== null) return cached;
  const page = await get<DzList<DzTrack>>(`/artist/${id}/top?limit=${limit}`, null);
  const tracks = mapTracks(page.data);
  cacheSet(key, tracks, true);
  return tracks;
}

export async function getAlbumTracks(id: number): Promise<Track[]> {
  const key = `albumtracks:${id}`;
  const cached = cacheGet<Track[]>(key, CACHE_TTL_MS, true);
  if (cached !== null) return cached;

  // /album/{id} carries album metadata *and* the tracklist; album track rows omit `album`.
  const album = await get<DzAlbum>(`/album/${id}`, null);
  const fallback = {
    artist: album.artist,
    album: {
      id: album.id ?? id,
      title: album.title,
      cover_medium: album.cover_medium,
      cover_big: album.cover_big,
      cover_xl: album.cover_xl,
      md5_image: album.md5_image,
    },
  };
  let rows = album.tracks?.data;
  if (!rows || rows.length === 0) {
    const page = await get<DzList<DzTrack>>(`/album/${id}/tracks?limit=300`, null);
    rows = page.data;
  }
  const tracks = mapTracks(rows, fallback);
  cacheSet(key, tracks, true);
  return tracks;
}

/** Track search. Cached in memory only (10 min) — search results churn. */
export async function searchTracks(q: string, limit = 25): Promise<Track[]> {
  const query = q.trim();
  if (query.length === 0) return [];
  const key = `search:${query.toLowerCase()}:${limit}`;
  const cached = cacheGet<Track[]>(key, SEARCH_TTL_MS, false);
  if (cached !== null) return cached;
  const page = await get<DzList<DzTrack>>(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    null,
  );
  const tracks = mapTracks(page.data);
  cacheSet(key, tracks, false);
  return tracks;
}

export async function searchArtists(q: string, limit = 10): Promise<ArtistSummary[]> {
  const query = q.trim();
  if (query.length === 0) return [];
  const key = `searchartist:${query.toLowerCase()}:${limit}`;
  const cached = cacheGet<ArtistSummary[]>(key, SEARCH_TTL_MS, false);
  if (cached !== null) return cached;
  const page = await get<DzList<DzArtistRef>>(
    `/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`,
    null,
  );
  const out: ArtistSummary[] = (page.data ?? [])
    .filter((a): a is DzArtistRef & { id: number } => typeof a.id === 'number')
    .map((a) => ({
      id: a.id,
      name: a.name ?? '',
      picture: a.picture_medium ?? a.picture_big ?? '',
      fans: a.nb_fan ?? 0,
    }));
  cacheSet(key, out, false);
  return out;
}

export async function searchPlaylists(q: string, limit = 10): Promise<PlaylistSummary[]> {
  const query = q.trim();
  if (query.length === 0) return [];
  const key = `searchplaylist:${query.toLowerCase()}:${limit}`;
  const cached = cacheGet<PlaylistSummary[]>(key, SEARCH_TTL_MS, false);
  if (cached !== null) return cached;
  const page = await get<DzList<DzPlaylist>>(
    `/search/playlist?q=${encodeURIComponent(query)}&limit=${limit}`,
    null,
  );
  const out: PlaylistSummary[] = (page.data ?? [])
    .filter((p): p is DzPlaylist & { id: number } => typeof p.id === 'number')
    .map((p) => ({
      id: p.id,
      title: p.title ?? '',
      picture: p.picture_medium ?? p.picture_big ?? '',
      trackCount: p.nb_tracks ?? 0,
      author: p.creator?.name ?? p.user?.name ?? '',
    }));
  cacheSet(key, out, false);
  return out;
}

/**
 * Track detail lookup — the only endpoint that returns `release_date` and `bpm`,
 * and always a freshly signed preview url.
 */
export async function getTrack(id: number, opts?: { fresh?: boolean }): Promise<Track> {
  const key = `track:${id}`;
  if (opts?.fresh !== true) {
    const cached = cacheGet<Track>(key, SEARCH_TTL_MS, false);
    if (cached !== null && isPreviewFresh(cached)) return cached;
  }
  const raw = await get<DzTrack>(`/track/${id}`, null);
  const track = mapTrack(raw);
  if (!track) throw new DeezerError(`Track ${id} has no playable preview`, 800, 'DataException');
  cacheSet(key, track, false);
  return track;
}

/** Re-sign an expired preview url, keeping catalog metadata (`packId`, hint fields). */
export async function refreshPreview(track: Track): Promise<Track> {
  const fresh = await getTrack(track.id, { fresh: true });
  return {
    ...track,
    preview: fresh.preview,
    previewFetchedAt: fresh.previewFetchedAt,
    ...(fresh.releaseYear !== undefined ? { releaseYear: fresh.releaseYear } : {}),
    ...(fresh.bpm !== undefined ? { bpm: fresh.bpm } : {}),
  };
}

/**
 * Re-sign a batch of previews, skipping the ones that are still fresh. Use this on the
 * handful of tracks about to be played (never on a whole 200-track pool) — each stale
 * track costs one request. A track that fails to refresh is returned unchanged so the
 * caller can decide whether to skip it.
 */
export async function refreshPreviews(tracks: Track[], marginSec = 300): Promise<Track[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (isPreviewFresh(track, marginSec)) return track;
      try {
        return await refreshPreview(track);
      } catch {
        return track;
      }
    }),
  );
}

/** Grouped surface — import this when you want to mock the whole client in a test. */
export const deezer = {
  jsonp,
  schedule,
  clearCache,
  mapTrack,
  previewExpiry,
  isPreviewFresh,
  getPlaylist,
  getPlaylistTracks,
  getChartTracks,
  getArtistTop,
  getAlbumTracks,
  searchTracks,
  searchArtists,
  searchPlaylists,
  getTrack,
  refreshPreview,
  refreshPreviews,
};

export type Deezer = typeof deezer;
