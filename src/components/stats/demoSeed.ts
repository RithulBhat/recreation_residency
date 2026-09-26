/**
 * DEV-only demo data for `/#/stats?demo=1`.
 *
 * Loaded with a dynamic import behind `import.meta.env.DEV`, so
 * `@/stats/testFactory` never reaches a production bundle. Seeding goes through
 * the real `recordGame` / `recordDaily` paths, so totals, clip buckets,
 * achievements and track history are derived exactly as they are in a real
 * game — which also means `reset()` wipes every trace of it.
 *
 * `recordGame` de-duplicates by game id, so re-visiting `?demo=1` is a no-op.
 */

import type { Track } from '@/types/catalog';
import type { GameState } from '@/types/game';
import { PACKS } from '@/lib/catalog';
import { localDateKey } from '@/stats/achievements';
import {
  blitzGame,
  classicGame,
  dailyGame,
  duelGame,
  fixedGame,
  partyGame,
  survivalGame,
  type RoundShape,
  type RoundSpec,
} from '@/stats/testFactory';
import { setPackMeta, useStatsStore } from '@/store/statsStore';

/** Clip stages that line up with the histogram buckets, for a readable chart. */
const BUCKET_STAGES = [0.1, 0.25, 0.5, 1, 2, 5, 10];

const DAY = 86_400_000;
const HOUR = 3_600_000;

function ago(days: number, hours = 0): number {
  return Date.now() - days * DAY - hours * HOUR;
}

const SONGS: ReadonlyArray<readonly [title: string, artist: string]> = [
  ['Blinding Lights', 'The Weeknd'],
  ['Levitating', 'Dua Lipa'],
  ['Espresso', 'Sabrina Carpenter'],
  ['As It Was', 'Harry Styles'],
  ['Flowers', 'Miley Cyrus'],
  ['Shake It Off', 'Taylor Swift'],
  ['Mr. Brightside', 'The Killers'],
  ['Hey Ya!', 'OutKast'],
  ['Toxic', 'Britney Spears'],
  ['Crazy In Love', 'Beyoncé'],
  ['In Da Club', '50 Cent'],
  ['Seven Nation Army', 'The White Stripes'],
  ['Kal Ho Naa Ho', 'Sonu Nigam'],
  ['Tum Hi Ho', 'Arijit Singh'],
  ['Chaiyya Chaiyya', 'Sukhwinder Singh'],
  ['Kesariya', 'Arijit Singh'],
  ['Jai Ho', 'Sukhwinder Singh'],
  ['Sicko Mode', 'Travis Scott'],
  ["God's Plan", 'Drake'],
  ['HUMBLE.', 'Kendrick Lamar'],
  ['rockstar', 'Post Malone'],
  ['Dynamite', 'BTS'],
  ['How You Like That', 'BLACKPINK'],
  ['Gangnam Style', 'PSY'],
  ['Smells Like Teen Spirit', 'Nirvana'],
  ['Bohemian Rhapsody', 'Queen'],
  ["Sweet Child O' Mine", "Guns N' Roses"],
  ['Wonderwall', 'Oasis'],
  ['No Scrubs', 'TLC'],
  ['...Baby One More Time', 'Britney Spears'],
  ['Let It Go', 'Idina Menzel'],
  ['Under The Sea', 'Samuel E. Wright'],
  ['Uptown Funk', 'Mark Ronson'],
  ['bad guy', 'Billie Eilish'],
  ['Rolling in the Deep', 'Adele'],
  ['Believer', 'Imagine Dragons'],
];

/** Covers are intentionally empty: demo data must never hit the network. */
function song(index: number): Partial<Track> {
  const entry = SONGS[index % SONGS.length];
  return {
    id: 9_000_000 + (index % SONGS.length),
    title: entry[0],
    titleFull: entry[0],
    artist: entry[1],
    cover: '',
    coverBig: '',
    preview: '',
  };
}

const SHAPES: Record<string, RoundShape> = {
  w: 'won',
  l: 'lost',
  p: 'partial',
  s: 'skipped',
};

/**
 * `specs([0, 3, 7], 'wlw', [0, 2, 1])` → three rounds over those songs.
 * Scores are derived from the shape + try so the demo is deterministic.
 */
function specs(indices: readonly number[], pattern: string, tries: readonly number[] = []): RoundSpec[] {
  return indices.map((songIndex, i) => {
    const shape = SHAPES[pattern[i] ?? 'w'] ?? 'won';
    const tryIndex = tries[i] ?? 0;
    const score = shape === 'won' ? Math.max(180, 940 - tryIndex * 130) : shape === 'partial' ? 165 : 0;
    return { shape, tryIndex, score, track: song(songIndex), elapsedMs: 2200 + i * 350 };
  });
}

function seats(rounds: RoundSpec[]): RoundSpec[] {
  return rounds.map((r, i) => ({ ...r, playerId: i % 2 === 0 ? 'p1' : 'p2' }));
}

/** Sixteen finished games over the last three and a bit weeks, oldest first. */
export function demoGames(): GameState[] {
  const daily1 = localDateKey(ago(9, 2));
  const daily2 = localDateKey(ago(1, 4));

  return [
    classicGame({
      id: 'demo-classic-1',
      startedAt: ago(23, 5),
      rounds: specs([0, 1, 2, 3, 4, 5, 32, 33], 'wwlwwpww', [0, 1, 6, 2, 0, 4, 1, 3]),
      settings: { packIds: ['pop-hits'], difficulty: 'easy', stages: BUCKET_STAGES, tries: 7, rounds: 8 },
    }),
    fixedGame({
      id: 'demo-fixed-1',
      startedAt: ago(21, 3),
      rounds: specs([6, 7, 8, 9, 10, 11], 'wwlwsw', [0, 1, 2, 0, 1, 2]),
      settings: { packIds: ['two-thousands'], difficulty: 'medium', clipLength: 1 },
    }),
    classicGame({
      id: 'demo-classic-2',
      startedAt: ago(19, 6),
      rounds: specs([12, 13, 14, 15, 16], 'wwwlw', [0, 2, 1, 6, 3]),
      settings: { packIds: ['bollywood-hits'], difficulty: 'hard', stages: BUCKET_STAGES, tries: 7, rounds: 5 },
    }),
    blitzGame(0, 0, {
      id: 'demo-blitz-1',
      startedAt: ago(17, 4),
      rounds: specs([0, 3, 17, 18, 19, 20, 21, 32, 33, 34, 35, 24], 'wwwwlwwwwlww'),
      settings: { packIds: ['chart-global'], difficulty: 'medium', clipLength: 1, blitzDuration: 90 },
    }),
    survivalGame(0, {
      id: 'demo-survival-1',
      startedAt: ago(15, 7),
      rounds: specs([17, 18, 19, 20, 10], 'wwwwl', [0, 1, 2, 0, 0]),
      settings: { packIds: ['hip-hop-heat'], difficulty: 'expert', stages: BUCKET_STAGES, tries: 7 },
    }),
    classicGame({
      id: 'demo-classic-3',
      startedAt: ago(13, 2),
      rounds: specs([21, 22, 23, 1, 4], 'wlpwl', [1, 3, 5, 2, 6]),
      settings: { packIds: ['kpop-hits'], difficulty: 'medium', stages: BUCKET_STAGES, tries: 7, rounds: 5 },
    }),
    fixedGame({
      id: 'demo-fixed-3',
      startedAt: ago(12, 6),
      rounds: specs([2, 5, 32, 34, 1, 33], 'wwwlww', [0, 1, 0, 2, 1, 0]),
      settings: { packIds: ['karaoke-anthems'], difficulty: 'easy', clipLength: 2, tries: 3, rounds: 6 },
    }),
    duelGame([2180, 1640], {
      id: 'demo-duel-1',
      startedAt: ago(11, 5),
      rounds: seats(specs([24, 25, 26, 11, 27, 6], 'wwwwlw', [0, 2, 0, 4, 6, 1])),
      settings: { packIds: ['rock-anthems'], difficulty: 'medium', stages: BUCKET_STAGES, tries: 7, rounds: 6 },
    }),
    dailyGame(daily1, {
      id: 'demo-daily-1',
      startedAt: ago(9, 2),
      rounds: specs([2, 4, 33, 34, 5], 'wwwlw', [0, 1, 4, 6, 2]),
      settings: { packIds: ['pop-hits'], difficulty: 'medium', stages: BUCKET_STAGES, tries: 7 },
    }),
    fixedGame({
      id: 'demo-fixed-2',
      startedAt: ago(8, 9),
      rounds: specs([27, 28, 29, 8, 24], 'wlwwp', [0, 1, 0, 2, 1]),
      settings: { packIds: ['nineties'], difficulty: 'hard', clipLength: 0.5, tries: 3, rounds: 5 },
    }),
    partyGame({
      id: 'demo-party-1',
      startedAt: ago(6, 3),
      rounds: specs([30, 31, 21, 25, 32], 'wwwww', [0, 2, 1, 3, 1]),
      settings: { packIds: ['disney-magic'], difficulty: 'easy', stages: BUCKET_STAGES, tries: 7, rounds: 5 },
    }),
    fixedGame({
      id: 'demo-fixed-4',
      startedAt: ago(5, 4),
      rounds: specs([21, 22, 23, 17, 20, 35], 'wwlwww', [0, 1, 2, 0, 1, 0]),
      settings: { packIds: ['kpop-hits'], difficulty: 'medium', clipLength: 0.25, tries: 3, rounds: 6 },
    }),
    classicGame({
      id: 'demo-classic-4',
      startedAt: ago(4, 6),
      rounds: specs([13, 15, 12, 16, 14, 34], 'wlwwlw', [1, 4, 0, 3, 6, 2]),
      settings: { packIds: ['bollywood-hits'], difficulty: 'hard', stages: BUCKET_STAGES, tries: 7, rounds: 6 },
    }),
    blitzGame(0, 0, {
      id: 'demo-blitz-2',
      startedAt: ago(3, 8),
      rounds: specs([2, 33, 4, 1, 35, 21, 22, 18], 'wwwwwlww'),
      settings: { packIds: ['tiktok-viral'], difficulty: 'easy', clipLength: 0.5, blitzDuration: 60 },
    }),
    dailyGame(daily2, {
      id: 'demo-daily-2',
      startedAt: ago(1, 4),
      rounds: specs([6, 8, 10, 9, 7], 'wwlwl', [0, 3, 6, 2, 6]),
      settings: { packIds: ['two-thousands'], difficulty: 'medium', stages: BUCKET_STAGES, tries: 7 },
    }),
    classicGame({
      id: 'demo-classic-5',
      startedAt: ago(0, 3),
      rounds: specs([0, 3, 5, 32, 4, 2, 34], 'wwwwwwl', [0, 0, 3, 1, 5, 2, 6]),
      settings: { packIds: ['pop-hits'], difficulty: 'expert', stages: BUCKET_STAGES, tries: 7, rounds: 7 },
    }),
  ];
}

/** Fold the demo games into the real store. Idempotent. */
export function seedDemoStats(): void {
  setPackMeta(PACKS);
  const store = useStatsStore.getState();
  for (const game of demoGames()) {
    if (game.settings.daily) store.recordDaily(game);
    else store.recordGame(game);
  }
}
