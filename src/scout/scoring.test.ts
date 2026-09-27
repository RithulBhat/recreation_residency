import { describe, expect, it } from 'vitest';
import { scoreGuess } from '@/game/scoring';
import { BLITZ_RUNG } from './formats';
import {
  FORMAT_SCORE_PROFILES,
  MODE_WEIGHTS,
  SURVIVAL_DEPTH_MAX,
  formatProfile,
  formatWeight,
  maxScoutScore,
  modeWeight,
  scoreScoutRound,
  scoutStreakBonusFraction,
  streakBonusFraction,
  survivalDepthFraction,
} from './scoring';
import type { ScoutFormat, ScoutMode } from './types';

const MODES = Object.keys(MODE_WEIGHTS) as ScoutMode[];

function total(over: Partial<Parameters<typeof scoreScoutRound>[0]> = {}): number {
  return scoreScoutRound({ mode: 'silhouette', tryIndex: 0, elapsedMs: 5000, streak: 0, ...over }).total;
}

describe('scoreScoutRound', () => {
  it('pays strictly more for an earlier rung, in every mode', () => {
    for (const mode of MODES) {
      let prev = Infinity;
      for (let tryIndex = 0; tryIndex < 6; tryIndex++) {
        const score = total({ mode, tryIndex });
        expect(score).toBeLessThan(prev);
        prev = score;
      }
    }
  });

  it('prices the zoom modes as the hardest and the logo as the easiest', () => {
    expect(modeWeight('faceZoom')).toBeGreaterThan(modeWeight('silhouette'));
    expect(modeWeight('silhouette')).toBeGreaterThan(modeWeight('highlight'));
    expect(modeWeight('highlight')).toBeGreaterThan(modeWeight('statLine'));
    expect(modeWeight('statLine')).toBeGreaterThan(modeWeight('careerPath'));
    expect(modeWeight('careerPath')).toBeGreaterThan(modeWeight('teamTrivia'));
    expect(modeWeight('teamTrivia')).toBeGreaterThan(modeWeight('logoZoom'));
    expect(total({ mode: 'faceZoom' })).toBeGreaterThan(total({ mode: 'logoZoom' }));
  });

  it('adds a speed bonus that decays with time', () => {
    const fast = total({ elapsedMs: 0 });
    const mid = total({ elapsedMs: 10_000 });
    const slow = total({ elapsedMs: 60_000 });
    expect(fast).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(slow);
    const breakdown = scoreScoutRound({ mode: 'silhouette', tryIndex: 0, elapsedMs: 0, streak: 0 });
    expect(breakdown.timeBonus).toBeGreaterThan(0);
    expect(breakdown.timeBonus / (breakdown.base * breakdown.tryFactor * breakdown.modeWeight)).toBeCloseTo(0.25, 2);
  });

  it('adds a streak bonus capped at 50%', () => {
    expect(total({ streak: 3 })).toBeGreaterThan(total({ streak: 0 }));
    expect(total({ streak: 10 })).toBe(total({ streak: 99 }));
    const b = scoreScoutRound({ mode: 'silhouette', tryIndex: 0, elapsedMs: 0, streak: 99 });
    expect(b.streakBonus / (b.base * b.tryFactor * b.modeWeight)).toBeCloseTo(0.5, 2);
  });

  it('subtracts 15% per hint and never goes below zero', () => {
    const none = total({ hintsUsed: 0 });
    const one = total({ hintsUsed: 1 });
    expect(one).toBeLessThan(none);
    expect(total({ hintsUsed: 99 })).toBeGreaterThanOrEqual(0);
    expect(total({ hintsUsed: -5 })).toBe(none);
  });

  it('returns a complete breakdown', () => {
    const b = scoreScoutRound({ mode: 'highlight', tryIndex: 1, elapsedMs: 4000, streak: 2, hintsUsed: 1 });
    expect(b.base).toBe(1000);
    expect(b.tryFactor).toBe(0.8);
    expect(b.modeWeight).toBe(1);
    expect(Number.isInteger(b.total)).toBe(true);
    expect(Number.isInteger(b.timeBonus)).toBe(true);
    expect(Number.isInteger(b.streakBonus)).toBe(true);
    expect(Number.isInteger(b.hintPenalty)).toBe(true);
  });

  it('stays in the same league as Songooner so the two games compare', () => {
    const scout = total({ mode: 'silhouette', tryIndex: 0, elapsedMs: 5000 });
    const song = scoreGuess({ clipLength: 0.5, tryIndex: 0, tries: 5, elapsedMs: 5000, hintsUsed: 0, streak: 0 }).total;
    expect(scout).toBeGreaterThan(song * 0.5);
    expect(scout).toBeLessThan(song * 3);
  });

  it('maxScoutScore is the rung-0 ceiling', () => {
    for (const mode of MODES) {
      expect(maxScoutScore(mode)).toBeGreaterThanOrEqual(total({ mode, tryIndex: 0, elapsedMs: 0, streak: 10 }));
      expect(maxScoutScore(mode)).toBeGreaterThan(total({ mode, tryIndex: 3 }));
    }
  });

  it('survives nonsense input', () => {
    expect(total({ tryIndex: -3 })).toBe(total({ tryIndex: 0 }));
    expect(total({ tryIndex: 99 })).toBe(total({ tryIndex: 5 }));
    expect(total({ elapsedMs: Number.NaN })).toBeGreaterThan(0);
    expect(total({ streak: Number.NaN })).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Session formats
// ---------------------------------------------------------------------------------------------

const FORMATS = Object.keys(FORMAT_SCORE_PROFILES) as ScoutFormat[];

describe('format scoring', () => {
  it('standard is the identity — the pre-format numbers, to the point', () => {
    for (const mode of MODES) {
      for (const tryIndex of [0, 2, 5]) {
        const bare = scoreScoutRound({ mode, tryIndex, elapsedMs: 4000, streak: 3 });
        const named = scoreScoutRound({ mode, tryIndex, elapsedMs: 4000, streak: 3, format: 'standard' });
        expect(named).toEqual(bare);
        expect(bare.formatWeight).toBe(1);
        expect(bare.depthBonus).toBe(0);
      }
    }
    expect(formatWeight('standard')).toBe(1);
    expect(scoutStreakBonusFraction(5, 'standard')).toBe(streakBonusFraction(5));
    expect(scoutStreakBonusFraction(99, 'standard')).toBe(streakBonusFraction(99));
  });

  it('has a profile for every format, and falls back to standard for nonsense', () => {
    for (const format of FORMATS) {
      const p = FORMAT_SCORE_PROFILES[format];
      expect(p.weight).toBeGreaterThan(0);
      expect(p.streakStep).toBeGreaterThan(0);
      expect(p.streakMax).toBeGreaterThanOrEqual(p.streakStep);
    }
    expect(formatProfile(undefined)).toBe(FORMAT_SCORE_PROFILES.standard);
    expect(formatProfile('nope' as ScoutFormat)).toBe(FORMAT_SCORE_PROFILES.standard);
    expect(formatWeight('nope' as ScoutFormat)).toBe(1);
  });

  it('never pays a negative or non-integer total, in any format', () => {
    for (const format of FORMATS) {
      for (const mode of MODES) {
        const b = scoreScoutRound({ mode, tryIndex: 3, elapsedMs: 9000, streak: 4, hintsUsed: 9, format, depth: 5 });
        expect(b.total).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(b.total)).toBe(true);
        expect(Number.isInteger(b.depthBonus)).toBe(true);
      }
    }
  });

  it('still pays strictly more for an earlier rung in every format', () => {
    for (const format of FORMATS) {
      let prev = Infinity;
      for (let tryIndex = 0; tryIndex < 6; tryIndex++) {
        const score = total({ format, tryIndex });
        expect(score).toBeLessThan(prev);
        prev = score;
      }
    }
  });

  it('blitz pays less per subject but much more for a streak', () => {
    const blitzOne = total({ format: 'blitz', streak: 0 });
    const standardOne = total({ format: 'standard', streak: 0 });
    expect(blitzOne).toBeLessThan(standardOne);
    expect(scoutStreakBonusFraction(10, 'blitz')).toBeGreaterThan(scoutStreakBonusFraction(10, 'standard'));
    expect(total({ format: 'blitz', streak: 12 })).toBeGreaterThan(total({ format: 'standard', streak: 12 }));
    // the streak bonus is still capped
    expect(total({ format: 'blitz', streak: 13 })).toBe(total({ format: 'blitz', streak: 500 }));
  });

  it('survival pays more the deeper the run gets, and caps the escalation', () => {
    const shallow = total({ format: 'survival', depth: 0 });
    const mid = total({ format: 'survival', depth: 5 });
    const deep = total({ format: 'survival', depth: 10 });
    expect(mid).toBeGreaterThan(shallow);
    expect(deep).toBeGreaterThan(mid);
    expect(total({ format: 'survival', depth: 10 })).toBe(total({ format: 'survival', depth: 99 }));
    expect(survivalDepthFraction(0)).toBe(0);
    expect(survivalDepthFraction(3)).toBeCloseTo(0.3, 5);
    expect(survivalDepthFraction(-4)).toBe(0);
    expect(survivalDepthFraction(Number.NaN)).toBe(0);
    expect(survivalDepthFraction(1000)).toBe(SURVIVAL_DEPTH_MAX);
    // depth is survival's alone
    expect(total({ format: 'standard', depth: 20 })).toBe(total({ format: 'standard', depth: 0 }));
    expect(total({ format: 'blitz', depth: 20 })).toBe(total({ format: 'blitz', depth: 0 }));
  });

  it('pays a small premium for the gauntlet, where the pool cannot be cherry-picked', () => {
    expect(formatWeight('gauntlet')).toBeGreaterThan(1);
    expect(total({ format: 'gauntlet' })).toBeGreaterThan(total({ format: 'standard' }));
  });

  it('scores duel and party exactly like standard — the split is per player, not per point', () => {
    for (const format of ['duel', 'party'] as const) {
      expect(total({ format })).toBe(total({ format: 'standard' }));
    }
  });

  it('keeps every format in the same league as Songooner', () => {
    const song = scoreGuess({ clipLength: 0.5, tryIndex: 0, tries: 5, elapsedMs: 5000, hintsUsed: 0, streak: 0 }).total;
    for (const format of FORMATS) {
      for (const mode of MODES) {
        const scout = total({ format, mode, tryIndex: 0, elapsedMs: 5000, streak: 0 });
        expect(scout).toBeGreaterThan(song * 0.4);
        expect(scout).toBeLessThan(song * 3);
      }
    }
  });

  it('a whole run of any format lands in the same few-thousand band', () => {
    // ten rounds at a middling rung, a warm streak, for each format
    const runTotal = (format: ScoutFormat): number => {
      let sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += scoreScoutRound({ mode: 'silhouette', tryIndex: 1, elapsedMs: 6000, streak: i, format, depth: i }).total;
      }
      return sum;
    };
    const totals = FORMATS.map(runTotal);
    const lo = Math.min(...totals);
    const hi = Math.max(...totals);
    expect(lo).toBeGreaterThan(5_000);
    expect(hi).toBeLessThan(60_000);
    expect(hi / lo).toBeLessThan(3);
  });

  it('maxScoutScore reads the best rung each format can reach', () => {
    for (const mode of MODES) {
      expect(maxScoutScore(mode)).toBe(maxScoutScore(mode, 'standard'));
      for (const format of FORMATS) {
        // blitz's best rung is the fixed one it always plays; every other format can reach rung 0
        const bestRung = format === 'blitz' ? BLITZ_RUNG : 0;
        const ceiling = maxScoutScore(mode, format);
        expect(ceiling).toBeGreaterThan(0);
        expect(ceiling).toBeGreaterThanOrEqual(
          total({ mode, format, tryIndex: bestRung, elapsedMs: 0, streak: 30, depth: 30 }),
        );
        expect(ceiling).toBeGreaterThan(total({ mode, format, tryIndex: bestRung + 2 }));
      }
      // blitz never plays rung 0, so its ceiling is the fixed rung's
      expect(maxScoutScore(mode, 'blitz')).toBeLessThan(maxScoutScore(mode, 'standard'));
    }
  });
});
