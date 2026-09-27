import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeezerError,
  LATE_CALLBACK_GRACE_MS,
  clearCache,
  getAlbumTracks,
  getArtistTop,
  getChartTracks,
  getPlaylist,
  getPlaylistTracks,
  getTrack,
  isPreviewFresh,
  isrcYear,
  jsonp,
  mapTrack,
  originalReleaseYear,
  previewExpiry,
  refreshPreview,
  refreshPreviews,
  searchArtists,
  searchPlaylists,
  searchTracks,
} from '@/lib/deezer';
import type { Track } from '@/types/catalog';

/* ------------------------------------------------------------- jsonp server */

type Route = (url: URL) => unknown;

let routes: Route = () => ({ data: [] });
let requested: string[] = [];
/** Paths that should make the <script> tag fire onerror instead of calling back. */
let networkErrors = new Set<string>();
/** Paths that should never call the callback at all (to exercise the timeout path). */
let blackHoles = new Set<string>();

function installJsonpServer(): void {
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreateElement(tag);
    if (tag !== 'script') return el;
    let src = '';
    Object.defineProperty(el, 'src', {
      configurable: true,
      get: () => src,
      set(next: string) {
        src = next;
        const url = new URL(next);
        requested.push(`${url.pathname}${url.search.replace(/[?&](output|callback)=[^&]*/g, '')}`);
        const callbackName = url.searchParams.get('callback');
        queueMicrotask(() => {
          if (blackHoles.has(url.pathname)) return;
          if (networkErrors.has(url.pathname)) {
            const onerror = (el as HTMLScriptElement).onerror;
            if (typeof onerror === 'function') onerror.call(el, new Event('error'));
            return;
          }
          if (callbackName === null) return;
          const host = globalThis as unknown as Record<string, unknown>;
          const fn = host[callbackName];
          if (typeof fn === 'function') (fn as (payload: unknown) => void)(routes(url));
        });
      },
    });
    return el;
  }) as typeof document.createElement);
}

/* ---------------------------------------------------------------- fixtures */

const EXP = Math.floor(Date.now() / 1000) + 86_400;
const previewUrl = (hash: string, exp = EXP): string =>
  `https://cdnt-preview.dzcdn.net/api/1/1/0/4/9/0/${hash}.mp3?hdnea=exp=${exp}~acl=/api/1/1/0/4/9/0/${hash}.mp3*~data=user_id=0,application_id=42~hmac=abc123`;

/** Shape copied verbatim from a real /artist/12246/top response. */
const RAW_TRACK = {
  id: 3579685431,
  readable: true,
  title: 'The Fate of Ophelia (Remix)',
  title_short: 'The Fate of Ophelia',
  title_version: '(Remix)',
  link: 'https://www.deezer.com/track/3579685431',
  duration: 226,
  rank: 999852,
  explicit_lyrics: false,
  explicit_content_lyrics: 0,
  preview: previewUrl('049e295c37bff556879080a0ec19adb3'),
  md5_image: 'd0bed55a0efb3c5c3ddb3dacda67d9b3',
  artist: { id: 12246, name: 'Taylor Swift', tracklist: 'https://api.deezer.com/artist/12246/top?limit=50' },
  album: {
    id: 829966251,
    title: 'The Life of a Showgirl',
    cover_medium: 'https://cdn-images.dzcdn.net/images/cover/d0bed55a/250x250-000000-80-0-0.jpg',
    cover_big: 'https://cdn-images.dzcdn.net/images/cover/d0bed55a/500x500-000000-80-0-0.jpg',
    cover_xl: 'https://cdn-images.dzcdn.net/images/cover/d0bed55a/1000x1000-000000-80-0-0.jpg',
    md5_image: 'd0bed55a0efb3c5c3ddb3dacda67d9b3',
  },
  type: 'track',
};

function rawTrack(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...RAW_TRACK, id, preview: previewUrl(`hash${id}`), ...over };
}

beforeEach(() => {
  requested = [];
  networkErrors = new Set();
  blackHoles = new Set();
  routes = () => ({ data: [] });
  clearCache();
  localStorage.clear();
  installJsonpServer();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* -------------------------------------------------------------------- jsonp */

describe('jsonp', () => {
  it('appends output=jsonp and a unique callback, then resolves with the payload', async () => {
    routes = () => ({ hello: 'world' });
    const srcs: string[] = [];
    const spy = vi.spyOn(document.head, 'appendChild');

    const [a, b] = await Promise.all([
      jsonp<{ hello: string }>('https://api.deezer.com/one'),
      jsonp<{ hello: string }>('https://api.deezer.com/two?limit=5'),
    ]);

    for (const call of spy.mock.calls) {
      const node = call[0] as HTMLScriptElement;
      if (node.tagName === 'SCRIPT') srcs.push(node.src);
    }
    expect(a.hello).toBe('world');
    expect(b.hello).toBe('world');
    expect(srcs[0]).toMatch(/\/one\?output=jsonp&callback=__sgdz_\d+$/);
    expect(srcs[1]).toMatch(/\/two\?limit=5&output=jsonp&callback=__sgdz_\d+$/);
    // Unique callback names.
    expect(new Set(srcs.map((s) => new URL(s).searchParams.get('callback'))).size).toBe(2);
  });

  it('cleans up the script tag and the global callback afterwards', async () => {
    routes = () => ({ ok: true });
    const before = Object.keys(globalThis).filter((k) => k.startsWith('__sgdz_')).length;
    await jsonp('https://api.deezer.com/clean');
    expect(Object.keys(globalThis).filter((k) => k.startsWith('__sgdz_')).length).toBe(before);
    expect(document.head.querySelectorAll('script').length).toBe(0);
  });

  it('rejects {error} payloads as a typed DeezerError', async () => {
    routes = () => ({ error: { type: 'DataException', message: 'no data', code: 800 } });
    await expect(jsonp('https://api.deezer.com/playlist/1')).rejects.toBeInstanceOf(DeezerError);
    await expect(jsonp('https://api.deezer.com/playlist/1')).rejects.toMatchObject({
      message: 'no data',
      code: 800,
      kind: 'DataException',
    });
  });

  it('rejects when the script fails to load, and still cleans up', async () => {
    networkErrors.add('/boom');
    await expect(jsonp('https://api.deezer.com/boom')).rejects.toMatchObject({ kind: 'NetworkError' });
    expect(document.head.querySelectorAll('script').length).toBe(0);
  });

  it('times out, removes the script, and leaves a no-op stub so a late response never throws (P3-4)', async () => {
    blackHoles.add('/silent');
    vi.useFakeTimers();
    const host = globalThis as unknown as Record<string, unknown>;
    const stubs = () => Object.keys(host).filter((k) => k.startsWith('__sgdz_'));
    const pending = jsonp('https://api.deezer.com/silent', { timeoutMs: 20 });
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'TimeoutError', code: -2 });
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    expect(document.head.querySelectorAll('script').length).toBe(0);
    // the callback global survives as a no-op for a grace period…
    expect(stubs()).toHaveLength(1);
    const late = host[stubs()[0]!];
    expect(typeof late).toBe('function');
    expect(() => (late as (payload: unknown) => void)({ data: [] })).not.toThrow();
    // …then goes away
    await vi.advanceTimersByTimeAsync(LATE_CALLBACK_GRACE_MS);
    expect(stubs()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ mapping */

describe('isrcYear', () => {
  it('reads the two-digit year of reference out of a well-formed ISRC', () => {
    expect(isrcYear('GBA077700130')).toBe(1977); // Bee Gees, verified live
    expect(isrcYear('USRH10721057')).toBe(2007);
    expect(isrcYear('USUG11700215')).toBe(2017);
  });

  it('accepts the hyphenated and lower-case spellings', () => {
    expect(isrcYear('gb-a07-77-00130')).toBe(1977);
  });

  it('refuses anything that is not an ISRC', () => {
    expect(isrcYear(undefined)).toBeUndefined();
    expect(isrcYear('')).toBeUndefined();
    expect(isrcYear('NOT-AN-ISRC')).toBeUndefined();
    expect(isrcYear('GBA07770013')).toBeUndefined(); // one digit short
  });
});

describe('originalReleaseYear', () => {
  it('is the earliest of the three signals, because each one is an upper bound', () => {
    expect(originalReleaseYear({ release_date: '2017-09-14', album: { release_date: '1977-12-13' }, isrc: 'GBA077700130' })).toBe(1977);
    expect(originalReleaseYear({ release_date: '1975-11-21', album: { release_date: '2005-01-01' }, isrc: 'GBUM71029604' })).toBe(1975);
  });

  it('is undefined when no signal survives, and never a year in the future', () => {
    expect(originalReleaseYear({})).toBeUndefined();
    expect(originalReleaseYear({ release_date: '0000-00-00' })).toBeUndefined();
    expect(originalReleaseYear({ release_date: `${new Date().getFullYear() + 5}-01-01` })).toBeUndefined();
  });
});

describe('mapTrack', () => {
  it('maps a real Deezer track payload onto Track', () => {
    const track = mapTrack(RAW_TRACK);
    expect(track).not.toBeNull();
    expect(track).toMatchObject({
      id: 3579685431,
      title: 'The Fate of Ophelia',
      titleFull: 'The Fate of Ophelia (Remix)',
      artist: 'Taylor Swift',
      artistId: 12246,
      album: 'The Life of a Showgirl',
      albumId: 829966251,
      cover: 'https://cdn-images.dzcdn.net/images/cover/d0bed55a/250x250-000000-80-0-0.jpg',
      coverBig: 'https://cdn-images.dzcdn.net/images/cover/d0bed55a/500x500-000000-80-0-0.jpg',
      duration: 226,
      rank: 999852,
      explicit: false,
    });
    expect(track?.preview).toContain('hdnea=exp=');
    expect(track?.previewFetchedAt).toBeGreaterThan(0);
    expect(track?.releaseYear).toBeUndefined();
    expect(track?.bpm).toBeUndefined();
  });

  it('falls back to md5_image for covers when the album has no cover urls', () => {
    const track = mapTrack({
      ...RAW_TRACK,
      album: { id: 1, title: 'X', md5_image: 'abc123' },
    });
    expect(track?.cover).toBe('https://cdn-images.dzcdn.net/images/cover/abc123/250x250-000000-80-0-0.jpg');
    expect(track?.coverBig).toBe('https://cdn-images.dzcdn.net/images/cover/abc123/500x500-000000-80-0-0.jpg');
  });

  it('drops unreadable tracks and tracks with no preview', () => {
    expect(mapTrack({ ...RAW_TRACK, readable: false })).toBeNull();
    expect(mapTrack({ ...RAW_TRACK, preview: '' })).toBeNull();
    expect(mapTrack({ ...RAW_TRACK, preview: undefined })).toBeNull();
  });

  it('reads releaseYear from release_date and ignores bpm 0', () => {
    expect(mapTrack({ ...RAW_TRACK, release_date: '2025-10-03', bpm: 0 })?.releaseYear).toBe(2025);
    expect(mapTrack({ ...RAW_TRACK, release_date: '2025-10-03', bpm: 0 })?.bpm).toBeUndefined();
    expect(mapTrack({ ...RAW_TRACK, bpm: 128 })?.bpm).toBe(128);
    expect(mapTrack({ ...RAW_TRACK, release_date: '0000-00-00' })?.releaseYear).toBeUndefined();
  });

  it('takes the ORIGINAL year, not the re-delivery date Deezer reports', () => {
    // Live Bee Gees "Stayin' Alive" (track 406815322): delivered 2017, original album 1977,
    // ISRC registered 1977. The hint used to read "Released in 2017".
    const staying = mapTrack({
      ...RAW_TRACK,
      release_date: '2017-09-14',
      isrc: 'GBA077700130',
      album: { ...RAW_TRACK.album, release_date: '1977-12-13' },
    });
    expect(staying?.releaseYear).toBe(1977);
  });

  it('uses whichever signal is earliest when only one of them predates the delivery', () => {
    // "Dancing Queen": delivered 2008, filed under a 2005 compilation, ISRC says 1976.
    expect(
      mapTrack({
        ...RAW_TRACK,
        release_date: '2008-01-01',
        isrc: 'SEABC7600101',
        album: { ...RAW_TRACK.album, release_date: '2005-03-01' },
      })?.releaseYear,
    ).toBe(1976);
    // "Sweet Child O' Mine": no usable ISRC, but the nested album date is the real one.
    expect(
      mapTrack({
        ...RAW_TRACK,
        release_date: '2018-06-29',
        album: { ...RAW_TRACK.album, release_date: '1987-07-21' },
      })?.releaseYear,
    ).toBe(1987);
  });

  it('leaves the year alone for the list endpoints, which carry an isrc but no release_date', () => {
    // A playlist page has an isrc; filling releaseYear from it would make hasTrackDetail() true and
    // skip the /track/{id} lookup that has the bpm and the two better year signals.
    expect(mapTrack({ ...RAW_TRACK, isrc: 'GBA077700130' })?.releaseYear).toBeUndefined();
  });

  it('uses fallback artist/album for endpoints that omit them (album tracks)', () => {
    const bare = { id: 9, title: 'Track', title_short: 'Track', duration: 100, preview: previewUrl('z'), rank: 5 };
    const track = mapTrack(bare, {
      artist: { id: 42, name: 'Fallback Artist' },
      album: { id: 7, title: 'Fallback Album', md5_image: 'mmm' },
    });
    expect(track).toMatchObject({ artist: 'Fallback Artist', artistId: 42, album: 'Fallback Album', albumId: 7 });
    expect(track?.cover).toContain('mmm');
  });
});

/* -------------------------------------------------------- preview freshness */

describe('preview freshness', () => {
  const base: Track = {
    id: 1, title: 't', titleFull: 't', artist: 'a', artistId: 1, album: 'al', albumId: 1,
    cover: '', coverBig: '', preview: '', previewFetchedAt: Date.now(), duration: 100, rank: 1, explicit: false,
  };

  it('parses the exp= timestamp out of an hdnea preview url', () => {
    expect(previewExpiry(previewUrl('x', 1790407155))).toBe(1790407155);
    expect(previewExpiry('https://cdn.example.com/a.mp3')).toBeNull();
  });

  it('is fresh well before expiry and stale inside the safety margin', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isPreviewFresh({ ...base, preview: previewUrl('x', now + 3600) })).toBe(true);
    // Expires in 60s, default margin is 300s → treated as stale.
    expect(isPreviewFresh({ ...base, preview: previewUrl('x', now + 60) })).toBe(false);
    // ...but acceptable with a smaller margin.
    expect(isPreviewFresh({ ...base, preview: previewUrl('x', now + 60) }, 10)).toBe(true);
    expect(isPreviewFresh({ ...base, preview: previewUrl('x', now - 10) })).toBe(false);
  });

  it('falls back to previewFetchedAt when the url has no exp, for the preview lifetime minus the margin (P3-3)', () => {
    const noExp = 'https://cdnt-preview.dzcdn.net/api/1/1/x.mp3';
    const min = 60_000;
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() })).toBe(true);
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() - 5 * min })).toBe(true);
    // 11 min old: previews live ~15 min and the default margin is 5 min → stale
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() - 11 * min })).toBe(false);
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() - 11 * min }, 10)).toBe(true);
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() - 16 * min }, 0)).toBe(false);
    expect(isPreviewFresh({ ...base, preview: noExp, previewFetchedAt: Date.now() - 7 * 3600_000 })).toBe(false);
  });

  it('is never fresh without a preview url', () => {
    expect(isPreviewFresh({ ...base, preview: '' })).toBe(false);
  });
});

/* ---------------------------------------------------------------- endpoints */

describe('endpoints', () => {
  it('paginates playlist tracks 100 at a time and stops at max', async () => {
    routes = (url) => {
      const index = Number(url.searchParams.get('index') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '100');
      const data = Array.from({ length: limit }, (_, i) => rawTrack(index + i + 1));
      return { data, total: 500, next: 'https://api.deezer.com/next' };
    };
    const tracks = await getPlaylistTracks(123, 250);
    expect(tracks).toHaveLength(250);
    expect(requested).toEqual([
      '/playlist/123/tracks?index=0&limit=100',
      '/playlist/123/tracks?index=100&limit=100',
      '/playlist/123/tracks?index=200&limit=50',
    ]);
  });

  it('stops paginating early when a short page comes back', async () => {
    routes = () => ({ data: [rawTrack(1), rawTrack(2)], total: 2 });
    expect(await getPlaylistTracks(5, 300)).toHaveLength(2);
    expect(requested).toHaveLength(1);
  });

  it('serves the second identical call from cache', async () => {
    routes = () => ({ data: [rawTrack(1)], total: 1 });
    await getChartTracks(132);
    const afterFirst = requested.length;
    await getChartTracks(132);
    expect(requested.length).toBe(afterFirst);
    expect(localStorage.getItem('sg:dz:chart:132:100')).not.toBeNull();
  });

  it('caches track lists in localStorage but keeps searches in memory only', async () => {
    routes = () => ({ data: [rawTrack(1)] });
    await getArtistTop(12246);
    await searchTracks('taylor swift');
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('sg:dz:'));
    expect(keys.some((k) => k.includes('artisttop'))).toBe(true);
    expect(keys.some((k) => k.includes('search'))).toBe(false);
  });

  it('never throws when localStorage rejects a write', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    routes = () => ({ data: [rawTrack(1)] });
    await expect(getChartTracks(116)).resolves.toHaveLength(1);
  });

  it('maps playlist metadata onto PlaylistSummary', async () => {
    routes = () => ({
      id: 1363560485, title: 'Deezer Hits', nb_tracks: 50,
      picture_medium: 'https://cdn/p.jpg', creator: { name: 'Alexandre - Pop & Hits Editor' },
    });
    expect(await getPlaylist(1363560485)).toEqual({
      id: 1363560485, title: 'Deezer Hits', picture: 'https://cdn/p.jpg',
      trackCount: 50, author: 'Alexandre - Pop & Hits Editor',
    });
  });

  it('maps artist and playlist search results', async () => {
    routes = (url) =>
      url.pathname.includes('artist')
        ? { data: [{ id: 12246, name: 'Taylor Swift', picture_medium: 'https://cdn/a.jpg', nb_fan: 12_731_723 }, { name: 'no id' }] }
        : { data: [{ id: 7, title: 'Top USA', nb_tracks: 100, user: { name: 'Deezer Charts' }, picture_medium: 'https://cdn/b.jpg' }] };

    expect(await searchArtists('taylor swift')).toEqual([
      { id: 12246, name: 'Taylor Swift', picture: 'https://cdn/a.jpg', fans: 12_731_723 },
    ]);
    expect(await searchPlaylists('top usa')).toEqual([
      { id: 7, title: 'Top USA', picture: 'https://cdn/b.jpg', trackCount: 100, author: 'Deezer Charts' },
    ]);
  });

  it('short-circuits empty search queries without a request', async () => {
    expect(await searchTracks('   ')).toEqual([]);
    expect(await searchArtists('')).toEqual([]);
    expect(await searchPlaylists('')).toEqual([]);
    expect(requested).toHaveLength(0);
  });

  it('reads album metadata for album tracks that omit their album object', async () => {
    routes = () => ({
      id: 302127, title: 'Nevermind', md5_image: 'nirv',
      artist: { id: 415, name: 'Nirvana' },
      tracks: { data: [{ id: 1, title: 'Smells Like Teen Spirit', title_short: 'Smells Like Teen Spirit', duration: 301, rank: 900_000, preview: previewUrl('sl') }] },
    });
    const tracks = await getAlbumTracks(302127);
    expect(tracks[0]).toMatchObject({ artist: 'Nirvana', album: 'Nevermind', albumId: 302127 });
    expect(tracks[0]?.cover).toContain('nirv');
  });

  it('getTrack surfaces release year + bpm, and refreshPreview re-signs the url', async () => {
    const stale: Track = {
      ...(mapTrack(RAW_TRACK) as Track),
      preview: previewUrl('old', Math.floor(Date.now() / 1000) - 10),
      packId: 'taylor-swift',
    };
    routes = () => ({ ...RAW_TRACK, release_date: '2025-10-03', bpm: 96, preview: previewUrl('fresh') });

    const detail = await getTrack(RAW_TRACK.id);
    expect(detail.releaseYear).toBe(2025);
    expect(detail.bpm).toBe(96);

    const refreshed = await refreshPreview(stale);
    expect(refreshed.preview).toContain('fresh');
    expect(isPreviewFresh(refreshed)).toBe(true);
    // Catalog metadata survives the refresh.
    expect(refreshed.packId).toBe('taylor-swift');
  });

  it('refreshPreviews only re-signs the stale tracks and survives failures', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const base = mapTrack(RAW_TRACK) as Track;
    const fresh = { ...base, id: 1, preview: previewUrl('fresh', nowSec + 3600) };
    const stale = { ...base, id: 2, preview: previewUrl('old', nowSec - 10) };
    const broken = { ...base, id: 3, preview: previewUrl('old', nowSec - 10) };

    routes = (url) => {
      if (url.pathname === '/track/3') return { error: { type: 'DataException', message: 'no data', code: 800 } };
      return { ...RAW_TRACK, id: 2, preview: previewUrl('resigned') };
    };

    const out = await refreshPreviews([fresh, stale, broken]);
    // Only the two stale tracks were looked up.
    expect(requested.filter((r) => r.startsWith('/track/'))).toEqual(['/track/2', '/track/3']);
    expect(out[0]?.preview).toContain('fresh');
    expect(out[1]?.preview).toContain('resigned');
    // A failed refresh returns the track untouched rather than throwing.
    expect(out[2]?.preview).toBe(broken.preview);
  });

  it('rejects getTrack when the track has no playable preview', async () => {
    routes = () => ({ ...RAW_TRACK, preview: '' });
    await expect(getTrack(1)).rejects.toBeInstanceOf(DeezerError);
  });

  it('drops unplayable rows from list endpoints', async () => {
    routes = () => ({
      data: [rawTrack(1), rawTrack(2, { readable: false }), rawTrack(3, { preview: '' }), rawTrack(4)],
    });
    const tracks = await getChartTracks(0);
    expect(tracks.map((t) => t.id)).toEqual([1, 4]);
  });
});

/* ------------------------------------------------------------ rate limiting */

describe('rate limiter', () => {
  it('keeps at most 6 requests in flight and dispatches in FIFO order', async () => {
    // Replace the beforeEach transport with a gated one (restore first: re-spying on an
    // active spy would make realCreateElement recurse into itself).
    vi.restoreAllMocks();
    const realCreateElement = document.createElement.bind(document);

    const dispatched: number[] = [];
    let concurrent = 0;
    let peak = 0;
    const gates: Array<() => void> = [];

    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag);
      if (tag !== 'script') return el;
      let src = '';
      Object.defineProperty(el, 'src', {
        configurable: true,
        get: () => src,
        set(next: string) {
          src = next;
          const url = new URL(next);
          const n = Number(url.pathname.split('/')[2]);
          dispatched.push(n);
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          gates.push(() => {
            concurrent -= 1;
            const cb = url.searchParams.get('callback');
            const host = globalThis as unknown as Record<string, unknown>;
            const fn = cb === null ? undefined : host[cb];
            if (typeof fn === 'function') (fn as (p: unknown) => void)({ data: [rawTrack(n)] });
          });
        },
      });
      return el;
    }) as typeof document.createElement);

    const pending = Promise.all(Array.from({ length: 15 }, (_, i) => getChartTracks(i + 1, 100)));

    // Release responses one at a time so the limiter has to refill its slots.
    for (let guard = 0; guard < 300 && (gates.length > 0 || dispatched.length < 15); guard++) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 1));
    }
    await pending;

    expect(peak).toBeGreaterThan(1); // actually parallel, not serialised
    expect(peak).toBeLessThanOrEqual(6);
    expect(dispatched).toHaveLength(15);
    expect(dispatched).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});
