/**
 * Test factory: build realistic finished `ScoutState`s without running the engine.
 *
 * Lives outside `*.test.ts` (like `src/stats/testFactory.ts`) so unit tests and screen fixtures can
 * both use it. Rounds are scored with the REAL `scoreScoutRound`, settings go through the REAL
 * `normalizeScoutSettings`, and subjects are built with the REAL `buildPlayerSubject` /
 * `buildTeamSubject` over `@/scout/fixtures`, so a factory run is shaped exactly like an engine run.
 *
 * Timestamps hang off a fixed 2pm local base, so the time-of-day badge (`midnight-film`) stays
 * locked unless a test asks for it.
 */

import { scoreScoutRound } from './scoring';
import { normalizeScoutSettings } from './presets';
import { BLITZ_RUNG } from './formats';
import { SCOUT_TEAM_META } from './packs';
import { buildPlayerSubject, buildTeamSubject } from './subjects';
import { FIXTURE_PLAYERS, FIXTURE_TEAMS, makePlayer } from './fixtures';
import type { ScoutSeenRound } from './engine';
import type {
  NflPlayer,
  NflTeam,
  PositionGroup,
  ScoutFormat,
  ScoutGuess,
  ScoutMode,
  ScoutPlayerState,
  ScoutRound,
  ScoutSettings,
  ScoutState,
  ScoutStatus,
  ScoutSubject,
} from './types';

/** 2026-09-20 14:00 local. */
export const SCOUT_BASE_TIME = new Date(2026, 8, 20, 14, 0, 0, 0).getTime();

const ROUND_GAP = 25_000;
const DEFAULT_ELAPSED = 6_000;

export type ScoutRoundShape = 'won' | 'lost' | 'close' | 'skipped' | 'timeout' | 'unresolved';

export interface ScoutRoundSpec {
  /** How the round ended. Default `'won'`. */
  shape?: ScoutRoundShape;
  /** 0-based rung the round resolved on. Default 1 (so rung-0 badges need opting in). */
  rung?: number;
  /** Puzzle type. Default `'silhouette'` (or `'teamTrivia'` for a team subject). */
  mode?: ScoutMode;
  /** Fixture player by exact name. */
  player?: string;
  /** Fixture team by abbreviation — makes this a TEAM round. */
  team?: string;
  /** Synthesise a player instead: any franchise id, group, fame and experience. */
  teamId?: string;
  group?: PositionGroup;
  pos?: string;
  fame?: number;
  exp?: number;
  name?: string;
  subjectId?: string;
  /** Override the round score (default: the real scorer). */
  score?: number;
  /** Milliseconds from first paint to the resolving guess. Default 6000. */
  elapsedMs?: number;
  /** Multiplayer: who took the round. */
  winnerPlayerId?: string;
}

export interface ScoutPlayerSpec {
  id?: string;
  name: string;
  score: number;
  emoji?: string;
  color?: string;
  correct?: number;
  bestStreak?: number;
  lives?: number;
}

export interface ScoutRunOpts {
  id?: string;
  settings?: Partial<ScoutSettings>;
  rounds?: ScoutRoundSpec[];
  startedAt?: number;
  finishedAt?: number;
  status?: ScoutStatus;
  endReason?: ScoutState['endReason'];
  /** Default: the sum of the round scores. */
  totalScore?: number;
  streak?: number;
  /** Default: the longest run of consecutive wins. */
  bestStreak?: number;
  players?: ScoutPlayerSpec[];
  gauntletTeamIds?: string[];
  clearedTeamIds?: string[];
  queue?: ScoutSubject[];
}

const PLAYER_BY_NAME: ReadonlyMap<string, NflPlayer> = new Map(FIXTURE_PLAYERS.map((p) => [p.name, p]));
const TEAM_BY_ABBR: ReadonlyMap<string, NflTeam> = new Map(FIXTURE_TEAMS.map((t) => [t.abbr, t]));
const TEAM_BY_ID: ReadonlyMap<string, NflTeam> = new Map(FIXTURE_TEAMS.map((t) => [t.id, t]));

/** Every franchise id in league order — handy for gauntlet and division fixtures. */
export const ALL_FRANCHISE_IDS: readonly string[] = SCOUT_TEAM_META.map((t) => t.id);

/** The four franchise ids of a division, e.g. `divisionTeamIds('AFC', 'West')`. */
export function divisionTeamIds(conf: 'AFC' | 'NFC', div: 'East' | 'North' | 'South' | 'West'): string[] {
  return SCOUT_TEAM_META.filter((t) => t.conf === conf && t.div === div).map((t) => t.id);
}

let synthetic = 0;

/** Resolve one spec to a subject, synthesising a player when no fixture is named. */
export function subjectForSpec(spec: ScoutRoundSpec): ScoutSubject {
  if (spec.team !== undefined) {
    const team = TEAM_BY_ABBR.get(spec.team);
    if (!team) throw new Error(`statsTestFactory: no fixture team ${spec.team}`);
    return buildTeamSubject(team);
  }
  if (spec.player !== undefined) {
    const player = PLAYER_BY_NAME.get(spec.player);
    if (!player) throw new Error(`statsTestFactory: no fixture player ${spec.player}`);
    return buildPlayerSubject(player, TEAM_BY_ID.get(player.teamId));
  }
  synthetic += 1;
  const pos = spec.pos ?? posForGroup(spec.group ?? 'WR');
  const player = makePlayer({
    id: spec.subjectId ?? `syn-${synthetic}`,
    name: spec.name ?? `Synth Player${synthetic}`,
    teamId: spec.teamId ?? '12',
    pos,
    ...(spec.group !== undefined ? { group: spec.group } : {}),
    fame: spec.fame ?? 60,
    ...(spec.exp !== undefined ? { exp: spec.exp } : {}),
  });
  return buildPlayerSubject(player, TEAM_BY_ID.get(player.teamId));
}

const GROUP_POS: Readonly<Record<PositionGroup, string>> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OL: 'OT',
  DL: 'DE',
  LB: 'LB',
  DB: 'CB',
  ST: 'PK',
};

function posForGroup(group: PositionGroup): string {
  return GROUP_POS[group];
}

export function makeScoutSettings(over: Partial<ScoutSettings> = {}): ScoutSettings {
  return normalizeScoutSettings({ mode: 'silhouette', tries: 5, rounds: 10, ...over });
}

interface RoundBuild {
  round: ScoutRound;
  won: boolean;
}

function buildRound(
  index: number,
  spec: ScoutRoundSpec,
  settings: ScoutSettings,
  startedAt: number,
  streakBefore: number,
  format: ScoutFormat,
): RoundBuild {
  const subject = subjectForSpec(spec);
  const shape = spec.shape ?? 'won';
  const mode = spec.mode ?? (subject.kind === 'team' ? 'teamTrivia' : 'silhouette');
  const tries = Math.max(1, settings.tries);
  const rung = Math.min(spec.rung ?? 1, tries - 1);
  const elapsed = spec.elapsedMs ?? DEFAULT_ELAPSED;
  const guesses: ScoutGuess[] = [];
  const at = (i: number): number => startedAt + Math.round((elapsed * (i + 1)) / (rung + 1));

  const wrong = (i: number, verdict: ScoutGuess['verdict'] = 'wrong'): ScoutGuess => ({
    text: `wrong-${i}`,
    verdict,
    tryIndex: i,
    at: at(i),
  });

  let status: ScoutRound['status'] = 'lost';
  let won = false;
  if (shape === 'won') {
    for (let i = 0; i < rung; i += 1) guesses.push(wrong(i));
    guesses.push({ text: subject.name, verdict: 'correct', tryIndex: rung, at: startedAt + elapsed });
    status = 'won';
    won = true;
  } else if (shape === 'lost' || shape === 'close') {
    for (let i = 0; i < tries; i += 1) {
      guesses.push(wrong(i, shape === 'close' && i === tries - 1 ? 'close' : 'wrong'));
    }
    status = 'lost';
  } else if (shape === 'skipped') {
    for (let i = 0; i < tries; i += 1) guesses.push(wrong(i, 'skipped'));
    status = 'skipped';
  } else if (shape === 'timeout') {
    for (let i = 0; i < tries - 1; i += 1) guesses.push(wrong(i));
    guesses.push(wrong(tries - 1, 'timeout'));
    status = 'lost';
  } else {
    // unresolved: the clock stopped mid-round, one guess already burnt
    guesses.push(wrong(0));
    status = 'playing';
  }

  const score =
    spec.score ??
    (won
      ? scoreScoutRound({ mode, tryIndex: rung, elapsedMs: elapsed, streak: streakBefore, format }).total
      : 0);

  const round: ScoutSeenRound = {
    index,
    mode,
    subject,
    stages: [],
    tryIndex: won ? rung + 1 : guesses.length,
    guesses,
    status,
    score,
    startedAt,
    seenAt: startedAt,
  };
  if (status !== 'playing') round.endedAt = startedAt + elapsed;
  if (spec.winnerPlayerId !== undefined) round.winnerPlayerId = spec.winnerPlayerId;
  return { round, won };
}

function seatStates(specs: readonly ScoutPlayerSpec[]): ScoutPlayerState[] {
  return specs.map((p, i) => {
    const seat: ScoutPlayerState = {
      id: p.id ?? `p${i + 1}`,
      name: p.name,
      emoji: p.emoji ?? '🏈',
      color: p.color ?? '#a855f7',
      score: p.score,
      streak: 0,
      bestStreak: p.bestStreak ?? 0,
      correct: p.correct ?? 0,
    };
    if (p.lives !== undefined) seat.lives = p.lives;
    return seat;
  });
}

/** A finished `ScoutState`. Everything has a sensible default; override what a test cares about. */
export function makeScoutRun(opts: ScoutRunOpts = {}): ScoutState {
  const settings = makeScoutSettings(opts.settings);
  const format: ScoutFormat = settings.format ?? 'standard';
  const specs = opts.rounds ?? Array.from({ length: 10 }, () => ({}) as ScoutRoundSpec);
  const startedAt = opts.startedAt ?? SCOUT_BASE_TIME;

  const rounds: ScoutRound[] = [];
  let streak = 0;
  let bestStreak = 0;
  let total = 0;
  specs.forEach((spec, i) => {
    const { round, won } = buildRound(i, spec, settings, startedAt + i * ROUND_GAP, streak, format);
    streak = won ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    total += round.score;
    rounds.push(round);
  });

  const finishedAt = opts.finishedAt ?? startedAt + specs.length * ROUND_GAP;
  const state: ScoutState = {
    id: opts.id ?? 'scout-run-1',
    settings,
    status: opts.status ?? 'finished',
    rounds,
    currentRound: Math.max(0, rounds.length - 1),
    queue: opts.queue ?? [],
    startedAt,
    finishedAt,
    totalScore: opts.totalScore ?? total,
    streak: opts.streak ?? streak,
    bestStreak: opts.bestStreak ?? bestStreak,
  };
  const endReason = opts.endReason ?? defaultEndReason(format);
  if (endReason) state.endReason = endReason;
  if (opts.players && opts.players.length > 0) {
    state.players = seatStates(opts.players);
    state.activePlayerIndex = 0;
  }
  if (opts.gauntletTeamIds) state.gauntletTeamIds = opts.gauntletTeamIds.slice();
  if (opts.clearedTeamIds) state.clearedTeamIds = opts.clearedTeamIds.slice();
  return state;
}

function defaultEndReason(format: ScoutFormat): ScoutState['endReason'] {
  if (format === 'blitz') return 'time';
  if (format === 'survival') return 'lives';
  if (format === 'gauntlet') return 'gauntlet';
  return 'rounds';
}

/* ------------------------------------------------------------------------------- shorthands */

/** Ten silhouette rounds, eight of them named on the second rung. */
export function standardRun(over: ScoutRunOpts = {}): ScoutState {
  const rounds: ScoutRoundSpec[] =
    over.rounds ??
    Array.from({ length: 10 }, (_unused, i) => ({
      shape: i < 8 ? 'won' : i === 8 ? 'close' : 'lost',
      rung: 1,
      group: (['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'OL', 'ST', 'WR'] as PositionGroup[])[i],
      teamId: ALL_FRANCHISE_IDS[i],
      fame: 60,
    })) as ScoutRoundSpec[];
  return makeScoutRun({ id: 'scout-standard-1', ...over, rounds });
}

/** A blitz: `correct` named at the fixed blitz rung, `misses` burnt, clock ran out. */
export function blitzRun(correct = 14, misses = 3, over: ScoutRunOpts = {}): ScoutState {
  const rounds: ScoutRoundSpec[] = [
    ...Array.from({ length: correct }, (_unused, i) => ({
      shape: 'won' as ScoutRoundShape,
      rung: BLITZ_RUNG,
      teamId: ALL_FRANCHISE_IDS[i % ALL_FRANCHISE_IDS.length],
      group: 'WR' as PositionGroup,
      elapsedMs: 3_000,
    })),
    ...Array.from({ length: misses }, () => ({ shape: 'lost' as ScoutRoundShape })),
  ];
  return makeScoutRun({
    id: 'scout-blitz-1',
    settings: { format: 'blitz', mode: 'silhouette', ...over.settings },
    rounds,
    endReason: 'time',
    ...stripSettings(over),
  });
}

/** A survival run that got `survived` right before the lives went. */
export function survivalRun(survived = 12, over: ScoutRunOpts = {}): ScoutState {
  const rounds: ScoutRoundSpec[] = [
    ...Array.from({ length: survived }, (_unused, i) => ({
      shape: 'won' as ScoutRoundShape,
      rung: 1,
      teamId: ALL_FRANCHISE_IDS[i % ALL_FRANCHISE_IDS.length],
      fame: i < survived / 2 ? 85 : 25,
    })),
    { shape: 'lost' },
    { shape: 'lost' },
    { shape: 'lost' },
  ];
  return makeScoutRun({
    id: 'scout-survival-1',
    settings: { format: 'survival', lives: 3, ...over.settings },
    rounds,
    endReason: 'lives',
    ...stripSettings(over),
  });
}

/** A gauntlet: one round per franchise, `cleared` of them won. */
export function gauntletRun(cleared = 20, over: ScoutRunOpts = {}): ScoutState {
  const rounds: ScoutRoundSpec[] = ALL_FRANCHISE_IDS.map((teamId, i) => ({
    shape: (i < cleared ? 'won' : 'lost') as ScoutRoundShape,
    rung: 1,
    teamId,
  }));
  return makeScoutRun({
    id: 'scout-gauntlet-1',
    settings: { format: 'gauntlet', ...over.settings },
    rounds,
    endReason: 'gauntlet',
    gauntletTeamIds: [...ALL_FRANCHISE_IDS],
    clearedTeamIds: ALL_FRANCHISE_IDS.slice(0, cleared),
    ...stripSettings(over),
  });
}

/** A two-seat duel. `ownerWins` decides whether seat 1 (the device owner) tops the table. */
export function duelRun(ownerWins = true, over: ScoutRunOpts = {}): ScoutState {
  return makeScoutRun({
    id: 'scout-duel-1',
    settings: { format: 'duel', rounds: 8, players: [], ...over.settings },
    rounds: Array.from({ length: 8 }, (_unused, i) => ({
      shape: 'won' as ScoutRoundShape,
      rung: 1,
      teamId: ALL_FRANCHISE_IDS[i],
      winnerPlayerId: i % 2 === 0 ? 'p1' : 'p2',
    })),
    players: [
      { id: 'p1', name: 'You', score: ownerWins ? 4200 : 2100, correct: ownerWins ? 5 : 3, bestStreak: 3 },
      { id: 'p2', name: 'Maanu', score: ownerWins ? 2100 : 4200, correct: ownerWins ? 3 : 5, bestStreak: 2 },
    ],
    endReason: 'rounds',
    ...stripSettings(over),
  });
}

/** A party run of `seats` players; seat 1 wins when `ownerWins`. */
export function partyRun(seats = 3, ownerWins = true, over: ScoutRunOpts = {}): ScoutState {
  const players: ScoutPlayerSpec[] = Array.from({ length: seats }, (_unused, i) => ({
    id: `p${i + 1}`,
    name: i === 0 ? 'You' : `Seat ${i + 1}`,
    score: i === 0 ? (ownerWins ? 5000 : 1000) : 2000 - i * 10,
    correct: 3,
  }));
  return makeScoutRun({
    id: 'scout-party-1',
    settings: { format: 'party', rounds: seats * 2, players: [], ...over.settings },
    rounds: Array.from({ length: seats * 2 }, (_unused, i) => ({
      shape: 'won' as ScoutRoundShape,
      rung: 1,
      teamId: ALL_FRANCHISE_IDS[i],
    })),
    players,
    endReason: 'rounds',
    ...stripSettings(over),
  });
}

/** A run that touches all seven puzzle types, winning each on the first rung. */
export function everyModeRun(over: ScoutRunOpts = {}): ScoutState {
  const rounds: ScoutRoundSpec[] = [
    { mode: 'silhouette', rung: 0, teamId: '12', group: 'QB' },
    { mode: 'faceZoom', rung: 0, teamId: '2', group: 'RB' },
    { mode: 'highlight', rung: 0, teamId: '21', group: 'WR' },
    { mode: 'statLine', rung: 0, teamId: '25', group: 'TE' },
    { mode: 'careerPath', rung: 0, teamId: '9', group: 'OL' },
    { mode: 'teamTrivia', rung: 0, team: 'KC' },
    { mode: 'logoZoom', rung: 0, team: 'SF' },
  ];
  return makeScoutRun({ id: 'scout-every-mode-1', settings: { mixModes: true }, rounds, ...over });
}

/** A daily run for `date`. */
export function dailyRun(date = '2026-09-20', over: ScoutRunOpts = {}): ScoutState {
  return standardRun({
    id: `scout-daily-${date}`,
    settings: { daily: date, seed: `scout-daily-${date}`, ...over.settings },
    ...stripSettings(over),
  });
}

/** Options minus `settings`, so a shorthand can merge settings itself. */
function stripSettings(over: ScoutRunOpts): Omit<ScoutRunOpts, 'settings'> {
  const { settings: _settings, ...rest } = over;
  return rest;
}
