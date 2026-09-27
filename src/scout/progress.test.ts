import { describe, expect, it } from 'vitest';
import {
  SCOUT_FORMAT_XP_BONUS,
  SCOUT_MAX_LEVEL,
  SCOUT_RANKS,
  SCOUT_TIER_XP,
  finalizeScoutRun,
  scoutFormatXpBonus,
  scoutLeveledUp,
  scoutRankFor,
  scoutTierHardness,
  scoutTierXp,
  scoutTierForLevel,
  scoutXpForLevel,
  scoutXpToNext,
  xpForScoutRun,
} from './progress';
import { summarizeScoutRun } from './scoutStats';
import { blitzRun, gauntletRun, makeScoutRun, standardRun } from './statsTestFactory';
import { rankFor } from '@/stats/rank';

describe('the ladder', () => {
  it('has at least twelve football titles, ascending and unique', () => {
    expect(SCOUT_RANKS.length).toBeGreaterThanOrEqual(12);
    expect(SCOUT_MAX_LEVEL).toBe(SCOUT_RANKS.length);
    SCOUT_RANKS.forEach((tier, i) => {
      expect(tier.level).toBe(i + 1);
      expect(tier.title.length).toBeGreaterThan(2);
      expect(tier.emoji).not.toBe('');
      if (i > 0) expect(tier.at).toBeGreaterThan(SCOUT_RANKS[i - 1].at);
    });
    expect(SCOUT_RANKS[0].at).toBe(0);
    expect(SCOUT_RANKS[0].title).toBe('Waterboy');
    expect(new Set(SCOUT_RANKS.map((t) => t.title)).size).toBe(SCOUT_RANKS.length);
    expect(SCOUT_RANKS.map((t) => t.title)).toContain('Hall of Fame Scout');
  });

  it('mirrors the shape of the Songooner rank so one component renders both', () => {
    expect(Object.keys(scoutRankFor(5000)).sort()).toEqual(Object.keys(rankFor(5000)).sort());
    expect(scoutRankFor(5000).level).toBe(rankFor(5000).level);
  });

  it('never goes down as XP goes up', () => {
    let lastLevel = 0;
    let lastThreshold = -1;
    for (let xp = 0; xp <= 60_000; xp += 137) {
      const rank = scoutRankFor(xp);
      expect(rank.level).toBeGreaterThanOrEqual(lastLevel);
      expect(rank.threshold).toBeGreaterThanOrEqual(lastThreshold);
      expect(rank.progress).toBeGreaterThanOrEqual(0);
      expect(rank.progress).toBeLessThanOrEqual(1);
      expect(rank.xp).toBe(xp);
      lastLevel = rank.level;
      lastThreshold = rank.threshold;
    }
    expect(lastLevel).toBe(SCOUT_MAX_LEVEL);
  });

  it('lands exactly on a threshold', () => {
    for (const tier of SCOUT_RANKS) {
      const rank = scoutRankFor(tier.at);
      expect(rank.level).toBe(tier.level);
      expect(rank.title).toBe(tier.title);
      expect(rank.threshold).toBe(tier.at);
      expect(rank.progress).toBe(tier.level === SCOUT_MAX_LEVEL ? 1 : 0);
    }
    const belowSecond = scoutRankFor(SCOUT_RANKS[1].at - 1);
    expect(belowSecond.level).toBe(1);
    expect(belowSecond.progress).toBeCloseTo((SCOUT_RANKS[1].at - 1) / SCOUT_RANKS[1].at, 5);
  });

  it('caps at the top and floors at zero', () => {
    const top = scoutRankFor(10_000_000);
    expect(top.level).toBe(SCOUT_MAX_LEVEL);
    expect(top.nextAt).toBeNull();
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
    expect(scoutXpToNext(10_000_000)).toBe(0);

    expect(scoutRankFor(-500).level).toBe(1);
    expect(scoutRankFor(-500).xp).toBe(0);
    expect(scoutRankFor(Number.NaN).xp).toBe(0);
  });

  it('reports the gap to the next title', () => {
    expect(scoutXpToNext(0)).toBe(SCOUT_RANKS[1].at);
    expect(scoutXpToNext(SCOUT_RANKS[1].at - 10)).toBe(10);
    expect(scoutLeveledUp(SCOUT_RANKS[1].at - 1, SCOUT_RANKS[1].at)).toBe(true);
    expect(scoutLeveledUp(SCOUT_RANKS[1].at, SCOUT_RANKS[1].at + 1)).toBe(false);
  });

  it('clamps level lookups', () => {
    expect(scoutXpForLevel(0)).toBe(0);
    expect(scoutXpForLevel(1)).toBe(0);
    expect(scoutXpForLevel(999)).toBe(SCOUT_RANKS[SCOUT_MAX_LEVEL - 1].at);
    expect(scoutTierForLevel(-3).level).toBe(1);
    expect(scoutTierForLevel(8).title).toBe(SCOUT_RANKS[7].title);
  });
});

describe('xp', () => {
  it('pays score, correct count, streak, format and who you named', () => {
    const run = standardRun();
    const summary = summarizeScoutRun(run);
    if (!summary) throw new Error('unfinished');
    const expected =
      summary.score / 10 + 20 * summary.correct + 3 * summary.bestStreak + 10 + scoutTierXp(summary);
    expect(xpForScoutRun(summary)).toBe(Math.round(expected));
    expect(finalizeScoutRun(run)?.xp).toBe(xpForScoutRun(summary));
  });

  it('rises with score and with correct count', () => {
    const low = summarizeScoutRun(standardRun({ totalScore: 1000 }));
    const high = summarizeScoutRun(standardRun({ id: 'b', totalScore: 9000 }));
    if (!low || !high) throw new Error('unfinished');
    expect(xpForScoutRun(high)).toBeGreaterThan(xpForScoutRun(low));

    const fewer = summarizeScoutRun(
      makeScoutRun({ id: 'c', totalScore: 0, rounds: [{ shape: 'won' }, { shape: 'lost' }] }),
    );
    const more = summarizeScoutRun(
      makeScoutRun({ id: 'd', totalScore: 0, rounds: [{ shape: 'won' }, { shape: 'won' }] }),
    );
    if (!fewer || !more) throw new Error('unfinished');
    expect(xpForScoutRun(more)).toBeGreaterThan(xpForScoutRun(fewer));
  });

  it('pays more for naming a deep cut than a household name', () => {
    const star = summarizeScoutRun(
      makeScoutRun({ id: 'star', totalScore: 0, rounds: [{ shape: 'won', fame: 95 }] }),
    );
    const deep = summarizeScoutRun(
      makeScoutRun({ id: 'deep', totalScore: 0, rounds: [{ shape: 'won', fame: 10 }] }),
    );
    if (!star || !deep) throw new Error('unfinished');
    expect(xpForScoutRun(deep) - xpForScoutRun(star)).toBe(SCOUT_TIER_XP.deepCut - SCOUT_TIER_XP.star);
    expect(SCOUT_TIER_XP.deepCut).toBeGreaterThan(SCOUT_TIER_XP.rotation);
    expect(SCOUT_TIER_XP.rotation).toBeGreaterThan(SCOUT_TIER_XP.starter);
    expect(scoutTierHardness('deepCut')).toBeGreaterThan(scoutTierHardness('star'));
  });

  it('prices the harder session formats higher', () => {
    expect(SCOUT_FORMAT_XP_BONUS.gauntlet).toBeGreaterThan(SCOUT_FORMAT_XP_BONUS.standard);
    expect(SCOUT_FORMAT_XP_BONUS.blitz).toBeGreaterThan(SCOUT_FORMAT_XP_BONUS.standard);
    expect(scoutFormatXpBonus('survival')).toBe(SCOUT_FORMAT_XP_BONUS.survival);
    const blitz = summarizeScoutRun(blitzRun(5, 1));
    const gauntlet = summarizeScoutRun(gauntletRun(1));
    if (!blitz || !gauntlet) throw new Error('unfinished');
    expect(xpForScoutRun(blitz)).toBeGreaterThan(0);
    expect(xpForScoutRun(gauntlet)).toBeGreaterThan(0);
  });

  it('never pays negative xp, and never pays for nothing but a finish', () => {
    const empty = summarizeScoutRun(
      makeScoutRun({ id: 'e', totalScore: 0, rounds: [{ shape: 'lost' }], bestStreak: 0 }),
    );
    if (!empty) throw new Error('unfinished');
    expect(xpForScoutRun(empty)).toBe(SCOUT_FORMAT_XP_BONUS.standard);
  });

  it('refuses to finalise an unfinished run', () => {
    expect(finalizeScoutRun(makeScoutRun({ status: 'playing' }))).toBeNull();
  });
});
