/**
 * The hub reads `sg:stats` by hand instead of importing the stats store, so these tests pin it to
 * the real persisted shape: a record written by the store must parse, and anything else must come
 * back `null` so the front door shows nothing rather than an empty state.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { classicGame } from '@/stats/testFactory';
import { useStatsStore, STATS_STORAGE_KEY } from '@/store/statsStore';
import { parseLastVisit, relativeTime } from './useLastVisit';

describe('parseLastVisit', () => {
  it('is null for missing, malformed or empty storage', () => {
    expect(parseLastVisit(null)).toBeNull();
    expect(parseLastVisit('')).toBeNull();
    expect(parseLastVisit('not json')).toBeNull();
    expect(parseLastVisit('[]')).toBeNull();
    expect(parseLastVisit('{"state":{}}')).toBeNull();
    // A store that exists but has never recorded a game shows nothing.
    expect(parseLastVisit('{"state":{"totals":{"games":0,"xp":0},"records":[]},"version":1}')).toBeNull();
  });

  it('reads rank, game count and the newest record', () => {
    const visit = parseLastVisit(
      JSON.stringify({
        version: 1,
        state: {
          totals: { games: 4, xp: 900 },
          records: [
            { id: 'a', mode: 'blitz', score: 3200, finishedAt: 1000, rounds: 9, correct: 7 },
            { id: 'b', mode: 'classic', score: 800, finishedAt: 5000, rounds: 5, correct: 4 },
          ],
        },
      }),
    );
    expect(visit).not.toBeNull();
    expect(visit?.games).toBe(4);
    // 900 XP is tier 3 in src/stats/rank.ts.
    expect(visit?.rank.level).toBe(3);
    // Newest by `finishedAt`, not by array order.
    expect(visit?.last?.mode).toBe('classic');
    expect(visit?.last?.score).toBe(800);
  });

  it('ignores records with an unknown mode or no timestamp', () => {
    const visit = parseLastVisit(
      JSON.stringify({
        state: {
          totals: { games: 1, xp: 10 },
          records: [
            { id: 'a', mode: 'sideways', score: 10, finishedAt: 9000 },
            { id: 'b', mode: 'classic', score: 10 },
          ],
        },
      }),
    );
    expect(visit?.last).toBeNull();
  });
});

describe('against the real stats store', () => {
  beforeEach(() => {
    localStorage.clear();
    useStatsStore.getState().reset();
  });

  it('parses what the store actually persists', () => {
    useStatsStore.getState().recordGame(classicGame());
    const visit = parseLastVisit(localStorage.getItem(STATS_STORAGE_KEY));
    expect(visit).not.toBeNull();
    expect(visit?.games).toBe(1);
    expect(visit?.last?.mode).toBe('classic');
    expect(visit?.rank.title.length).toBeGreaterThan(0);
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000_000;
  it('stays coarse', () => {
    expect(relativeTime(now, now)).toBe('just now');
    expect(relativeTime(now - 30_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe('5h ago');
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('4 days ago');
    expect(relativeTime(now - 70 * 86_400_000, now)).toBe('2 months ago');
  });
  it('never reports the future as negative', () => {
    expect(relativeTime(now + 60_000, now)).toBe('just now');
  });
});
