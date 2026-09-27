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
  /**
   * Present ONLY on the album object nested in a `/track/{id}` payload, and — measured — the
   * ORIGINAL album date there, where `/album/{id}` returns the digital re-delivery date. See
   * {@link originalReleaseYear}.
   */
  release_date?: string;
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
  /** `CCXXXYYNNNNN` — the `YY` pair is the recording's registration year. */
  isrc?: string;
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
  return plausibleYear(year);
}

/** A year that could be a record's: after the first commercial discs, never in the future. */
function plausibleYear(year: number): number | undefined {
  if (!Number.isFinite(year) || year <= 1900) return undefined;
  return year <= new Date().getFullYear() + 1 ? year : undefined;
}

/**
 * The registration year encoded in an ISRC: `GB-A07-77-00130` → 1977.
 *
 * `CC XXX YY NNNNN` — country, registrant, two-digit year of reference, designation. Labels backdate
 * the year to the original recording when they register a legacy master, which is what makes this the
 * strongest single signal for old catalogue; a master re-registered for a reissue carries the later
 * year instead. Two digits are disambiguated against the current year, so `77` is 1977 and `05` is
 * 2005; a recording backdated past the turn of the century would therefore read a hundred years late,
 * and {@link originalReleaseYear} — which takes the EARLIEST candidate — would fall back to one of the
 * other two rather than print it.
 */
export function isrcYear(isrc: string | undefined): number | undefined {
  if (typeof isrc !== 'string') return undefined;
  const clean = isrc.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(clean)) return undefined;
  const yy = Number.parseInt(clean.slice(5, 7), 10);
  if (!Number.isFinite(yy)) return undefined;
  const century = yy <= new Date().getFullYear() % 100 ? 2000 : 1900;
  return plausibleYear(century + yy);
}

/**
 * The year the song came out — as close as Deezer's data can get.
 *
 * WHY THIS IS NOT `track.release_date`: that field is the date the file was DELIVERED to Deezer, not
 * the date the record came out. Bee Gees "Stayin' Alive" reports `2017-09-14`. Across 180 tracks
 * pulled from this app's own decade packs (The 60s … The 2010s, where the pack name is the ground
 * truth) `release_date` landed in the right decade 53% of the time, and 84 of those tracks were
 * reported LATER than the decade they belong to.
 *
 * Deezer exposes exactly three date-ish signals, and all three arrive in the single `/track/{id}`
 * response we already fetch, so this costs no extra request:
 *
 *   - `release_date`            the delivery date — 53% in-decade
 *   - `album.release_date`      nested in the TRACK payload, this is the original album date (the
 *                               standalone `/album/{id}` returns the re-delivery date instead:
 *                               verified on album 48140842, nested `1977-12-13` vs endpoint
 *                               `2017-09-14`) — 53% in-decade on its own
 *   - `isrc`                    the recording's registration year — 64% in-decade
 *
 * Every one of them is a delivery or registration date, so each is an UPPER BOUND on the real
 * release: they can be too late and essentially never too early. Taking the EARLIEST therefore lands
 * closest — 77% in-decade over the same 180 tracks (60s 47%, 70s 70%, 80s 67%, 90s 87%, 2000s 90%,
 * 2010s 100%), and 2 of 180 too early, both of them tracks the playlist itself files under the wrong
 * decade. On a separate hand-checked set of 26 famous songs the exact year goes from 6/26 to 18/26.
 *
 * Rejected alternatives:
 *   - the standalone `/album/{id}` date: it is the re-delivery date, strictly worse than the nested
 *     one, and costs a second request.
 *   - the earliest release among the artist's versions of the track: Deezer's `artist:"…" track:"…"`
 *     advanced-search filter returns 0 results, so the version list has to come from a fuzzy
 *     text search full of covers, karaoke and tribute acts. Measured, it costs up to 9 requests per
 *     hint and is not reliably better — it dates "Hotel California" to a 1980 LIVE album and "Purple
 *     Rain" to a 1993 festival recording, and it gives up the never-too-early property.
 *
 * What it still cannot do: pre-1990 catalogue that was re-delivered wholesale with fresh ISRCs has no
 * surviving original date at all, so roughly half of 1960s tracks still read late. There is no
 * confidence signal that separates those from genuinely new records — for a 60s track the delivery
 * date and the ISRC year agree with each other (and are both wrong) 5 times out of 5.
 */
export function originalReleaseYear(raw: Pick<DzTrack, 'release_date' | 'album' | 'isrc'>): number | undefined {
  const candidates = [yearOf(raw.release_date), yearOf(raw.album?.release_date), isrcYear(raw.isrc)].filter(
    (y): y is number => y !== undefined,
  );
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

/**
 * Map a raw Deezer track to `Track`. Returns null for entries that are unplayable
 * (`readable === false` or no preview url).
 *
 * `fallback` fills in artist/album for endpoints that omit them — `/album/{id}/tracks`
 * returns no `album` object, for instance.
 *
 * `releaseYear` is set only when the payload carries `release_date`, which is to say only from
 * `/track/{id}`. The list endpoints do carry an `isrc`, so a year COULD be squeezed out of them — but
 * `hasTrackDetail()` reads "we have a release year" as "the `/track/{id}` lookup has already run", so
 * filling it from a playlist page would skip that lookup and lose both the bpm and the two better
 * year signals that only the detail payload has.
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
  const releaseYear = raw.release_date === undefined ? undefined : originalReleaseYear(raw);
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
 * Track detail lookup — the only endpoint that returns `release_date`, the nested album date and
 * `bpm`, and always a freshly signed preview url. It is therefore also the only call that can derive
 * a release year; see {@link originalReleaseYear}.
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
