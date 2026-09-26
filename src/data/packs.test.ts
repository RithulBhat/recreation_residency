import { describe, expect, it } from 'vitest';
import { FEATURED_PACKS, PACKS, PACKS_BY_ID, packsInCategory } from '@/data/packs';
import type { PackCategory, PackSource } from '@/types/catalog';

/**
 * Shape + diversity guarantees for the curated catalog. These are pure data assertions —
 * live Deezer verification is `node scripts/verify-packs.mjs`.
 */

const CATEGORIES: PackCategory[] = [
  'genre', 'decade', 'region', 'artist', 'vibe', 'soundtrack', 'chart', 'custom',
];

function countIn(category: PackCategory): number {
  return packsInCategory(category).length;
}

describe('catalog shape', () => {
  it('ships at least 150 packs', () => {
    expect(PACKS.length).toBeGreaterThanOrEqual(150);
  });

  it('has unique, url-safe slugs', () => {
    const ids = PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('PACKS_BY_ID indexes every pack', () => {
    expect(PACKS_BY_ID.size).toBe(PACKS.length);
    for (const p of PACKS) expect(PACKS_BY_ID.get(p.id)).toBe(p);
  });

  it('every pack is fully populated', () => {
    for (const p of PACKS) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.emoji.length, p.id).toBeGreaterThan(0);
      expect(p.tagline.length, p.id).toBeGreaterThan(0);
      expect(p.tagline.length, `${p.id} tagline too long`).toBeLessThanOrEqual(60);
      expect(CATEGORIES, p.id).toContain(p.category);
      expect(p.tags.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.accent, p.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.sources.length, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('tags are lowercase and deduped', () => {
    for (const p of PACKS) {
      expect(new Set(p.tags).size, p.id).toBe(p.tags.length);
      for (const tag of p.tags) expect(tag, p.id).toBe(tag.toLowerCase());
    }
  });

  it('accent colors are all distinct', () => {
    expect(new Set(PACKS.map((p) => p.accent)).size).toBe(PACKS.length);
  });

  it('has a verified approxSize of at least 30 playable tracks', () => {
    for (const p of PACKS) {
      expect(p.approxSize, `${p.id} has no approxSize`).toBeDefined();
      expect(p.approxSize ?? 0, `${p.id} is too small`).toBeGreaterThanOrEqual(30);
    }
  });

  it('features a handful of crowd-pleasers, not the whole catalog', () => {
    expect(FEATURED_PACKS.length).toBeGreaterThanOrEqual(10);
    expect(FEATURED_PACKS.length).toBeLessThanOrEqual(20);
  });

  it('marks some packs explicitHeavy', () => {
    expect(PACKS.filter((p) => p.explicitHeavy === true).length).toBeGreaterThan(10);
  });
});

describe('sources', () => {
  const isValid = (s: PackSource): boolean => {
    switch (s.kind) {
      case 'playlist':
      case 'artist':
      case 'album':
        return Number.isInteger(s.id) && s.id > 0;
      case 'chart':
        return Number.isInteger(s.genreId) && s.genreId >= 0;
      case 'search':
        return s.q.trim().length > 0;
    }
  };

  it('every source is a well-formed, real-looking Deezer reference', () => {
    for (const p of PACKS) {
      for (const s of p.sources) {
        expect(isValid(s), `${p.id}: ${JSON.stringify(s)}`).toBe(true);
      }
    }
  });

  it('never repeats a source within one pack', () => {
    for (const p of PACKS) {
      const keys = p.sources.map((s) => JSON.stringify(s));
      expect(new Set(keys).size, p.id).toBe(keys.length);
    }
  });

  it('uses only chart genre ids Deezer actually serves', () => {
    const KNOWN = new Set([
      0, 2, 16, 65, 67, 71, 75, 81, 84, 85, 95, 98, 106, 113, 116, 122, 129, 132, 144,
      152, 153, 165, 169, 173, 186, 197, 464, 466,
    ]);
    for (const p of PACKS) {
      for (const s of p.sources) {
        if (s.kind === 'chart') expect(KNOWN, `${p.id} genre ${s.genreId}`).toContain(s.genreId);
      }
    }
  });

  it('artist packs are built from artist top-tracks', () => {
    for (const p of packsInCategory('artist')) {
      expect(p.sources.some((s) => s.kind === 'artist'), p.id).toBe(true);
    }
  });

  it('shares very few playlists between packs', () => {
    const owners = new Map<number, string[]>();
    for (const p of PACKS) {
      for (const s of p.sources) {
        if (s.kind !== 'playlist') continue;
        owners.set(s.id, [...(owners.get(s.id) ?? []), p.id]);
      }
    }
    const shared = [...owners.entries()].filter(([, list]) => list.length > 1);
    expect(shared.map(([id, list]) => `${id}: ${list.join(', ')}`)).toEqual([]);
  });
});

describe('diversity', () => {
  it('meets the per-category minimums', () => {
    expect(countIn('genre'), 'genre').toBeGreaterThanOrEqual(35);
    expect(countIn('decade'), 'decade').toBeGreaterThanOrEqual(10);
    expect(countIn('region'), 'region').toBeGreaterThanOrEqual(25);
    expect(countIn('artist'), 'artist').toBeGreaterThanOrEqual(60);
    expect(countIn('vibe'), 'vibe').toBeGreaterThanOrEqual(15);
    expect(countIn('soundtrack'), 'soundtrack').toBeGreaterThanOrEqual(10);
    expect(countIn('chart'), 'chart').toBeGreaterThanOrEqual(8);
  });

  it('covers the headline genres', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'pop-hits', 'hip-hop-heat', 'rnb-vibes', 'rock-anthems', 'indie-alt', 'metal-mayhem',
      'pop-punk', 'emo-hours', 'grunge', 'classic-rock', 'edm-bangers', 'house-party',
      'techno', 'drum-and-bass', 'dubstep', 'electro-synth', 'synthwave', 'disco-fever',
      'funk-soul', 'jazz-club', 'blues', 'country-roads', 'folk-acoustic', 'reggae-roots',
      'dancehall', 'reggaeton', 'latin-pop', 'salsa-bachata', 'cumbia', 'regional-mexicano',
      'classical-essentials', 'gospel-christian', 'lofi-beats', 'phonk', 'hyperpop',
      'uk-drill-grime', 'trap-bangers', 'boom-bap', 'kids-classics',
    ]) {
      expect(ids, `missing genre pack ${id}`).toContain(id);
    }
  });

  it('covers every decade from the 60s to the 2020s plus combos', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'sixties', 'seventies', 'eighties', 'nineties', 'two-thousands', 'twenty-tens',
      'twenty-twenties', 'nineties-hip-hop', 'eighties-rock', 'two-thousands-rnb', 'twenty-tens-edm',
    ]) {
      expect(ids, `missing decade pack ${id}`).toContain(id);
    }
  });

  it('spans the regions the game cares about', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'bollywood-hits', 'bollywood-nineties', 'bollywood-romance', 'punjabi-wave',
      'tamil-hits', 'telugu-hits', 'malayalam-hits', 'indian-indie',
      'kpop-hits', 'kpop-girl-groups', 'kpop-boy-groups', 'jpop', 'anime-openings', 'mandopop',
      'afrobeats', 'amapiano', 'naija-heat', 'sa-house',
      'arabic-pop', 'turkish-pop', 'french-pop', 'french-rap', 'german-rap', 'italian-hits',
      'spanish-pop', 'sertanejo', 'funk-carioca', 'mpb', 'soca-carnival', 'latin-trap',
    ]) {
      expect(ids, `missing region pack ${id}`).toContain(id);
    }
  });

  it('tags language codes on regional packs so the guess matcher can adapt', () => {
    const LANGS = ['en', 'hi', 'ko', 'es', 'pt', 'fr', 'ta', 'pa', 'ja', 'de', 'it', 'tr', 'ar', 'zh'];
    const tagged = new Set<string>();
    for (const p of PACKS) for (const t of p.tags) if (LANGS.includes(t)) tagged.add(t);
    expect([...tagged].sort()).toEqual(expect.arrayContaining(['en', 'es', 'fr', 'hi', 'ko', 'pa', 'pt', 'ta']));
  });

  it('includes the marquee artists', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'taylor-swift', 'drake', 'the-weeknd', 'beyonce', 'rihanna', 'ariana-grande',
      'billie-eilish', 'olivia-rodrigo', 'dua-lipa', 'ed-sheeran', 'harry-styles',
      'justin-bieber', 'bruno-mars', 'lady-gaga', 'adele', 'sabrina-carpenter', 'sza',
      'doja-cat', 'kendrick-lamar', 'travis-scott', 'eminem', 'kanye-west', 'post-malone',
      'bad-bunny', 'karol-g', 'shakira', 'j-balvin', 'peso-pluma',
      'bts', 'blackpink', 'iu', 'stray-kids',
      'coldplay', 'imagine-dragons', 'arctic-monkeys', 'the-1975', 'tame-impala',
      'queen', 'the-beatles', 'michael-jackson', 'elton-john', 'abba', 'fleetwood-mac',
      'nirvana', 'linkin-park', 'metallica', 'acdc', 'green-day', 'red-hot-chili-peppers',
      'daft-punk', 'calvin-harris', 'david-guetta',
      'burna-boy', 'wizkid', 'rema',
      'arijit-singh', 'ar-rahman', 'diljit-dosanjh', 'anirudh-ravichander', 'pritam',
      'sidhu-moose-wala', 'ap-dhillon',
      'frank-ocean', 'tyler-the-creator', 'lana-del-rey', 'hozier', 'radiohead', 'beach-house',
    ]) {
      expect(ids, `missing artist pack ${id}`).toContain(id);
    }
  });

  it('covers the vibes and soundtracks', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'tiktok-viral', 'gym-workout', 'road-trip', 'wedding-classics', 'karaoke-anthems',
      'one-hit-wonders', 'sad-girl-hours', 'summer-anthems', 'party-starters', 'throwback',
      'meme-songs', 'late-night-chill', 'breakup-bangers', 'feel-good', 'study-focus',
      'disney-magic', 'pixar-feels', 'musicals', 'hindi-film-songs', 'game-ost',
      'anime-ost', 'movie-themes', 'christmas', 'eurovision', 'tv-themes',
    ]) {
      expect(ids, `missing pack ${id}`).toContain(id);
    }
  });

  it('has country and genre charts', () => {
    const ids = new Set(PACKS.map((p) => p.id));
    for (const id of [
      'chart-global', 'chart-usa', 'chart-uk', 'chart-india', 'chart-brazil',
      'chart-france', 'chart-nigeria', 'chart-korea', 'chart-mexico', 'chart-germany',
    ]) {
      expect(ids, `missing chart pack ${id}`).toContain(id);
    }
  });

  it('spreads featured packs across categories', () => {
    expect(new Set(FEATURED_PACKS.map((p) => p.category)).size).toBeGreaterThanOrEqual(4);
  });
});
