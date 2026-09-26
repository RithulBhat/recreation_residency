/**
 * Test fixtures: deterministic fake tracks. Safe to import from tests in any folder.
 */

import type { Track } from '@/types';
import { createRng } from './rng';

export function makeTrack(over: Partial<Track> = {}): Track {
  const id = over.id ?? 1;
  const title = over.title ?? 'Blinding Lights';
  return {
    id,
    title,
    titleFull: over.titleFull ?? title,
    artist: 'The Weeknd',
    artistId: 1,
    album: 'After Hours',
    albumId: 1,
    cover: `https://cdn.example/cover/${id}.jpg`,
    coverBig: `https://cdn.example/cover/${id}-big.jpg`,
    preview: `https://cdn.example/preview/${id}.mp3`,
    previewFetchedAt: 0,
    duration: 200,
    rank: 500000,
    explicit: false,
    ...over,
  };
}

const WORDS = [
  'love',
  'night',
  'light',
  'heart',
  'dance',
  'fire',
  'gold',
  'summer',
  'blue',
  'young',
  'wild',
  'home',
  'dream',
  'city',
  'river',
  'star',
  'moon',
  'sun',
  'girl',
  'boy',
  'time',
  'forever',
  'stay',
  'hello',
  'sorry',
  'happy',
  'crazy',
  'lonely',
  'party',
  'rock',
];
const FIRST = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Kai', 'Nia', 'Eli', 'Ivy', 'Max'];
const LAST = ['Rivers', 'Stone', 'Blake', 'Cruz', 'Vale', 'Knight', 'Reyes', 'Moon', 'Hart', 'Fox'];

/** `n` varied fake tracks with pseudo-realistic titles/artists (seeded → stable). */
export function makeTracks(n: number, seed = 'fixtures'): Track[] {
  const rng = createRng(seed);
  const out: Track[] = [];
  for (let i = 0; i < n; i++) {
    const words = rng.int(1, 4);
    const title = Array.from({ length: words }, () => rng.pick(WORDS))
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
    const artist = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    out.push(
      makeTrack({
        id: 1000 + i,
        title,
        titleFull: rng.next() < 0.2 ? `${title} (feat. ${rng.pick(FIRST)})` : title,
        artist,
        artistId: 100 + (i % 50),
        album: `${rng.pick(WORDS)} album`,
        albumId: i,
        rank: rng.int(1000, 999999),
      }),
    );
  }
  return out;
}
