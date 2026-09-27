import { describe, expect, it } from 'vitest';
import {
  BASE_POINTS,
  CLOSE_BONUS,
  EXACT_BONUS,
  closenessPoints,
  eliminationCasualty,
  priceIsRightWinner,
  scoreGuess,
  speedFraction,
  streakFactor,
  verdictFor,
} from './scoring';
import type { PriceScoreInput } from './types';

function input(over: Partial<PriceScoreInput> = {}): PriceScoreInput {
  return {
    guess: 100,
    answer: 100,
    scoring: 'closeness',
    timer: 0,
    elapsedMs: 0,
    speedBonus: false,
    streak: 0,
    streakMultiplier: false,
    hintsUsed: 0,
    ...over,
  };
}

describe('closenessPoints', () => {
  it('pays full points for a perfect guess', () => {
    expect(closenessPoints(0)).toBe(BASE_POINTS);
  });

  it('pays nothing once the guess is 100% or more out', () => {
    expect(closenessPoints(1)).toBe(0);
    expect(closenessPoints(2)).toBe(0);
    expect(closenessPoints(Infinity)).toBe(0);
  });

  it('falls away faster than linear — the point of the 1.5 exponent', () => {
    // a linear curve would pay 500 at 50% out; the curve pays materially less
    expect(closenessPoints(0.5)).toBeLessThan(400);
    expect(closenessPoints(0.5)).toBeGreaterThan(300);
  });

  it('still rewards a near miss generously', () => {
    expect(closenessPoints(0.1)).toBeGreaterThan(800);
  });

  it('decreases monotonically as error grows', () => {
    let prev = Infinity;
    for (const e of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const p = closenessPoints(e);
      expect(p).toBeLessThan(prev);
      prev = p;
    }
  });

  it('never returns a negative score', () => {
    expect(closenessPoints(-1)).toBe(0);
    expect(closenessPoints(NaN)).toBe(0);
  });
});

describe('speedFraction', () => {
  it('pays nothing when the round is untimed', () => {
    expect(speedFraction(0, 0)).toBe(0);
  });

  it('pays the maximum for an instant answer', () => {
    expect(speedFraction(0, 20)).toBeCloseTo(0.25);
  });

  it('pays nothing at the buzzer', () => {
    expect(speedFraction(20_000, 20)).toBe(0);
    expect(speedFraction(999_999, 20)).toBe(0);
  });

  it('is linear in between', () => {
    expect(speedFraction(10_000, 20)).toBeCloseTo(0.125);
  });
});

describe('streakFactor', () => {
  it('is neutral when disabled or below a streak of two', () => {
    expect(streakFactor(10, false)).toBe(1);
    expect(streakFactor(0, true)).toBe(1);
    expect(streakFactor(1, true)).toBe(1);
  });

  it('ramps 5% per step', () => {
    expect(streakFactor(2, true)).toBeCloseTo(1.05);
    expect(streakFactor(3, true)).toBeCloseTo(1.1);
  });

  it('caps at +50%', () => {
    expect(streakFactor(100, true)).toBeCloseTo(1.5);
  });
});

describe('verdictFor', () => {
  it('grades by relative error', () => {
    expect(verdictFor(100, 100, false)).toBe('exact');
    expect(verdictFor(103, 100, false)).toBe('close');
    expect(verdictFor(150, 100, false)).toBe('wide');
  });

  it('calls any overbid "over" under Price Is Right, however small', () => {
    expect(verdictFor(101, 100, true)).toBe('over');
    expect(verdictFor(100.01, 100, true)).toBe('over');
    expect(verdictFor(100, 100, true)).toBe('exact');
  });

  it('does not penalise going over under normal scoring', () => {
    expect(verdictFor(101, 100, false)).toBe('exact');
  });
});

describe('scoreGuess', () => {
  it('awards base plus the exact bonus for a perfect guess', () => {
    const s = scoreGuess(input());
    expect(s.base).toBe(BASE_POINTS);
    expect(s.accuracyBonus).toBe(EXACT_BONUS);
    expect(s.total).toBe(BASE_POINTS + EXACT_BONUS);
  });

  it('awards the smaller bonus for a close guess', () => {
    expect(scoreGuess(input({ guess: 103 })).accuracyBonus).toBe(CLOSE_BONUS);
  });

  it('awards no accuracy bonus for a wide guess', () => {
    expect(scoreGuess(input({ guess: 150 })).accuracyBonus).toBe(0);
  });

  it('scores a Price Is Right overbid as exactly zero', () => {
    const s = scoreGuess(input({ guess: 101, scoring: 'priceIsRight' }));
    expect(s.verdict).toBe('over');
    expect(s.total).toBe(0);
    expect(s.base).toBe(0);
  });

  it('cannot rescue an overbid with speed or streak bonuses', () => {
    const s = scoreGuess(
      input({
        guess: 101,
        scoring: 'priceIsRight',
        timer: 20,
        elapsedMs: 0,
        speedBonus: true,
        streak: 10,
        streakMultiplier: true,
      }),
    );
    expect(s.total).toBe(0);
  });

  it('pays an underbid normally under Price Is Right', () => {
    expect(scoreGuess(input({ guess: 99, scoring: 'priceIsRight' })).total).toBeGreaterThan(0);
  });

  it('applies the streak multiplier after the bonuses', () => {
    const plain = scoreGuess(input());
    const streaked = scoreGuess(input({ streak: 3, streakMultiplier: true }));
    expect(streaked.total).toBe(Math.round(plain.total * 1.1));
  });

  it('subtracts a hint penalty', () => {
    const none = scoreGuess(input());
    const hinted = scoreGuess(input({ hintsUsed: 2 }));
    expect(hinted.hintPenalty).toBe(300);
    expect(hinted.total).toBe(none.total - 300);
  });

  it('never returns a negative total, however many hints were bought', () => {
    expect(scoreGuess(input({ guess: 180, hintsUsed: 9 })).total).toBe(0);
  });

  it('scores a hopeless guess as zero rather than negative', () => {
    expect(scoreGuess(input({ guess: 10_000 })).total).toBe(0);
  });

  it('treats a non-finite guess as wide, not as a crash', () => {
    const s = scoreGuess(input({ guess: NaN }));
    expect(s.total).toBe(0);
    expect(s.verdict).toBe('wide');
  });

  it('handles a zero answer without dividing by zero', () => {
    expect(scoreGuess(input({ guess: 0, answer: 0 })).total).toBe(BASE_POINTS + EXACT_BONUS);
    expect(scoreGuess(input({ guess: 5, answer: 0 })).total).toBe(0);
  });
});

describe('priceIsRightWinner', () => {
  const g = (playerId: string, value: number) => ({ playerId, value });

  it('picks the closest guess that did not go over', () => {
    const won = priceIsRightWinner([g('a', 80), g('b', 99), g('c', 101)], 100);
    expect(won?.playerId).toBe('b');
  });

  it('returns null when every player overbid', () => {
    expect(priceIsRightWinner([g('a', 120), g('b', 101)], 100)).toBeNull();
  });

  it('accepts an exact guess as the winner', () => {
    expect(priceIsRightWinner([g('a', 100), g('b', 99)], 100)?.playerId).toBe('a');
  });

  it('ignores non-finite guesses', () => {
    expect(priceIsRightWinner([g('a', NaN), g('b', 50)], 100)?.playerId).toBe('b');
  });

  it('returns null for an empty field', () => {
    expect(priceIsRightWinner([], 100)).toBeNull();
  });
});

describe('eliminationCasualty', () => {
  const g = (playerId: string, value: number) => ({ playerId, value });

  it('knocks out the furthest-out player', () => {
    expect(eliminationCasualty([g('a', 95), g('b', 500)], 100)?.playerId).toBe('b');
  });

  it('keeps everyone when the worst is tied — a coincidence should not gut the room', () => {
    expect(eliminationCasualty([g('a', 50), g('b', 150)], 100)).toBeNull();
  });

  it('never eliminates the last player standing', () => {
    expect(eliminationCasualty([g('a', 9999)], 100)).toBeNull();
    expect(eliminationCasualty([], 100)).toBeNull();
  });

  it('measures distance relatively, not absolutely', () => {
    // 'b' is 40 away but on a large answer; 'a' is 9 away on the same answer scale
    const out = eliminationCasualty([g('a', 91), g('b', 60)], 100);
    expect(out?.playerId).toBe('b');
  });
});
