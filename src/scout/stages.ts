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
 *   teammates              position → experience → jersey → first initial (never the club: the
 *                          roster is on screen) and one more teammate card per rung
 *   depthChart             conference → division → Super Bowls → venue → a legend (never the club's
 *                          own name) and one more roster card per rung
 *   draftClass             decade → five-year window → odd/even → earliest slot → two-year window
 *   higherLower            position both play → season → the gap → one of the two numbers
 *   oddOneOut              the category (rung 0) → the shared value → the odd man's position, plus
 *                          one wrong card struck out per rung (never all three)
 *   jersey                 conference → experience → draft → college → first initial
 *
 * `cropFocus` gives faceZoom and logoZoom a deterministic spot to zoom into: the same seed always
 * zooms the same feature. It is pure, so a screen can recompute it from `settings.seed` without
 * threading the rng, and it is also attached to every stage as `focus` (see `ScoutFocusStage`).
 */

import { hashToUnit, type Rng } from '@/game/rng';
import type {
  NflPlayer,
  NflTeam,
  PositionGroup,
  ScoutClue,
  ScoutDraftClassPuzzle,
  ScoutHigherLowerPuzzle,
  ScoutMode,
  ScoutOddOneOutPuzzle,
  ScoutPersonCard,
  ScoutPuzzle,
  ScoutStage,
  ScoutSubject,
} from './types';

export const SILHOUETTE_MAX = 0.85;
export const FACE_ZOOM_MIN = 0.06;
export const FACE_ZOOM_MAX = 0.95;
export const LOGO_ZOOM_MIN = 0.1;
export const LOGO_ZOOM_MAX = 0.95;
export const MAX_STAT_CLUES = 6;

/**
 * `visual` for the CHOICE-SHAPED modes (ADDED).
 *
 * The contract's `visual` is "how much of the visual is shown, 0 → 1", and for these modes the
 * visual is the SET OF CARDS, so the same number keeps meaning the same thing:
 *
 *   teammates / draftClass  0.5 → 1     two of the four cards, up to all four
 *   depthChart              0.4 → 1     two of the five, up to all five
 *   oddOneOut               0 → 2/3     fraction of the WRONG cards struck out (never all three)
 *   higherLower / jersey    0           nothing to uncover: both cards, or the number, are there
 *                                       from rung 0 and the clue ladder does the narrowing
 *
 * Read them back with {@link visibleCards} and {@link ruledOutCardIds} rather than doing the maths
 * at the call site — the stage components and the reveal share exactly one implementation.
 */
export const TEAMMATES_VISUAL_MIN = 0.5;
export const DEPTH_CHART_VISUAL_MIN = 0.4;
export const DRAFT_CLASS_VISUAL_MIN = 0.5;
export const CARD_VISUAL_MAX = 1;
export const ODD_ONE_OUT_VISUAL_MAX = 2 / 3;
/** A set of cards is never opened one card at a time — two is the smallest readable prompt. */
export const MIN_VISIBLE_CARDS = 2;

/**
 * What rung 0 of an `oddOneOut` says, and which clue kind carries the shared value.
 *
 * Deliberately a local table rather than an import from `@/scout/puzzles`: that module imports
 * `GROUP_LABELS` from here, and one direction is all a dependency between two pure modules gets.
 * `puzzles.test.ts` pins the two tables to each other.
 */
const ODD_PROMPTS: Readonly<Record<'college' | 'team' | 'draftRound' | 'positionGroup', string>> = {
  college: 'a college',
  team: 'a current club',
  draftRound: 'a draft round',
  positionGroup: 'a position group',
};

const ODD_CLUE_KINDS: Readonly<Record<'college' | 'team' | 'draftRound' | 'positionGroup', ScoutClue['kind']>> = {
  college: 'college',
  team: 'team',
  draftRound: 'draft',
  positionGroup: 'position',
};

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

/**
 * The same groups written as a PERSON, for a sentence (ADDED).
 *
 * `GROUP_LABELS` names the unit — 'Defensive line' is a room, not a man — which reads fine on a clue
 * chip and badly in a question: "Which defensive line wears this?" is not English. These two tables
 * are what the choice-shaped stages ask their questions with.
 */
export const GROUP_PERSON_LABELS: Readonly<Record<PositionGroup, string>> = {
  QB: 'quarterback',
  RB: 'running back',
  WR: 'wide receiver',
  TE: 'tight end',
  OL: 'offensive lineman',
  DL: 'defensive lineman',
  LB: 'linebacker',
  DB: 'defensive back',
  ST: 'special teamer',
};

export const GROUP_PEOPLE_LABELS: Readonly<Record<PositionGroup, string>> = {
  QB: 'quarterbacks',
  RB: 'running backs',
  WR: 'wide receivers',
  TE: 'tight ends',
  OL: 'offensive linemen',
  DL: 'defensive linemen',
  LB: 'linebackers',
  DB: 'defensive backs',
  ST: 'special teamers',
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

/** The cards a payload holds. `jersey` has none — it is a number and two colours. */
function cardsOf(puzzle: ScoutPuzzle | undefined): readonly ScoutPersonCard[] {
  if (!puzzle || puzzle.type === 'jersey') return [];
  return puzzle.cards;
}

/** How many of `total` cards a rung shows. Never fewer than two, never more than there are. */
export function visibleCardCount(total: number, visual: number): number {
  if (total <= MIN_VISIBLE_CARDS) return total;
  const v = Number.isFinite(visual) ? Math.max(0, Math.min(1, visual)) : 0;
  return Math.max(MIN_VISIBLE_CARDS, Math.min(total, Math.round(v * total)));
}

/** The cards on screen at a rung, in payload order. */
export function visibleCards(puzzle: ScoutPuzzle | undefined, visual: number): ScoutPersonCard[] {
  const cards = cardsOf(puzzle);
  // Both `higherLower` cards are on screen from rung 0 — its ladder narrows with clues, not cards.
  if (puzzle?.type === 'higherLower') return cards.slice();
  return cards.slice(0, visibleCardCount(cards.length, visual));
}

/**
 * The wrong `oddOneOut` cards struck out at a rung, in the payload's own elimination order.
 * Never all three: the last rung leaves a two-way choice, not the answer.
 */
export function ruledOutCardIds(puzzle: ScoutPuzzle | undefined, visual: number): string[] {
  if (!puzzle || puzzle.type !== 'oddOneOut') return [];
  const total = puzzle.ruleOutIds.length;
  if (total === 0) return [];
  const v = Number.isFinite(visual) ? Math.max(0, Math.min(1, visual)) : 0;
  // `total - 1` is the promise, not an accident of the rounding: one wrong card always survives to
  // the last rung, so the round always ends as a choice rather than as the answer handed over.
  const n = Math.min(total - 1, Math.ceil(v * total));
  return puzzle.ruleOutIds.slice(0, n);
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

// ---------------------------------------------------------------------------------------------
// Clue orders — the choice-shaped modes
// ---------------------------------------------------------------------------------------------

/** 1234 → '1,234'; decimals keep their tail. */
function groupDigits(n: number): string {
  const [whole, frac] = String(n).split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign === '-' ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${frac === undefined ? '' : `.${frac}`}`;
}

/**
 * `teammates`: the four faces are the puzzle, so the ladder never mentions the club — the roster is
 * already on screen, and a 'Conference: AFC' chip next to four Chiefs is noise, not a clue.
 */
function teammatesLadder(player: NflPlayer, tries: number): ScoutClue[] {
  const core: ScoutClue[] = [clue('position', 'Position', GROUP_LABELS[player.group])];
  if (typeof player.exp === 'number') core.push(clue('experience', 'Experience', experienceValue(player.exp)));
  if (player.jersey) core.push(clue('jersey', 'Jersey', `#${player.jersey}`));
  const tail = [clue('initials', 'First initial', initialValue(player))];
  const filler: ScoutClue[] = [];
  if (player.college) filler.push(clue('college', 'College', player.college));
  if (player.draft) filler.push(clue('draft', 'Drafted', String(player.draft.year)));
  while (core.length + tail.length < tries - 1 && filler.length > 0) {
    const next = filler.shift();
    if (next) core.push(next);
  }
  return [...core, ...tail];
}

/**
 * `depthChart`: name the franchise off five of its players. NOTHING here may name the club — not the
 * nickname, not the city — so the ladder walks conference → division → trophies → venue → a legend.
 */
function depthChartLadder(team: NflTeam, tries: number): ScoutClue[] {
  const out: ScoutClue[] = [
    clue('conference', 'Conference', team.conference),
    clue('division', 'Division', `${team.conference} ${team.division}`),
    clue('superBowls', 'Super Bowls', superBowlValue(team)),
  ];
  if (out.length + 1 < tries) out.push(clue('founded', 'Founded', String(team.founded)));
  out.push(clue('venue', 'Home venue', team.venue));
  if (team.legends.length > 0) out.push(clue('legend', 'Franchise legend', team.legends[0]));
  return out;
}

/**
 * `draftClass`: the answer is a year, so every rung narrows the BAND it can be in —
 * decade → five-year window → odd/even → the earliest slot on the board → a two-year window.
 * Parity plus the two-year window pin the year exactly, which is what makes the last rung fair.
 */
function draftClassLadder(puzzle: ScoutDraftClassPuzzle, tries: number): ScoutClue[] {
  const year = puzzle.year;
  const decade = Math.floor(year / 10) * 10;
  const bandStart = Math.floor(year / 5) * 5;
  const out: ScoutClue[] = [
    clue('draft', 'Era', `${decade}s`),
    clue('draft', 'Somewhere in', `${bandStart}–${bandStart + 4}`),
    clue('draft', 'Parity', year % 2 === 0 ? 'Even year' : 'Odd year'),
  ];
  if (out.length + 1 < tries && puzzle.earliest) {
    out.push(clue('draft', 'Earliest slot shown', `Round ${puzzle.earliest.round}, pick ${puzzle.earliest.pick}`));
  }
  out.push(clue('draft', 'Down to two', `${year - 1} or ${year}`));
  return out;
}

/**
 * `higherLower`: a coin flip is not a ladder, so the rungs pay INFORMATION instead of more picture —
 * the position both men play, the season, the size of the gap, and finally one of the two numbers.
 * Gap + one number is the whole answer, which is the right price for burning most of your tries on
 * a two-way question.
 */
function higherLowerLadder(puzzle: ScoutHigherLowerPuzzle, tries: number): ScoutClue[] {
  const gap = Math.abs(puzzle.numbers[0] - puzzle.numbers[1]);
  const out: ScoutClue[] = [
    clue('position', 'Both play', GROUP_LABELS[puzzle.group]),
    clue('stat', 'Season', String(puzzle.season)),
  ];
  if (out.length + 1 < tries) out.push(clue('stat', 'The gap', groupDigits(Math.round(gap * 10) / 10)));
  out.push(clue('stat', `${puzzle.statLabel} · ${puzzle.cards[0].name}`, puzzle.values[0]));
  return out;
}

/** 'The odd man out' clue: the first dimension that is not the one being asked about. */
function oddOutHint(puzzle: ScoutOddOneOutPuzzle): ScoutClue | undefined {
  const card = puzzle.cards.find((c) => c.playerId === puzzle.answerPlayerId);
  if (!card) return undefined;
  if (puzzle.trait !== 'positionGroup') return clue('position', 'The odd man out plays', GROUP_LABELS[card.group]);
  if (card.college) return clue('college', 'The odd man out went to', card.college);
  return clue('draft', 'The odd man out went', card.draftRound ? `in round ${card.draftRound}` : 'undrafted');
}

/**
 * `oddOneOut`: rung 0 names the CATEGORY (without it the question is unanswerable), the next rung
 * pays out the value the three share, and the rest of the narrowing is the eliminations `visual`
 * carries. Tuned for three or four tries — two clues and two strike-outs is exactly four rungs.
 */
function oddOneOutLadder(puzzle: ScoutOddOneOutPuzzle): ScoutClue[] {
  const out: ScoutClue[] = [clue('fact', 'Three of these share', ODD_PROMPTS[puzzle.trait])];
  out.push(clue(ODD_CLUE_KINDS[puzzle.trait], `The shared ${puzzle.traitLabel.toLowerCase()}`, puzzle.sharedValue));
  const hint = oddOutHint(puzzle);
  if (hint) out.push(hint);
  return out;
}

/**
 * `jersey`: the number, the position and the colours are all on screen from rung 0, so the ladder
 * starts where the other player modes get to third — conference, then the paperwork, then the
 * initial. The club is never named: two colours and a number is the whole point.
 */
function jerseyLadder(player: NflPlayer, team: NflTeam | undefined, tries: number): ScoutClue[] {
  const core: ScoutClue[] = [];
  if (team) core.push(clue('conference', 'Conference', team.conference));
  if (typeof player.exp === 'number') core.push(clue('experience', 'Experience', experienceValue(player.exp)));
  core.push(clue('draft', player.draft ? 'Draft year' : 'Draft', draftValue(player)));
  if (player.college) core.push(clue('college', 'College', player.college));
  const tail = [clue('initials', 'First initial', initialValue(player))];
  if (core.length + tail.length < tries && player.heightIn && player.weightLb) {
    core.push(clue('physical', 'Build', `${Math.floor(player.heightIn / 12)}'${player.heightIn % 12}", ${player.weightLb} lb`));
  }
  return [...core, ...tail];
}

/** The full clue order for a mode + subject, before it is spread across the rungs. */
export function clueOrderFor(mode: ScoutMode, subject: ScoutSubject, tries: number, rng?: Rng): ClueOrder {
  const player = subject.player;
  const team = subject.team;
  const puzzle = subject.puzzle;
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
    case 'teammates':
      return {
        clues: player ? teammatesLadder(player, tries) : [],
        base: 0,
        visual: { min: TEAMMATES_VISUAL_MIN, max: CARD_VISUAL_MAX },
      };
    case 'depthChart':
      return {
        clues: team ? depthChartLadder(team, tries) : [],
        base: 0,
        visual: { min: DEPTH_CHART_VISUAL_MIN, max: CARD_VISUAL_MAX },
      };
    case 'draftClass':
      return {
        clues: puzzle?.type === 'draftClass' ? draftClassLadder(puzzle, tries) : [],
        base: 0,
        visual: { min: DRAFT_CLASS_VISUAL_MIN, max: CARD_VISUAL_MAX },
      };
    case 'higherLower':
      return {
        clues: puzzle?.type === 'higherLower' ? higherLowerLadder(puzzle, tries) : [],
        base: 0,
        visual: { min: 0, max: 0 },
      };
    case 'oddOneOut':
      return {
        clues: puzzle?.type === 'oddOneOut' ? oddOneOutLadder(puzzle) : [],
        base: 1,
        visual: { min: 0, max: ODD_ONE_OUT_VISUAL_MAX },
      };
    case 'jersey':
      return {
        clues: player ? jerseyLadder(player, team, tries) : [],
        base: 0,
        visual: { min: 0, max: 0 },
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
