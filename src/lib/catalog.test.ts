import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pack, Track } from '@/types/catalog';

/**
 * The Deezer fetchers are mocked at the module boundary so pool building, dedupe and the
 * difficulty tiers can be tested without a network (or a JSONP transport).
 */
const fetchers = vi.hoisted(() => ({
  getPlaylistTracks: vi.fn<(id: number, max?: number) => Promise<Track[]>>(),
  getChartTracks: vi.fn<(genreId: number, limit?: number) => Promise<Track[]>>(),
  getArtistTop: vi.fn<(id: number, limit?: number) => Promise<Track[]>>(),
  getAlbumTracks: vi.fn<(id: number) => Promise<Track[]>>(),
  searchTracks: vi.fn<(q: string, limit?: number) => Promise<Track[]>>(),
}));

vi.mock('@/lib/deezer', () => fetchers);

const {
  PACKS,
  PACK_CATEGORIES,
  allTags,
  applyDifficulty,
  buildPool,
  clearPackCache,
  dedupeTracks,
  getDailyPack,
  getPack,
  normalizeText,
  packFromArtist,
  packFromPlaylist,
  packFromSearch,
  parseDeezerUrl,
  resolvePack,
  searchPacks,
  tierOf,
  trackKey,
} = await import('@/lib/catalog');

/* ---------------------------------------------------------------- fixtures */

let nextId = 1;
function track(over: Partial<Track> = {}): Track {
  const id = over.id ?? nextId++;
  return {
    id,
    title: `Song ${id}`,
    titleFull: `Song ${id}`,
    artist: `Artist ${id}`,
    artistId: id,
    album: `Album ${id}`,
    albumId: id,
    cover: '',
    coverBig: '',
    preview: `https://cdnt-preview.dzcdn.net/${id}.mp3?hdnea=exp=9999999999`,
    previewFetchedAt: Date.now(),
    duration: 200,
    rank: 500_000,
    explicit: false,
    ...over,
  };
}

/** A pool of `n` tracks with strictly descending rank — index 0 is the most popular. */
function rankedPool(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => track({ id: i + 1, rank: 1_000_000 - i * 1000 }));
}

function pack(over: Partial<Pack> = {}): Pack {
  return {
    id: 'test-pack',
    name: 'Test Pack',
    emoji: '🎵',
    tagline: 'For tests',
    category: 'genre',
    tags: ['test'],
    accent: '#a855f7',
    sources: [{ kind: 'playlist', id: 1 }],
    ...over,
  };
}

beforeEach(() => {
  nextId = 1;
  clearPackCache();
  for (const fn of Object.values(fetchers)) fn.mockReset();
  fetchers.getPlaylistTracks.mockResolvedValue([]);
  fetchers.getChartTracks.mockResolvedValue([]);
  fetchers.getArtistTop.mockResolvedValue([]);
  fetchers.getAlbumTracks.mockResolvedValue([]);
  fetchers.searchTracks.mockResolvedValue([]);
});

/* -------------------------------------------------------------- normalizing */

describe('normalizeText / trackKey', () => {
  it('strips diacritics, punctuation and case', () => {
    expect(normalizeText('Beyoncé')).toBe('beyonce');
    expect(normalizeText('  ROSALÍA!! ')).toBe('rosalia');
    expect(normalizeText("Don't Stop Me Now")).toBe('don t stop me now');
    expect(normalizeText('A.R. Rahman')).toBe('a r rahman');
  });

  it('ignores bracketed version suffixes so releases collapse together', () => {
    expect(normalizeText('Blinding Lights (Remix)')).toBe('blinding lights');
    expect(normalizeText('Hello [Radio Edit]')).toBe('hello');
  });

  it('builds a title|artist key', () => {
    expect(trackKey(track({ title: 'Bad Guy', artist: 'Billie Eilish' }))).toBe('bad guy|billie eilish');
  });
});

/* -------------------------------------------------------------------- dedupe */

describe('dedupeTracks', () => {
  it('drops repeated ids, keeping the first occurrence', () => {
    const a = track({ id: 7, title: 'One' });
    const b = track({ id: 7, title: 'One again' });
    expect(dedupeTracks([a, b]).map((t) => t.title)).toEqual(['One']);
  });

  it('drops the same song released under a different id', () => {
    const single = track({ id: 1, title: 'Levitating', artist: 'Dua Lipa' });
    const album = track({ id: 2, title: 'Levitating', artist: 'Dua Lipa' });
    const remix = track({ id: 3, title: 'Levitating (Remix)', artist: 'Dua Lipa' });
    const other = track({ id: 4, title: 'Levitating', artist: 'Someone Else' });
    expect(dedupeTracks([single, album, remix, other]).map((t) => t.id)).toEqual([1, 4]);
  });

  it('treats diacritics and punctuation as equal', () => {
    const a = track({ id: 1, title: 'Despacito', artist: 'Luis Fonsi' });
    const b = track({ id: 2, title: 'Despacito!', artist: 'Luís Fonsi' });
    expect(dedupeTracks([a, b])).toHaveLength(1);
  });

  it('drops tracks with no preview url', () => {
    expect(dedupeTracks([track({ id: 1, preview: '' }), track({ id: 2 })]).map((t) => t.id)).toEqual([2]);
  });
});

/* ------------------------------------------------------------- resolvePack */

describe('resolvePack', () => {
  it('resolves every source kind and tags tracks with packId', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue([track({ id: 1 })]);
    fetchers.getChartTracks.mockResolvedValue([track({ id: 2 })]);
    fetchers.getArtistTop.mockResolvedValue([track({ id: 3 })]);
    fetchers.getAlbumTracks.mockResolvedValue([track({ id: 4 })]);
    fetchers.searchTracks.mockResolvedValue([track({ id: 5 })]);

    const tracks = await resolvePack(
      pack({
        id: 'mixed',
        sources: [
          { kind: 'playlist', id: 11 },
          { kind: 'chart', genreId: 132 },
          { kind: 'artist', id: 12246 },
          { kind: 'album', id: 99 },
          { kind: 'search', q: 'abba' },
        ],
      }),
    );

    expect(tracks.map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
    expect(tracks.every((t) => t.packId === 'mixed')).toBe(true);
    expect(fetchers.getPlaylistTracks).toHaveBeenCalledWith(11, 300);
    expect(fetchers.getChartTracks).toHaveBeenCalledWith(132, 100);
    expect(fetchers.getArtistTop).toHaveBeenCalledWith(12246, 100);
    expect(fetchers.getAlbumTracks).toHaveBeenCalledWith(99);
  });

  it('dedupes across sources, first source wins', async () => {
    fetchers.getPlaylistTracks.mockImplementation((id) =>
      Promise.resolve(
        id === 1
          ? [track({ id: 10, title: 'Shared', artist: 'X' }), track({ id: 11 })]
          : [track({ id: 12, title: 'Shared', artist: 'X' }), track({ id: 13 })],
      ),
    );
    const tracks = await resolvePack(
      pack({ id: 'dd', sources: [{ kind: 'playlist', id: 1 }, { kind: 'playlist', id: 2 }] }),
    );
    expect(tracks.map((t) => t.id)).toEqual([10, 11, 13]);
  });

  it('memoizes per pack and only refetches after clearPackCache', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue([track({ id: 1 })]);
    const p = pack({ id: 'memo' });
    await resolvePack(p);
    await resolvePack(p);
    expect(fetchers.getPlaylistTracks).toHaveBeenCalledTimes(1);
    clearPackCache('memo');
    await resolvePack(p);
    expect(fetchers.getPlaylistTracks).toHaveBeenCalledTimes(2);
  });

  it('tolerates one failing source but rejects when every source fails', async () => {
    fetchers.getPlaylistTracks.mockRejectedValue(new Error('no data'));
    fetchers.getArtistTop.mockResolvedValue([track({ id: 5 })]);

    const partial = await resolvePack(
      pack({ id: 'partial', sources: [{ kind: 'playlist', id: 1 }, { kind: 'artist', id: 2 }] }),
    );
    expect(partial.map((t) => t.id)).toEqual([5]);

    await expect(resolvePack(pack({ id: 'broken', sources: [{ kind: 'playlist', id: 1 }] }))).rejects.toThrow(
      /all 1 source/,
    );
    // A rejected pack is retryable rather than a poisoned cache entry.
    fetchers.getPlaylistTracks.mockResolvedValue([track({ id: 9 })]);
    await expect(resolvePack(pack({ id: 'broken', sources: [{ kind: 'playlist', id: 1 }] }))).resolves.toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- difficulty */

describe('difficulty tiers', () => {
  it('slices by rank percentile: easy is the most popular quarter', () => {
    const pool = rankedPool(100);
    const easy = applyDifficulty(pool, 'easy');
    const medium = applyDifficulty(pool, 'medium');
    const hard = applyDifficulty(pool, 'hard');
    const expert = applyDifficulty(pool, 'expert');
    const impossible = applyDifficulty(pool, 'impossible');

    expect(easy.map((t) => t.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(medium.map((t) => t.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 26));
    expect(hard.map((t) => t.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 51));
    expect(expert.map((t) => t.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 76));
    // Bottom 5% widens to the minimum playable slice.
    expect(impossible.length).toBeGreaterThanOrEqual(12);
    expect(impossible.at(-1)?.id).toBe(100);
  });

  it('easy tracks really are the highest-ranked', () => {
    const pool = rankedPool(80);
    const easy = applyDifficulty(pool, 'easy');
    const impossible = applyDifficulty(pool, 'impossible');
    const minEasyRank = Math.min(...easy.map((t) => t.rank));
    const maxImpossibleRank = Math.max(...impossible.map((t) => t.rank));
    expect(minEasyRank).toBeGreaterThan(maxImpossibleRank);
  });

  it("widens into neighbouring tiers when a tier can't fill 12 slots", () => {
    const pool = rankedPool(20); // 25% = 5 tracks
    for (const tier of ['easy', 'medium', 'hard', 'expert', 'impossible'] as const) {
      expect(applyDifficulty(pool, tier).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('returns the whole pool for "any", and never more than the pool', () => {
    const pool = rankedPool(9);
    expect(applyDifficulty(pool, 'any')).toEqual(pool);
    expect(applyDifficulty(pool, 'expert')).toHaveLength(9);
    expect(applyDifficulty([], 'easy')).toEqual([]);
  });

  it('tierOf is the inverse of the slicing', () => {
    const pool = rankedPool(100);
    expect(tierOf(pool[0]!, pool)).toBe('easy');
    expect(tierOf(pool[24]!, pool)).toBe('easy');
    expect(tierOf(pool[25]!, pool)).toBe('medium');
    expect(tierOf(pool[50]!, pool)).toBe('hard');
    expect(tierOf(pool[75]!, pool)).toBe('expert');
    expect(tierOf(pool[95]!, pool)).toBe('impossible');
    expect(tierOf(pool[99]!, pool)).toBe('impossible');
    expect(tierOf(track({ id: 9999 }), pool)).toBe('any');
    expect(tierOf(pool[0]!, [])).toBe('any');
  });

  it('is deterministic when ranks tie', () => {
    const tied = Array.from({ length: 40 }, (_, i) => track({ id: 40 - i, rank: 1000 }));
    const once = applyDifficulty(tied, 'easy').map((t) => t.id);
    const twice = applyDifficulty([...tied].reverse(), 'easy').map((t) => t.id);
    expect(once).toEqual(twice);
  });
});

/* ----------------------------------------------------------------- buildPool */

describe('buildPool', () => {
  const twoPacks = [PACKS[0]!.id, PACKS[1]!.id];

  it('unions the selected packs and dedupes across them', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue([track({ id: 1, title: 'Same', artist: 'A' })]);
    fetchers.getChartTracks.mockResolvedValue([track({ id: 2, title: 'Same', artist: 'A' })]);
    fetchers.getArtistTop.mockResolvedValue([track({ id: 3 })]);

    const pool = await buildPool({ packIds: twoPacks, difficulty: 'any', explicitFilter: false });
    const keys = new Set(pool.map(trackKey));
    expect(keys.size).toBe(pool.length);
  });

  it('applies the explicit filter', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue([
      track({ id: 1, explicit: true }),
      track({ id: 2, explicit: false }),
    ]);
    fetchers.getChartTracks.mockResolvedValue([]);
    fetchers.getArtistTop.mockResolvedValue([]);

    const clean = await buildPool({ packIds: [PACKS[0]!.id], difficulty: 'any', explicitFilter: true });
    expect(clean.every((t) => !t.explicit)).toBe(true);
  });

  it('honours opts.exclude', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue([track({ id: 1 }), track({ id: 2 }), track({ id: 3 })]);
    fetchers.getChartTracks.mockResolvedValue([]);
    const pool = await buildPool(
      { packIds: [PACKS[0]!.id], difficulty: 'any', explicitFilter: false },
      { exclude: [2] },
    );
    expect(pool.map((t) => t.id)).not.toContain(2);
  });

  it('returns [] for unknown or empty pack selections without fetching', async () => {
    expect(await buildPool({ packIds: [], difficulty: 'any', explicitFilter: false })).toEqual([]);
    expect(await buildPool({ packIds: ['nope-not-real'], difficulty: 'any', explicitFilter: false })).toEqual([]);
    expect(fetchers.getPlaylistTracks).not.toHaveBeenCalled();
  });

  it('applies the difficulty tier to the unioned pool', async () => {
    fetchers.getPlaylistTracks.mockResolvedValue(rankedPool(100));
    fetchers.getChartTracks.mockResolvedValue([]);
    const easy = await buildPool({ packIds: [PACKS[0]!.id], difficulty: 'easy', explicitFilter: false });
    const all = await buildPool({ packIds: [PACKS[0]!.id], difficulty: 'any', explicitFilter: false });
    expect(easy.length).toBeLessThan(all.length);
    expect(Math.min(...easy.map((t) => t.rank))).toBeGreaterThan(Math.min(...all.map((t) => t.rank)));
  });
});

/* --------------------------------------------------------------- pack browsing */

describe('pack browsing', () => {
  it('getPack finds by slug and returns undefined otherwise', () => {
    expect(getPack('taylor-swift')?.name).toBe('Taylor Swift');
    expect(getPack('definitely-not-a-pack')).toBeUndefined();
  });

  it('searchPacks matches names, tags and taglines, best match first', () => {
    expect(searchPacks('taylor')[0]?.id).toBe('taylor-swift');
    expect(searchPacks('bollywood').map((p) => p.id)).toContain('bollywood-hits');
    expect(searchPacks('k-pop').map((p) => p.id)).toContain('kpop-hits');
    // Exact name beats a substring match elsewhere.
    expect(searchPacks('Techno')[0]?.name).toBe('Techno');
  });

  it('searchPacks is diacritic- and case-insensitive', () => {
    expect(searchPacks('REGGAETON').map((p) => p.id)).toContain('reggaeton');
    expect(searchPacks('beyoncé').map((p) => p.id)).toContain('beyonce');
  });

  it('searchPacks with an empty query returns everything, featured first', () => {
    const all = searchPacks('');
    expect(all).toHaveLength(PACKS.length);
    expect(all[0]?.featured).toBe(true);
  });

  it('searchPacks narrows by category and tags', () => {
    const artists = searchPacks('', { category: 'artist' });
    expect(artists.length).toBeGreaterThan(0);
    expect(artists.every((p) => p.category === 'artist')).toBe(true);

    const hindi = searchPacks('', { tags: ['hi'] });
    expect(hindi.length).toBeGreaterThan(0);
    expect(hindi.every((p) => p.tags.includes('hi'))).toBe(true);

    expect(searchPacks('', { tags: ['hi', 'ko'] })).toHaveLength(0);
  });

  it('returns [] for a query that matches nothing', () => {
    expect(searchPacks('zzzzqqqx')).toEqual([]);
  });

  it('allTags is sorted, deduped and non-empty', () => {
    const tags = allTags();
    expect(tags.length).toBeGreaterThan(50);
    expect(new Set(tags).size).toBe(tags.length);
    expect([...tags].sort((a, b) => a.localeCompare(b))).toEqual(tags);
  });

  it('PACK_CATEGORIES covers every category actually used', () => {
    const declared = new Set(PACK_CATEGORIES.map((c) => c.id));
    for (const p of PACKS) expect(declared.has(p.category)).toBe(true);
    for (const c of PACK_CATEGORIES) {
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.blurb.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ daily */

describe('getDailyPack', () => {
  it('is deterministic for a given date', () => {
    for (const date of ['2026-01-01', '2026-09-26', '2027-12-31']) {
      const a = getDailyPack(date);
      const b = getDailyPack(date);
      expect(a.id).toBe(b.id);
    }
  });

  it('only ever picks featured or genre packs', () => {
    for (let d = 0; d < 120; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const picked = getDailyPack(date);
      expect(picked.featured === true || picked.category === 'genre').toBe(true);
    }
  });

  it('rotates: a year of dailies uses many different packs', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      seen.add(getDailyPack(date).id);
    }
    expect(seen.size).toBeGreaterThan(30);
  });

  it('does not collide on consecutive days', () => {
    let repeats = 0;
    let prev = '';
    for (let d = 0; d < 180; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const id = getDailyPack(date).id;
      if (id === prev) repeats += 1;
      prev = id;
    }
    expect(repeats).toBeLessThan(5);
  });
});

/* ----------------------------------------------------------- custom packs */

describe('parseDeezerUrl', () => {
  it('accepts playlist, artist and album urls with and without locale prefixes', () => {
    expect(parseDeezerUrl('https://www.deezer.com/playlist/1363560485')).toEqual({ kind: 'playlist', id: 1363560485 });
    expect(parseDeezerUrl('https://www.deezer.com/en/playlist/123')).toEqual({ kind: 'playlist', id: 123 });
    expect(parseDeezerUrl('https://deezer.com/fr/artist/12246')).toEqual({ kind: 'artist', id: 12246 });
    expect(parseDeezerUrl('https://www.deezer.com/pt-br/album/302127')).toEqual({ kind: 'album', id: 302127 });
    expect(parseDeezerUrl('deezer.com/artist/789')).toEqual({ kind: 'artist', id: 789 });
    expect(parseDeezerUrl('http://www.deezer.com/de/playlist/456?utm_source=deezer')).toEqual({
      kind: 'playlist',
      id: 456,
    });
    expect(parseDeezerUrl('  https://www.deezer.com/ARTIST/1  ')).toEqual({ kind: 'artist', id: 1 });
  });

  it('rejects anything else', () => {
    for (const bad of [
      '',
      'not a url',
      'https://open.spotify.com/playlist/abc',
      'https://www.deezer.com/en/track/3579685431',
      'https://www.deezer.com/en/playlist/',
      'https://www.deezer.com/en/playlist/abc',
      'https://notdeezer.example.com/playlist/1',
    ]) {
      expect(parseDeezerUrl(bad)).toBeNull();
    }
  });
});

describe('custom pack builders', () => {
  it('packFromArtist produces a valid custom pack', () => {
    const p = packFromArtist({ id: 12246, name: 'Taylor Swift', picture: 'x', fans: 1 });
    expect(p).toMatchObject({ category: 'custom', sources: [{ kind: 'artist', id: 12246 }] });
    expect(p.id).toBe('custom-artist-12246');
    expect(p.tagline.length).toBeLessThanOrEqual(60);
    expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('packFromPlaylist carries the title, author and size', () => {
    const p = packFromPlaylist({ id: 999, title: 'Top USA', picture: '', trackCount: 100, author: 'Deezer Charts' });
    expect(p).toMatchObject({
      id: 'custom-playlist-999',
      name: 'Top USA',
      sources: [{ kind: 'playlist', id: 999 }],
      approxSize: 100,
    });
    expect(p.tagline).toContain('Deezer Charts');
  });

  it('packFromSearch slugifies the query', () => {
    const p = packFromSearch('  Bollywood  90s!! ');
    expect(p.id).toBe('custom-search-bollywood-90s');
    expect(p.sources).toEqual([{ kind: 'search', q: 'Bollywood  90s!!' }]);
  });

  it('custom packs resolve through the same path as curated ones', async () => {
    fetchers.getArtistTop.mockResolvedValue([track({ id: 1 }), track({ id: 2 })]);
    const p = packFromArtist({ id: 42, name: 'Someone', picture: '', fans: 0 });
    const tracks = await resolvePack(p);
    expect(tracks).toHaveLength(2);
    expect(tracks.every((t) => t.packId === p.id)).toBe(true);
  });
});
