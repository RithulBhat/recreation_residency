/**
 * The reveal ladder.
 *
 * `buildStages(mode, subject, tries, rng)` returns EXACTLY `tries` rungs. Rung 0 is the hardest
 * and every later rung shows strictly more: `visual` grows, and `clues` is CUMULATIVE — each rung's
 * array starts with the previous rung's clues and appends whatever just unlocked (newest last), so
 * a screen can render `stages[tryIndex]` and nothing else.
 *
 * Visual bounds (screens map these to a filter / scale):
 *   silhouette 0 → 0.85   (0 = pure black shape; the photo is never fully revealed before the answer)
 *   faceZoom   0.06 → 0.95 (0.06 = an extreme crop of one feature)
 *   logoZoom   0.1 → 0.95
 *   text modes stay at 0.
 *
 * Clue order per mode (unavailable clues are dropped, filler clues are appended before the final
 * giveaway so short ladders still gain information every rung):
 *   silhouette / faceZoom  position group → conference → experience → jersey → first initial
 *   highlight              redacted play text (rung 0) → team → situation → position → first initial
 *   teamTrivia             obscure facts (rung 0 first) → conference+division → venue →
 *                          Super Bowls → a legend → team colours last
 *   statLine               stat pairs one at a time (rung 0 shows one) → position → team
 *   careerPath             draft year (rung 0) → round/pick → college → team → jersey
 *   logoZoom               conference → division → venue (+ founded / Super Bowls / legend filler)
 *
 * `cropFocus` gives faceZoom and logoZoom a deterministic spot to zoom into: the same seed always
 * zooms the same feature. It is pure, so a screen can recompute it from `settings.seed` without
 * threading the rng, and it is also attached to every stage as `focus` (see `ScoutFocusStage`).
 */

import { hashToUnit, type Rng } from '@/game/rng';
import type { NflPlayer, NflTeam, PositionGroup, ScoutClue, ScoutMode, ScoutStage, ScoutSubject } from './types';

export const SILHOUETTE_MAX = 0.85;
export const FACE_ZOOM_MIN = 0.06;
export const FACE_ZOOM_MAX = 0.95;
export const LOGO_ZOOM_MIN = 0.1;
export const LOGO_ZOOM_MAX = 0.95;
export const MAX_STAT_CLUES = 6;

export const GROUP_LABELS: Readonly<Record<PositionGroup, string>> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  OL: 'Offensive line',
  DL: 'Defensive line',
  LB: 'Linebacker',
  DB: 'Defensive back',
  ST: 'Special teams',
};

/** 0..1 point the zoom modes crop around. */
export interface ScoutFocus {
  x: number;
  y: number;
}

/** A stage plus the deterministic crop centre (an additive convenience, not part of the contract). */
export interface ScoutFocusStage extends ScoutStage {
  focus: ScoutFocus;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clue(kind: ScoutClue['kind'], label: string, value: string): ScoutClue {
  return { kind, label, value };
}

function experienceValue(exp: number): string {
  if (exp <= 0) return 'Rookie';
  if (exp === 1) return '1 season';
  return `${exp} seasons`;
}

function initialValue(player: NflPlayer): string {
  const first = player.first.trim();
  return first === '' ? '?' : `${first[0].toUpperCase()}.`;
}

function draftValue(player: NflPlayer): string {
  return player.draft ? String(player.draft.year) : 'Undrafted';
}

function superBowlValue(team: NflTeam): string {
  const n = team.superBowls.length;
  if (n === 0) return 'Never won one';
  return n === 1 ? `1 (${team.superBowls[0]})` : `${n} titles`;
}

// ---------------------------------------------------------------------------------------------
// Ladder maths
// ---------------------------------------------------------------------------------------------

/** `tries` values from `min` to `max`, linear. A single try shows only `min`. */
export function visualLadder(tries: number, min: number, max: number): number[] {
  const n = Math.max(1, Math.floor(tries));
  if (n === 1) return [round3(min)];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(round3(min + (i / (n - 1)) * (max - min)));
  return out;
}

/**
 * How many clues are visible at each rung: `base` at rung 0 (0 for the visual modes, 1 for the
 * text modes whose first clue IS the puzzle), all `n` at the last rung, monotonically
 * non-decreasing in between.
 */
export function clueCounts(n: number, tries: number, base: number): number[] {
  const rungs = Math.max(1, Math.floor(tries));
  const b = Math.max(0, Math.min(base, n));
  if (rungs === 1) return [b];
  const out: number[] = [];
  for (let i = 0; i < rungs; i++) {
    const extra = Math.round((i * (n - b)) / (rungs - 1));
    out.push(Math.min(n, b + extra));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Crop focus
// ---------------------------------------------------------------------------------------------

function span(unit: number, lo: number, hi: number): number {
  return round3(lo + unit * (hi - lo));
}

/**
 * Deterministic crop centre for the zoom modes. Same (seed, mode, subject) → same spot.
 * Headshots are 600×436 with the head high and centred, so faceZoom stays in that band.
 */
export function cropFocus(subject: ScoutSubject, mode: ScoutMode, seed?: string): ScoutFocus {
  const key = `${seed ?? ''}|${mode}|${subject.kind}:${subject.id}`;
  const ux = hashToUnit(`${key}|x`);
  const uy = hashToUnit(`${key}|y`);
  if (mode === 'faceZoom') return { x: span(ux, 0.36, 0.64), y: span(uy, 0.16, 0.44) };
  if (mode === 'logoZoom') return { x: span(ux, 0.3, 0.7), y: span(uy, 0.3, 0.7) };
  return { x: 0.5, y: 0.5 };
}

// ---------------------------------------------------------------------------------------------
// Which team a clue is actually about
// ---------------------------------------------------------------------------------------------

/**
 * ESPN team id → franchise name, for the ONE case a clue is about a team the subject is not on.
 *
 * `ScoutSubject.team` is the player's CURRENT club. A highlight play carries its own `teamId`, and
 * MEASURED against the shipped dataset, 414 of the 1,700 plays (24%) were run by a different club
 * than the player is on now — so building the Film Room "Team" clue from `subject.team` captioned a
 * 2024 Vikings play with a 2026 roster spot and contradicted itself.
 *
 * Why a literal and not a lookup into `@/data/nfl`: this module is pure and synchronous, and the
 * ladder has to be REPRODUCIBLE — a daily or challenge seed must build the same clues whether or
 * not some async index happened to be warm yet. The 32 entries are pinned to `teams.json` by
 * `src/components/scout/playTeam.test.ts`, which fails the moment they drift.
 */
const TEAM_NAMES: Readonly<Record<string, string>> = {
  '1': 'Atlanta Falcons',
  '2': 'Buffalo Bills',
  '3': 'Chicago Bears',
  '4': 'Cincinnati Bengals',
  '5': 'Cleveland Browns',
  '6': 'Dallas Cowboys',
  '7': 'Denver Broncos',
  '8': 'Detroit Lions',
  '9': 'Green Bay Packers',
  '10': 'Tennessee Titans',
  '11': 'Indianapolis Colts',
  '12': 'Kansas City Chiefs',
  '13': 'Las Vegas Raiders',
  '14': 'Los Angeles Rams',
  '15': 'Miami Dolphins',
  '16': 'Minnesota Vikings',
  '17': 'New England Patriots',
  '18': 'New Orleans Saints',
  '19': 'New York Giants',
  '20': 'New York Jets',
  '21': 'Philadelphia Eagles',
  '22': 'Arizona Cardinals',
  '23': 'Pittsburgh Steelers',
  '24': 'Los Angeles Chargers',
  '25': 'San Francisco 49ers',
  '26': 'Seattle Seahawks',
  '27': 'Tampa Bay Buccaneers',
  '28': 'Washington Commanders',
  '29': 'Carolina Panthers',
  '30': 'Jacksonville Jaguars',
  '33': 'Baltimore Ravens',
  '34': 'Houston Texans',
};

/** The franchise a team id names, preferring the subject's own record when it is the same club. */
export function teamNameById(id: string, known?: NflTeam): string | undefined {
  if (known && known.id === id) return known.displayName;
  return TEAM_NAMES[id];
}

// ---------------------------------------------------------------------------------------------
// Clue orders
// ---------------------------------------------------------------------------------------------

export interface ClueOrder {
  /** Hardest-first; index 0 unlocks first. */
  clues: ScoutClue[];
  /** How many of them are already visible at rung 0. */
  base: number;
  visual: { min: number; max: number };
}

function playerFiller(player: NflPlayer): ScoutClue[] {
  const out: ScoutClue[] = [];
  if (player.college) out.push(clue('college', 'College', player.college));
  if (player.heightIn && player.weightLb) {
    out.push(clue('physical', 'Build', `${Math.floor(player.heightIn / 12)}'${player.heightIn % 12}", ${player.weightLb} lb`));
  }
  if (player.draft) out.push(clue('draft', 'Drafted', String(player.draft.year)));
  return out;
}

/** position group → conference → experience → jersey → first initial (+ filler before the initial). */
function playerLadder(player: NflPlayer, team: NflTeam | undefined, tries: number): ScoutClue[] {
  const core: ScoutClue[] = [clue('position', 'Position', GROUP_LABELS[player.group])];
  if (team) core.push(clue('conference', 'Conference', team.conference));
  if (typeof player.exp === 'number') core.push(clue('experience', 'Experience', experienceValue(player.exp)));
  if (player.jersey) core.push(clue('jersey', 'Jersey', `#${player.jersey}`));
  const tail = [clue('initials', 'First initial', initialValue(player))];
  // Filler only when the canonical five cannot give one clue per rung after rung 0 — the spec
  // ladder (position → conference → experience → jersey → initial) is never padded.
  const filler = playerFiller(player).filter((f) => !core.some((c) => c.kind === f.kind));
  while (core.length + tail.length < tries - 1 && filler.length > 0) {
    const next = filler.shift();
    if (next) core.push(next);
  }
  return [...core, ...tail];
}

function highlightLadder(subject: ScoutSubject, player: NflPlayer, tries: number): ScoutClue[] {
  const play = subject.play;
  const out: ScoutClue[] = [];
  if (play) out.push(clue('play', 'The play', play.redacted || play.text));
  // The team that RAN THE PLAY, which a quarter of the time is not the club the player is on now.
  // A play is a moment in a season, so the clue about it has to belong to that season too.
  const playTeam = play ? teamNameById(play.teamId, subject.team) : undefined;
  // When the play's club IS the club he is on now, plain "Team" says everything; when it is not,
  // the label has to say which team it means, or the clue reads as a roster spot he no longer has.
  const moved = play !== undefined && subject.team !== undefined && subject.team.id !== play.teamId;
  if (playTeam) out.push(clue('team', moved ? 'Team on the play' : 'Team', playTeam));
  else if (subject.team) out.push(clue('team', 'Team', subject.team.displayName));
  if (play) {
    // The season rides with the situation, so nothing on screen implies the play is from this year.
    out.push(clue('play', 'Situation', `${play.season} · Q${play.quarter} · ${play.clock} · ${play.kind}`));
  }
  out.push(clue('position', 'Position', GROUP_LABELS[player.group]));
  if (out.length + 1 < tries && play) {
    out.push(clue('play', 'When', `Week ${play.week}, ${play.season}`));
  }
  if (out.length + 1 < tries && typeof player.exp === 'number') {
    out.push(clue('experience', 'Experience', experienceValue(player.exp)));
  }
  out.push(clue('initials', 'First initial', initialValue(player)));
  return out;
}

function statLadder(subject: ScoutSubject, player: NflPlayer): ScoutClue[] {
  const pairs = (subject.statLine?.stats ?? []).slice(0, MAX_STAT_CLUES);
  const out: ScoutClue[] = pairs.map(([label, value]) => clue('stat', label, value));
  const season = subject.statLine?.season;
  if (season !== undefined) out.push(clue('stat', 'Season', String(season)));
  out.push(clue('position', 'Position', GROUP_LABELS[player.group]));
  // A stat line is a SEASON, and `subject.team` is this year's roster spot — printing them side by
  // side as "Season 2025 / Team X" asserted a roster spot the dataset does not actually know. The
  // attached play is the one record that ties this player to a club in a given season, so when it
  // covers the same season it answers the question; otherwise the clue says what it really is.
  const play = subject.play;
  const sameSeason = play !== undefined && season !== undefined && play.season === season;
  const thatYear = sameSeason ? teamNameById(play.teamId, subject.team) : undefined;
  if (thatYear) out.push(clue('team', 'Team', thatYear));
  else if (subject.team) out.push(clue('team', 'Current team', subject.team.displayName));
  return out;
}

function careerLadder(player: NflPlayer, team: NflTeam | undefined, tries: number): ScoutClue[] {
  const out: ScoutClue[] = [clue('draft', player.draft ? 'Draft year' : 'Draft', draftValue(player))];
  if (player.draft) {
    out.push(clue('draft', 'Draft slot', `Round ${player.draft.round}, pick ${player.draft.pick}`));
  }
  if (player.college) out.push(clue('college', 'College', player.college));
  if (team) out.push(clue('team', 'Team', team.displayName));
  if (out.length + 1 < tries && typeof player.exp === 'number') {
    out.push(clue('experience', 'Experience', experienceValue(player.exp)));
  }
  if (player.jersey) out.push(clue('jersey', 'Jersey', `#${player.jersey}`));
  if (out.length < 2) out.push(clue('position', 'Position', GROUP_LABELS[player.group]));
  return out;
}

function triviaLadder(team: NflTeam, tries: number, rng?: Rng): ScoutClue[] {
  const out: ScoutClue[] = [];
  const facts = team.facts.slice(0, Math.max(1, tries - 1));
  for (const f of facts) out.push(clue('fact', 'Deep cut', f));
  if (out.length === 0) out.push(clue('founded', 'Founded', String(team.founded)));
  out.push(clue('division', 'Division', `${team.conference} ${team.division}`));
  out.push(clue('venue', 'Home venue', team.venue));
  out.push(clue('superBowls', 'Super Bowls', superBowlValue(team)));
  const legend = team.legends.length > 0 ? (rng ? rng.pick(team.legends) : team.legends[0]) : undefined;
  if (legend) out.push(clue('legend', 'Franchise legend', legend));
  out.push(clue('colors', 'Team colours', [team.color, team.altColor].filter(Boolean).join(' / ')));
  return out;
}

function logoLadder(team: NflTeam, tries: number): ScoutClue[] {
  const out: ScoutClue[] = [
    clue('conference', 'Conference', team.conference),
    clue('division', 'Division', `${team.conference} ${team.division}`),
    clue('venue', 'Home venue', team.venue),
  ];
  if (out.length + 1 < tries) out.push(clue('founded', 'Founded', String(team.founded)));
  if (out.length + 1 < tries) out.push(clue('superBowls', 'Super Bowls', superBowlValue(team)));
  if (out.length + 1 < tries && team.legends.length > 0) {
    out.push(clue('legend', 'Franchise legend', team.legends[0]));
  }
  return out;
}

/** The full clue order for a mode + subject, before it is spread across the rungs. */
export function clueOrderFor(mode: ScoutMode, subject: ScoutSubject, tries: number, rng?: Rng): ClueOrder {
  const player = subject.player;
  const team = subject.team;
  switch (mode) {
    case 'silhouette':
      return {
        clues: player ? playerLadder(player, team, tries) : [],
        base: 0,
        visual: { min: 0, max: SILHOUETTE_MAX },
      };
    case 'faceZoom':
      return {
        clues: player ? playerLadder(player, team, tries) : [],
        base: 0,
        visual: { min: FACE_ZOOM_MIN, max: FACE_ZOOM_MAX },
      };
    case 'highlight':
      return {
        clues: player ? highlightLadder(subject, player, tries) : [],
        base: 1,
        visual: { min: 0, max: 0 },
      };
    case 'statLine':
      return {
        clues: player ? statLadder(subject, player) : [],
        base: 1,
        visual: { min: 0, max: 0 },
      };
    case 'careerPath':
      return {
        clues: player ? careerLadder(player, team, tries) : [],
        base: 1,
        visual: { min: 0, max: 0 },
      };
    case 'teamTrivia':
      return {
        clues: team ? triviaLadder(team, tries, rng) : [],
        base: 1,
        visual: { min: 0, max: 0 },
      };
    case 'logoZoom':
      return {
        clues: team ? logoLadder(team, tries) : [],
        base: 0,
        visual: { min: LOGO_ZOOM_MIN, max: LOGO_ZOOM_MAX },
      };
    default:
      return { clues: [], base: 0, visual: { min: 0, max: 0 } };
  }
}

// ---------------------------------------------------------------------------------------------
// buildStages
// ---------------------------------------------------------------------------------------------

/** Exactly `tries` rungs, hardest first, each carrying the cumulative clue list and the crop focus. */
export function buildFocusStages(
  mode: ScoutMode,
  subject: ScoutSubject,
  tries: number,
  rng?: Rng,
): ScoutFocusStage[] {
  const rungs = Math.max(1, Math.min(6, Math.floor(Number.isFinite(tries) ? tries : 1)));
  const order = clueOrderFor(mode, subject, rungs, rng);
  const visuals = visualLadder(rungs, order.visual.min, order.visual.max);
  const counts = clueCounts(order.clues.length, rungs, order.base);
  const focus = cropFocus(subject, mode, rng?.seed);
  const stages: ScoutFocusStage[] = [];
  for (let i = 0; i < rungs; i++) {
    stages.push({ visual: visuals[i], clues: order.clues.slice(0, counts[i]), focus });
  }
  return stages;
}

export function buildStages(mode: ScoutMode, subject: ScoutSubject, tries: number, rng?: Rng): ScoutStage[] {
  return buildFocusStages(mode, subject, tries, rng);
}

/** The clues newly unlocked at `tryIndex` (the difference from the previous rung). */
export function newClues(stages: readonly ScoutStage[], tryIndex: number): ScoutClue[] {
  const i = Math.max(0, Math.min(stages.length - 1, tryIndex));
  const cur = stages[i]?.clues ?? [];
  const prev = i > 0 ? (stages[i - 1]?.clues ?? []) : [];
  return cur.slice(prev.length);
}
