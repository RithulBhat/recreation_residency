/**
 * Dataset → playable subjects.
 *
 * `buildSubject(mode, source)` resolves one player or team into a {@link ScoutSubject} with every
 * accepted spelling, the image URL the mode needs and the attached play / stat line; it returns
 * `null` when the mode cannot be rendered from that source (no headshot for silhouette, no play for
 * highlight, a stat line with fewer than two pairs, …).
 *
 * `buildPool(dataset, settings, rng)` applies the selected packs and difficulty tier, drops
 * unrenderable subjects, deduplicates by kind + id, and orders the result. Seeded runs sort by
 * `hashToUnit('<seed>|<kind>:<id>')` — the same trick Songooner uses — so a subject that disappears
 * from one device's dataset only removes itself instead of reshuffling the whole run.
 *
 * The six CHOICE-SHAPED modes (`teammates`, `depthChart`, `draftClass`, `higherLower`, `oddOneOut`,
 * `jersey`) need a SET of players per round rather than one subject, so `buildPool` also asks
 * `@/scout/puzzles` for their payloads and attaches them as `subject.puzzle`. A subject carrying one
 * is playable in that mode only, and its dedupe key carries the puzzle type — the same man can
 * anchor a `teammates` round and a `jersey` round in one mixed pool.
 */

import { createRng, hashToUnit, type Rng } from '@/game/rng';
import { SCOUT_PACKS, type ScoutDraftFilter } from './packs';
import { buildScoutPuzzleSpecs, draftYearAccepted, isScoutPuzzleMode, type ScoutPuzzleSpec } from './puzzles';
import type {
  Conference,
  DivisionName,
  HighlightPlay,
  NflDataset,
  NflPlayer,
  NflTeam,
  PositionGroup,
  ScoutDifficulty,
  ScoutMode,
  ScoutPack,
  ScoutPackFilter,
  ScoutPuzzle,
  ScoutSettings,
  ScoutSubject,
  StatLine,
  SubjectKind,
} from './types';

/** Fame thresholds (CLAUDE.md): star ≥ 80, starter 55–79, rotation 30–54, deepCut < 30. */
export const TIER_THRESHOLDS = { star: 80, starter: 55, rotation: 30 } as const;

export const PLAYER_MODES: readonly ScoutMode[] = [
  'silhouette',
  'faceZoom',
  'highlight',
  'statLine',
  'careerPath',
  // choice-shaped (ADDED) — the answer is a player, even where the round is answered by tapping
  'teammates',
  'draftClass',
  'higherLower',
  'oddOneOut',
  'jersey',
];
export const TEAM_MODES: readonly ScoutMode[] = ['teamTrivia', 'logoZoom', 'depthChart'];
export const ALL_SCOUT_MODES: readonly ScoutMode[] = [...PLAYER_MODES, ...TEAM_MODES];

export const MIN_STAT_PAIRS = 2;

export function tierOf(player: NflPlayer): ScoutDifficulty {
  const fame = Number.isFinite(player.fame) ? player.fame : 0;
  if (fame >= TIER_THRESHOLDS.star) return 'star';
  if (fame >= TIER_THRESHOLDS.starter) return 'starter';
  if (fame >= TIER_THRESHOLDS.rotation) return 'rotation';
  return 'deepCut';
}

/** Franchises have no fame score; their tier comes from championship history. */
export function teamTier(team: NflTeam): ScoutDifficulty {
  const n = team.superBowls.length;
  if (n >= 3) return 'star';
  if (n >= 1) return 'starter';
  return 'rotation';
}

export function subjectKindForMode(mode: ScoutMode): SubjectKind {
  return TEAM_MODES.includes(mode) ? 'team' : 'player';
}

// ---------------------------------------------------------------------------------------------
// Accepted spellings
// ---------------------------------------------------------------------------------------------

function pushLower(out: string[], value: string | undefined): void {
  if (!value) return;
  const v = value.trim().toLowerCase();
  if (v !== '' && !out.includes(v)) out.push(v);
}

/** Every spelling a player may be guessed as (the matcher normalizes these further). */
export function playerAccepted(player: NflPlayer): string[] {
  const out: string[] = [];
  pushLower(out, player.name);
  pushLower(out, `${player.first} ${player.last}`);
  pushLower(out, player.last);
  if (player.first) pushLower(out, `${player.first[0]} ${player.last}`);
  for (const a of player.aliases ?? []) pushLower(out, a);
  return out;
}

/** Every spelling a franchise may be guessed as. */
export function teamAccepted(team: NflTeam): string[] {
  const out: string[] = [];
  pushLower(out, team.displayName);
  pushLower(out, `${team.location} ${team.name}`);
  pushLower(out, team.name);
  pushLower(out, `the ${team.name}`);
  pushLower(out, team.location);
  pushLower(out, team.abbr);
  for (const a of team.aliases) pushLower(out, a);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Subject construction
// ---------------------------------------------------------------------------------------------

export interface SubjectSource {
  player?: NflPlayer;
  team?: NflTeam;
  play?: HighlightPlay;
  statLine?: StatLine;
  /** ADDED — the payload of a choice-shaped round (`@/scout/puzzles`). */
  puzzle?: ScoutPuzzle;
}

export function buildPlayerSubject(
  player: NflPlayer,
  team?: NflTeam,
  extra: { play?: HighlightPlay; statLine?: StatLine } = {},
): ScoutSubject {
  const subject: ScoutSubject = {
    kind: 'player',
    id: player.id,
    name: player.name,
    accepted: playerAccepted(player),
    image: player.headshot,
    player,
    tier: tierOf(player),
  };
  if (team) subject.team = team;
  if (extra.play) subject.play = extra.play;
  if (extra.statLine) subject.statLine = extra.statLine;
  return subject;
}

export function buildTeamSubject(team: NflTeam): ScoutSubject {
  return {
    kind: 'team',
    id: team.id,
    name: team.displayName,
    accepted: teamAccepted(team),
    image: team.logo,
    team,
    tier: teamTier(team),
  };
}

/**
 * True when `mode` has everything it needs to render `subject`.
 *
 * A subject that carries a {@link ScoutPuzzle} is playable in THAT MODE AND NOTHING ELSE. Without
 * that rule a `draftClass` subject — a player record whose accepted answer is a year — would also
 * pass the silhouette check and a mixed run would show a headshot whose answer was '2019'.
 */
export function canRender(mode: ScoutMode, subject: ScoutSubject): boolean {
  if (subjectKindForMode(mode) !== subject.kind) return false;
  if (subject.puzzle) return subject.puzzle.type === mode;
  if (isScoutPuzzleMode(mode)) return false;
  switch (mode) {
    case 'silhouette':
    case 'faceZoom':
      return Boolean(subject.player && subject.image);
    case 'highlight':
      return Boolean(subject.play && (subject.play.redacted || subject.play.text));
    case 'statLine':
      return (subject.statLine?.stats.length ?? 0) >= MIN_STAT_PAIRS;
    case 'careerPath':
      return Boolean(subject.player && (subject.player.draft || subject.player.college));
    case 'teamTrivia':
      return Boolean(subject.team && (subject.team.facts.length > 0 || subject.team.legends.length > 0));
    case 'logoZoom':
      return Boolean(subject.team && subject.image);
    default:
      return false;
  }
}

/** Which of `allowed` this subject can actually be played in, in `allowed` order. */
export function playableModes(subject: ScoutSubject, allowed: readonly ScoutMode[] = ALL_SCOUT_MODES): ScoutMode[] {
  return allowed.filter((m) => canRender(m, subject));
}

/** Resolve a source into a subject for one mode, or null when the mode cannot render it. */
export function buildSubject(mode: ScoutMode, source: SubjectSource): ScoutSubject | null {
  if (subjectKindForMode(mode) === 'team') {
    if (!source.team) return null;
    const subject = buildTeamSubject(source.team);
    if (source.puzzle) subject.puzzle = source.puzzle;
    return canRender(mode, subject) ? subject : null;
  }
  if (!source.player) return null;
  const subject = buildPlayerSubject(source.player, source.team, { play: source.play, statLine: source.statLine });
  if (source.puzzle) subject.puzzle = source.puzzle;
  return canRender(mode, subject) ? subject : null;
}

// ---------------------------------------------------------------------------------------------
// Choice-shaped subjects
// ---------------------------------------------------------------------------------------------

/**
 * A {@link ScoutPuzzleSpec} → the subject a round is built around.
 *
 * `depthChart` answers a franchise, so it is a team subject. The rest answer a player — except
 * `draftClass`, whose answer is a YEAR: that one deliberately carries NO `player`, because the
 * matcher derives surname variants from `subject.player` and would otherwise accept the anchor's
 * surname as a correct answer to "which draft?". It keeps his id and headshot (so the reveal has a
 * face and `subjectImage` still resolves) and nothing else.
 */
export function buildPuzzleSubject(spec: ScoutPuzzleSpec): ScoutSubject | null {
  if (spec.mode === 'depthChart') {
    if (!spec.team) return null;
    const subject = buildTeamSubject(spec.team);
    subject.puzzle = spec.puzzle;
    return canRender(spec.mode, subject) ? subject : null;
  }
  if (!spec.player) return null;
  if (spec.answer) {
    const subject: ScoutSubject = {
      kind: 'player',
      id: spec.player.id,
      name: spec.answer.name,
      accepted: spec.answer.accepted.slice(),
      image: spec.player.headshot,
      tier: tierOf(spec.player),
      puzzle: spec.puzzle,
    };
    return canRender(spec.mode, subject) ? subject : null;
  }
  const subject = buildPlayerSubject(spec.player, spec.team);
  subject.puzzle = spec.puzzle;
  return canRender(spec.mode, subject) ? subject : null;
}

/** The accepted spellings of a `draftClass` answer, re-exported so screens can explain the answer. */
export { draftYearAccepted };

// ---------------------------------------------------------------------------------------------
// Pack filters
// ---------------------------------------------------------------------------------------------

function inList<T>(list: readonly T[] | undefined, value: T): boolean {
  return !list || list.length === 0 || list.includes(value);
}

export function playerMatchesFilter(player: NflPlayer, filter: ScoutPackFilter, team?: NflTeam): boolean {
  if (filter.ids && filter.ids.includes(player.id)) return true;
  // draft rules live in `ScoutDraftFilter` (packs.ts), an optional extension of the frozen filter
  const draft = filter as ScoutDraftFilter;
  if (draft.undrafted === true && player.draft) return false;
  if (typeof draft.maxDraftRound === 'number' && (!player.draft || player.draft.round > draft.maxDraftRound)) {
    return false;
  }
  if (typeof draft.minDraftYear === 'number' && (!player.draft || player.draft.year < draft.minDraftYear)) {
    return false;
  }
  if (!inList(filter.teamIds, player.teamId)) return false;
  if (filter.conferences && filter.conferences.length > 0) {
    if (!team || !filter.conferences.includes(team.conference)) return false;
  }
  if (filter.divisions && filter.divisions.length > 0) {
    if (!team || !filter.divisions.includes(team.division)) return false;
  }
  if (!inList(filter.groups, player.group)) return false;
  if (filter.positions && filter.positions.length > 0) {
    const pos = player.pos.toUpperCase();
    if (!filter.positions.some((p) => p.toUpperCase() === pos)) return false;
  }
  if (typeof filter.minFame === 'number' && player.fame < filter.minFame) return false;
  if (typeof filter.maxFame === 'number' && player.fame > filter.maxFame) return false;
  const exp = typeof player.exp === 'number' ? player.exp : 0;
  if (typeof filter.minExp === 'number' && exp < filter.minExp) return false;
  if (typeof filter.maxExp === 'number' && exp > filter.maxExp) return false;
  return true;
}

export function teamMatchesFilter(team: NflTeam, filter: ScoutPackFilter): boolean {
  if (filter.ids && filter.ids.includes(team.id)) return true;
  if (!inList(filter.teamIds, team.id)) return false;
  if (!inList<Conference>(filter.conferences, team.conference)) return false;
  if (!inList<DivisionName>(filter.divisions, team.division)) return false;
  return true;
}

export function findPack(id: string): ScoutPack | undefined {
  return SCOUT_PACKS.find((p) => p.id === id);
}

export function resolvePacks(packIds: readonly string[]): ScoutPack[] {
  const out: ScoutPack[] = [];
  for (const id of packIds) {
    const pack = findPack(id);
    if (pack && !out.includes(pack)) out.push(pack);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pool building
// ---------------------------------------------------------------------------------------------

/** `NflDataset` plus the optional extras the loader ships separately. */
export interface ScoutPoolSource extends NflDataset {
  plays?: readonly HighlightPlay[];
  statLines?: readonly StatLine[];
}

/** Modes a run may serve up: every mode when `mixModes`, otherwise just the chosen one. */
export function activeModes(settings: Pick<ScoutSettings, 'mode' | 'mixModes'>): ScoutMode[] {
  return settings.mixModes ? [...ALL_SCOUT_MODES] : [settings.mode];
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of items) m.set(item.id, item);
  return m;
}

function groupByPlayer<T extends { playerId: string }>(items: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const list = m.get(item.playerId);
    if (list) list.push(item);
    else m.set(item.playerId, [item]);
  }
  return m;
}

/** Deterministic choice from a list, stable for (seed, key). */
function pickStable<T>(list: readonly T[], key: string, seed: string | undefined): T | undefined {
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const u = hashToUnit(`${seed ?? 'scout'}|${key}`);
  return list[Math.min(list.length - 1, Math.floor(u * list.length))];
}

/**
 * The dedupe / ordering key. A puzzle type is part of it: the same player anchors a `teammates` and
 * a `jersey` round, and both belong in a mixed pool.
 */
function subjectKey(subject: ScoutSubject): string {
  const base = `${subject.kind}:${subject.id}`;
  return subject.puzzle ? `${base}#${subject.puzzle.type}` : base;
}

/**
 * Seeded runs sort by a per-subject hash so a missing subject only removes itself;
 * unseeded runs get a plain rng shuffle.
 */
export function orderSubjects(subjects: readonly ScoutSubject[], seed: string | undefined, rng: Rng): ScoutSubject[] {
  if (seed === undefined) return rng.shuffle(subjects);
  const key = new Map<string, number>();
  for (const s of subjects) key.set(subjectKey(s), hashToUnit(`${seed}|${subjectKey(s)}`));
  return subjects
    .slice()
    .sort((a, b) => (key.get(subjectKey(a)) ?? 0) - (key.get(subjectKey(b)) ?? 0) || subjectKey(a).localeCompare(subjectKey(b)));
}

export interface BuildPoolOptions {
  /** Cap the pool (0 = no cap). */
  limit?: number;
}

/**
 * The playable pool for a run.
 *
 * Packs of `kind: 'player'` contribute players, packs of `kind: 'team'` contribute franchises; when
 * the selection has no pack of a kind an active mode needs, that kind falls back to the whole
 * dataset so a run can never be empty for the wrong reason. `difficulty` filters PLAYERS by
 * {@link tierOf} (franchises have no fame score and are always kept).
 */
export function buildPool(
  dataset: ScoutPoolSource,
  settings: ScoutSettings,
  rng: Rng = createRng(settings.seed),
  options: BuildPoolOptions = {},
): ScoutSubject[] {
  const modes = activeModes(settings);
  const wantsPlayers = modes.some((m) => subjectKindForMode(m) === 'player');
  const wantsTeams = modes.some((m) => subjectKindForMode(m) === 'team');
  const packs = resolvePacks(settings.packIds);
  const playerPacks = packs.filter((p) => p.kind === 'player');
  const teamPacks = packs.filter((p) => p.kind === 'team');
  const teams = byId(dataset.teams);
  const plays = groupByPlayer(dataset.plays ?? []);
  const statLines = groupByPlayer(dataset.statLines ?? []);
  const seed = settings.seed;

  const subjects: ScoutSubject[] = [];
  const seen = new Set<string>();

  if (wantsPlayers) {
    for (const player of dataset.players) {
      const team = teams.get(player.teamId);
      if (playerPacks.length > 0 && !playerPacks.some((p) => playerMatchesFilter(player, p.filter, team))) continue;
      if (settings.difficulty !== 'any' && tierOf(player) !== settings.difficulty) continue;
      const subject = buildPlayerSubject(player, team, {
        play: pickStable(plays.get(player.id) ?? [], `play|${player.id}`, seed),
        statLine: pickStable(statLines.get(player.id) ?? [], `stat|${player.id}`, seed),
      });
      if (playableModes(subject, modes).length === 0) continue;
      const key = subjectKey(subject);
      if (seen.has(key)) continue;
      seen.add(key);
      subjects.push(subject);
    }
  }

  if (wantsTeams) {
    for (const team of dataset.teams) {
      if (teamPacks.length > 0 && !teamPacks.some((p) => teamMatchesFilter(team, p.filter))) continue;
      const subject = buildTeamSubject(team);
      if (playableModes(subject, modes).length === 0) continue;
      const key = subjectKey(subject);
      if (seen.has(key)) continue;
      seen.add(key);
      subjects.push(subject);
    }
  }

  // Choice-shaped rounds are not one subject revealed slowly: each one needs a SET of real players,
  // so `@/scout/puzzles` reads the dataset and hands back payloads. Pack filters and the tier gate
  // the ANSWER; the cards come out of the tier's fame band (see `cardFameWindows`).
  const puzzleModes = modes.filter(isScoutPuzzleMode);
  if (puzzleModes.length > 0) {
    const specs = buildScoutPuzzleSpecs({
      dataset,
      modes: puzzleModes,
      difficulty: settings.difficulty,
      seed,
      rng,
      playerEligible: (player) => {
        const team = teams.get(player.teamId);
        if (playerPacks.length > 0 && !playerPacks.some((pk) => playerMatchesFilter(player, pk.filter, team))) return false;
        return settings.difficulty === 'any' || tierOf(player) === settings.difficulty;
      },
      teamEligible: (team) => teamPacks.length === 0 || teamPacks.some((pk) => teamMatchesFilter(team, pk.filter)),
    });
    for (const spec of specs) {
      const subject = buildPuzzleSubject(spec);
      if (!subject) continue;
      const key = subjectKey(subject);
      if (seen.has(key)) continue;
      seen.add(key);
      subjects.push(subject);
    }
  }

  const ordered = orderSubjects(subjects, seed, rng);
  const limit = options.limit ?? 0;
  return limit > 0 ? ordered.slice(0, limit) : ordered;
}

/** Group label lookup used by pack taglines and screens. */
export function groupsOf(players: readonly NflPlayer[]): PositionGroup[] {
  const set = new Set<PositionGroup>();
  for (const p of players) set.add(p.group);
  return [...set];
}
