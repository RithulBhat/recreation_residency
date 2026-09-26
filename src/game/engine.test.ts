import { describe, expect, it } from 'vitest';
import type { GameAction, GameSettings, GameState, Track } from '@/types';
import { BLITZ_PENALTY_MS, createInitialState, pickStartOffset, reduce } from './engine';
import { makeTrack } from './fixtures';
import { DEFAULT_PLAYERS, normalizeSettings } from './presets';
import { createRng } from './rng';
import { currentClipLength, currentRound, triesLeft } from './selectors';

const T0 = 1_700_000_000_000;

const pool: Track[] = [
  makeTrack({ id: 1, title: 'Blinding Lights', artist: 'The Weeknd', releaseYear: 2019 }),
  makeTrack({ id: 2, title: 'Levitating', titleFull: 'Levitating (feat. DaBaby)', artist: 'Dua Lipa' }),
  makeTrack({ id: 3, title: 'Hello', artist: 'Adele' }),
  makeTrack({ id: 4, title: 'Stay', artist: 'The Kid LAROI' }),
  makeTrack({ id: 5, title: 'Bad Guy', artist: 'Billie Eilish' }),
  makeTrack({ id: 6, title: 'Shape of You', artist: 'Ed Sheeran' }),
];

function start(settings: Partial<GameSettings>, tracks: Track[] = pool, seed = 'test-seed'): GameState {
  const s = normalizeSettings({ ...settings, seed });
  return reduce(createInitialState(), { type: 'start', settings: s, tracks, now: T0 });
}

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce((s, a) => reduce(s, a), state);
}

const rightAnswer = (s: GameState) => currentRound(s)!.track.title;

describe('start', () => {
  it('opens round 0 from a shuffled queue with players and timestamps', () => {
    const s = start({ mode: 'classic' });
    expect(s.status).toBe('playing');
    expect(s.id).toHaveLength(12);
    expect(s.rounds).toHaveLength(1);
    expect(s.currentRound).toBe(0);
    expect(s.queue).toHaveLength(pool.length - 1);
    expect(s.players).toEqual([expect.objectContaining({ id: 'you', score: 0, streak: 0, correct: 0 })]);
    expect(s.startedAt).toBe(T0);
    const r = s.rounds[0];
    expect(r).toMatchObject({ index: 0, tryIndex: 0, status: 'playing', guesses: [], hintsUsed: [], playsThisTry: 0, score: 0, startedAt: T0, activePlayerId: 'you', lockedOutPlayerIds: [] });
    expect(s.queue.map((t) => t.id)).not.toContain(r.track.id);
  });

  it('is deterministic for the same seed (queue + offsets), differs across seeds', () => {
    const a = start({ mode: 'classic', startPosition: 'random' }, pool, 'seed-A');
    const b = start({ mode: 'classic', startPosition: 'random' }, pool, 'seed-A');
    const c = start({ mode: 'classic', startPosition: 'random' }, pool, 'seed-B');
    expect(a.id).toBe(b.id);
    expect(a.queue.map((t) => t.id)).toEqual(b.queue.map((t) => t.id));
    expect(a.rounds[0].track.id).toBe(b.rounds[0].track.id);
    expect(a.rounds[0].startOffset).toBe(b.rounds[0].startOffset);
    const orderA = [a.rounds[0].track.id, ...a.queue.map((t) => t.id)];
    const orderC = [c.rounds[0].track.id, ...c.queue.map((t) => t.id)];
    expect(orderA).not.toEqual(orderC);
    // and subsequent rounds too
    const a2 = run(a, { type: 'giveUp', now: T0 + 1 }, { type: 'next', now: T0 + 2 });
    const b2 = run(b, { type: 'giveUp', now: T0 + 1 }, { type: 'next', now: T0 + 2 });
    expect(a2.rounds[1].startOffset).toBe(b2.rounds[1].startOffset);
  });

  it('respects an explicit rng over the seed', () => {
    const settings = normalizeSettings({ mode: 'classic' });
    const a = reduce(createInitialState(), { type: 'start', settings, tracks: pool, now: T0 }, createRng('rng-1'));
    const b = reduce(createInitialState(), { type: 'start', settings, tracks: pool, now: T0 }, createRng('rng-1'));
    expect(a.id).toBe(b.id);
    expect(a.queue.map((t) => t.id)).toEqual(b.queue.map((t) => t.id));
  });

  it('dedupes tracks by id and finishes immediately with no tracks', () => {
    const s = start({ mode: 'classic' }, [pool[0], { ...pool[0] }, pool[1]]);
    expect(s.rounds.length + s.queue.length).toBe(2);
    const empty = start({ mode: 'classic' }, []);
    expect(empty.status).toBe('finished');
    expect(empty.endReason).toBe('queue-empty');
  });

  it('start offsets respect startPosition and the max clip length', () => {
    const settings = normalizeSettings({ mode: 'classic', stages: [0.1, 1, 10] });
    const track = makeTrack({ id: 9 });
    expect(pickStartOffset({ ...settings, startPosition: 'start' }, track, 'k')).toBe(0);
    for (let i = 0; i < 50; i++) {
      const rnd = pickStartOffset({ ...settings, startPosition: 'random' }, track, `r${i}`);
      expect(rnd).toBeGreaterThanOrEqual(0);
      expect(rnd).toBeLessThanOrEqual(20);
      const mid = pickStartOffset({ ...settings, startPosition: 'middle' }, track, `m${i}`);
      expect(mid).toBeGreaterThanOrEqual(10);
      expect(mid).toBeLessThanOrEqual(20);
      const end = pickStartOffset({ ...settings, startPosition: 'end' }, track, `e${i}`);
      expect(end).toBeGreaterThanOrEqual(20);
      expect(end).toBeLessThanOrEqual(20);
    }
    const short = makeTrack({ id: 10, duration: 12 });
    const o = pickStartOffset({ ...settings, startPosition: 'end' }, short, 'x');
    expect(o).toBeLessThanOrEqual(2);
    expect(pickStartOffset(settings, track, 'same')).toBe(pickStartOffset(settings, track, 'same'));
  });

  it('single-player takes name/emoji from settings.players[0] but keeps id "you"', () => {
    const s = start({ mode: 'fixed', players: [{ id: 'abc', name: 'Rithul', emoji: '🔥', color: '#ff00ff' }] });
    expect(s.players).toEqual([expect.objectContaining({ id: 'you', name: 'Rithul', emoji: '🔥', color: '#ff00ff' })]);
  });
});

describe('classic (escalating)', () => {
  it('wins on the 3rd try with the stage-3 clip length and scores it', () => {
    let s = start({ mode: 'classic', stages: [0.1, 0.3, 1, 2, 4, 7, 10] });
    const title = rightAnswer(s);
    expect(currentClipLength(s)).toBe(0.1);
    s = reduce(s, { type: 'play', now: T0 + 500 });
    expect(currentRound(s)!.playsThisTry).toBe(1);
    expect(currentRound(s)!.startedAt).toBe(T0 + 500); // clock starts at first listen
    s = reduce(s, { type: 'guess', text: 'nope', now: T0 + 2000 });
    expect(currentRound(s)!.tryIndex).toBe(1);
    expect(currentRound(s)!.playsThisTry).toBe(0);
    expect(currentClipLength(s)).toBe(0.3);
    s = reduce(s, { type: 'skip', now: T0 + 3000 });
    expect(currentRound(s)!.tryIndex).toBe(2);
    expect(currentClipLength(s)).toBe(1);
    expect(triesLeft(s)).toBe(5);
    s = reduce(s, { type: 'guess', text: title, now: T0 + 4000 });
    const r = currentRound(s)!;
    expect(s.status).toBe('round-over');
    expect(r.status).toBe('won');
    expect(r.winnerPlayerId).toBe('you');
    expect(r.guesses.map((g) => g.verdict)).toEqual(['wrong', 'skipped', 'correct']);
    expect(r.guesses[2].clipLength).toBe(1);
    expect(r.guesses[2].tryIndex).toBe(2);
    // 1000 * 0.55 * 0.65 = 357.5; elapsed 3.5 s → time bonus 25% × (1 − 0.5/17) ≈ 86.7 → 444
    expect(r.score).toBe(444);
    expect(s.totalScore).toBe(444);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(1);
    expect(s.players[0]).toMatchObject({ score: 444, streak: 1, correct: 1 });
  });

  it('loses after exhausting all tries and resets the streak', () => {
    let s = start({ mode: 'classic', stages: [0.1, 0.5, 2] });
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1000 });
    s = reduce(s, { type: 'next', now: T0 + 2000 });
    expect(s.streak).toBe(1);
    s = run(s, { type: 'guess', text: 'a', now: T0 + 3000 }, { type: 'guess', text: 'b', now: T0 + 3100 });
    expect(s.status).toBe('playing');
    s = reduce(s, { type: 'guess', text: 'c', now: T0 + 3200 });
    expect(s.status).toBe('round-over');
    expect(currentRound(s)!.status).toBe('lost');
    expect(currentRound(s)!.guesses).toHaveLength(3);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
    expect(s.players[0].streak).toBe(0);
  });

  it('skip on the last try loses; giveUp loses immediately; timeout records a timeout', () => {
    let s = start({ mode: 'classic', stages: [0.1, 0.5] });
    s = run(s, { type: 'skip', now: T0 + 1 }, { type: 'skip', now: T0 + 2 });
    expect(currentRound(s)!.status).toBe('lost');
    expect(currentRound(s)!.guesses.map((g) => g.verdict)).toEqual(['skipped', 'skipped']);

    let g = start({ mode: 'classic' });
    g = reduce(g, { type: 'giveUp', now: T0 + 1 });
    expect(g.status).toBe('round-over');
    expect(currentRound(g)!.status).toBe('lost');

    let t = start({ mode: 'classic' });
    t = reduce(t, { type: 'timeout', now: T0 + 1 });
    expect(currentRound(t)!.guesses[0].verdict).toBe('timeout');
    expect(currentRound(t)!.status).toBe('lost');
  });

  it('skip is a no-op when allowSkip is false', () => {
    const s = start({ mode: 'classic', allowSkip: false });
    expect(reduce(s, { type: 'skip', now: T0 + 1 })).toBe(s);
  });

  it('next advances rounds, finishes after `rounds`, and endReason is "rounds"', () => {
    let s = start({ mode: 'classic', rounds: 2 });
    s = run(s, { type: 'giveUp', now: T0 + 1 }, { type: 'next', now: T0 + 2 });
    expect(s.status).toBe('playing');
    expect(s.currentRound).toBe(1);
    expect(s.rounds).toHaveLength(2);
    s = run(s, { type: 'giveUp', now: T0 + 3 }, { type: 'next', now: T0 + 4 });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('rounds');
    expect(s.finishedAt).toBe(T0 + 4);
  });

  it('finishes with queue-empty when the pool runs out (rounds=0 endless)', () => {
    let s = start({ mode: 'classic', rounds: 0 }, pool.slice(0, 2));
    s = run(s, { type: 'giveUp', now: T0 + 1 }, { type: 'next', now: T0 + 2 }, { type: 'giveUp', now: T0 + 3 }, { type: 'next', now: T0 + 4 });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('queue-empty');
  });

  it('new offset per try when sameStartEachTry is false, same otherwise', () => {
    let a = start({ mode: 'classic', sameStartEachTry: false, startPosition: 'random' });
    const o0 = currentRound(a)!.startOffset;
    a = reduce(a, { type: 'skip', now: T0 + 1 });
    expect(currentRound(a)!.startOffset).not.toBe(o0);
    let b = start({ mode: 'classic', sameStartEachTry: true, startPosition: 'random' });
    const b0 = currentRound(b)!.startOffset;
    b = reduce(b, { type: 'skip', now: T0 + 1 });
    expect(currentRound(b)!.startOffset).toBe(b0);
  });

  it('quit finishes from playing or round-over and marks the open round skipped', () => {
    let s = start({ mode: 'classic' });
    const q = reduce(s, { type: 'quit', now: T0 + 5 });
    expect(q.status).toBe('finished');
    expect(q.endReason).toBe('quit');
    expect(q.rounds[0].status).toBe('skipped');
    s = reduce(s, { type: 'giveUp', now: T0 + 1 });
    expect(reduce(s, { type: 'quit', now: T0 + 2 }).status).toBe('finished');
  });
});

describe('fixed mode', () => {
  it('uses one clip length and loses after `tries`', () => {
    let s = start({ mode: 'fixed', clipLength: 0.3, tries: 2 });
    expect(currentClipLength(s)).toBe(0.3);
    s = reduce(s, { type: 'guess', text: 'wrong one', now: T0 + 1 });
    expect(currentClipLength(s)).toBe(0.3);
    expect(triesLeft(s)).toBe(1);
    s = reduce(s, { type: 'guess', text: 'wrong two', now: T0 + 2 });
    expect(currentRound(s)!.status).toBe('lost');
    expect(s.status).toBe('round-over');
  });
});

describe('guess target both / partial', () => {
  it('artist-only is partial, consumes a try, credits 30% if the round is lost', () => {
    let s = start({ mode: 'fixed', clipLength: 1, tries: 2, guessTarget: 'both' });
    const artist = currentRound(s)!.track.artist;
    s = reduce(s, { type: 'guess', text: artist, now: T0 + 30000 });
    const r = currentRound(s)!;
    expect(r.guesses[0]).toMatchObject({ verdict: 'partial', matchedArtist: true, matchedTitle: false });
    expect(r.tryIndex).toBe(1);
    expect(r.status).toBe('playing');
    expect(r.score).toBe(Math.round(1000 * 0.55 * 0.3)); // 165, no time bonus
    expect(s.totalScore).toBe(0);
    s = reduce(s, { type: 'guess', text: 'nah', now: T0 + 31000 });
    expect(currentRound(s)!.status).toBe('lost');
    expect(s.totalScore).toBe(165);
    expect(s.players[0].score).toBe(165);
    expect(s.players[0].correct).toBe(0);
  });

  it('full title after a partial wins with the full score (replacing partial credit)', () => {
    let s = start({ mode: 'fixed', clipLength: 1, tries: 3, guessTarget: 'both' });
    const track = currentRound(s)!.track;
    s = reduce(s, { type: 'guess', text: track.artist, now: T0 + 30000 });
    s = reduce(s, { type: 'guess', text: track.title, now: T0 + 31000 });
    const r = currentRound(s)!;
    expect(r.status).toBe('won');
    expect(r.score).toBe(Math.round(1000 * 0.55 * 0.8)); // 440
    expect(s.totalScore).toBe(440);
  });
});

describe('hints', () => {
  it('records hints without duplicates, honours the budget and availability', () => {
    let s = start({ mode: 'classic', stages: [0.1, 1, 2, 4, 7] }, [pool[0]]);
    s = reduce(s, { type: 'hint', kind: 'year', now: T0 + 1 });
    expect(currentRound(s)!.hintsUsed).toEqual(['year']);
    expect(reduce(s, { type: 'hint', kind: 'year', now: T0 + 2 })).toBe(s);
    s = reduce(s, { type: 'hint', kind: 'firstLetter', now: T0 + 3 });
    s = reduce(s, { type: 'hint', kind: 'coverPeek', now: T0 + 4 });
    expect(currentRound(s)!.hintsUsed).toHaveLength(3);
    expect(reduce(s, { type: 'hint', kind: 'album', now: T0 + 5 })).toBe(s);
  });

  it('is a no-op when hints are disabled or data is missing', () => {
    const s = start({ mode: 'classic', hintsEnabled: false });
    expect(reduce(s, { type: 'hint', kind: 'year', now: T0 + 1 })).toBe(s);
    const noYear = start({ mode: 'classic' }, [pool[2]]);
    expect(reduce(noYear, { type: 'hint', kind: 'year', now: T0 + 1 })).toBe(noYear);
  });

  it('hints reduce the score by 15% each', () => {
    let s = start({ mode: 'fixed', clipLength: 0.1, tries: 3 }, [pool[0]]);
    s = reduce(s, { type: 'hint', kind: 'firstLetter', now: T0 + 1 });
    s = reduce(s, { type: 'guess', text: 'Blinding Lights', now: T0 + 30000 });
    expect(currentRound(s)!.score).toBe(850);
  });
});

describe('blitz', () => {
  it('sets the clock, auto-advances on correct, penalizes wrong by 3 s', () => {
    let s = start({ mode: 'blitz', blitzDuration: 60, clipLength: 1 });
    expect(s.blitzEndsAt).toBe(T0 + 60000);
    const first = currentRound(s)!.track;
    s = reduce(s, { type: 'guess', text: first.title, now: T0 + 1000 });
    expect(s.status).toBe('playing');
    expect(s.currentRound).toBe(1);
    expect(s.rounds[0].status).toBe('won');
    expect(s.totalScore).toBeGreaterThan(0);
    expect(s.blitzEndsAt).toBe(T0 + 60000);
    s = reduce(s, { type: 'guess', text: 'definitely wrong', now: T0 + 2000 });
    expect(s.currentRound).toBe(2);
    expect(s.rounds[1].status).toBe('lost');
    expect(s.blitzEndsAt).toBe(T0 + 60000 - BLITZ_PENALTY_MS);
    expect(s.streak).toBe(0);
    s = reduce(s, { type: 'skip', now: T0 + 2500 });
    expect(s.currentRound).toBe(3);
    expect(s.blitzEndsAt).toBe(T0 + 60000 - 2 * BLITZ_PENALTY_MS);
  });

  it('tick ends the game when time is up; a penalty past the clock also ends it', () => {
    let s = start({ mode: 'blitz', blitzDuration: 15 });
    expect(reduce(s, { type: 'tick', now: T0 + 14999 })).toBe(s);
    const done = reduce(s, { type: 'tick', now: T0 + 15000 });
    expect(done.status).toBe('finished');
    expect(done.endReason).toBe('time');
    expect(done.rounds[0].status).toBe('skipped');
    s = reduce(s, { type: 'guess', text: 'wrong', now: T0 + 13000 });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('time');
  });

  it('ignores `rounds` and ends with queue-empty when the pool runs out', () => {
    let s = start({ mode: 'blitz', rounds: 1, blitzDuration: 600 }, pool.slice(0, 2));
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1 });
    expect(s.status).toBe('playing');
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 2 });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('queue-empty');
    expect(s.rounds.filter((r) => r.status === 'won')).toHaveLength(2);
  });
});

describe('survival', () => {
  it('starts with lives, loses one per lost round, shrinks the clip 15% per win, ends at 0', () => {
    let s = start({ mode: 'survival', lives: 2, clipLength: 2, tries: 1, rounds: 0 });
    expect(s.players[0].lives).toBe(2);
    expect(currentClipLength(s)).toBe(2);
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1 });
    s = reduce(s, { type: 'next', now: T0 + 2 });
    expect(currentClipLength(s)).toBe(1.7);
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 3 });
    s = reduce(s, { type: 'next', now: T0 + 4 });
    expect([1.44, 1.45]).toContain(currentClipLength(s));
    s = reduce(s, { type: 'guess', text: 'wrong', now: T0 + 5 });
    expect(s.players[0].lives).toBe(1);
    expect(s.status).toBe('round-over');
    s = reduce(s, { type: 'next', now: T0 + 6 });
    expect(s.status).toBe('playing');
    s = reduce(s, { type: 'giveUp', now: T0 + 7 });
    expect(s.players[0].lives).toBe(0);
    s = reduce(s, { type: 'next', now: T0 + 8 });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('lives');
  });

  it('shrink never goes below 0.1 s', () => {
    let s = start({ mode: 'survival', lives: 5, clipLength: 0.1, tries: 1, rounds: 0 });
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1 });
    s = reduce(s, { type: 'next', now: T0 + 2 });
    expect(currentClipLength(s)).toBe(0.1);
  });
});

describe('duel — buzzer', () => {
  const players = DEFAULT_PLAYERS.slice(0, 2);
  const duel = () => start({ mode: 'duel', duelStyle: 'buzzer', stages: [0.5, 1, 2], players: [...players] });

  it('requires a buzz before guessing; locks out wrong buzzer; other player can win', () => {
    let s = duel();
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(currentRound(s)!.activePlayerId).toBeUndefined();
    expect(reduce(s, { type: 'guess', text: 'x', now: T0 + 1 })).toBe(s);
    s = reduce(s, { type: 'buzz', playerId: 'p1', now: T0 + 1 });
    expect(currentRound(s)!.activePlayerId).toBe('p1');
    expect(reduce(s, { type: 'buzz', playerId: 'p2', now: T0 + 2 })).toBe(s);
    expect(reduce(s, { type: 'guess', text: 'x', playerId: 'p2', now: T0 + 2 })).toBe(s);
    s = reduce(s, { type: 'guess', text: 'nope', playerId: 'p1', now: T0 + 3 });
    expect(currentRound(s)!.lockedOutPlayerIds).toEqual(['p1']);
    expect(currentRound(s)!.activePlayerId).toBeUndefined();
    expect(currentRound(s)!.status).toBe('playing');
    expect(reduce(s, { type: 'buzz', playerId: 'p1', now: T0 + 4 })).toBe(s);
    s = reduce(s, { type: 'buzz', playerId: 'p2', now: T0 + 4 });
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 5 });
    expect(currentRound(s)!.status).toBe('won');
    expect(currentRound(s)!.winnerPlayerId).toBe('p2');
    expect(s.players[1].score).toBeGreaterThan(0);
    expect(s.players[0].score).toBe(0);
  });

  it('both locked out → round lost; skip advances the stage keeping lockouts', () => {
    let s = duel();
    s = reduce(s, { type: 'guess', text: 'nope', playerId: 'p1', now: T0 + 1 }); // auto-buzz + wrong
    expect(currentRound(s)!.lockedOutPlayerIds).toEqual(['p1']);
    s = reduce(s, { type: 'skip', now: T0 + 2 });
    expect(currentRound(s)!.tryIndex).toBe(1);
    expect(currentRound(s)!.lockedOutPlayerIds).toEqual(['p1']);
    s = reduce(s, { type: 'guess', text: 'also nope', playerId: 'p2', now: T0 + 3 });
    expect(currentRound(s)!.status).toBe('lost');
    expect(s.status).toBe('round-over');
    expect(s.players.every((p) => p.streak === 0)).toBe(true);
  });

  it('buzz is a no-op outside buzzer duels', () => {
    const s = start({ mode: 'classic' });
    expect(reduce(s, { type: 'buzz', playerId: 'you', now: T0 + 1 })).toBe(s);
  });
});

describe('duel — turns & party rotation', () => {
  it('rotates the active player each round and scores per player', () => {
    const players = DEFAULT_PLAYERS.slice(0, 3);
    let s = start({ mode: 'party', clipMode: 'fixed', clipLength: 1, tries: 1, rounds: 6, players: [...players] });
    expect(s.activePlayerIndex).toBe(0);
    expect(currentRound(s)!.activePlayerId).toBe('p1');
    expect(reduce(s, { type: 'guess', text: 'x', playerId: 'p2', now: T0 + 1 })).toBe(s);
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1 });
    expect(currentRound(s)!.winnerPlayerId).toBe('p1');
    s = reduce(s, { type: 'next', now: T0 + 2 });
    expect(s.activePlayerIndex).toBe(1);
    expect(currentRound(s)!.activePlayerId).toBe('p2');
    s = reduce(s, { type: 'guess', text: 'wrong', playerId: 'p2', now: T0 + 3 });
    expect(currentRound(s)!.status).toBe('lost');
    s = reduce(s, { type: 'next', now: T0 + 4 });
    expect(currentRound(s)!.activePlayerId).toBe('p3');
    s = reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 5 });
    s = reduce(s, { type: 'next', now: T0 + 6 });
    expect(currentRound(s)!.activePlayerId).toBe('p1');
    expect(s.players.map((p) => p.correct)).toEqual([1, 0, 1]);
    expect(s.players[0].score).toBeGreaterThan(0);
    expect(s.players[1].score).toBe(0);
  });

  it('duel turns alternates two players', () => {
    let s = start({ mode: 'duel', duelStyle: 'turns', players: DEFAULT_PLAYERS.slice(0, 2) });
    expect(currentRound(s)!.activePlayerId).toBe('p1');
    s = run(s, { type: 'giveUp', now: T0 + 1 }, { type: 'next', now: T0 + 2 });
    expect(currentRound(s)!.activePlayerId).toBe('p2');
  });
});

describe('round timer via tick', () => {
  it('times the round out once the clock runs past roundTimer', () => {
    let s = start({ mode: 'classic', roundTimer: 10 });
    s = reduce(s, { type: 'play', now: T0 + 2000 });
    expect(reduce(s, { type: 'tick', now: T0 + 11999 })).toBe(s);
    s = reduce(s, { type: 'tick', now: T0 + 12000 });
    expect(currentRound(s)!.status).toBe('lost');
    expect(currentRound(s)!.guesses[0].verdict).toBe('timeout');
  });
});

describe('invalid actions are no-ops (same reference)', () => {
  it('idle state ignores everything but start', () => {
    const idle = createInitialState();
    const actions: GameAction[] = [
      { type: 'play', now: T0 },
      { type: 'guess', text: 'x', now: T0 },
      { type: 'skip', now: T0 },
      { type: 'giveUp', now: T0 },
      { type: 'hint', kind: 'year', now: T0 },
      { type: 'timeout', now: T0 },
      { type: 'buzz', playerId: 'p1', now: T0 },
      { type: 'next', now: T0 },
      { type: 'tick', now: T0 },
      { type: 'quit', now: T0 },
    ];
    for (const a of actions) expect(reduce(idle, a), a.type).toBe(idle);
  });

  it('round-over ignores guess/skip/hint/play; finished ignores next/quit', () => {
    let s = start({ mode: 'classic' });
    s = reduce(s, { type: 'giveUp', now: T0 + 1 });
    for (const a of [
      { type: 'guess', text: 'x', now: T0 + 2 },
      { type: 'skip', now: T0 + 2 },
      { type: 'hint', kind: 'year', now: T0 + 2 },
      { type: 'play', now: T0 + 2 },
      { type: 'giveUp', now: T0 + 2 },
    ] as GameAction[]) {
      expect(reduce(s, a), a.type).toBe(s);
    }
    const done = reduce(s, { type: 'quit', now: T0 + 3 });
    expect(reduce(done, { type: 'next', now: T0 + 4 })).toBe(done);
    expect(reduce(done, { type: 'quit', now: T0 + 4 })).toBe(done);
    expect(reduce(done, { type: 'guess', text: 'x', now: T0 + 4 })).toBe(done);
  });

  it('empty guesses and whitespace are ignored; start works from finished', () => {
    const s = start({ mode: 'classic' });
    expect(reduce(s, { type: 'guess', text: '   ', now: T0 + 1 })).toBe(s);
    const done = reduce(s, { type: 'quit', now: T0 + 2 });
    const again = reduce(done, { type: 'start', settings: normalizeSettings({ mode: 'fixed' }), tracks: pool, now: T0 + 3 });
    expect(again.status).toBe('playing');
    expect(again.totalScore).toBe(0);
    expect(again.rounds).toHaveLength(1);
  });

  it('never mutates the previous state', () => {
    const s = start({ mode: 'classic' });
    const snapshot = JSON.stringify(s);
    reduce(s, { type: 'guess', text: rightAnswer(s), now: T0 + 1 });
    reduce(s, { type: 'skip', now: T0 + 1 });
    reduce(s, { type: 'hint', kind: 'firstLetter', now: T0 + 1 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
