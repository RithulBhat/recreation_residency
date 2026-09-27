/**
 * The six CHOICE-SHAPED puzzle types.
 *
 * The original seven modes all reveal ONE subject a bit at a time, so a `ScoutSubject` plus a rung
 * was everything a round needed. These six ask a different shape of question — they put a SET of
 * real players on screen — so each one needs a payload built from the whole dataset:
 *
 *   teammates   four of his current teammates        → name the player
 *   depthChart  five men off one roster              → name the franchise
 *   draftClass  four men taken in the same draft     → name the year
 *   higherLower two players and one stat             → pick the card that put up more
 *   oddOneOut   four players, three share a trait    → pick the outlier
 *   jersey      a number, a position, club colours   → name the player
 *
 * This module is the only place that reads the dataset for them. It returns {@link ScoutPuzzleSpec}s
 * — payload + the player/team a subject should be built around — and `@/scout/subjects` turns those
 * into `ScoutSubject`s (that direction, never the other, so there is no import cycle).
 *
 * ## The guard rails (measured against the shipped `src/data/nfl/*.json`)
 * - Cards are drawn at fame ≥ {@link CARD_FAME_FLOOR} by default: every one of the 460 recognisable
 *   subjects has 15+ teammates that clear it, and all 32 clubs have 16+, so the mode is never thin.
 * - `draftClass` never goes earlier than {@link MIN_DRAFT_CLASS_YEAR}: older classes no longer have
 *   four recognisable players on a roster.
 * - `higherLower` picks the STAT FIRST and then two men who BOTH carry it in the SAME SEASON and
 *   play the SAME position group. A receiver's yards against a linebacker's tackles is not a
 *   question, and a tie is not a question either — equal values are rejected.
 * - `oddOneOut` rotates its trait across college, club, draft round and position group, and checks
 *   every one of those four dimensions before it ships a set: if any dimension has a single
 *   outlier, it must be the same card, or the set is thrown away. That is what stops "three
 *   Alabama men and a Georgia man" from also being "three receivers and a safety".
 * - `jersey` needs a number (9 of the 460 have none) and a club whose colours can be shown, and it
 *   refuses a number that is worn twice on the same roster.
 *
 * ## Determinism
 * Everything here is a pure function of (dataset, seed): candidate order, which cards are shown,
 * which side of a `higherLower` the answer sits on, which trait an `oddOneOut` uses and the order
 * its wrong cards get struck out. Same seed → same puzzle, same options, same order. Unseeded runs
 * follow the same rule as the rest of the pool (see `orderSubjects`): a shuffled candidate order,
 * with the payload internals still stable per subject — the trick `pickStable` already uses.
 */

import type { Rng } from '@/game/rng';
import { hashToUnit } from '@/game/rng';
import { GROUP_LABELS } from './stages';
import type {
  NflPlayer,
  NflTeam,
  PositionGroup,
  ScoutDepthChartPuzzle,
  ScoutDifficulty,
  ScoutDraftClassPuzzle,
  ScoutHigherLowerPuzzle,
  ScoutJerseyPuzzle,
  ScoutMode,
  ScoutOddOneOutPuzzle,
  ScoutOddTrait,
  ScoutPersonCard,
  ScoutPuzzle,
  ScoutPuzzleMode,
  ScoutTeammatesPuzzle,
  StatLine,
} from './types';

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

export const SCOUT_PUZZLE_MODES: readonly ScoutPuzzleMode[] = [
  'teammates',
  'depthChart',
  'draftClass',
  'higherLower',
  'oddOneOut',
  'jersey',
];

/** The two modes answered by PICKING A CARD — they never use the guess box. */
export const SCOUT_CHOICE_MODES: readonly ScoutPuzzleMode[] = ['higherLower', 'oddOneOut'];

export function isScoutPuzzleMode(mode: ScoutMode): mode is ScoutPuzzleMode {
  return (SCOUT_PUZZLE_MODES as readonly ScoutMode[]).includes(mode);
}

/** True for the modes whose answer is a tap, not a typed name. */
export function isScoutChoiceMode(mode: ScoutMode): boolean {
  return (SCOUT_CHOICE_MODES as readonly ScoutMode[]).includes(mode);
}

/** Cards are nameable clues, not noise: the measured floor at which every club stays playable. */
export const CARD_FAME_FLOOR = 45;

/** Classes before this are too thin — fewer than four recognisable players are still on a roster. */
export const MIN_DRAFT_CLASS_YEAR = 2011;

export const TEAMMATE_CARDS = 4;
export const DEPTH_CHART_CARDS = 5;
export const DRAFT_CLASS_CARDS = 4;
export const ODD_ONE_OUT_CARDS = 4;

/** How many subjects one puzzle mode contributes to a pool. Rounds cap at 50; this is plenty. */
export const MAX_PUZZLE_SUBJECTS_PER_MODE = 240;

/** The dimensions an `oddOneOut` set is checked against — every one of them, every time. */
export const ODD_TRAITS: readonly ScoutOddTrait[] = ['college', 'team', 'draftRound', 'positionGroup'];

export const ODD_TRAIT_LABELS: Readonly<Record<ScoutOddTrait, string>> = {
  college: 'College',
  team: 'Club',
  draftRound: 'Draft round',
  positionGroup: 'Position',
};

/** What rung 0 says the round is about: 'Three of these four share <this>'. */
export const ODD_TRAIT_PROMPTS: Readonly<Record<ScoutOddTrait, string>> = {
  college: 'a college',
  team: 'a current club',
  draftRound: 'a draft round',
  positionGroup: 'a position group',
};

// ---------------------------------------------------------------------------------------------
// Fame windows — this is how the Difficulty control keeps meaning what it says
// ---------------------------------------------------------------------------------------------

export interface FameWindow {
  min: number;
  max: number;
}

/**
 * The fame band a tier draws its CARDS from, followed by the relaxations to fall back through.
 *
 * For the modes whose answer is a player the tier already filters the answer (`buildPool` does it);
 * this is what makes the tier mean something for `depthChart` and `draftClass` too, whose answers
 * are a club and a year. Star rounds show faces you know; deep cuts show men you have to work for.
 * The fallbacks exist because a narrow band is not satisfiable everywhere — New England has only
 * four players over fame 65, and a depth chart needs five.
 */
export function cardFameWindows(difficulty: ScoutDifficulty): FameWindow[] {
  switch (difficulty) {
    case 'star':
      return [{ min: 70, max: 100 }, { min: 55, max: 100 }, { min: CARD_FAME_FLOOR, max: 100 }, { min: 0, max: 100 }];
    case 'starter':
      return [{ min: 50, max: 88 }, { min: CARD_FAME_FLOOR, max: 100 }, { min: 0, max: 100 }];
    case 'rotation':
      return [{ min: 38, max: 66 }, { min: 30, max: 100 }, { min: 0, max: 100 }];
    case 'deepCut':
      return [{ min: 30, max: 52 }, { min: 30, max: 72 }, { min: 0, max: 100 }];
    default:
      return [{ min: CARD_FAME_FLOOR, max: 100 }, { min: 30, max: 100 }, { min: 0, max: 100 }];
  }
}

/**
 * Fame bands centred on the subject, tightest first, then the tier's own windows as a fallback.
 *
 * WHY: `oddOneOut` draws its outlier from the ANSWER pool (gated by the pack and the tier) but drew
 * its other three from {@link cardFameWindows}, which floors at {@link CARD_FAME_FLOOR}. At the
 * `any` tier that let a deep-cut outlier hide among three household names, so the answer was the
 * least famous card on the board 72% of the time, measured over 9,940 generated rounds. A player
 * could win by picking the name they did not recognise, having learned nothing about colleges or
 * draft rounds — the round still resolved correctly, so every other test passed. `puzzles.tells.test.ts`
 * now holds that rate near chance.
 */
function fameBandsAround(player: NflPlayer, windows: readonly FameWindow[]): FameWindow[] {
  const fame = Number.isFinite(player.fame) ? player.fame : 0;
  const around = [12, 20, 30].map((spread) => ({
    min: Math.max(0, fame - spread),
    max: Math.min(100, fame + spread),
  }));
  return [...around, ...windows];
}

function inWindow(player: NflPlayer, w: FameWindow): boolean {
  const fame = Number.isFinite(player.fame) ? player.fame : 0;
  return fame >= w.min && fame <= w.max;
}

// ---------------------------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------------------------

/** Every hash in this module goes through here, so one seed pins every choice it makes. */
function unit(seed: string | undefined, key: string): number {
  return hashToUnit(`${seed ?? 'scout'}|puzzle|${key}`);
}

/** A copy of `list` in an order that depends only on (seed, key(item)). */
function stableOrder<T>(list: readonly T[], seed: string | undefined, key: (item: T) => string): T[] {
  return list
    .map((item) => ({ item, k: key(item), u: unit(seed, key(item)) }))
    .sort((a, b) => a.u - b.u || a.k.localeCompare(b.k))
    .map((e) => e.item);
}

function lastNameKey(player: NflPlayer): string {
  const last = (player.last || player.name.split(' ').slice(-1)[0] || '').trim().toLowerCase();
  return last;
}

/** '1,499' → 1499, '102.2' → 102.2, '—' → null. */
export function statNumber(display: string): number | null {
  const cleaned = display.replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function draftRoundKey(player: NflPlayer): string {
  return player.draft ? `${player.draft.round}` : 'UDFA';
}

function draftRoundValue(player: NflPlayer): string {
  return player.draft ? `Round ${player.draft.round}` : 'Undrafted';
}

/** Accepted spellings for a `draftClass` answer — the answer is a YEAR, not a man. */
export function draftYearAccepted(year: number): string[] {
  const y = String(year);
  return [y, `'${y.slice(2)}`, `${y} draft`, `${y} draft class`, `${y} nfl draft`, `class of ${y}`];
}

export function personCard(player: NflPlayer, team?: NflTeam): ScoutPersonCard {
  const card: ScoutPersonCard = {
    playerId: player.id,
    name: player.name,
    image: player.headshot,
    pos: player.pos,
    group: player.group,
  };
  if (player.jersey) card.jersey = player.jersey;
  if (player.teamId) card.teamId = player.teamId;
  if (team) card.teamAbbr = team.abbr;
  if (player.college) card.college = player.college;
  if (player.draft) {
    card.draftRound = player.draft.round;
    card.draftPick = player.draft.pick;
  }
  return card;
}

// ---------------------------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------------------------

/** One player's value for one stat label, in one season. */
export interface StatEntry {
  player: NflPlayer;
  label: string;
  /** As printed: '1,499'. */
  display: string;
  value: number;
  season: number;
}

/** What this module needs out of the dataset — a subset of `ScoutPoolSource`. */
export interface ScoutPuzzleDataset {
  teams: readonly NflTeam[];
  players: readonly NflPlayer[];
  statLines?: readonly StatLine[];
}

export interface ScoutPuzzleIndex {
  teamById: ReadonlyMap<string, NflTeam>;
  playerById: ReadonlyMap<string, NflPlayer>;
  byTeam: ReadonlyMap<string, readonly NflPlayer[]>;
  byCollege: ReadonlyMap<string, readonly NflPlayer[]>;
  byDraftYear: ReadonlyMap<number, readonly NflPlayer[]>;
  byDraftRound: ReadonlyMap<string, readonly NflPlayer[]>;
  byGroup: ReadonlyMap<PositionGroup, readonly NflPlayer[]>;
  statByPlayer: ReadonlyMap<string, StatLine>;
  /** `'WR|Rec yds'` → every player who carries that stat, biggest first. */
  statBoards: ReadonlyMap<string, readonly StatEntry[]>;
  /** `'12|15'` (teamId|jersey) → how many men on that roster wear it. */
  jerseyCount: ReadonlyMap<string, number>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function statBoardKey(group: PositionGroup, label: string): string {
  return `${group}|${label}`;
}

/** Index the dataset once; every builder below is a lookup away from O(1). */
export function buildPuzzleIndex(dataset: ScoutPuzzleDataset): ScoutPuzzleIndex {
  const teamById = new Map<string, NflTeam>();
  for (const t of dataset.teams) teamById.set(t.id, t);

  const playerById = new Map<string, NflPlayer>();
  const byTeam = new Map<string, NflPlayer[]>();
  const byCollege = new Map<string, NflPlayer[]>();
  const byDraftYear = new Map<number, NflPlayer[]>();
  const byDraftRound = new Map<string, NflPlayer[]>();
  const byGroup = new Map<PositionGroup, NflPlayer[]>();
  const jerseyCount = new Map<string, number>();

  for (const p of dataset.players) {
    playerById.set(p.id, p);
    push(byTeam, p.teamId, p);
    if (p.college) push(byCollege, p.college, p);
    if (p.draft) push(byDraftYear, p.draft.year, p);
    push(byDraftRound, draftRoundKey(p), p);
    push(byGroup, p.group, p);
    if (p.jersey) {
      const key = `${p.teamId}|${p.jersey}`;
      jerseyCount.set(key, (jerseyCount.get(key) ?? 0) + 1);
    }
  }

  const statByPlayer = new Map<string, StatLine>();
  const boards = new Map<string, StatEntry[]>();
  for (const line of dataset.statLines ?? []) {
    const player = playerById.get(line.playerId);
    if (!player) continue;
    // One stat line per player in the shipped dataset; if that ever changes, the first wins so the
    // index stays a pure function of the file order.
    if (!statByPlayer.has(line.playerId)) statByPlayer.set(line.playerId, line);
    for (const [label, display] of line.stats) {
      const value = statNumber(display);
      if (value === null) continue;
      push(boards, statBoardKey(player.group, label), { player, label, display, value, season: line.season });
    }
  }
  const statBoards = new Map<string, readonly StatEntry[]>();
  for (const [key, list] of boards) {
    statBoards.set(key, list.slice().sort((a, b) => b.value - a.value || a.player.id.localeCompare(b.player.id)));
  }

  return { teamById, playerById, byTeam, byCollege, byDraftYear, byDraftRound, byGroup, statByPlayer, statBoards, jerseyCount };
}

// ---------------------------------------------------------------------------------------------
// teammates
// ---------------------------------------------------------------------------------------------

export interface PuzzleBuildOptions {
  seed?: string;
  /** Fame bands to try in order. Defaults to `cardFameWindows('any')`. */
  windows?: readonly FameWindow[];
}

function windowsOf(options: PuzzleBuildOptions): readonly FameWindow[] {
  return options.windows && options.windows.length > 0 ? options.windows : cardFameWindows('any');
}

/**
 * Pick `n` cards out of `pool` under the first fame band that can fill the set.
 * `prefer` spreads the picks across a dimension (position group, club) so a set of five reads as a
 * roster rather than as one position room.
 */
function pickCards(
  pool: readonly NflPlayer[],
  n: number,
  options: PuzzleBuildOptions,
  key: string,
  prefer?: (p: NflPlayer) => string,
): NflPlayer[] | null {
  for (const w of windowsOf(options)) {
    const eligible = pool.filter((p) => inWindow(p, w));
    if (eligible.length < n) continue;
    const ordered = stableOrder(eligible, options.seed, (p) => `${key}|${p.id}`);
    if (!prefer) return ordered.slice(0, n);
    const seen = new Set<string>();
    const spread: NflPlayer[] = [];
    for (const p of ordered) {
      const bucket = prefer(p);
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      spread.push(p);
      if (spread.length === n) return spread;
    }
    for (const p of ordered) {
      if (spread.includes(p)) continue;
      spread.push(p);
      if (spread.length === n) return spread;
    }
  }
  return null;
}

/**
 * Four of his current teammates. The answer himself is never shown, and nobody who shares his
 * surname is either — the guess box accepts a bare surname, so a second Smith would make a correct
 * answer ambiguous.
 */
export function teammatesPuzzle(
  index: ScoutPuzzleIndex,
  player: NflPlayer,
  options: PuzzleBuildOptions = {},
): ScoutTeammatesPuzzle | null {
  const roster = index.byTeam.get(player.teamId) ?? [];
  const mates = roster.filter((p) => p.id !== player.id && lastNameKey(p) !== lastNameKey(player));
  const picked = pickCards(mates, TEAMMATE_CARDS, options, `teammates|${player.id}`, (p) => p.group);
  if (!picked) return null;
  const team = index.teamById.get(player.teamId);
  return { type: 'teammates', cards: picked.map((p) => personCard(p, team)) };
}

// ---------------------------------------------------------------------------------------------
// depthChart
// ---------------------------------------------------------------------------------------------

/**
 * Five men off one roster. The clue ladder never names the club (that is the answer), and the cards
 * are spread across position groups so the set reads as a depth chart.
 */
export function depthChartPuzzle(
  index: ScoutPuzzleIndex,
  team: NflTeam,
  options: PuzzleBuildOptions = {},
): ScoutDepthChartPuzzle | null {
  const roster = index.byTeam.get(team.id) ?? [];
  const picked = pickCards(roster, DEPTH_CHART_CARDS, options, `depth|${team.id}`, (p) => p.group);
  if (!picked) return null;
  return { type: 'depthChart', cards: picked.map((p) => personCard(p, team)) };
}

// ---------------------------------------------------------------------------------------------
// draftClass
// ---------------------------------------------------------------------------------------------

/**
 * Four men taken in the same draft, spread across clubs so the set cannot be mistaken for a roster.
 * Returns the payload and the ANCHOR — the most recognisable of the four, whose id and headshot the
 * subject borrows (its NAME is the year).
 */
export function draftClassPuzzle(
  index: ScoutPuzzleIndex,
  year: number,
  options: PuzzleBuildOptions = {},
): { puzzle: ScoutDraftClassPuzzle; anchor: NflPlayer } | null {
  if (!Number.isFinite(year) || year < MIN_DRAFT_CLASS_YEAR) return null;
  const klass = (index.byDraftYear.get(year) ?? []).filter((p) => p.draft?.year === year);
  const picked = pickCards(klass, DRAFT_CLASS_CARDS, options, `draft|${year}`, (p) => p.teamId);
  if (!picked) return null;
  const cards = picked.map((p) => personCard(p, index.teamById.get(p.teamId)));
  const anchor = picked.reduce((best, p) => (p.fame > best.fame || (p.fame === best.fame && p.id < best.id) ? p : best), picked[0]);
  const slots = picked.filter((p) => p.draft).map((p) => p.draft as { round: number; pick: number });
  const earliest = slots.reduce<{ round: number; pick: number } | undefined>((best, d) => {
    if (!best) return { round: d.round, pick: d.pick };
    if (d.round < best.round || (d.round === best.round && d.pick < best.pick)) return { round: d.round, pick: d.pick };
    return best;
  }, undefined);
  const puzzle: ScoutDraftClassPuzzle = { type: 'draftClass', year, cards };
  if (earliest) puzzle.earliest = earliest;
  return { puzzle, anchor };
}

/** Every draft year the dataset can actually fill a class from, ascending. */
export function draftClassYears(index: ScoutPuzzleIndex, options: PuzzleBuildOptions = {}): number[] {
  const years: number[] = [];
  for (const year of [...index.byDraftYear.keys()].sort((a, b) => a - b)) {
    if (year < MIN_DRAFT_CLASS_YEAR) continue;
    if (draftClassPuzzle(index, year, options)) years.push(year);
  }
  return years;
}

// ---------------------------------------------------------------------------------------------
// higherLower
// ---------------------------------------------------------------------------------------------

/**
 * Stat labels a `higherLower` round prefers, in order.
 *
 * Volume beats rate. "Who had more receiving yards" is a question a fan can reason about; "who
 * averaged 11.9 against 12.8 yards a catch" is a coin flip with extra steps, so rate and
 * single-play stats (`Yds/rec`, `Rating`, `Longest`) are only used when a man carries nothing else.
 */
export const HIGHER_LOWER_VOLUME_STATS: readonly string[] = [
  'Rec yds',
  'Rush yds',
  'Pass yds',
  'Tackles',
  'Sacks',
  'Rec',
  'Carries',
  'Targets',
  'Pass TD',
  'Rush TD',
  'Rec TD',
  'TD',
  'INT',
  'TFL',
  'QB hits',
  'Solo',
  'Pass def',
  'Forced FUM',
];

/** 0 = a volume stat, 1 = a rate or single-play stat. Lower sorts first. */
export function statPreference(label: string): number {
  return HIGHER_LOWER_VOLUME_STATS.includes(label) ? 0 : 1;
}

/** Two men whose fame is this close read as an even matchup, so fame is not the tell. */
export const HIGHER_LOWER_FAME_SPREAD = 20;

/** How far apart the two values should be — a star round is a blowout, a deep cut is a squeaker. */
function gapBand(difficulty: ScoutDifficulty): 'wide' | 'middle' | 'tight' {
  if (difficulty === 'star') return 'wide';
  if (difficulty === 'deepCut' || difficulty === 'rotation') return 'tight';
  return 'middle';
}

export interface HigherLowerOptions extends PuzzleBuildOptions {
  /** Drives how big the gap between the two numbers is. Defaults to `'any'`. */
  difficulty?: ScoutDifficulty;
}

/**
 * Two men, one stat, one season, one position group — and the answer is always the SUBJECT, who is
 * always the bigger number. Which side he is displayed on is seeded, so there is no side to learn.
 *
 * The stat comes first (his own stat line decides what can be asked), then an opponent who carries
 * the same label in the same season with a strictly smaller value.
 */
export function higherLowerPuzzle(
  index: ScoutPuzzleIndex,
  player: NflPlayer,
  options: HigherLowerOptions = {},
): ScoutHigherLowerPuzzle | null {
  const line = index.statByPlayer.get(player.id);
  if (!line) return null;
  const seed = options.seed;
  const gap = gapBand(options.difficulty ?? 'any');
  const windows = windowsOf(options);

  const labels = stableOrder(
    line.stats.filter(([, display]) => statNumber(display) !== null).map(([label, display]) => ({ label, display })),
    seed,
    (e) => `hl|${player.id}|${e.label}`,
  ).sort((a, b) => statPreference(a.label) - statPreference(b.label));

  for (const { label, display } of labels) {
    const mine = statNumber(display);
    if (mine === null) continue;
    const board = index.statBoards.get(statBoardKey(player.group, label)) ?? [];
    const lower = board.filter(
      (e) =>
        e.player.id !== player.id &&
        e.season === line.season &&
        e.value < mine &&
        e.player.group === player.group &&
        lastNameKey(e.player) !== lastNameKey(player),
    );
    if (lower.length === 0) continue;
    // Closest gap first, then take the third of the field this difficulty wants.
    const byGap = lower.slice().sort((a, b) => mine - a.value - (mine - b.value) || a.player.id.localeCompare(b.player.id));
    const third = Math.max(1, Math.ceil(byGap.length / 3));
    const slice =
      gap === 'tight' ? byGap.slice(0, third) : gap === 'wide' ? byGap.slice(-third) : byGap.slice(third - 1, byGap.length - third + 1);
    const band = slice.length > 0 ? slice : byGap;
    const inBand = band.filter((e) => windows.some((w) => inWindow(e.player, w)));
    const pool = inBand.length > 0 ? inBand : band;
    // An even matchup: a man of roughly the same standing, so "the famous one" is never the answer.
    const close = pool.filter((e) => Math.abs((e.player.fame || 0) - (player.fame || 0)) <= HIGHER_LOWER_FAME_SPREAD);
    const candidates = close.length > 0 ? close : pool;
    const chosen = stableOrder(candidates, seed, (e) => `hl|${player.id}|${label}|${e.player.id}`)[0];
    if (!chosen) continue;

    const mineCard = personCard(player, index.teamById.get(player.teamId));
    const theirCard = personCard(chosen.player, index.teamById.get(chosen.player.teamId));
    const answerLeft = unit(seed, `hl|side|${player.id}|${label}`) < 0.5;
    const cards: [ScoutPersonCard, ScoutPersonCard] = answerLeft ? [mineCard, theirCard] : [theirCard, mineCard];
    const values: [string, string] = answerLeft ? [display, chosen.display] : [chosen.display, display];
    const numbers: [number, number] = answerLeft ? [mine, chosen.value] : [chosen.value, mine];
    return {
      type: 'higherLower',
      statLabel: label,
      season: line.season,
      group: player.group,
      cards,
      values,
      numbers,
      answerPlayerId: player.id,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// oddOneOut
// ---------------------------------------------------------------------------------------------

function traitValue(player: NflPlayer, trait: ScoutOddTrait): string | undefined {
  switch (trait) {
    case 'college':
      return player.college;
    case 'team':
      return player.teamId || undefined;
    case 'draftRound':
      return draftRoundKey(player);
    default:
      return player.group;
  }
}

function traitGroups(index: ScoutPuzzleIndex, trait: ScoutOddTrait): ReadonlyMap<string, readonly NflPlayer[]> {
  switch (trait) {
    case 'college':
      return index.byCollege;
    case 'team':
      return index.byTeam;
    case 'draftRound':
      return index.byDraftRound;
    default: {
      const out = new Map<string, readonly NflPlayer[]>();
      for (const [g, list] of index.byGroup) out.set(g, list);
      return out;
    }
  }
}

function displayTraitValue(index: ScoutPuzzleIndex, trait: ScoutOddTrait, sample: NflPlayer): string {
  switch (trait) {
    case 'college':
      return sample.college ?? '';
    case 'team':
      return index.teamById.get(sample.teamId)?.displayName ?? sample.teamId;
    case 'draftRound':
      return draftRoundValue(sample);
    default:
      return GROUP_LABELS[sample.group];
  }
}

/**
 * Is `[outlier, ...three]` a fair round for `trait`?
 *
 * Every dimension is checked, not just the one being asked: if college makes exactly one man the
 * odd one out and it is NOT the intended answer, the set has two defensible answers and is thrown
 * away. Sets where a dimension splits 2–2 (or is shared by all four) are fine — there is no single
 * outlier to point at.
 */
export function oddOneOutFair(cards: readonly NflPlayer[], trait: ScoutOddTrait, outlierIndex = 0): boolean {
  if (cards.length !== ODD_ONE_OUT_CARDS) return false;
  if (new Set(cards.map((c) => c.id)).size !== cards.length) return false;
  if (new Set(cards.map(lastNameKey)).size !== cards.length) return false;
  for (const dim of ODD_TRAITS) {
    const values = cards.map((c) => traitValue(c, dim));
    if (values.some((v) => v === undefined || v === '')) return false;
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v as string, (counts.get(v as string) ?? 0) + 1);
    const singles = values.map((v, i) => (counts.get(v as string) === 1 ? i : -1)).filter((i) => i >= 0);
    if (dim === trait) {
      if (singles.length !== 1 || singles[0] !== outlierIndex) return false;
      if (counts.get(values[outlierIndex] as string) !== 1) return false;
    } else if (singles.length === 1 && singles[0] !== outlierIndex) {
      return false;
    }
  }
  return true;
}

export interface OddOneOutOptions extends PuzzleBuildOptions {
  /** How many trait buckets and how many candidate trios to try per bucket. */
  maxBuckets?: number;
  maxCandidates?: number;
}

/**
 * Four players, three of whom share one trait, and the subject is the outlier. The trait ROTATES
 * per subject (seeded), so the answer is not forever "the one from a different school".
 */
export function oddOneOutPuzzle(
  index: ScoutPuzzleIndex,
  player: NflPlayer,
  options: OddOneOutOptions = {},
): ScoutOddOneOutPuzzle | null {
  const seed = options.seed;
  const maxBuckets = options.maxBuckets ?? 10;
  const maxCandidates = options.maxCandidates ?? 7;
  const windows = windowsOf(options);
  const traits = stableOrder(ODD_TRAITS, seed, (t) => `odd|${player.id}|${t}`);

  for (const trait of traits) {
    const mine = traitValue(player, trait);
    if (mine === undefined || mine === '') continue;
    const groups = traitGroups(index, trait);
    const keys = stableOrder(
      [...groups.keys()].filter((k) => k !== mine),
      seed,
      (k) => `odd|${player.id}|${trait}|${k}`,
    );
    let tried = 0;
    for (const key of keys) {
      if (tried >= maxBuckets) break;
      const bucket = (groups.get(key) ?? []).filter((p) => p.id !== player.id);
      // Bands centred on the outlier, so he is not simply the least famous name on the board.
      const eligible = fameBandsAround(player, windows)
        .map((w) => bucket.filter((p) => inWindow(p, w)))
        .find((list) => list.length >= ODD_ONE_OUT_CARDS - 1);
      if (!eligible) continue;
      tried += 1;
      const candidates = stableOrder(eligible, seed, (p) => `odd|${player.id}|${trait}|${key}|${p.id}`).slice(0, maxCandidates);
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          for (let k = j + 1; k < candidates.length; k++) {
            const trio = [candidates[i], candidates[j], candidates[k]];
            if (!oddOneOutFair([player, ...trio], trait)) continue;
            const all = [player, ...trio];
            const ordered = stableOrder(all, seed, (p) => `odd|order|${player.id}|${p.id}`);
            const ruleOutIds = stableOrder(trio, seed, (p) => `odd|ruleout|${player.id}|${p.id}`).map((p) => p.id);
            return {
              type: 'oddOneOut',
              trait,
              traitLabel: ODD_TRAIT_LABELS[trait],
              sharedValue: displayTraitValue(index, trait, trio[0]),
              cards: ordered.map((p) => personCard(p, index.teamById.get(p.teamId))),
              answerPlayerId: player.id,
              ruleOutIds,
            };
          }
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// jersey
// ---------------------------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{3,8}$/i;

function colorPair(team: NflTeam): [string, string] {
  const primary = HEX.test(team.color) ? team.color : '#64748b';
  const alt = HEX.test(team.altColor) && team.altColor.toLowerCase() !== primary.toLowerCase() ? team.altColor : '#f8fafc';
  return [primary, alt];
}

/**
 * A number, a position and two club colours — no photo at all. Numbers repeat across the league, so
 * the colours are load-bearing; a number worn twice on the SAME roster is refused outright.
 */
export function jerseyPuzzle(index: ScoutPuzzleIndex, player: NflPlayer): ScoutJerseyPuzzle | null {
  const number = (player.jersey ?? '').trim();
  if (number === '') return null;
  const team = index.teamById.get(player.teamId);
  if (!team) return null;
  if ((index.jerseyCount.get(`${player.teamId}|${number}`) ?? 0) > 1) return null;
  return { type: 'jersey', number, pos: player.pos, group: player.group, colors: colorPair(team) };
}

// ---------------------------------------------------------------------------------------------
// Specs — what `buildPool` consumes
// ---------------------------------------------------------------------------------------------

/**
 * One playable choice-shaped round, before it becomes a `ScoutSubject`.
 * `@/scout/subjects` owns that last step, which is why nothing here imports it.
 */
export interface ScoutPuzzleSpec {
  mode: ScoutPuzzleMode;
  puzzle: ScoutPuzzle;
  /** The answer (teammates / higherLower / oddOneOut / jersey), or the `draftClass` anchor. */
  player?: NflPlayer;
  /** The answer for `depthChart`; the player's current club otherwise. */
  team?: NflTeam;
  /** Set when the answer is NOT the anchor's name — `draftClass`, whose answer is the year. */
  answer?: { name: string; accepted: string[] };
}

export interface ScoutPuzzleRequest {
  dataset: ScoutPuzzleDataset;
  /** The run's active modes; anything that is not a puzzle mode is ignored. */
  modes: readonly ScoutMode[];
  difficulty: ScoutDifficulty;
  seed?: string;
  /**
   * Answer-side eligibility — the pack filters and the tier, handed down by `buildPool`. It gates
   * the modes whose answer is a player; the CARDS are gated by {@link cardFameWindows} instead, so
   * a `draftClass` still spans the league when the pack is one roster.
   */
  playerEligible?: (player: NflPlayer) => boolean;
  /** Which franchises `depthChart` may ask about. */
  teamEligible?: (team: NflTeam) => boolean;
  /** Per-mode cap. 0 = uncapped. */
  limit?: number;
  /** Unseeded runs shuffle the candidate order with this, exactly as `orderSubjects` does. */
  rng?: Rng;
  /** Pass a prebuilt index to skip re-indexing. */
  index?: ScoutPuzzleIndex;
}

function candidateOrder(players: readonly NflPlayer[], mode: ScoutPuzzleMode, seed: string | undefined, rng?: Rng): NflPlayer[] {
  if (seed === undefined && rng) return rng.shuffle(players);
  return stableOrder(players, seed, (p) => `${mode}|pick|${p.id}`);
}

/** Every choice-shaped round this dataset + these settings can serve up. */
export function buildScoutPuzzleSpecs(request: ScoutPuzzleRequest): ScoutPuzzleSpec[] {
  const modes = request.modes.filter(isScoutPuzzleMode);
  if (modes.length === 0) return [];
  const index = request.index ?? buildPuzzleIndex(request.dataset);
  const seed = request.seed;
  const windows = cardFameWindows(request.difficulty);
  const options: PuzzleBuildOptions = { seed, windows };
  const limit = request.limit === undefined ? MAX_PUZZLE_SUBJECTS_PER_MODE : request.limit;
  const cap = limit > 0 ? limit : Number.POSITIVE_INFINITY;
  const playerOk = request.playerEligible ?? (() => true);
  const teamOk = request.teamEligible ?? (() => true);
  const out: ScoutPuzzleSpec[] = [];

  const answerPlayers = request.dataset.players.filter(playerOk);

  for (const mode of modes) {
    if (mode === 'depthChart') {
      for (const team of request.dataset.teams) {
        if (!teamOk(team)) continue;
        const puzzle = depthChartPuzzle(index, team, options);
        if (puzzle) out.push({ mode, puzzle, team });
      }
      continue;
    }
    if (mode === 'draftClass') {
      for (const year of draftClassYears(index, options)) {
        const built = draftClassPuzzle(index, year, options);
        if (!built) continue;
        out.push({
          mode,
          puzzle: built.puzzle,
          player: built.anchor,
          team: index.teamById.get(built.anchor.teamId),
          answer: { name: String(year), accepted: draftYearAccepted(year) },
        });
      }
      continue;
    }

    // The three player-answer modes: walk the candidates in a deterministic order, stop once the
    // pool is deep enough. The scan bound keeps a 2,500-player dataset cheap to start.
    let built = 0;
    let examined = 0;
    const scanLimit = limit > 0 ? limit * 4 : Number.POSITIVE_INFINITY;
    for (const player of candidateOrder(answerPlayers, mode, seed, request.rng)) {
      if (built >= cap || examined >= scanLimit) break;
      examined += 1;
      const team = index.teamById.get(player.teamId);
      const puzzle =
        mode === 'teammates'
          ? teammatesPuzzle(index, player, options)
          : mode === 'higherLower'
            ? higherLowerPuzzle(index, player, { ...options, difficulty: request.difficulty })
            : mode === 'oddOneOut'
              ? oddOneOutPuzzle(index, player, options)
              : jerseyPuzzle(index, player);
      if (!puzzle) continue;
      built += 1;
      out.push(team ? { mode, puzzle, player, team } : { mode, puzzle, player });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading a payload back (components, the wiring layer, the reveal)
// ---------------------------------------------------------------------------------------------

/** The cards a payload shows. `jersey` has none — it is a number and two colours. */
export function puzzleCards(puzzle: ScoutPuzzle): readonly ScoutPersonCard[] {
  return puzzle.type === 'jersey' ? [] : puzzle.cards;
}

/** The card that answers the round, for the two choice modes. */
export function puzzleAnswerId(puzzle: ScoutPuzzle): string | undefined {
  return puzzle.type === 'higherLower' || puzzle.type === 'oddOneOut' ? puzzle.answerPlayerId : undefined;
}

/** True when the round is answered by tapping a card rather than typing. */
export function isChoicePuzzle(puzzle: ScoutPuzzle): boolean {
  return puzzle.type === 'higherLower' || puzzle.type === 'oddOneOut';
}

/** The card a player picked, by id. */
export function puzzleCardById(puzzle: ScoutPuzzle, playerId: string): ScoutPersonCard | undefined {
  return puzzleCards(puzzle).find((c) => c.playerId === playerId);
}
