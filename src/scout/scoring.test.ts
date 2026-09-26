import { describe, expect, it } from 'vitest';
import { scoreGuess } from '@/game/scoring';
import { MODE_WEIGHTS, maxScoutScore, modeWeight, scoreScoutRound } from './scoring';
import type { ScoutMode } from './types';

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
