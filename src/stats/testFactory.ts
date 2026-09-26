/**
 * Test factory: build realistic finished `GameState`s without the engine.
 *
 * Lives outside `*.test.ts` so both unit tests and screen/story fixtures can use
 * it. Timestamps are derived from a fixed local base (2pm, so time-of-day
 * achievements stay locked unless a test asks for them).
 */

import type { Track } from '@/types/catalog';
import type {
  GameSettings,
  GameState,
  Guess,
  HintKind,
  PlayerState,
  Round,
  RoundStatus,
} from '@/types/game';

/** 2026-09-20 14:00 local. */
export const BASE_TIME = new Date(2026, 8, 20, 14, 0, 0, 0).getTime();

const ROUND_GAP = 20_000;

export type RoundShape = 'won' | 'lost' | 'skipped' | 'partial' | 'unresolved';

export interface RoundSpec {
  /** how the round ended (default `won`) */
  shape?: RoundShape;
  /** 0-based try the round resolved on (default 0) */
  tryIndex?: number;
  /** clip length heard at the resolving guess (default: derived from settings) */
  clip?: number;
  hints?: HintKind[];
  score?: number;
  /** ms from round start to the resolving guess (default 4000) */
  elapsedMs?: number;
  track?: Partial<Track>;
  packId?: string;
  playerId?: string;
}

export interface GameOpts {
  id?: string;
  settings?: Partial<GameSettings>;
  rounds?: RoundSpec[];
  startedAt?: number;
  finishedAt?: number;
  players?: PlayerSpec[];
  totalScore?: number;
  streak?: number;
  bestStreak?: number;
  status?: GameState['status'];
  endReason?: GameState['endReason'];
  queue?: Track[];
}

export interface PlayerSpec {
  id?: string;
  name: string;
  score: number;
  emoji?: string;
  color?: string;
  streak?: number;
  bestStreak?: number;
  correct?: number;
  lives?: number;
}

export function makeTrack(over: Partial<Track> = {}): Track {
  const id = over.id ?? 1001;
  return {
    id,
    title: over.title ?? `Track ${id}`,
    titleFull: over.titleFull ?? over.title ?? `Track ${id}`,
    artist: over.artist ?? `Artist ${id}`,
    artistId: over.artistId ?? id * 10,
    album: over.album ?? `Album ${id}`,
    albumId: over.albumId ?? id * 100,
    cover: over.cover ?? `https://cdn.example/cover/${id}.jpg`,
    coverBig: over.coverBig ?? `https://cdn.example/cover-big/${id}.jpg`,
    preview: over.preview ?? `https://cdn.example/preview/${id}.mp3`,
    previewFetchedAt: over.previewFetchedAt ?? BASE_TIME,
    duration: over.duration ?? 210,
    rank: over.rank ?? 500_000,
    explicit: over.explicit ?? false,
    ...(over.releaseYear !== undefined ? { releaseYear: over.releaseYear } : {}),
    ...(over.bpm !== undefined ? { bpm: over.bpm } : {}),
    ...(over.packId !== undefined ? { packId: over.packId } : {}),
  };
}

export function makeSettings(over: Partial<GameSettings> = {}): GameSettings {
  return {
    mode: 'classic',
    packIds: ['pop-hits'],
    difficulty: 'medium',
    clipMode: 'escalating',
    clipLength: 1,
    stages: [0.1, 0.3, 1, 2, 4, 7, 10],
    tries: 7,
    rounds: 10,
    startPosition: 'random',
    sameStartEachTry: true,
    guessTarget: 'both',
    hintsEnabled: true,
    roundTimer: 0,
    modifiers: { speed: 1, reverse: false, lofi: false, bitcrush: false, pitch: 0 },
    allowSkip: true,
    explicitFilter: false,
    blitzDuration: 90,
    lives: 3,
    players: [],
    duelStyle: 'buzzer',
    voiceHost: false,
    ...over,
  };
}

/** Clip length the player hears on a given try. */
export function clipForTry(settings: GameSettings, tryIndex: number): number {
  if (settings.clipMode === 'escalating' && settings.stages.length > 0) {
    const i = Math.min(tryIndex, settings.stages.length - 1);
    return settings.stages[i];
  }
  return settings.clipLength;
}

function guess(
  text: string,
  verdict: Guess['verdict'],
  tryIndex: number,
  clipLength: number,
  at: number,
  playerId?: string,
): Guess {
  return {
    text,
    verdict,
    tryIndex,
    clipLength,
    at,
    matchedTitle: verdict === 'correct',
    matchedArtist: verdict === 'correct' || verdict === 'partial',
    ...(playerId ? { playerId } : {}),
  };
}

function statusFor(shape: RoundShape): RoundStatus {
  switch (shape) {
    case 'won':
      return 'won';
    case 'skipped':
      return 'skipped';
    case 'unresolved':
      return 'playing';
    default:
      return 'lost';
  }
}

export function makeRound(
  spec: RoundSpec,
  settings: GameSettings,
  index: number,
  baseTime: number,
): Round {
  const shape = spec.shape ?? 'won';
  const tryIndex = spec.tryIndex ?? 0;
  const startedAt = baseTime + index * ROUND_GAP;
  const elapsed = spec.elapsedMs ?? 4000;
  const finalClip = spec.clip ?? clipForTry(settings, tryIndex);
  const track = makeTrack({
    id: spec.track?.id ?? 1000 + index,
    ...spec.track,
    packId: spec.packId ?? spec.track?.packId ?? settings.packIds[0],
  });

  const guesses: Guess[] = [];
  for (let i = 0; i < tryIndex; i += 1) {
    guesses.push(
      guess(`wrong ${i}`, 'wrong', i, clipForTry(settings, i), startedAt + 1000 * (i + 1), spec.playerId),
    );
  }
  const at = startedAt + elapsed;
  if (shape === 'won') {
    guesses.push(guess(track.title, 'correct', tryIndex, finalClip, at, spec.playerId));
  } else if (shape === 'partial') {
    guesses.push(guess(track.artist, 'partial', tryIndex, finalClip, at, spec.playerId));
  } else if (shape === 'lost') {
    guesses.push(guess(`wrong ${tryIndex}`, 'wrong', tryIndex, finalClip, at, spec.playerId));
  } else if (shape === 'unresolved') {
    guesses.push(guess(`wrong ${tryIndex}`, 'wrong', tryIndex, finalClip, at, spec.playerId));
  }

  const score = spec.score ?? (shape === 'won' ? 500 : shape === 'partial' ? 150 : 0);
  const round: Round = {
    index,
    track,
    startOffset: 3 + index,
    tryIndex: shape === 'won' ? tryIndex : Math.max(tryIndex, guesses.length - 1),
    guesses,
    hintsUsed: spec.hints ?? [],
    status: statusFor(shape),
    score,
    startedAt,
    playsThisTry: 1,
    lockedOutPlayerIds: [],
    ...(shape === 'unresolved' ? {} : { endedAt: at + 500 }),
    ...(shape === 'won' && spec.playerId ? { winnerPlayerId: spec.playerId } : {}),
    ...(spec.playerId ? { activePlayerId: spec.playerId } : {}),
  };
  return round;
}

function makePlayers(specs: PlayerSpec[] | undefined, fallback: PlayerState): PlayerState[] {
  if (!specs || specs.length === 0) return [fallback];
  const palette = ['#a855f7', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185'];
  const emojis = ['🎧', '🎤', '🎸', '🥁', '🎹', '🪩'];
  return specs.map((p, i) => ({
    id: p.id ?? `p${i + 1}`,
    name: p.name,
    emoji: p.emoji ?? emojis[i % emojis.length],
    color: p.color ?? palette[i % palette.length],
    score: p.score,
    streak: p.streak ?? 0,
    bestStreak: p.bestStreak ?? 0,
    correct: p.correct ?? 0,
    ...(p.lives !== undefined ? { lives: p.lives } : {}),
  }));
}

/** Longest run of consecutive `won` rounds in a spec list. */
function streaksOf(specs: RoundSpec[]): { streak: number; best: number } {
  let streak = 0;
  let best = 0;
  for (const spec of specs) {
    if ((spec.shape ?? 'won') === 'won') {
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  }
  return { streak, best };
}

/** Build a finished `GameState`. */
export function makeGame(opts: GameOpts = {}): GameState {
  const settings = makeSettings(opts.settings);
  const specs = opts.rounds ?? [{ shape: 'won' }];
  const startedAt = opts.startedAt ?? BASE_TIME;
  const rounds = specs.map((spec, i) => makeRound(spec, settings, i, startedAt));
  const lastEnd = rounds.reduce((m, r) => Math.max(m, r.endedAt ?? r.startedAt), startedAt);
  const roundScore = rounds.reduce((n, r) => n + r.score, 0);
  const { streak, best } = streaksOf(specs);
  const correct = specs.filter((s) => (s.shape ?? 'won') === 'won').length;
  const fallbackPlayer: PlayerState = {
    id: 'p1',
    name: 'You',
    emoji: '🎧',
    color: '#a855f7',
    score: opts.totalScore ?? roundScore,
    streak,
    bestStreak: best,
    correct,
    ...(settings.mode === 'survival' ? { lives: settings.lives } : {}),
  };
  return {
    id: opts.id ?? 'game-1',
    settings,
    status: opts.status ?? 'finished',
    rounds,
    currentRound: Math.max(0, rounds.length - 1),
    players: makePlayers(opts.players, fallbackPlayer),
    activePlayerIndex: 0,
    queue: opts.queue ?? [],
    startedAt,
    finishedAt: opts.finishedAt ?? lastEnd + 1000,
    totalScore: opts.totalScore ?? roundScore,
    streak: opts.streak ?? streak,
    bestStreak: opts.bestStreak ?? best,
    ...(opts.endReason ? { endReason: opts.endReason } : { endReason: 'rounds' }),
  };
}

/* ---------------------------------------------------------------- presets */

/** 10 escalating rounds, 8 correct — the canonical classic game. */
export function classicGame(over: GameOpts = {}): GameState {
  const rounds: RoundSpec[] =
    over.rounds ??
    [
      { shape: 'won', tryIndex: 0, score: 900 },
      { shape: 'won', tryIndex: 1, score: 700 },
      { shape: 'won', tryIndex: 0, score: 880 },
      { shape: 'lost', tryIndex: 6, score: 0 },
      { shape: 'won', tryIndex: 2, score: 600 },
      { shape: 'won', tryIndex: 3, score: 480 },
      { shape: 'partial', tryIndex: 4, score: 150 },
      { shape: 'won', tryIndex: 1, score: 720 },
      { shape: 'won', tryIndex: 0, score: 910 },
      { shape: 'won', tryIndex: 5, score: 300 },
    ];
  return makeGame({ ...over, rounds, settings: { mode: 'classic', ...over.settings } });
}

/** Fixed 0.5s clips, 6 rounds. */
export function fixedGame(over: GameOpts = {}): GameState {
  const rounds: RoundSpec[] =
    over.rounds ??
    [
      { shape: 'won', tryIndex: 0, score: 800 },
      { shape: 'won', tryIndex: 1, score: 640 },
      { shape: 'lost', tryIndex: 2, score: 0 },
      { shape: 'won', tryIndex: 0, score: 820 },
      { shape: 'skipped', tryIndex: 1, score: 0 },
      { shape: 'won', tryIndex: 2, score: 500 },
    ];
  return makeGame({
    ...over,
    rounds,
    settings: {
      mode: 'fixed',
      clipMode: 'fixed',
      clipLength: 0.5,
      stages: [],
      tries: 3,
      rounds: 6,
      ...over.settings,
    },
  });
}

/** Blitz: many quick single-try rounds. */
export function blitzGame(correct = 18, misses = 3, over: GameOpts = {}): GameState {
  const rounds: RoundSpec[] = [];
  for (let i = 0; i < correct; i += 1) {
    rounds.push({ shape: 'won', tryIndex: 0, score: 220, elapsedMs: 1500 });
  }
  for (let i = 0; i < misses; i += 1) {
    rounds.push({ shape: 'lost', tryIndex: 0, score: 0, elapsedMs: 2500 });
  }
  return makeGame({
    ...over,
    rounds: over.rounds ?? rounds,
    settings: {
      mode: 'blitz',
      clipMode: 'fixed',
      clipLength: 1,
      stages: [],
      tries: 1,
      rounds: 0,
      blitzDuration: 90,
      ...over.settings,
    },
    endReason: over.endReason ?? 'time',
  });
}

/** Two-player duel, seat 1 ahead by default. */
export function duelGame(
  scores: [number, number] = [1800, 900],
  over: GameOpts = {},
): GameState {
  const rounds: RoundSpec[] =
    over.rounds ??
    [
      { shape: 'won', tryIndex: 0, score: 600, playerId: 'p1' },
      { shape: 'won', tryIndex: 1, score: 450, playerId: 'p2' },
      { shape: 'won', tryIndex: 0, score: 620, playerId: 'p1' },
      { shape: 'won', tryIndex: 1, score: 450, playerId: 'p2' },
      { shape: 'won', tryIndex: 0, score: 580, playerId: 'p1' },
      { shape: 'lost', tryIndex: 2, score: 0 },
    ];
  return makeGame({
    ...over,
    rounds,
    settings: { mode: 'duel', tries: 3, rounds: 6, ...over.settings },
    players: over.players ?? [
      { id: 'p1', name: 'Rithul', score: scores[0], correct: 3, bestStreak: 3 },
      { id: 'p2', name: 'Maanu', score: scores[1], correct: 2, bestStreak: 1 },
    ],
    totalScore: over.totalScore ?? scores[0] + scores[1],
  });
}

/** Four-player party game. */
export function partyGame(over: GameOpts = {}): GameState {
  return makeGame({
    rounds: [
      { shape: 'won', tryIndex: 0, score: 500, playerId: 'p1' },
      { shape: 'won', tryIndex: 0, score: 500, playerId: 'p2' },
      { shape: 'won', tryIndex: 1, score: 400, playerId: 'p3' },
      { shape: 'won', tryIndex: 0, score: 520, playerId: 'p4' },
      { shape: 'won', tryIndex: 0, score: 510, playerId: 'p1' },
    ],
    ...over,
    settings: { mode: 'party', rounds: 5, ...over.settings },
    players: over.players ?? [
      { id: 'p1', name: 'Rithul', score: 2400, correct: 4 },
      { id: 'p2', name: 'Maanu', score: 900, correct: 2 },
      { id: 'p3', name: 'Sam', score: 700, correct: 1 },
      { id: 'p4', name: 'Kai', score: 500, correct: 1 },
    ],
  });
}

/** Survival run. */
export function survivalGame(roundsPlayed = 12, over: GameOpts = {}): GameState {
  const rounds: RoundSpec[] = [];
  for (let i = 0; i < roundsPlayed - 1; i += 1) {
    rounds.push({ shape: 'won', tryIndex: 0, score: 300, clip: Math.max(0.1, 1 - i * 0.05) });
  }
  rounds.push({ shape: 'lost', tryIndex: 0, score: 0 });
  return makeGame({
    ...over,
    rounds: over.rounds ?? rounds,
    settings: { mode: 'survival', lives: 3, rounds: 0, ...over.settings },
    endReason: over.endReason ?? 'lives',
  });
}

/** Daily run (5 rounds, seeded). */
export function dailyGame(date = '2026-09-20', over: GameOpts = {}): GameState {
  return makeGame({
    rounds: [
      { shape: 'won', tryIndex: 0, score: 900 },
      { shape: 'won', tryIndex: 1, score: 700 },
      { shape: 'won', tryIndex: 0, score: 880 },
      { shape: 'lost', tryIndex: 6, score: 0 },
      { shape: 'won', tryIndex: 2, score: 600 },
    ],
    ...over,
    settings: { daily: date, seed: `daily-${date}`, rounds: 5, ...over.settings },
  });
}
