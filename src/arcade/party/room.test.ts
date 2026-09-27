import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, type PartyRoomState } from './protocol';
import {
  activePlayers,
  createRoom,
  everyoneAnswered,
  hostOf,
  leaderboard,
  reduce,
  reduceAll,
  type RoomAction,
} from './room';

const HOST = { id: 'h', name: 'Host', emoji: '👑', color: '#a855f7' };

function room(): PartyRoomState {
  return createRoom('ABC234', 'price', HOST);
}

const join = (id: string, name = id): RoomAction => ({
  type: 'join',
  playerId: id,
  name,
  emoji: '🙂',
  color: '#22d3ee',
});

/** A room with the host and two guests, mid-question. */
function playing(): PartyRoomState {
  return reduceAll(room(), [
    join('a'),
    join('b'),
    { type: 'start', by: 'h', settings: { x: 1 }, seed: 's', totalRounds: 3 },
  ]);
}

describe('createRoom', () => {
  it('starts in the lobby with the creator as host', () => {
    const r = room();
    expect(r.phase).toBe('lobby');
    expect(hostOf(r)?.id).toBe('h');
    expect(r.players).toHaveLength(1);
  });
});

describe('joining', () => {
  it('adds a player', () => {
    expect(reduce(room(), join('a')).players).toHaveLength(2);
  });

  it('refuses to exceed the room cap', () => {
    let r = room();
    for (let i = 0; i < MAX_PLAYERS + 5; i++) r = reduce(r, join(`p${i}`));
    expect(r.players).toHaveLength(MAX_PLAYERS);
  });

  it('lets a returning player reclaim their seat and score instead of starting over', () => {
    let r = reduceAll(playing(), [
      { type: 'answer', playerId: 'a', value: 10 },
      { type: 'score', scores: { a: 500 } },
      { type: 'disconnect', playerId: 'a' },
    ]);
    expect(r.players.find((p) => p.id === 'a')?.connected).toBe(false);
    r = reduce(r, join('a'));
    const back = r.players.find((p) => p.id === 'a');
    expect(back?.connected).toBe(true);
    expect(back?.score).toBe(500);
    expect(r.players).toHaveLength(3);
  });

  it('does not expect a late joiner to answer the round already in flight', () => {
    const r = reduce(playing(), join('late'));
    expect(r.players.find((p) => p.id === 'late')?.answered).toBe(true);
  });

  it('lets a late joiner play the next round normally', () => {
    const r = reduceAll(playing(), [
      join('late'),
      { type: 'answer', playerId: 'h', value: 1 },
      { type: 'answer', playerId: 'a', value: 1 },
      { type: 'answer', playerId: 'b', value: 1 },
      { type: 'reveal', by: 'h' },
      { type: 'advance', by: 'h' },
    ]);
    expect(r.players.find((p) => p.id === 'late')?.answered).toBe(false);
  });
});

describe('disconnects', () => {
  it('holds the seat rather than freeing it', () => {
    const r = reduce(playing(), { type: 'disconnect', playerId: 'a' });
    expect(r.players).toHaveLength(3);
    expect(activePlayers(r)).toHaveLength(2);
  });

  it('does not wait for a disconnected player to answer', () => {
    const r = reduceAll(playing(), [
      { type: 'disconnect', playerId: 'b' },
      { type: 'answer', playerId: 'h', value: 1 },
      { type: 'answer', playerId: 'a', value: 1 },
    ]);
    expect(everyoneAnswered(r)).toBe(true);
  });

  it('migrates the host when the host drops', () => {
    const r = reduce(playing(), { type: 'disconnect', playerId: 'h' });
    expect(hostOf(r)?.id).toBe('a');
    expect(r.players.filter((p) => p.host)).toHaveLength(1);
  });

  it('never leaves the room without a host', () => {
    const r = reduceAll(playing(), [
      { type: 'disconnect', playerId: 'h' },
      { type: 'disconnect', playerId: 'a' },
    ]);
    expect(hostOf(r)).toBeDefined();
  });
});

describe('leaving and kicking', () => {
  it('frees the seat on an explicit leave', () => {
    const r = reduce(playing(), { type: 'leave', playerId: 'a' });
    expect(r.players.map((p) => p.id)).toEqual(['h', 'b']);
  });

  it('migrates the host when the host leaves', () => {
    const r = reduce(playing(), { type: 'leave', playerId: 'h' });
    expect(hostOf(r)?.id).toBe('a');
  });

  it('finishes the room when the last player leaves', () => {
    const r = reduceAll(room(), [{ type: 'leave', playerId: 'h' }]);
    expect(r.phase).toBe('finished');
  });

  it('lets only the host kick', () => {
    const attempt = reduce(playing(), { type: 'kick', by: 'a', playerId: 'b' });
    expect(attempt.players).toHaveLength(3);
    const real = reduce(playing(), { type: 'kick', by: 'h', playerId: 'b' });
    expect(real.players.map((p) => p.id)).toEqual(['h', 'a']);
  });

  it('will not let the host kick themselves into a hostless room', () => {
    const r = playing();
    expect(reduce(r, { type: 'kick', by: 'h', playerId: 'h' })).toBe(r);
  });

  it('drops a kicked player’s answer with them', () => {
    const r = reduceAll(playing(), [
      { type: 'answer', playerId: 'b', value: 42 },
      { type: 'kick', by: 'h', playerId: 'b' },
    ]);
    expect(r.answers.b).toBeUndefined();
  });
});

describe('starting', () => {
  it('only the host may start', () => {
    const r = room();
    expect(reduce(r, { type: 'start', by: 'a', settings: null, seed: 's', totalRounds: 3 })).toBe(r);
  });

  it('resets scores and answers when a finished room starts again', () => {
    const finished = reduceAll(playing(), [
      { type: 'score', scores: { a: 100 } },
      { type: 'answer', playerId: 'a', value: 5 },
      { type: 'reveal', by: 'h' },
      { type: 'advance', by: 'h' },
      { type: 'reveal', by: 'h' },
      { type: 'advance', by: 'h' },
      { type: 'reveal', by: 'h' },
      { type: 'advance', by: 'h' },
    ]);
    expect(finished.phase).toBe('finished');
    const r = reduce(finished, { type: 'start', by: 'h', settings: null, seed: 's2', totalRounds: 2 });
    expect(r.players.every((p) => p.score === 0 && !p.answered)).toBe(true);
    expect(r.round).toBe(0);
    expect(r.phase).toBe('question');
  });

  it('will not restart a round already in flight, so a mis-tap cannot wipe the scores', () => {
    const mid = playing();
    expect(reduce(mid, { type: 'start', by: 'h', settings: null, seed: 'x', totalRounds: 2 })).toBe(
      mid,
    );
  });

  it('refuses to start an empty room', () => {
    const empty = reduce(room(), { type: 'disconnect', playerId: 'h' });
    const r = reduce(empty, { type: 'start', by: 'h', settings: null, seed: 's', totalRounds: 2 });
    expect(r.phase).toBe('lobby');
  });
});

describe('answering', () => {
  it('records one sealed answer per player', () => {
    const r = reduce(playing(), { type: 'answer', playerId: 'a', value: 12 });
    expect(r.answers.a).toBe(12);
    expect(r.players.find((p) => p.id === 'a')?.answered).toBe(true);
  });

  it('ignores a second answer rather than overwriting the first', () => {
    const r = reduceAll(playing(), [
      { type: 'answer', playerId: 'a', value: 12 },
      { type: 'answer', playerId: 'a', value: 99 },
    ]);
    expect(r.answers.a).toBe(12);
  });

  it('ignores an answer from someone not in the room', () => {
    const r = playing();
    expect(reduce(r, { type: 'answer', playerId: 'ghost', value: 1 })).toBe(r);
  });

  it('ignores a non-finite answer', () => {
    const r = playing();
    expect(reduce(r, { type: 'answer', playerId: 'a', value: NaN })).toBe(r);
  });

  it('ignores answers outside the question phase', () => {
    const r = room();
    expect(reduce(r, { type: 'answer', playerId: 'h', value: 1 })).toBe(r);
  });
});

describe('phases', () => {
  it('runs question → reveal → question and finishes on the last round', () => {
    let r = playing();
    for (let i = 0; i < 3; i++) {
      expect(r.phase).toBe('question');
      r = reduce(r, { type: 'reveal', by: 'h' });
      expect(r.phase).toBe('reveal');
      r = reduce(r, { type: 'advance', by: 'h' });
    }
    expect(r.phase).toBe('finished');
  });

  it('only the host may reveal or advance', () => {
    const r = playing();
    expect(reduce(r, { type: 'reveal', by: 'a' })).toBe(r);
    const revealed = reduce(r, { type: 'reveal', by: 'h' });
    expect(reduce(revealed, { type: 'advance', by: 'a' })).toBe(revealed);
  });

  it('clears answers between rounds', () => {
    const r = reduceAll(playing(), [
      { type: 'answer', playerId: 'a', value: 5 },
      { type: 'reveal', by: 'h' },
      { type: 'advance', by: 'h' },
    ]);
    expect(r.answers).toEqual({});
    expect(r.players.every((p) => !p.answered)).toBe(true);
  });
});

describe('leaderboard', () => {
  it('sorts by score, breaking ties by join order so the board does not jitter', () => {
    const r = reduce(playing(), { type: 'score', scores: { h: 10, a: 30, b: 30 } });
    expect(leaderboard(r).map((p) => p.id)).toEqual(['a', 'b', 'h']);
  });
});

describe('purity', () => {
  it('never mutates the state it was given', () => {
    const r = playing();
    const snapshot = JSON.parse(JSON.stringify(r));
    reduce(r, { type: 'answer', playerId: 'a', value: 1 });
    reduce(r, { type: 'kick', by: 'h', playerId: 'b' });
    reduce(r, { type: 'disconnect', playerId: 'h' });
    expect(JSON.parse(JSON.stringify(r))).toEqual(snapshot);
  });

  it('ignores an unknown action', () => {
    const r = playing();
    expect(reduce(r, { type: 'nonsense' } as unknown as RoomAction)).toBe(r);
  });
});
