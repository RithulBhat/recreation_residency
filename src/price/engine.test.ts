import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { DEFAULT_SETTINGS, PARTY_PLAYERS, SOLO_PLAYER, reconcile } from './settings';
import {
  createInitialState,
  ladderFeedback,
  pendingPlayers,
  reduce,
  reduceAll,
  selectItems,
} from './engine';
import type { PriceSettings, PriceState } from './types';

function item(id: string, value: number): ContentItem {
  return {
    id,
    name: id,
    emoji: '📦',
    category: 'test',
    value,
    unit: 'usd',
    source: 'test',
    asOf: '2026-09-27',
    verified: false,
  };
}

const ITEMS = [item('a', 100), item('b', 200), item('c', 300)];

function settings(over: Partial<PriceSettings> = {}): PriceSettings {
  return reconcile({ ...DEFAULT_SETTINGS, rounds: 3, ...over });
}

function started(over: Partial<PriceSettings> = {}): PriceState {
  return reduce(createInitialState(settings(over), ITEMS), { type: 'start' });
}

const guess = (value: number, playerId = SOLO_PLAYER.id, elapsedMs = 0) =>
  ({ type: 'guess', playerId, value, elapsedMs }) as const;

describe('createInitialState', () => {
  it('builds one round per item, capped at the round count', () => {
    const s = createInitialState(settings({ rounds: 2 }), ITEMS);
    expect(s.rounds).toHaveLength(2);
    expect(s.status).toBe('idle');
    expect(s.totalScore).toBe(0);
  });

  it('finishes immediately rather than hanging when there is no content', () => {
    const s = reduce(createInitialState(settings(), []), { type: 'start' });
    expect(s.status).toBe('finished');
  });
});

describe('selectItems', () => {
  it('is deterministic for a seed — the basis of daily and duel fairness', () => {
    const a = selectItems(ITEMS, settings({ seed: 'day' }), createRng('day'));
    const b = selectItems(ITEMS, settings({ seed: 'day' }), createRng('day'));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it('never returns more rounds than asked for', () => {
    expect(selectItems(ITEMS, settings({ rounds: 2 }), createRng('s'))).toHaveLength(2);
  });
});

describe('guessing', () => {
  it('scores a correct guess and advances the streak', () => {
    const s = reduce(started(), guess(100));
    expect(s.status).toBe('revealing');
    expect(s.totalScore).toBeGreaterThan(0);
    expect(s.streak).toBe(1);
    expect(s.rounds[0].verdict).toBe('exact');
  });

  it('resets the streak on a wide guess', () => {
    let s = reduce(started(), guess(100));
    s = reduce(s, { type: 'next' });
    s = reduce(s, guess(9999));
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  it('ignores a guess before the game has started', () => {
    const idle = createInitialState(settings(), ITEMS);
    expect(reduce(idle, guess(100))).toBe(idle);
  });

  it('ignores a guess once the round is revealing', () => {
    const revealing = reduce(started(), guess(100));
    expect(reduce(revealing, guess(50))).toBe(revealing);
  });

  it('rejects a negative or non-finite guess rather than scoring it', () => {
    const s = started();
    expect(reduce(s, guess(-1))).toBe(s);
    expect(reduce(s, guess(NaN))).toBe(s);
  });

  it('allows a player only one sealed guess per round outside ladder mode', () => {
    const s = reduce(started(), guess(90));
    // the round already resolved for a solo game, so a second guess is a no-op either way
    expect(reduce(s, guess(100))).toBe(s);
  });

  it('waits for every player before resolving a party round', () => {
    const players = PARTY_PLAYERS.slice(0, 3);
    let s = started({ players, rounds: 3 });
    s = reduce(s, guess(90, players[0].id));
    expect(s.status).toBe('playing');
    expect(pendingPlayers(s)).toHaveLength(2);
    s = reduce(s, guess(110, players[1].id));
    expect(s.status).toBe('playing');
    s = reduce(s, guess(105, players[2].id));
    expect(s.status).toBe('revealing');
  });

  it('scores a party round on the closest guess', () => {
    const players = PARTY_PLAYERS.slice(0, 2);
    let s = started({ players });
    s = reduce(s, guess(500, players[0].id));
    s = reduce(s, guess(100, players[1].id));
    expect(s.rounds[0].verdict).toBe('exact');
  });
});

describe('ladder input', () => {
  const ladder = (over: Partial<PriceSettings> = {}) =>
    started({ input: 'ladder', ladderTries: 3, ladderTolerance: 0.05, ...over });

  it('tells the player which way to move', () => {
    expect(ladderFeedback(50, 100, 0.05)).toBe('higher');
    expect(ladderFeedback(150, 100, 0.05)).toBe('lower');
    expect(ladderFeedback(102, 100, 0.05)).toBe('hit');
  });

  it('keeps the round open across several guesses', () => {
    let s = ladder();
    s = reduce(s, guess(50));
    expect(s.status).toBe('playing');
    expect(s.rounds[0].guesses[0].feedback).toBe('higher');
    s = reduce(s, guess(500));
    expect(s.status).toBe('playing');
    expect(s.rounds[0].guesses[1].feedback).toBe('lower');
  });

  it('ends the round on a hit', () => {
    const s = reduceAll(ladder(), [guess(50), guess(101)]);
    expect(s.status).toBe('revealing');
    expect(s.totalScore).toBeGreaterThan(0);
  });

  it('ends the round when the tries run out', () => {
    const s = reduceAll(ladder(), [guess(10), guess(20), guess(30)]);
    expect(s.status).toBe('revealing');
    expect(s.rounds[0].guesses).toHaveLength(3);
  });

  it('never records more guesses than the configured tries', () => {
    const s = reduceAll(ladder(), [guess(10), guess(20), guess(30), guess(40), guess(50)]);
    expect(s.rounds[0].guesses).toHaveLength(3);
  });
});

describe('hints', () => {
  it('records a hint and charges for it at reveal', () => {
    const plain = reduce(started(), guess(100));
    let s = started();
    s = reduce(s, { type: 'hint', hint: 'bracket' });
    s = reduce(s, guess(100));
    expect(s.rounds[0].hintsUsed).toEqual(['bracket']);
    expect(s.totalScore).toBeLessThan(plain.totalScore);
  });

  it('will not charge twice for the same hint', () => {
    let s = started();
    s = reduce(s, { type: 'hint', hint: 'bracket' });
    s = reduce(s, { type: 'hint', hint: 'bracket' });
    expect(s.rounds[0].hintsUsed).toHaveLength(1);
  });

  it('refuses a hint the settings disabled', () => {
    const s = started({ hints: ['category'] });
    expect(reduce(s, { type: 'hint', hint: 'firstDigit' })).toBe(s);
  });
});

describe('timeout and skip', () => {
  it('scores a guess already on the board when the clock runs out', () => {
    const players = PARTY_PLAYERS.slice(0, 2);
    let s = started({ players, timer: 20 });
    s = reduce(s, guess(100, players[0].id));
    s = reduce(s, { type: 'timeout' });
    expect(s.status).toBe('revealing');
    expect(s.totalScore).toBeGreaterThan(0);
  });

  it('scores nothing when the clock runs out with no guess at all', () => {
    const s = reduce(started({ timer: 20 }), { type: 'timeout' });
    expect(s.rounds[0].verdict).toBe('timeout');
    expect(s.totalScore).toBe(0);
  });

  it('a skip scores nothing and breaks the streak', () => {
    let s = reduce(started(), guess(100));
    s = reduce(s, { type: 'next' });
    s = reduce(s, { type: 'skip' });
    expect(s.rounds[1].verdict).toBe('skipped');
    expect(s.streak).toBe(0);
  });
});

describe('round flow', () => {
  it('advances through every round and finishes', () => {
    let s = started();
    for (let i = 0; i < 3; i++) {
      s = reduce(s, guess(s.rounds[i].item.value));
      s = reduce(s, { type: 'next' });
    }
    expect(s.status).toBe('finished');
    expect(s.bestStreak).toBe(3);
  });

  it('ignores next while a round is still being played', () => {
    const s = started();
    expect(reduce(s, { type: 'next' })).toBe(s);
  });

  it('finish is always available', () => {
    expect(reduce(started(), { type: 'finish' }).status).toBe('finished');
  });
});

describe('Price Is Right', () => {
  it('scores an overbid as zero and breaks the streak', () => {
    const s = reduce(started({ scoring: 'priceIsRight' }), guess(101));
    expect(s.rounds[0].verdict).toBe('over');
    expect(s.totalScore).toBe(0);
    expect(s.streak).toBe(0);
  });

  it('pays an underbid', () => {
    expect(reduce(started({ scoring: 'priceIsRight' }), guess(99)).totalScore).toBeGreaterThan(0);
  });
});

describe('elimination', () => {
  const players = PARTY_PLAYERS.slice(0, 3);

  it('knocks out the furthest-out player each round', () => {
    let s = started({ players, scoring: 'elimination' });
    s = reduce(s, guess(100, players[0].id));
    s = reduce(s, guess(110, players[1].id));
    s = reduce(s, guess(99999, players[2].id));
    expect(s.eliminated).toEqual([players[2].id]);
  });

  it('stops asking an eliminated player to guess', () => {
    let s = started({ players, scoring: 'elimination' });
    s = reduceAll(s, [guess(100, players[0].id), guess(110, players[1].id), guess(99999, players[2].id)]);
    s = reduce(s, { type: 'next' });
    expect(pendingPlayers(s)).not.toContain(players[2].id);
  });

  it('ignores a guess from an eliminated player', () => {
    let s = started({ players, scoring: 'elimination' });
    s = reduceAll(s, [guess(100, players[0].id), guess(110, players[1].id), guess(99999, players[2].id)]);
    s = reduce(s, { type: 'next' });
    const before = s;
    expect(reduce(s, guess(100, players[2].id))).toBe(before);
  });

  it('ends the game when only one player is left, before the rounds run out', () => {
    const two = PARTY_PLAYERS.slice(0, 2);
    let s = started({ players: two, scoring: 'elimination' });
    s = reduce(s, guess(100, two[0].id));
    s = reduce(s, guess(99999, two[1].id));
    s = reduce(s, { type: 'next' });
    expect(s.status).toBe('finished');
  });
});

describe('purity', () => {
  it('never mutates the state it was given', () => {
    const s = started();
    const snapshot = JSON.parse(JSON.stringify(s));
    reduce(s, guess(100));
    reduce(s, { type: 'hint', hint: 'bracket' });
    reduce(s, { type: 'skip' });
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });

  it('is reproducible — the same actions from the same seed give the same score', () => {
    const run = () =>
      reduceAll(started({ seed: 'fixed' }), [guess(95), { type: 'next' }, guess(210)]).totalScore;
    expect(run()).toBe(run());
  });

  it('ignores an unknown action', () => {
    const s = started();
    expect(reduce(s, { type: 'nonsense' } as unknown as Parameters<typeof reduce>[1])).toBe(s);
  });
});
