/**
 * Highlight Scout — stats contracts and pure aggregation.
 *
 * This is the Scout twin of `src/stats/aggregate.ts` + `src/stats/types.ts`: no React, no storage,
 * no clocks. Every function is a deterministic transform over `ScoutState` → `ScoutRunRecord` →
 * `ScoutStatsTotals`, so the whole progression layer is unit-testable without a DOM.
 *
 * Everything here is JSON-safe (no Map/Set/Date in the persisted shapes) because
 * `src/store/scoutStatsStore.ts` writes these objects straight into localStorage.
 *
 * ## Why the cuts look like this
 * Scout's real skill curve is not "how many did you get" — it is *which* players you can name.
 * So a round is recorded with the five axes that actually separate a fan from a scout: position
 * group, conference, division, franchise and fame tier — plus the puzzle type (`ScoutMode`) and the
 * session format (`ScoutFormat`). `src/scout/report.ts` turns those counters into the Report Card.
 *
 * Formats, seats, lives and the gauntlet board belong to `@/scout/formats`; this module only reads
 * them (`scoutFormat`, `franchiseIdOf`), so the whole game speaks one vocabulary.
 */

import { roundSeenAt } from './engine';
import { SCOUT_FORMAT_IDS, franchiseIdOf, scoutFormat } from './formats';
import { SCOUT_TEAM_META } from './packs';
import type {
  Conference,
  DivisionName,
  PositionGroup,
  ScoutDifficulty,
  ScoutFormat,
  ScoutMode,
  ScoutPlayerState,
  ScoutRound,
  ScoutSettings,
  ScoutState,
  SubjectKind,
} from './types';

/** One row of `SCOUT_TEAM_META` — id, abbr, city, name, conf, div, emoji, accent. */
export type ScoutTeamInfo = (typeof SCOUT_TEAM_META)[number];

/** Runs kept in local storage, newest first. */
export const MAX_SCOUT_RUNS = 150;
/** Per-subject history rows kept, evicted by `lastSeen`. */
export const MAX_SCOUT_SUBJECTS = 2000;

/* -------------------------------------------------------------------------------------- axes */

/** The real skill curve. Display order: most famous first, `deepCut` (nobody knows him) last. */
export type ScoutFameTier = Exclude<ScoutDifficulty, 'any'>;

export const SCOUT_FAME_TIERS: readonly ScoutFameTier[] = ['star', 'starter', 'rotation', 'deepCut'];

/** How hard a tier is, 0 (household name) → 3 (nobody knows him). */
export const SCOUT_TIER_HARDNESS: Readonly<Record<ScoutFameTier, number>> = {
  star: 0,
  starter: 1,
  rotation: 2,
  deepCut: 3,
};

export const SCOUT_POSITION_GROUPS: readonly PositionGroup[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'DB',
  'ST',
];

export const SCOUT_CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];

export const SCOUT_DIVISION_NAMES: readonly DivisionName[] = ['East', 'North', 'South', 'West'];

/** `'AFC East'` … `'NFC West'` — the keys of the division cut, in display order. */
export const SCOUT_DIVISION_KEYS: readonly string[] = SCOUT_CONFERENCES.flatMap((conf) =>
  SCOUT_DIVISION_NAMES.map((div) => `${conf} ${div}`),
);

/** Every puzzle type, in the order `SCOUT_MODES` lists them. */
/**
 * Every puzzle type the Report Card breaks accuracy down by. This list must stay exhaustive —
 * a missing id means that mode's rounds are silently absent from the "by puzzle type" cut.
 * `scoutStats.test.ts` asserts it covers `SCOUT_MODES`, so adding a mode fails loudly here.
 */
export const SCOUT_MODE_KEYS: readonly ScoutMode[] = [
  'silhouette',
  'faceZoom',
  'highlight',
  'teamTrivia',
  'statLine',
  'careerPath',
  'logoZoom',
  'teammates',
  'depthChart',
  'draftClass',
  'higherLower',
  'oddOneOut',
  'jersey',
];

const TEAM_BY_ID: ReadonlyMap<string, ScoutTeamInfo> = new Map(SCOUT_TEAM_META.map((t) => [t.id, t]));

export function scoutTeamInfo(teamId: string | undefined): ScoutTeamInfo | undefined {
  return teamId === undefined ? undefined : TEAM_BY_ID.get(teamId);
}

/** `'AFC West'` for a team id, or undefined when the id is not a franchise we know. */
export function scoutDivisionKeyOf(teamId: string | undefined): string | undefined {
  const t = scoutTeamInfo(teamId);
  return t ? `${t.conf} ${t.div}` : undefined;
}

/** `'any'` is not a real tier — a subject that somehow carries it is treated as a starter. */
export function asScoutFameTier(tier: ScoutDifficulty): ScoutFameTier {
  return tier === 'any' ? 'starter' : tier;
}

/** A trusted `ScoutFormat` out of unknown JSON (a persisted record, an import). */
export function asScoutFormat(value: unknown): ScoutFormat {
  return typeof value === 'string' && (SCOUT_FORMAT_IDS as readonly string[]).includes(value)
    ? (value as ScoutFormat)
    : 'standard';
}

/* ------------------------------------------------------------------------------------- shapes */

/** Multiplayer outcome from the device owner's point of view (seat 1 is "me"). */
export interface ScoutDuelResult {
  /** The device owner's score. */
  mine: number;
  /** The best opposing score. */
  theirs: number;
  /** True when the owner is the unique top scorer. */
  won: boolean;
  /** Name of the best opponent. */
  opponent?: string;
}

/** One seat's line on a multiplayer run. */
export interface ScoutRunPlayerResult {
  id: string;
  name: string;
  emoji: string;
  score: number;
  correct: number;
  bestStreak: number;
}

/**
 * Anything the recording side knows that a finished `ScoutState` cannot express. All optional —
 * every field has a sound default derived from the state itself.
 */
export interface ScoutRunExtras {
  /** Override the run's format (a screen replaying an older state, mostly). */
  format?: ScoutFormat;
  /** Override the duel result — an online duel, where the opponent is not a local seat. */
  duel?: ScoutDuelResult;
  /** Survival: rounds survived. Defaults to the correct count. */
  survived?: number;
  /** Gauntlet: whether the whole board was played. Defaults to `endReason === 'gauntlet'`. */
  gauntletCleared?: boolean;
}

/** One graded round, with every axis the Report Card cuts by. */
export interface ScoutRoundStat {
  index: number;
  mode: ScoutMode;
  kind: SubjectKind;
  subjectId: string;
  /** `'player:3139477'` / `'team:12'` — the per-subject history key. */
  key: string;
  name: string;
  /** Players only. */
  group?: PositionGroup;
  /** Raw ESPN position ('CB', 'PK'). Players only. */
  pos?: string;
  /** The franchise this round was about (the player's team, or the team itself). */
  teamId?: string;
  teamAbbr?: string;
  conference?: Conference;
  division?: DivisionName;
  /** `'AFC West'`. */
  divisionKey?: string;
  tier: ScoutFameTier;
  /** Players only, 0–100. */
  fame?: number;
  /** Years of experience, players only. */
  exp?: number;
  /** `exp <= 1`. */
  rookie: boolean;
  won: boolean;
  /** Ended unwon with at least one near-miss guess. */
  close: boolean;
  /** The player passed on this round (skip / give up). */
  skipped: boolean;
  timedOut: boolean;
  /** 0-based rung the correct guess landed on; null when unsolved. */
  rung: number | null;
  /** Rungs consumed, 1-based. */
  triesUsed: number;
  triesAllowed: number;
  guesses: number;
  score: number;
  ms: number;
  /** Multiplayer: who won the round. */
  winnerPlayerId?: string;
}

/** A finished run, condensed. Newest-first in the store (capped at `MAX_SCOUT_RUNS`). */
export interface ScoutRunRecord {
  /** Same id as the `ScoutState` — de-duplicates writes. */
  id: string;
  finishedAt: number;
  durationMs: number;
  format: ScoutFormat;
  /** `settings.mode`; with `mixModes` the per-round types live in `roundStats`. */
  mode: ScoutMode;
  mixModes: boolean;
  packIds: string[];
  difficulty: ScoutDifficulty;
  /** Rungs per subject. */
  tries: number;
  /** Graded rounds (see `gradedScoutRounds`). */
  rounds: number;
  correct: number;
  close: number;
  skipped: number;
  timeouts: number;
  score: number;
  bestStreak: number;
  /** Mean 1-based rung of solved rounds (2dp); 0 when nothing was solved. */
  avgRung: number;
  /** Rounds solved on rung 0 — the hardest information state. */
  firstRungSolves: number;
  /** Every graded round won, all of them on rung 0. */
  perfect: boolean;
  /** No round was passed on. */
  noSkips: boolean;
  /** XP this run paid out (see `xpForScoutRun`). */
  xp: number;
  endReason?: ScoutState['endReason'];
  seed?: string;
  /** `YYYY-MM-DD` when this was the daily. */
  daily?: string;
  /** Emoji summary, one glyph per graded round, wrapped every ten. */
  grid: string;
  /** Survival: rounds survived. */
  survived: number;
  /** Gauntlet: the whole 32-franchise board was played. */
  gauntletCleared: boolean;
  /** Distinct franchises whose round was won in this run. */
  franchisesCleared: number;
  /** Present for duel / party. */
  players?: ScoutRunPlayerResult[];
  /** Present for duel / party — the owner's side of the result. */
  duel?: ScoutDuelResult;
  /** Unique top scorer of a multiplayer run. */
  winnerName?: string;
  roundStats: ScoutRoundStat[];
}

/** `ScoutRunRecord` before XP is priced in (`progress.ts` finishes the job). */
export type ScoutRunSummary = Omit<ScoutRunRecord, 'xp'>;

/** Lifetime per-subject history row. */
export interface ScoutSubjectRecord {
  /** `'player:3139477'`. */
  key: string;
  kind: SubjectKind;
  id: string;
  name: string;
  teamId?: string;
  teamAbbr?: string;
  group?: PositionGroup;
  tier: ScoutFameTier;
  timesSeen: number;
  timesCorrect: number;
  /** Shortest rung (0-based) this subject was ever named at; null = never named. */
  bestRung: number | null;
  /** The puzzle type that best call came in. */
  bestRungMode?: ScoutMode;
  lastSeen: number;
}

/** One counter bucket of a cut (position group, division, franchise, …). */
export interface ScoutCutTotals {
  seen: number;
  correct: number;
  /** Sum of 1-based rungs over solved rounds — divide by `solved` for the mean. */
  rungSum: number;
  solved: number;
}

/** Per-format run totals, the Scout twin of `ModeTotals`. */
export interface ScoutFormatRunTotals {
  runs: number;
  best: number;
  avg: number;
}

/** The shortest rung at which the player ever named anybody. */
export interface ScoutBestCall {
  key: string;
  subjectId: string;
  name: string;
  mode: ScoutMode;
  /** 0-based. */
  rung: number;
  tier: ScoutFameTier;
  teamAbbr?: string;
  runId: string;
  at: number;
}

/** Lifetime aggregates. Bounded key sets, so this never grows without limit. */
export interface ScoutStatsTotals {
  runs: number;
  /** Graded rounds. */
  rounds: number;
  correct: number;
  close: number;
  skipped: number;
  score: number;
  xp: number;
  timePlayedMs: number;
  bestStreak: number;
  bestScore: number;
  perfectRuns: number;
  firstRungSolves: number;
  byGroup: Record<string, ScoutCutTotals>;
  byConference: Record<string, ScoutCutTotals>;
  /** Keyed `'AFC West'`. */
  byDivision: Record<string, ScoutCutTotals>;
  byTier: Record<string, ScoutCutTotals>;
  byMode: Record<string, ScoutCutTotals>;
  byFormat: Record<string, ScoutCutTotals>;
  /** Keyed by ESPN team id — the heatmap's raw counts. */
  byTeam: Record<string, ScoutCutTotals>;
  runsByFormat: Record<string, ScoutFormatRunTotals>;
  bestCall: ScoutBestCall | null;
}

/** A completed daily, keyed by ISO date in the store. */
export interface ScoutDailyResult {
  /** `YYYY-MM-DD` */
  date: string;
  score: number;
  correct: number;
  rounds: number;
  grid: string;
}

export interface ScoutAchievementUnlock {
  id: string;
  at: number;
  runId: string;
}

/* --------------------------------------------------------------------------------- grading */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The winning guess of a round, if it was won. */
export function scoutWinningGuess(round: ScoutRound): ScoutRound['guesses'][number] | undefined {
  return round.guesses.find((g) => g.verdict === 'correct');
}

/**
 * Rounds that count towards stats: anything resolved, plus an unresolved round the player already
 * guessed on (a blitz clock can stop mid-round). A round the engine auto-marked `skipped` before any
 * guess — the run was quit, or the queue moved on — was never attempted and must not drag accuracy
 * down.
 */
export function gradedScoutRounds(state: ScoutState): ScoutRound[] {
  return state.rounds.filter(
    (r) => (r.status !== 'playing' && r.status !== 'skipped') || r.guesses.length > 0,
  );
}

/** One glyph per round: solved, one name away, passed, missed. */
export function scoutRoundGlyph(round: ScoutRound): string {
  if (round.status === 'won') return '🟩';
  if (round.guesses.some((g) => g.verdict === 'close')) return '🟨';
  if (round.guesses.length > 0 && round.guesses.every((g) => g.verdict === 'skipped')) return '⬜';
  return '🟥';
}

/** `🟩🟩🟨🟥🟩` — wrapped every ten rounds so it pastes tidily. */
export function scoutRunGrid(state: ScoutState): string {
  const glyphs = gradedScoutRounds(state).map(scoutRoundGlyph);
  const lines: string[] = [];
  for (let i = 0; i < glyphs.length; i += 10) lines.push(glyphs.slice(i, i + 10).join(''));
  return lines.join('\n');
}

function triesUsedIn(round: ScoutRound): number {
  const win = scoutWinningGuess(round);
  if (win) return win.tryIndex + 1;
  return Math.max(round.tryIndex, round.guesses.length > 0 ? 1 : 0);
}

/** Condense one round into its stat row. `triesAllowed` comes from the run settings. */
export function scoutRoundStat(round: ScoutRound, triesAllowed: number, fallbackEnd: number): ScoutRoundStat {
  const subject = round.subject;
  const player = subject.player;
  const win = scoutWinningGuess(round);
  const from = roundSeenAt(round) ?? round.startedAt;
  const teamId = franchiseIdOf(subject);
  const info = scoutTeamInfo(teamId);
  const conference = subject.team?.conference ?? info?.conf;
  const division = subject.team?.division ?? info?.div;
  const stat: ScoutRoundStat = {
    index: round.index,
    mode: round.mode,
    kind: subject.kind,
    subjectId: subject.id,
    key: `${subject.kind}:${subject.id}`,
    name: subject.name,
    tier: asScoutFameTier(subject.tier),
    rookie: player?.exp !== undefined && player.exp <= 1,
    won: round.status === 'won',
    close: round.status !== 'won' && round.guesses.some((g) => g.verdict === 'close'),
    skipped: round.guesses.some((g) => g.verdict === 'skipped'),
    timedOut: round.guesses.some((g) => g.verdict === 'timeout'),
    rung: win ? win.tryIndex : null,
    triesUsed: triesUsedIn(round),
    triesAllowed: Math.max(1, triesAllowed),
    guesses: round.guesses.length,
    score: round.score,
    ms: Math.max(0, (round.endedAt ?? fallbackEnd) - from),
  };
  if (player) {
    stat.group = player.group;
    stat.pos = player.pos;
    if (player.fame !== undefined) stat.fame = player.fame;
    if (player.exp !== undefined) stat.exp = player.exp;
  }
  if (teamId !== undefined) stat.teamId = teamId;
  const abbr = subject.team?.abbr ?? info?.abbr;
  if (abbr !== undefined) stat.teamAbbr = abbr;
  if (conference !== undefined) stat.conference = conference;
  if (division !== undefined) stat.division = division;
  if (conference !== undefined && division !== undefined) stat.divisionKey = `${conference} ${division}`;
  if (round.winnerPlayerId !== undefined) stat.winnerPlayerId = round.winnerPlayerId;
  return stat;
}

/** The format a finished run was played in (`extras.format` overrides the settings). */
export function scoutRunFormat(settings: ScoutSettings, extras: ScoutRunExtras = {}): ScoutFormat {
  return extras.format !== undefined ? asScoutFormat(extras.format) : scoutFormat(settings);
}

/** Seats with a score, for the record. Empty for the solo formats. */
function playerResults(players: readonly ScoutPlayerState[] | undefined): ScoutRunPlayerResult[] {
  if (!players || players.length < 2) return [];
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    score: p.score,
    correct: p.correct,
    bestStreak: p.bestStreak,
  }));
}

/**
 * The owner's side of a multiplayer result. Seat 1 is "me" — local multiplayer has no notion of an
 * account, and this is the convention `src/stats/achievements.ts` already uses for Songooner.
 */
export function scoutDuelResultOf(players: readonly ScoutRunPlayerResult[]): ScoutDuelResult | null {
  if (players.length < 2) return null;
  const me = players[0];
  const rest = players.slice(1);
  let bestOther = rest[0];
  for (const p of rest) if (p.score > bestOther.score) bestOther = p;
  const result: ScoutDuelResult = {
    mine: me.score,
    theirs: bestOther.score,
    won: rest.every((p) => p.score < me.score),
  };
  if (bestOther.name !== '') result.opponent = bestOther.name;
  return result;
}

/** The unique top scorer of a multiplayer run, if there is one. */
export function scoutWinnerName(players: readonly ScoutRunPlayerResult[]): string | undefined {
  if (players.length < 2) return undefined;
  let top = players[0];
  for (const p of players) if (p.score > top.score) top = p;
  return players.filter((p) => p.score === top.score).length === 1 ? top.name : undefined;
}

/**
 * Fold a finished run into a storable summary. Null when the run never finished or has no id —
 * `progress.finalizeScoutRun` adds the XP and produces the full `ScoutRunRecord`.
 */
export function summarizeScoutRun(state: ScoutState, extras: ScoutRunExtras = {}): ScoutRunSummary | null {
  if (state.status !== 'finished' || state.id === '') return null;
  const finishedAt = state.finishedAt ?? state.startedAt ?? 0;
  const graded = gradedScoutRounds(state);
  const roundStats = graded.map((r) => scoutRoundStat(r, state.settings.tries, finishedAt));
  const won = roundStats.filter((r) => r.won);
  const rungSum = won.reduce((n, r) => n + ((r.rung ?? 0) + 1), 0);
  const players = playerResults(state.players);
  const summary: ScoutRunSummary = {
    id: state.id,
    finishedAt,
    durationMs: Math.max(0, finishedAt - (state.startedAt ?? finishedAt)),
    format: scoutRunFormat(state.settings, extras),
    mode: state.settings.mode,
    mixModes: state.settings.mixModes,
    packIds: state.settings.packIds.slice(),
    difficulty: state.settings.difficulty,
    tries: state.settings.tries,
    rounds: roundStats.length,
    correct: won.length,
    close: roundStats.filter((r) => r.close).length,
    skipped: roundStats.filter((r) => r.skipped).length,
    timeouts: roundStats.filter((r) => r.timedOut).length,
    score: state.totalScore,
    bestStreak: state.bestStreak,
    avgRung: won.length === 0 ? 0 : round2(rungSum / won.length),
    firstRungSolves: won.filter((r) => r.rung === 0).length,
    perfect: roundStats.length > 0 && won.length === roundStats.length && won.every((r) => r.rung === 0),
    noSkips: roundStats.length > 0 && roundStats.every((r) => !r.skipped),
    grid: scoutRunGrid(state),
    survived: extras.survived !== undefined ? Math.max(0, Math.floor(extras.survived)) : won.length,
    gauntletCleared: extras.gauntletCleared ?? state.endReason === 'gauntlet',
    franchisesCleared: new Set(won.map((r) => r.teamId).filter((id): id is string => id !== undefined)).size,
    roundStats,
  };
  if (state.endReason) summary.endReason = state.endReason;
  if (state.settings.seed) summary.seed = state.settings.seed;
  if (state.settings.daily) summary.daily = state.settings.daily;
  if (players.length >= 2) {
    summary.players = players;
    const winner = scoutWinnerName(players);
    if (winner !== undefined) summary.winnerName = winner;
  }
  const duel = extras.duel ?? scoutDuelResultOf(players);
  if (duel) summary.duel = { ...duel };
  return summary;
}

/* ---------------------------------------------------------------------------------- totals */

function emptyCut(): ScoutCutTotals {
  return { seen: 0, correct: 0, rungSum: 0, solved: 0 };
}

function seedCuts(keys: readonly string[]): Record<string, ScoutCutTotals> {
  const out: Record<string, ScoutCutTotals> = {};
  for (const key of keys) out[key] = emptyCut();
  return out;
}

/** A zeroed totals object with every known cut key pre-seeded. Safe to mutate — it is fresh. */
export function emptyScoutTotals(): ScoutStatsTotals {
  return {
    runs: 0,
    rounds: 0,
    correct: 0,
    close: 0,
    skipped: 0,
    score: 0,
    xp: 0,
    timePlayedMs: 0,
    bestStreak: 0,
    bestScore: 0,
    perfectRuns: 0,
    firstRungSolves: 0,
    byGroup: seedCuts(SCOUT_POSITION_GROUPS),
    byConference: seedCuts(SCOUT_CONFERENCES),
    byDivision: seedCuts(SCOUT_DIVISION_KEYS),
    byTier: seedCuts(SCOUT_FAME_TIERS),
    byMode: seedCuts(SCOUT_MODE_KEYS),
    byFormat: seedCuts(SCOUT_FORMAT_IDS),
    byTeam: seedCuts(SCOUT_TEAM_META.map((t) => t.id)),
    runsByFormat: {},
    bestCall: null,
  };
}

function bumpCut(
  bucket: Record<string, ScoutCutTotals>,
  key: string | undefined,
  stat: ScoutRoundStat,
): void {
  if (key === undefined) return;
  const prev = bucket[key] ?? emptyCut();
  bucket[key] = {
    seen: prev.seen + 1,
    correct: prev.correct + (stat.won ? 1 : 0),
    rungSum: prev.rungSum + (stat.won ? (stat.rung ?? 0) + 1 : 0),
    solved: prev.solved + (stat.won ? 1 : 0),
  };
}

/** True when `next` is a strictly better call than `prev` (shorter rung, or as short but harder). */
export function isBetterScoutCall(next: ScoutBestCall, prev: ScoutBestCall | null): boolean {
  if (!prev) return true;
  if (next.rung !== prev.rung) return next.rung < prev.rung;
  return SCOUT_TIER_HARDNESS[next.tier] > SCOUT_TIER_HARDNESS[prev.tier];
}

/** The best single call inside one run, if it had any. */
export function bestCallOfRun(record: ScoutRunSummary): ScoutBestCall | null {
  let best: ScoutBestCall | null = null;
  for (const stat of record.roundStats) {
    if (!stat.won || stat.rung === null) continue;
    const candidate: ScoutBestCall = {
      key: stat.key,
      subjectId: stat.subjectId,
      name: stat.name,
      mode: stat.mode,
      rung: stat.rung,
      tier: stat.tier,
      runId: record.id,
      at: record.finishedAt,
    };
    if (stat.teamAbbr !== undefined) candidate.teamAbbr = stat.teamAbbr;
    if (isBetterScoutCall(candidate, best)) best = candidate;
  }
  return best;
}

/** Fold a finished run into lifetime totals. Returns a new object; `totals` is never mutated. */
export function applyScoutRun(totals: ScoutStatsTotals, record: ScoutRunRecord): ScoutStatsTotals {
  const next: ScoutStatsTotals = {
    ...totals,
    runs: totals.runs + 1,
    rounds: totals.rounds + record.rounds,
    correct: totals.correct + record.correct,
    close: totals.close + record.close,
    skipped: totals.skipped + record.skipped,
    score: totals.score + record.score,
    xp: totals.xp + record.xp,
    timePlayedMs: totals.timePlayedMs + record.durationMs,
    bestStreak: Math.max(totals.bestStreak, record.bestStreak),
    bestScore: Math.max(totals.bestScore, record.score),
    perfectRuns: totals.perfectRuns + (record.perfect ? 1 : 0),
    firstRungSolves: totals.firstRungSolves + record.firstRungSolves,
    byGroup: { ...totals.byGroup },
    byConference: { ...totals.byConference },
    byDivision: { ...totals.byDivision },
    byTier: { ...totals.byTier },
    byMode: { ...totals.byMode },
    byFormat: { ...totals.byFormat },
    byTeam: { ...totals.byTeam },
    runsByFormat: { ...totals.runsByFormat },
    bestCall: totals.bestCall,
  };

  for (const stat of record.roundStats) {
    bumpCut(next.byGroup, stat.group, stat);
    bumpCut(next.byConference, stat.conference, stat);
    bumpCut(next.byDivision, stat.divisionKey, stat);
    bumpCut(next.byTier, stat.tier, stat);
    bumpCut(next.byMode, stat.mode, stat);
    bumpCut(next.byFormat, record.format, stat);
    bumpCut(next.byTeam, stat.teamId, stat);
  }

  const prevFormat = next.runsByFormat[record.format] ?? { runs: 0, best: 0, avg: 0 };
  const runs = prevFormat.runs + 1;
  next.runsByFormat[record.format] = {
    runs,
    best: Math.max(prevFormat.best, record.score),
    avg: round2((prevFormat.avg * prevFormat.runs + record.score) / runs),
  };

  const call = bestCallOfRun(record);
  if (call && isBetterScoutCall(call, next.bestCall)) next.bestCall = call;
  return next;
}

/** Lifetime accuracy, 0..1. */
export function scoutTotalsAccuracy(totals: ScoutStatsTotals): number {
  return totals.rounds === 0 ? 0 : totals.correct / totals.rounds;
}

/** Accuracy of one cut bucket, 0..1 (0 when never seen). */
export function scoutCutAccuracy(cut: ScoutCutTotals | undefined): number {
  return cut && cut.seen > 0 ? cut.correct / cut.seen : 0;
}

/** Mean 1-based rung of the solved rounds in a bucket (0 when none were solved). */
export function scoutCutAvgRung(cut: ScoutCutTotals | undefined): number {
  return cut && cut.solved > 0 ? round2(cut.rungSum / cut.solved) : 0;
}

/* ------------------------------------------------------------------------- subject history */

/** Merge a finished run into per-subject history. Returns a new Map; the input is not mutated. */
export function updateScoutSubjects(
  map: ReadonlyMap<string, ScoutSubjectRecord>,
  record: ScoutRunRecord,
): Map<string, ScoutSubjectRecord> {
  const next = new Map(map);
  for (const stat of record.roundStats) {
    const prev = next.get(stat.key);
    const row: ScoutSubjectRecord = {
      key: stat.key,
      kind: stat.kind,
      id: stat.subjectId,
      name: stat.name,
      tier: stat.tier,
      timesSeen: (prev?.timesSeen ?? 0) + 1,
      timesCorrect: (prev?.timesCorrect ?? 0) + (stat.won ? 1 : 0),
      bestRung: prev?.bestRung ?? null,
      lastSeen: Math.max(prev?.lastSeen ?? 0, record.finishedAt),
    };
    if (stat.teamId !== undefined) row.teamId = stat.teamId;
    if (stat.teamAbbr !== undefined) row.teamAbbr = stat.teamAbbr;
    if (stat.group !== undefined) row.group = stat.group;
    if (prev?.bestRungMode !== undefined) row.bestRungMode = prev.bestRungMode;
    if (stat.won && stat.rung !== null && (row.bestRung === null || stat.rung < row.bestRung)) {
      row.bestRung = stat.rung;
      row.bestRungMode = stat.mode;
    }
    next.set(stat.key, row);
  }
  return next;
}

/** Keep the `max` most recently seen subjects. Returns a new Map. */
export function capScoutSubjects(
  map: ReadonlyMap<string, ScoutSubjectRecord>,
  max = MAX_SCOUT_SUBJECTS,
): Map<string, ScoutSubjectRecord> {
  if (map.size <= max) return new Map(map);
  const rows = [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, max);
  return new Map(rows.map((r) => [r.key, r]));
}

/** Franchises with at least one correct call. */
export function scoutTeamsKnown(totals: ScoutStatsTotals): number {
  return Object.values(totals.byTeam).filter((c) => c.correct > 0).length;
}

/** Franchises of one division (`'AFC West'`) the player has named someone from. */
export function scoutDivisionTeamsKnown(totals: ScoutStatsTotals, divisionKey: string): number {
  let n = 0;
  for (const team of SCOUT_TEAM_META) {
    if (`${team.conf} ${team.div}` !== divisionKey) continue;
    if ((totals.byTeam[team.id]?.correct ?? 0) > 0) n += 1;
  }
  return n;
}

/** Division keys where all four franchises have been named. */
export function scoutDivisionsSwept(totals: ScoutStatsTotals): string[] {
  return SCOUT_DIVISION_KEYS.filter((key) => scoutDivisionTeamsKnown(totals, key) >= 4);
}
