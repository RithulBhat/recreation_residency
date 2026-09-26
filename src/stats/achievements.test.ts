import { describe, expect, it } from 'vitest';
import type { Modifiers } from '@/types/game';
import {
  ACHIEVEMENTS,
  RARITIES,
  achievementById,
  evaluateAchievements,
  localDateKey,
  type AchievementContext,
} from './achievements';
import { applyGame, emptyTotals, summarizeGame, updateTrackRecords } from './aggregate';
import type { PackMeta, StatsTotals, TrackRecord } from './types';
import {
  blitzGame,
  classicGame,
  dailyGame,
  duelGame,
  fixedGame,
  makeGame,
  partyGame,
  survivalGame,
  type GameOpts,
  type RoundSpec,
} from './testFactory';
import type { GameState } from '@/types/game';

/* ------------------------------------------------------------------ helpers */

function ctxOf(state: GameState, over: Partial<AchievementContext> = {}): AchievementContext {
  const record = summarizeGame(state);
  const totals = applyGame(emptyTotals(), record, state);
  const tracks = updateTrackRecords(new Map(), state);
  return { state, record, totals, tracks, ...over };
}

function withTotals(state: GameState, patch: Partial<StatsTotals>): AchievementContext {
  const base = ctxOf(state);
  return { ...base, totals: { ...base.totals, ...patch } };
}

function mods(over: Partial<Modifiers> = {}): Modifiers {
  return { speed: 1, reverse: false, lofi: false, bitcrush: false, pitch: 0, ...over };
}

function wins(n: number, over: GameOpts = {}): GameState {
  const rounds: RoundSpec[] = Array.from({ length: n }, () => ({ shape: 'won' }));
  return makeGame({ rounds, ...over });
}

function at(hour: number, minute = 0): number {
  return new Date(2026, 8, 20, hour, minute, 0, 0).getTime();
}

function modGame(m: Partial<Modifiers>): GameState {
  return makeGame({ rounds: [{ shape: 'won' }], settings: { modifiers: mods(m) } });
}

/** ctx whose lifetime `byPack` covers the given pack → tags map. */
function packCtx(tags: Record<string, string[]>): AchievementContext {
  const base = ctxOf(classicGame());
  const byPack: StatsTotals['byPack'] = {};
  const packs = new Map<string, PackMeta>();
  for (const [id, t] of Object.entries(tags)) {
    byPack[id] = { seen: 4, correct: 2 };
    packs.set(id, { id, name: id, emoji: '🎵', tags: t });
  }
  return { ...base, totals: { ...base.totals, byPack }, packs };
}

function manyPacks(n: number): AchievementContext {
  const tags: Record<string, string[]> = {};
  for (let i = 0; i < n; i += 1) tags[`pack-${i}`] = ['pop'];
  return packCtx(tags);
}

function seenTimes(state: GameState, times: number): ReadonlyMap<number, TrackRecord> {
  let map: ReadonlyMap<number, TrackRecord> = new Map<number, TrackRecord>();
  for (let i = 0; i < times; i += 1) map = updateTrackRecords(map, state);
  return map;
}

const plain = classicGame();
const allLost = makeGame({ rounds: [{ shape: 'lost' }, { shape: 'lost' }, { shape: 'lost' }] });
const hintGame = makeGame({
  rounds: Array.from({ length: 5 }, () => ({ shape: 'won', hints: ['year'] })) as RoundSpec[],
});
const lastTryGame = (count: number): GameState =>
  makeGame({
    settings: { clipMode: 'fixed', clipLength: 1, stages: [], tries: 3 },
    rounds: Array.from({ length: count }, () => ({ shape: 'won', tryIndex: 2 })) as RoundSpec[],
  });
const fixedPointOne = (clipLength: number): GameState =>
  makeGame({
    settings: { mode: 'fixed', clipMode: 'fixed', clipLength, stages: [], tries: 3 },
    rounds: [{ shape: 'won' }, { shape: 'won' }, { shape: 'won' }],
  });

/* -------------------------------------------------------------------- table */

interface Case {
  id: string;
  pos: AchievementContext;
  neg: AchievementContext;
}

const cases: Case[] = [
  { id: 'needle-drop', pos: ctxOf(plain), neg: ctxOf(allLost) },
  {
    id: 'on-the-board',
    pos: ctxOf(plain),
    neg: { ...ctxOf(plain), totals: emptyTotals() },
  },
  { id: 'point-one', pos: ctxOf(plain), neg: ctxOf(fixedGame()) },
  { id: 'dolphin-ears', pos: ctxOf(wins(5)), neg: ctxOf(plain) },
  {
    id: 'bat-hearing',
    pos: ctxOf(wins(3)),
    neg: ctxOf(
      makeGame({ rounds: [
        { shape: 'won', tryIndex: 1 },
        { shape: 'won', tryIndex: 1 },
        { shape: 'won', tryIndex: 1 },
      ] }),
    ),
  },
  { id: 'streak-5', pos: ctxOf(wins(5)), neg: ctxOf(plain) },
  { id: 'streak-10', pos: ctxOf(wins(10)), neg: ctxOf(wins(5)) },
  { id: 'streak-25', pos: ctxOf(wins(25)), neg: ctxOf(wins(10)) },
  { id: 'flawless', pos: ctxOf(wins(5)), neg: ctxOf(plain) },
  { id: 'clean-sweep', pos: ctxOf(wins(5)), neg: ctxOf(plain) },
  { id: 'blitz-15', pos: ctxOf(blitzGame(18, 3)), neg: ctxOf(blitzGame(10, 2)) },
  { id: 'blitz-25', pos: ctxOf(blitzGame(26, 0)), neg: ctxOf(blitzGame(18, 3)) },
  { id: 'blitz-40', pos: ctxOf(blitzGame(41, 0)), neg: ctxOf(blitzGame(26, 0)) },
  { id: 'survival-20', pos: ctxOf(survivalGame(21)), neg: ctxOf(survivalGame(12)) },
  {
    id: 'untouchable',
    pos: ctxOf(survivalGame(11, { players: [{ name: 'You', score: 3000, lives: 3 }] })),
    neg: ctxOf(survivalGame(11, { players: [{ name: 'You', score: 3000, lives: 1 }] })),
  },
  { id: 'duelist', pos: ctxOf(duelGame([1800, 900])), neg: ctxOf(duelGame([900, 1800])) },
  { id: 'shutout', pos: ctxOf(duelGame([1800, 0])), neg: ctxOf(duelGame([1800, 900])) },
  { id: 'party-host', pos: ctxOf(partyGame()), neg: ctxOf(duelGame()) },
  {
    id: 'landslide',
    pos: ctxOf(partyGame()),
    neg: ctxOf(
      partyGame({
        players: [
          { name: 'A', score: 1000 },
          { name: 'B', score: 900 },
          { name: 'C', score: 800 },
        ],
      }),
    ),
  },
  {
    id: 'polyglot',
    pos: packCtx({
      a: ['english'],
      b: ['hindi'],
      c: ['korean'],
      d: ['french'],
      e: ['spanish', 'pop'],
    }),
    neg: packCtx({ a: ['english'], b: ['hindi'], c: ['korean'] }),
  },
  {
    id: 'time-traveler',
    pos: packCtx({ a: ['1980s'], b: ['1990s'], c: ['2000s'], d: ['2010s'] }),
    neg: packCtx({ a: ['1980s'], b: ['1990s'] }),
  },
  {
    id: 'night-owl',
    pos: ctxOf(makeGame({ startedAt: at(2), rounds: [{ shape: 'won' }] })),
    neg: ctxOf(plain),
  },
  {
    id: 'early-bird',
    pos: ctxOf(makeGame({ startedAt: at(5, 30), rounds: [{ shape: 'won' }] })),
    neg: ctxOf(plain),
  },
  { id: 'marathon', pos: withTotals(plain, { games: 50 }), neg: withTotals(plain, { games: 49 }) },
  {
    id: 'centurion',
    pos: withTotals(plain, { correct: 100 }),
    neg: withTotals(plain, { correct: 99 }),
  },
  {
    id: 'five-hundred-club',
    pos: withTotals(plain, { correct: 500 }),
    neg: withTotals(plain, { correct: 499 }),
  },
  { id: 'comeback-kid', pos: ctxOf(lastTryGame(3)), neg: ctxOf(lastTryGame(2)) },
  { id: 'no-hints-needed', pos: ctxOf(plain), neg: ctxOf(hintGame) },
  { id: 'hint-addict', pos: ctxOf(hintGame), neg: ctxOf(plain) },
  { id: 'reverse-card', pos: ctxOf(modGame({ reverse: true })), neg: ctxOf(modGame({})) },
  { id: 'speed-demon', pos: ctxOf(modGame({ speed: 2 })), neg: ctxOf(modGame({})) },
  { id: 'slow-motion', pos: ctxOf(modGame({ speed: 0.5 })), neg: ctxOf(modGame({})) },
  { id: 'chipmunk-mode', pos: ctxOf(modGame({ pitch: 7 })), neg: ctxOf(modGame({})) },
  { id: 'demon-voice', pos: ctxOf(modGame({ pitch: -7 })), neg: ctxOf(modGame({})) },
  { id: 'lofi-beats', pos: ctxOf(modGame({ lofi: true })), neg: ctxOf(modGame({})) },
  { id: 'eight-bit-ears', pos: ctxOf(modGame({ bitcrush: true })), neg: ctxOf(modGame({})) },
  {
    id: 'kitchen-sink',
    pos: ctxOf(modGame({ speed: 2, reverse: true, lofi: true, bitcrush: true })),
    neg: ctxOf(modGame({ speed: 2, reverse: true, lofi: true })),
  },
  {
    id: 'daily-devotee',
    pos: ctxOf(dailyGame(), { dailies: 7 }),
    neg: ctxOf(dailyGame(), { dailies: 6 }),
  },
  {
    id: 'daily-month',
    pos: ctxOf(dailyGame(), { dailies: 30 }),
    neg: ctxOf(dailyGame(), { dailies: 29 }),
  },
  {
    id: 'daily-perfect',
    pos: ctxOf(dailyGame('2026-09-20', { rounds: [{ shape: 'won' }, { shape: 'won' }] })),
    neg: ctxOf(dailyGame()),
  },
  { id: 'genre-hopper', pos: manyPacks(10), neg: manyPacks(9) },
  {
    id: 'impossible',
    pos: ctxOf(makeGame({ rounds: [{ shape: 'won' }], settings: { difficulty: 'impossible' } })),
    neg: ctxOf(makeGame({ rounds: [{ shape: 'won' }], settings: { difficulty: 'hard' } })),
  },
  {
    id: 'expert-sweep',
    pos: ctxOf(wins(5, { settings: { difficulty: 'expert' } })),
    neg: ctxOf(classicGame({ settings: { difficulty: 'expert' } })),
  },
  { id: 'deja-vu', pos: ctxOf(plain, { tracks: seenTimes(plain, 5) }), neg: ctxOf(plain) },
  {
    id: 'nemesis',
    pos: ctxOf(allLost, { tracks: seenTimes(allLost, 3) }),
    neg: ctxOf(wins(3), { tracks: seenTimes(wins(3), 3) }),
  },
  { id: 'one-and-done', pos: ctxOf(fixedPointOne(0.1)), neg: ctxOf(fixedPointOne(0.5)) },
  {
    id: 'encore',
    pos: ctxOf(plain, { records: Array.from({ length: 5 }, () => summarizeGame(plain)) }),
    neg: ctxOf(plain, { records: Array.from({ length: 4 }, () => summarizeGame(plain)) }),
  },
  {
    id: 'six-pack',
    pos: ctxOf(makeGame({ settings: { packIds: ['a', 'b', 'c', 'd', 'e', 'f'] } })),
    neg: ctxOf(plain),
  },
  {
    id: 'high-roller',
    pos: ctxOf(makeGame({ rounds: [{ shape: 'won' }], totalScore: 12_000 })),
    neg: ctxOf(plain),
  },
  {
    id: 'bank-run',
    pos: withTotals(plain, { score: 100_000 }),
    neg: withTotals(plain, { score: 99_999 }),
  },
  {
    id: 'reflex',
    pos: ctxOf(makeGame({ rounds: [{ shape: 'won', elapsedMs: 1200 }] })),
    neg: ctxOf(makeGame({ rounds: [{ shape: 'won', elapsedMs: 5000 }] })),
  },
  { id: 'sniper', pos: ctxOf(wins(5)), neg: ctxOf(plain) },
  {
    id: 'shortest-fuse',
    pos: (() => {
      const base = ctxOf(plain);
      return {
        ...base,
        totals: {
          ...base.totals,
          byClipBucket: { ...base.totals.byClipBucket, '0.1': { seen: 40, correct: 10 } },
        },
      };
    })(),
    neg: (() => {
      const base = ctxOf(plain);
      return {
        ...base,
        totals: {
          ...base.totals,
          byClipBucket: { ...base.totals.byClipBucket, '0.1': { seen: 40, correct: 9 } },
        },
      };
    })(),
  },
];

/* -------------------------------------------------------------------- specs */

describe('achievement roster', () => {
  it('has at least 36 achievements with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('is fully described', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length, a.id).toBeGreaterThan(0);
      expect(a.emoji.length, a.id).toBeGreaterThan(0);
      expect(a.description.length, a.id).toBeGreaterThan(8);
      expect(RARITIES, a.id).toContain(a.rarity);
    }
  });

  it('spans every rarity and has a few hidden ones', () => {
    for (const rarity of RARITIES) {
      expect(ACHIEVEMENTS.some((a) => a.rarity === rarity), rarity).toBe(true);
    }
    expect(ACHIEVEMENTS.filter((a) => a.hidden).length).toBeGreaterThan(0);
  });

  it('is looked up by id', () => {
    expect(achievementById('point-one')?.name).toBe('Point-One');
    expect(achievementById('nope')).toBeUndefined();
  });

  it('every achievement is covered by the table', () => {
    const covered = new Set(cases.map((c) => c.id));
    const missing = ACHIEVEMENTS.filter((a) => !covered.has(a.id)).map((a) => a.id);
    expect(missing).toEqual([]);
    const unknown = cases.filter((c) => !achievementById(c.id)).map((c) => c.id);
    expect(unknown).toEqual([]);
  });
});

describe.each(cases)('$id', ({ id, pos, neg }) => {
  const achievement = achievementById(id);

  it('unlocks on a matching game', () => {
    expect(achievement).toBeDefined();
    expect(achievement?.check(pos)).toBe(true);
  });

  it('stays locked otherwise', () => {
    expect(achievement?.check(neg)).toBe(false);
  });
});

describe('an untouched quit game', () => {
  /** Quit before listening or guessing: the reducer marks the open round 'skipped', nothing was attempted. */
  function untouchedQuit(startedAt: number): GameState {
    const g = makeGame({ rounds: [{ shape: 'skipped' }], endReason: 'quit', startedAt, finishedAt: startedAt + 1000 });
    g.rounds[0] = { ...g.rounds[0], playsThisTry: 0, tryIndex: 0 };
    return g;
  }

  it('does not put the player on the board', () => {
    const ctx = ctxOf(untouchedQuit(at(14)));
    expect(ctx.record.rounds).toBe(0);
    expect(ctx.totals.games).toBe(1);
    expect(achievementById('on-the-board')!.check(ctx)).toBe(false);
    expect(evaluateAchievements(ctx).map((a) => a.id)).not.toContain('on-the-board');
  });

  it('is not an Early Bird or a Night Owl either', () => {
    expect(achievementById('early-bird')!.check(ctxOf(untouchedQuit(at(5, 30))))).toBe(false);
    expect(achievementById('night-owl')!.check(ctxOf(untouchedQuit(at(2))))).toBe(false);
    // …while a real game at those hours still is
    expect(achievementById('early-bird')!.check(ctxOf(makeGame({ startedAt: at(5, 30), rounds: [{ shape: 'lost' }] })))).toBe(true);
  });
});

describe('evaluateAchievements', () => {
  it('returns the newly earned ones in roster order', () => {
    const ctx = ctxOf(plain);
    const earned = evaluateAchievements(ctx);
    const ids = earned.map((a) => a.id);
    expect(ids).toContain('needle-drop');
    expect(ids).toContain('on-the-board');
    expect(ids).toContain('point-one');
    expect(ids).not.toContain('clean-sweep');
    const order = ACHIEVEMENTS.map((a) => a.id).filter((x) => ids.includes(x));
    expect(ids).toEqual(order);
  });

  it('skips already unlocked ids', () => {
    const ctx = ctxOf(plain);
    const first = evaluateAchievements(ctx);
    const again = evaluateAchievements(ctx, new Set(first.map((a) => a.id)));
    expect(again).toEqual([]);
  });

  it('never unlocks anything for a shut-out game', () => {
    const ids = evaluateAchievements(ctxOf(allLost)).map((a) => a.id);
    expect(ids).not.toContain('needle-drop');
    expect(ids).not.toContain('point-one');
    expect(ids).toContain('on-the-board');
  });

  it('survives a throwing check', () => {
    const ctx = ctxOf(plain);
    const broken = {
      ...ctx,
      get totals(): StatsTotals {
        throw new Error('boom');
      },
    };
    expect(() => evaluateAchievements(broken as unknown as AchievementContext)).not.toThrow();
  });
});

describe('localDateKey', () => {
  it('formats local dates zero-padded', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 8, 26, 0, 1).getTime())).toBe('2026-09-26');
  });
});
