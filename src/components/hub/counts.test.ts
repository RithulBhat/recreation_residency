/**
 * The hub quotes real numbers from a constant so the front door does not have to download a 57 kB
 * pack file and an 800 kB roster to paint. These tests are what keeps the constant honest: they
 * read the same JSON the app ships and fail the moment a sync changes a count.
 */

import { describe, expect, it } from 'vitest';
import packs from '@/data/packs.json';
import meta from '@/data/nfl/meta.json';
import clips from '@/data/nfl/clips.json';
import { STATS_STORAGE_KEY } from '@/store/statsStore';
import {
  SCOUT_CLIP_COUNT,
  SCOUT_PLAY_COUNT,
  SCOUT_PLAYER_COUNT,
  SCOUT_TEAM_COUNT,
  SONGOONER_PACK_COUNT,
  SONGOONER_TRACK_FLOOR,
  STATS_KEY,
} from './counts';

describe('hub counts', () => {
  it('matches the pack catalogue', () => {
    expect(SONGOONER_PACK_COUNT).toBe(packs.length);
  });

  it('floors the track total to the nearest thousand', () => {
    const total = packs.reduce((sum, p) => sum + (p.approxSize ?? 0), 0);
    expect(SONGOONER_TRACK_FLOOR).toBe(Math.floor(total / 1000) * 1000);
    // The label says "37,000+", so the floor must never overstate the pool.
    expect(SONGOONER_TRACK_FLOOR).toBeLessThanOrEqual(total);
  });

  it('matches the NFL sync manifest', () => {
    expect(SCOUT_PLAYER_COUNT).toBe(meta.counts.players);
    expect(SCOUT_TEAM_COUNT).toBe(meta.counts.teams);
    expect(SCOUT_PLAY_COUNT).toBe(meta.counts.highlights);
  });

  it('matches the verified clip dataset', () => {
    expect(SCOUT_CLIP_COUNT).toBe(clips.length);
  });

  it('reads the same localStorage key the stats store writes', () => {
    expect(STATS_KEY).toBe(STATS_STORAGE_KEY);
  });
});
