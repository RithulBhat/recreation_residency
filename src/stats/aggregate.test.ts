import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { normalizeSettings } from '@/game/presets';
import { createRng } from '@/game/rng';
import {
  MAX_TRACKS,
  accuracy,
  anyRoundAttempted,
  applyGame,
  bestClipBucket,
  bucketClip,
  capTrackRecords,
  emptyTotals,
  playedRounds,
  recentForm,
  roundOutcome,
  shortestClip,
  summarizeGame,
  triesAvailable,
  updateTrackRecords,
  weakestPacks,
  xpForGame,
} from './aggregate';
import type { GameRecord, TrackRecord } from './types';
import {
  blitzGame,
  classicGame,
  dailyGame,
  duelGame,
  fixedGame,
  makeGame,
  makeTrack,
  partyGame,
  survivalGame,
} from './testFactory';

describe('bucketClip', () => {
  const cases: [number, string][] = [
    [0, '0.1'],
    [-5, '0.1'],
    [0.05, '0.1'],
    [0.1, '0.1'],
    [0.1000001, '0.1'],
    [0.11, '0.25'],
    [0.25, '0.25'],
    [0.26, '0.5'],
    [0.3, '0.5'],
    [0.5, '0.5'],
    [0.51, '1'],
    [1, '1'],
    [1.01, '2'],
    [2, '2'],
    [2.5, '5'],
    [4, '5'],
    [5, '5'],
    [5.5, '10'],
    [7, '10'],
    [10, '10'],
    [30, '10'],
    [Number.NaN, '0.1'],
    [Number.POSITIVE_INFINITY, '0.1'],
  ];
  it.each(cases)('bucketClip(%s) === %s', (len, expected) => {
    expect(bucketClip(len)).toBe(expected);
  });
});

describe('settings helpers', () => {
  it('reads the shortest clip from escalating stages', () => {
    const game = classicGame();
    expect(shortestClip(game.settings)).toBe(0.1);
    expect(triesAvailable(game.settings)).toBe(7);
  });

  it('falls back to the fixed clip length', () => {
    const game = fixedGame();
    expect(shortestClip(game.settings)).toBe(0.5);
    expect(triesAvailable(game.settings)).toBe(3);
  });
});

describe('playedRounds / roundOutcome', () => {
  it('counts an unresolved round that was guessed on', () => {
    const game = makeGame({ rounds: [{ shape: 'won' }, { shape: 'unresolved' }] });
    expect(playedRounds(game)).toHaveLength(2);
  });

  it('ignores a round the engine auto-skipped before any guess — blitz clock ran out, or quit (P3-9)', () => {
    const game = makeGame({ rounds: [{ shape: 'won' }, { shape: 'skipped', tryIndex: 0 }] });
    expect(game.rounds[1]).toMatchObject({ status: 'skipped', guesses: [] });
    expect(playedRounds(game)).toHaveLength(1);
    expect(summarizeGame(game)).toMatchObject({ rounds: 1, correct: 1 });
    // a round the player skipped after guessing on it still counts
    const skippedLater = makeGame({ rounds: [{ shape: 'won' }, { shape: 'skipped', tryIndex: 1 }] });
    expect(playedRounds(skippedLater)).toHaveLength(2);
  });

  it('blitz: the round left open when the clock runs out does not lower accuracy', () => {
    const settings = normalizeSettings({ mode: 'blitz', blitzDuration: 15, clipLength: 1, packIds: ['x'] });
    const tracks = Array.from({ length: 5 }, (_, i) => makeTrack({ id: i + 1, title: `Song ${i + 1}` }));
    let s = reduce(createInitialState(), { type: 'start', settings, tracks, now: 0 }, createRng('blitz'));
    s = reduce(s, { type: 'guess', text: s.rounds[0].track.title, now: 1000 });
    s = reduce(s, { type: 'tick', now: 15_000 });
    expect(s.status).toBe('finished');
    expect(s.rounds.map((r) => r.status)).toEqual(['won', 'skipped']);
    expect(summarizeGame(s)).toMatchObject({ rounds: 1, correct: 1 });
  });

  it('describes a win', () => {
    const game = classicGame();
    const o = roundOutcome(game.rounds[0], game.settings);
    expect(o).toMatchObject({
      won: true,
      wonFirstTry: true,
      perfect: true,
      triesUsed: 1,
      clipHeard: 0.1,
      hadPartial: false,
    });
  });

  it('describes a loss with the longest clip heard', () => {
    const game = classicGame();
    const o = roundOutcome(game.rounds[3], game.settings);
    expect(o.won).toBe(false);
    expect(o.clipHeard).toBe(10);
    expect(o.buckets).toEqual(['0.1', '0.5', '1', '2', '5', '10']);
  });

  it('flags a partial round', () => {
    const game = classicGame();
    const o = roundOutcome(game.rounds[6], game.settings);
    expect(o.won).toBe(false);
    expect(o.hadPartial).toBe(true);
  });

  it('is not perfect when the win came on a later try', () => {
    const game = classicGame();
    expect(roundOutcome(game.rounds[1], game.settings).perfect).toBe(false);
  });
});

describe('summarizeGame', () => {
  it('condenses a classic game', () => {
    const game = classicGame();
    const record = summarizeGame(game);
    expect(record).toMatchObject({
      id: 'game-1',
      mode: 'classic',
      difficulty: 'medium',
      clipMode: 'escalating',
      rounds: 10,
      correct: 8,
      partial: 1,
      score: 5640,
      bestStreak: 3,
      avgTries: 2.5,
      avgClipLengthHeard: 1.363,
    });
    expect(record.packIds).toEqual(['pop-hits']);
    expect(record.durationMs).toBeGreaterThan(0);
    expect(record.players).toBeUndefined();
    expect(record.winnerName).toBeUndefined();
    expect(record.daily).toBeUndefined();
  });

  it('zeroes the averages when nothing was won', () => {
    const record = summarizeGame(makeGame({ rounds: [{ shape: 'lost' }, { shape: 'skipped' }] }));
    expect(record.correct).toBe(0);
    expect(record.avgTries).toBe(0);
    expect(record.avgClipLengthHeard).toBe(0);
  });

  it('keeps the daily date', () => {
    expect(summarizeGame(dailyGame('2026-09-20')).daily).toBe('2026-09-20');
  });

  it('records players and a unique winner', () => {
    const record = summarizeGame(duelGame([1800, 900]));
    expect(record.players).toEqual([
      { name: 'Rithul', score: 1800 },
      { name: 'Maanu', score: 900 },
    ]);
    expect(record.winnerName).toBe('Rithul');
  });

  it('leaves the winner blank on a tie', () => {
    expect(summarizeGame(duelGame([900, 900])).winnerName).toBeUndefined();
  });

  it('takes the best streak across players', () => {
    const record = summarizeGame(
      duelGame([1800, 900], { bestStreak: 1, players: [
        { id: 'p1', name: 'A', score: 1800, bestStreak: 9 },
        { id: 'p2', name: 'B', score: 900, bestStreak: 2 },
      ] }),
    );
    expect(record.bestStreak).toBe(9);
  });

  it('counts survival and blitz rounds', () => {
    expect(summarizeGame(survivalGame(12)).rounds).toBe(12);
    expect(summarizeGame(blitzGame(18, 3)).correct).toBe(18);
    expect(summarizeGame(partyGame()).rounds).toBe(5);
  });
});

describe('xpForGame', () => {
  it('is score/10 + 20 per correct + mode bonus', () => {
    expect(xpForGame(summarizeGame(classicGame()))).toBe(564 + 160 + 10);
    expect(xpForGame(summarizeGame(blitzGame(18, 3)))).toBe(396 + 360 + 25);
    expect(xpForGame(summarizeGame(fixedGame()))).toBe(276 + 80 + 5);
  });

  it('never goes negative', () => {
    const record = { ...summarizeGame(classicGame()), score: -100, correct: 0 };
    expect(xpForGame(record)).toBeGreaterThanOrEqual(0);
  });
});

describe('applyGame', () => {
  it('folds one game into empty totals', () => {
    const game = classicGame();
    const record = summarizeGame(game);
    const totals = applyGame(emptyTotals(), record, game);
    expect(totals).toMatchObject({
      games: 1,
      rounds: 10,
      correct: 8,
      partial: 1,
      score: 5640,
      xp: 734,
      bestStreak: 3,
      perfectRounds: 3,
    });
    expect(totals.timePlayedMs).toBe(record.durationMs);
    expect(totals.byMode.classic).toEqual({ games: 1, best: 5640, avg: 5640 });
    expect(totals.byPack['pop-hits']).toEqual({ seen: 10, correct: 8 });
    expect(totals.byClipBucket['0.1']).toEqual({ seen: 10, correct: 3 });
    expect(totals.byClipBucket['0.5']).toEqual({ seen: 7, correct: 2 });
    expect(totals.byClipBucket['0.25']).toEqual({ seen: 0, correct: 0 });
    expect(totals.byClipBucket['10']).toEqual({ seen: 2, correct: 1 });
  });

  it('does not mutate the input totals', () => {
    const game = classicGame();
    const before = emptyTotals();
    applyGame(before, summarizeGame(game), game);
    expect(before).toEqual(emptyTotals());
  });

  it('accumulates across games and keeps a running mode average', () => {
    const a = classicGame();
    const b = classicGame({ id: 'game-2', totalScore: 1000 });
    let totals = applyGame(emptyTotals(), summarizeGame(a), a);
    totals = applyGame(totals, summarizeGame(b), b);
    expect(totals.games).toBe(2);
    expect(totals.rounds).toBe(20);
    expect(totals.byMode.classic).toEqual({ games: 2, best: 5640, avg: 3320 });
    expect(totals.byPack['pop-hits']).toEqual({ seen: 20, correct: 16 });
  });

  it('keeps modes separate', () => {
    const a = classicGame();
    const b = blitzGame(18, 3, { id: 'game-2' });
    let totals = applyGame(emptyTotals(), summarizeGame(a), a);
    totals = applyGame(totals, summarizeGame(b), b);
    expect(totals.byMode.classic.games).toBe(1);
    expect(totals.byMode.blitz.games).toBe(1);
    expect(totals.byMode.survival.games).toBe(0);
  });

  it('buckets by the pack of each track', () => {
    const game = makeGame({
      settings: { packIds: ['a', 'b'] },
      rounds: [
        { shape: 'won', packId: 'a' },
        { shape: 'lost', packId: 'b' },
        { shape: 'won', packId: 'b' },
      ],
    });
    const totals = applyGame(emptyTotals(), summarizeGame(game), game);
    expect(totals.byPack).toEqual({ a: { seen: 1, correct: 1 }, b: { seen: 2, correct: 1 } });
  });
});

describe('track records', () => {
  it('builds and merges per-track history', () => {
    const game = makeGame({
      rounds: [
        { shape: 'won', clip: 0.3, track: { id: 42, title: 'Hoo', artist: 'Bee' } },
        { shape: 'lost', track: { id: 43 } },
      ],
    });
    const first = updateTrackRecords(new Map(), game);
    expect(first.get(42)).toMatchObject({
      trackId: 42,
      title: 'Hoo',
      artist: 'Bee',
      timesSeen: 1,
      timesCorrect: 1,
      fastestClip: 0.3,
      packId: 'pop-hits',
    });
    expect(first.get(43)).toMatchObject({ timesSeen: 1, timesCorrect: 0, fastestClip: null });

    const faster = makeGame({
      id: 'g2',
      rounds: [{ shape: 'won', clip: 0.1, track: { id: 42 } }],
    });
    const second = updateTrackRecords(first, faster);
    expect(second.get(42)).toMatchObject({ timesSeen: 2, timesCorrect: 2, fastestClip: 0.1 });
    // input map untouched
    expect(first.get(42)?.timesSeen).toBe(1);
  });

  it('does not regress the fastest clip', () => {
    const fast = makeGame({ rounds: [{ shape: 'won', clip: 0.1, track: { id: 7 } }] });
    const slow = makeGame({ id: 'g2', rounds: [{ shape: 'won', clip: 2, track: { id: 7 } }] });
    const map = updateTrackRecords(updateTrackRecords(new Map(), fast), slow);
    expect(map.get(7)?.fastestClip).toBe(0.1);
  });

  it('caps by lastSeen', () => {
    const map = new Map<number, TrackRecord>();
    for (let i = 0; i < 20; i += 1) {
      map.set(i, {
        trackId: i,
        title: `t${i}`,
        artist: 'a',
        cover: '',
        timesSeen: 1,
        timesCorrect: 0,
        fastestClip: null,
        lastSeen: i,
      });
    }
    const capped = capTrackRecords(map, 5);
    expect(capped.size).toBe(5);
    expect([...capped.keys()].sort((x, y) => x - y)).toEqual([15, 16, 17, 18, 19]);
    expect(capTrackRecords(map, 50).size).toBe(20);
    expect(MAX_TRACKS).toBe(1500);
  });
});

describe('derived views', () => {
  const totals = (() => {
    const t = emptyTotals();
    t.rounds = 10;
    t.correct = 8;
    t.byPack = {
      pop: { seen: 10, correct: 9 },
      kpop: { seen: 10, correct: 2 },
      rock: { seen: 2, correct: 0 },
    };
    t.byClipBucket['0.1'] = { seen: 10, correct: 0 };
    t.byClipBucket['0.5'] = { seen: 8, correct: 4 };
    t.byClipBucket['2'] = { seen: 4, correct: 4 };
    return t;
  })();

  it('accuracy', () => {
    expect(accuracy(totals)).toBeCloseTo(0.8);
    expect(accuracy(emptyTotals())).toBe(0);
  });

  it('weakestPacks honours the minimum sample', () => {
    const meta = [
      { id: 'pop', name: 'Pop Hits', emoji: '🎤', tags: ['pop'] },
      { id: 'kpop', name: 'K-Pop', emoji: '🇰🇷', tags: ['korean'] },
    ];
    const weak = weakestPacks(totals, meta);
    expect(weak.map((p) => p.packId)).toEqual(['kpop', 'pop']);
    expect(weak[0]).toMatchObject({ name: 'K-Pop', emoji: '🇰🇷', seen: 10, correct: 2 });
    expect(weak[0].accuracy).toBeCloseTo(0.2);
  });

  it('weakestPacks falls back to any sample and unknown packs', () => {
    const t = emptyTotals();
    t.byPack = { mystery: { seen: 1, correct: 0 } };
    const weak = weakestPacks(t, []);
    expect(weak).toHaveLength(1);
    expect(weak[0]).toMatchObject({ packId: 'mystery', name: 'mystery', emoji: '🎵' });
  });

  it('bestClipBucket picks the shortest bucket with a correct answer', () => {
    expect(bestClipBucket(totals)).toMatchObject({ bucket: '0.5', seen: 8, correct: 4 });
    expect(bestClipBucket(emptyTotals())).toBeNull();
  });

  it('recentForm returns oldest → newest', () => {
    const records: GameRecord[] = [3, 2, 1].map((n) => ({
      ...summarizeGame(classicGame({ id: `g${n}` })),
      finishedAt: n * 1000,
      rounds: 10,
      correct: n,
    }));
    const form = recentForm(records, 2);
    expect(form.map((p) => p.gameId)).toEqual(['g2', 'g3']);
    expect(form[1]).toMatchObject({ correct: 3, rounds: 10, clean: false });
    expect(form[1].accuracy).toBeCloseTo(0.3);
    expect(recentForm(records, 0)).toEqual([]);
  });

  it('recentForm marks clean games', () => {
    const game = makeGame({ rounds: [{ shape: 'won' }, { shape: 'won' }] });
    expect(recentForm([summarizeGame(game)])[0].clean).toBe(true);
  });
});

describe('anyRoundAttempted', () => {
  it('is false for a game quit before anything happened, true after a listen, a guess or a verdict', () => {
    const untouched = makeGame({ rounds: [{ shape: 'skipped' }], endReason: 'quit' });
    untouched.rounds[0] = { ...untouched.rounds[0], playsThisTry: 0, tryIndex: 0 };
    expect(anyRoundAttempted(untouched)).toBe(false);
    expect(anyRoundAttempted({ ...untouched, rounds: [{ ...untouched.rounds[0], playsThisTry: 1 }] })).toBe(true);
    expect(anyRoundAttempted(makeGame({ rounds: [{ shape: 'lost' }], endReason: 'quit' }))).toBe(true);
    expect(anyRoundAttempted(makeGame({ rounds: [{ shape: 'unresolved' }], endReason: 'quit' }))).toBe(true);
  });
});
