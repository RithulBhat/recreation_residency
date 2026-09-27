import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { DEFAULT_SETTINGS, PARTY_PLAYERS, reconcile } from './settings';
import {
  availablePowerUps,
  BASE_POINTS,
  chainLength,
  correctPick,
  createInitialState,
  currentPair,
  reduce,

  streakFactor,
} from './engine';
import type { HiloSettings, HiloState } from './types';

function item(id: string, value: number): ContentItem {
  return {
    id,
    name: id,
    emoji: '🌍',
    category: 'c',
    value,
    unit: 'count',
    source: 's',
    asOf: '2026-09-27',
    verified: true,
  };
}

const POOL: ContentItem[] = Array.from({ length: 80 }, (_, i) =>
  item(`i${i}`, Math.round(100 * Math.pow(1.15, i))),
);

function settings(over: Partial<HiloSettings> = {}): HiloSettings {
  return reconcile({ ...DEFAULT_SETTINGS, seed: 'test', ...over });
}

function started(over: Partial<HiloSettings> = {}): HiloState {
  return reduce(createInitialState(settings(over), POOL, createRng('test')), { type: 'start' });
}

/** Answer the live round correctly. */
function right(state: HiloState, elapsedMs = 0) {
  return reduce(state, { type: 'pick', pick: correctPick(state) ?? 'higher', elapsedMs });
}

/** Answer the live round wrongly. */
function wrong(state: HiloState) {
  const answer = correctPick(state);
  return reduce(state, { type: 'pick', pick: answer === 'higher' ? 'lower' : 'higher', elapsedMs: 0 });
}

describe('chainLength', () => {
  it('plans one more link than there are rounds', () => {
    expect(chainLength(settings({ format: 'rounds', rounds: 10 }))).toBe(11);
  });

  it('plans generously for timed and endless formats', () => {
    expect(chainLength(settings({ format: 'timed', duration: 60 }))).toBeGreaterThan(60);
    expect(chainLength(settings({ format: 'classic' }))).toBeGreaterThan(50);
  });
});

describe('createInitialState', () => {
  it('plans the whole chain before play', () => {
    const s = createInitialState(settings(), POOL, createRng('test'));
    expect(s.chain.length).toBeGreaterThan(1);
    expect(s.status).toBe('idle');
    expect(s.degradations).toHaveLength(s.chain.length);
  });

  it('finishes immediately rather than hanging on an empty pool', () => {
    const s = reduce(createInitialState(settings(), [], createRng('x')), { type: 'start' });
    expect(s.status).toBe('finished');
    expect(s.exhausted).toBe(true);
  });
});

describe('correctPick', () => {
  it('reads the direction of the live pair', () => {
    const s = started();
    const pair = currentPair(s);
    expect(pair).not.toBeNull();
    const expected = (pair?.to.value ?? 0) > (pair?.from.value ?? 0) ? 'higher' : 'lower';
    expect(correctPick(s)).toBe(expected);
  });

  it('answers "same" only when the format allows it and the values are close', () => {
    const tight = [item('a', 100), item('b', 100.5), item('c', 101)];
    const s = reduce(
      createInitialState(
        settings({ allowSame: true, sameTolerance: 0.05, difficulty: 'hard' }),
        tight,
        createRng('t'),
      ),
      { type: 'start' },
    );
    expect(correctPick(s)).toBe('same');
  });
});

describe('picking', () => {
  it('scores a correct pick and builds a streak', () => {
    const s = right(started());
    expect(s.status).toBe('revealing');
    expect(s.totalScore).toBeGreaterThan(0);
    expect(s.streak).toBe(1);
    expect(s.rounds[0].outcome).toBe('correct');
  });

  it('ends a classic run on the first mistake', () => {
    const s = wrong(started({ format: 'classic' }));
    expect(s.rounds[0].outcome).toBe('wrong');
    expect(s.livesLeft).toBe(0);
    expect(reduce(s, { type: 'next' }).status).toBe('finished');
  });

  it('spends one life per mistake in lives format', () => {
    let s = started({ format: 'lives', lives: 3 });
    s = wrong(s);
    expect(s.livesLeft).toBe(2);
    s = reduce(s, { type: 'next' });
    expect(s.status).toBe('playing');
  });

  it('resets the streak on a miss but keeps the best', () => {
    let s = started({ format: 'lives', lives: 3 });
    s = reduce(right(s), { type: 'next' });
    s = reduce(right(s), { type: 'next' });
    expect(s.streak).toBe(2);
    s = wrong(s);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it('ignores a pick outside a live round', () => {
    const revealing = right(started());
    expect(reduce(revealing, { type: 'pick', pick: 'higher', elapsedMs: 0 })).toBe(revealing);
  });
});

describe('streakFactor', () => {
  it('is neutral when the curve is off or the streak is short', () => {
    expect(streakFactor(10, 'off')).toBe(1);
    expect(streakFactor(1, 'steep')).toBe(1);
  });

  it('climbs faster on the steep curve and caps', () => {
    expect(streakFactor(5, 'steep')).toBeGreaterThan(streakFactor(5, 'gentle'));
    expect(streakFactor(999, 'gentle')).toBeCloseTo(1.6);
    expect(streakFactor(999, 'steep')).toBeCloseTo(3);
  });
});

describe('power-ups', () => {
  it('skip ends the round without costing a life or a streak reset', () => {
    let s = reduce(right(started({ format: 'lives', lives: 3 })), { type: 'next' });
    const before = s.livesLeft;
    s = reduce(s, { type: 'powerUp', powerUp: 'skip' });
    expect(s.rounds[1].outcome).toBe('skipped');
    expect(s.livesLeft).toBe(before);
    expect(s.powerUpsLeft).not.toContain('skip');
  });

  it('each power-up can only be spent once', () => {
    let s = started({ format: 'lives', lives: 3 });
    s = reduce(s, { type: 'powerUp', powerUp: 'peek' });
    const after = s;
    expect(reduce(after, { type: 'powerUp', powerUp: 'peek' })).toBe(after);
  });

  it('double down doubles a win', () => {
    const plain = right(started({ format: 'lives', lives: 3 }));
    let s = started({ format: 'lives', lives: 3 });
    s = reduce(s, { type: 'powerUp', powerUp: 'doubleDown' });
    s = right(s);
    expect(s.totalScore).toBe(plain.totalScore * 2);
  });

  it('double down costs two lives on a miss', () => {
    let s = started({ format: 'lives', lives: 3 });
    s = reduce(s, { type: 'powerUp', powerUp: 'doubleDown' });
    s = wrong(s);
    expect(s.livesLeft).toBe(1);
  });

  it('does not leave double down armed for the next round', () => {
    let s = started({ format: 'lives', lives: 3 });
    s = reduce(s, { type: 'powerUp', powerUp: 'doubleDown' });
    s = reduce(right(s), { type: 'next' });
    expect(s.pendingDouble).toBe(false);
    const plain = right(s);
    expect(plain.rounds[1].doubled).toBe(false);
  });

  it('refuses a power-up the settings disabled', () => {
    const s = started({ format: 'lives', lives: 3, powerUps: ['skip'] });
    expect(reduce(s, { type: 'powerUp', powerUp: 'peek' })).toBe(s);
  });

  it('withholds double down when there is only one life to risk', () => {
    // with one life a miss already ends the run, so doubling would be pure upside
    const classic = started({ format: 'classic' });
    expect(availablePowerUps(classic)).not.toContain('doubleDown');
    expect(reduce(classic, { type: 'powerUp', powerUp: 'doubleDown' })).toBe(classic);
  });

  it('keeps the double down preference through a format that cannot use it', () => {
    // reconcile must not destroy a stored preference just because the current format bans it
    const classic = settings({ format: 'classic' });
    expect(classic.powerUps).toContain('doubleDown');
    expect(settings({ format: 'lives', lives: 3 }).powerUps).toContain('doubleDown');
  });
});

describe('timed format', () => {
  it('counts down and ends at zero', () => {
    let s = started({ format: 'timed', duration: 15 });
    expect(s.msLeft).toBe(15_000);
    s = reduce(s, { type: 'tick', ms: 14_000 });
    expect(s.status).toBe('playing');
    s = reduce(s, { type: 'tick', ms: 2_000 });
    expect(s.msLeft).toBe(0);
    expect(s.status).toBe('finished');
  });

  it('ignores ticks in formats without a clock', () => {
    const s = started({ format: 'classic' });
    expect(reduce(s, { type: 'tick', ms: 5000 })).toBe(s);
  });
});

describe('fixed rounds', () => {
  it('finishes after exactly the configured number of rounds', () => {
    let s = started({ format: 'rounds', rounds: 5 });
    for (let i = 0; i < 5; i++) s = reduce(right(s), { type: 'next' });
    expect(s.status).toBe('finished');
    expect(s.rounds).toHaveLength(5);
  });

  it('keeps going after a miss, since a round format is not elimination', () => {
    let s = started({ format: 'rounds', rounds: 5, lives: 5 });
    s = reduce(wrong(s), { type: 'next' });
    expect(s.status).toBe('playing');
  });
});

describe('timeout', () => {
  it('ends the round as a miss', () => {
    const s = reduce(started({ format: 'lives', lives: 3, timer: 10 }), { type: 'timeout' });
    expect(s.rounds[0].outcome).toBe('timeout');
    expect(s.livesLeft).toBe(2);
  });
});

describe('sudden death', () => {
  it('seats two players and ends on the first mistake', () => {
    const s = started({ format: 'suddenDeath', players: PARTY_PLAYERS.slice(0, 2) });
    expect(s.settings.players).toHaveLength(2);
    const lost = wrong(s);
    expect(lost.livesLeft).toBe(0);
  });
});

describe('purity and determinism', () => {
  it('never mutates the state it was given', () => {
    const s = started();
    const snapshot = JSON.parse(JSON.stringify(s));
    right(s);
    reduce(s, { type: 'powerUp', powerUp: 'skip' });
    reduce(s, { type: 'timeout' });
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });

  it('plays out identically from the same seed', () => {
    const run = () => {
      let s = started({ format: 'rounds', rounds: 6 });
      for (let i = 0; i < 6; i++) s = reduce(right(s), { type: 'next' });
      return s.totalScore;
    };
    expect(run()).toBe(run());
  });

  it('ignores an unknown action', () => {
    const s = started();
    expect(reduce(s, { type: 'nope' } as unknown as Parameters<typeof reduce>[1])).toBe(s);
  });

  it('records how far the pairing had to relax, so awkward rounds are visible', () => {
    const s = right(started());
    expect(typeof s.rounds[0].degraded).toBe('number');
  });
});

describe('scoring', () => {
  it('pays the base rate for the first correct answer', () => {
    expect(right(started()).totalScore).toBe(BASE_POINTS);
  });

  it('pays more as the streak builds', () => {
    let s = started({ format: 'rounds', rounds: 6, streakCurve: 'steep' });
    const scores: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = right(s);
      scores.push(s.rounds[s.rounds.length - 1].score);
      s = reduce(s, { type: 'next' });
    }
    expect(scores[3]).toBeGreaterThan(scores[0]);
  });
});
