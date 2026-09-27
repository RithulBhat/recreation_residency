/**
 * Highlight Scout packs, modes and presets.
 *
 * `SCOUT_PACKS` covers every position group, all 8 divisions, both conferences, all 32 franchises
 * (as player packs), the fame/experience/draft cuts, and the team-guessing packs. Each pack is a
 * `filter` evaluated against the dataset by `subjects.ts` — nothing here hard-codes a player id, so
 * the packs survive every roster sync.
 *
 * Team ids are ESPN's (verified against `site.api.espn.com/.../nfl/teams`).
 */

import type { ScoutMode, ScoutPack, ScoutPackFilter, ScoutSettings, SubjectKind } from './types';
import type { Conference, DivisionName, PositionGroup } from './types';

/**
 * `ScoutPackFilter` plus the two draft rules the frozen contract has no room for. These are
 * OPTIONAL additions read by `playerMatchesFilter` in `subjects.ts`; a plain `ScoutPackFilter`
 * still works everywhere, and `SCOUT_PACKS` is still typed `readonly ScoutPack[]`.
 */
export interface ScoutDraftFilter extends ScoutPackFilter {
  /** Keep only players drafted in this round or earlier (1 = first-rounders). */
  maxDraftRound?: number;
  /** Keep only players with no draft record at all. */
  undrafted?: boolean;
  /** ADDED — keep only players drafted in this year or later (the `draftClass` floor is 2011). */
  minDraftYear?: number;
}

interface ScoutPackDraft extends Omit<ScoutPack, 'filter'> {
  filter: ScoutDraftFilter;
}

interface TeamMeta {
  id: string;
  abbr: string;
  city: string;
  name: string;
  conf: Conference;
  div: DivisionName;
  emoji: string;
  accent: string;
  tagline: string;
}

/** The 32 franchises, ESPN ids. */
export const SCOUT_TEAM_META: readonly TeamMeta[] = [
  { id: '2', abbr: 'BUF', city: 'Buffalo', name: 'Bills', conf: 'AFC', div: 'East', emoji: '🦬', accent: '#00338d', tagline: 'Snow games, table smashes, Bills Mafia.' },
  { id: '15', abbr: 'MIA', city: 'Miami', name: 'Dolphins', conf: 'AFC', div: 'East', emoji: '🐬', accent: '#008e97', tagline: 'Speed in aqua. The only perfect season.' },
  { id: '17', abbr: 'NE', city: 'New England', name: 'Patriots', conf: 'AFC', div: 'East', emoji: '🇺🇸', accent: '#0c2340', tagline: 'Two decades of dynasty, and what came next.' },
  { id: '20', abbr: 'NYJ', city: 'New York', name: 'Jets', conf: 'AFC', div: 'East', emoji: '🛩️', accent: '#125740', tagline: 'Gang Green: one guarantee, endless hope.' },
  { id: '33', abbr: 'BAL', city: 'Baltimore', name: 'Ravens', conf: 'AFC', div: 'North', emoji: '🐦‍⬛', accent: '#241773', tagline: 'Nevermore. Defense first, always.' },
  { id: '4', abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', conf: 'AFC', div: 'North', emoji: '🐅', accent: '#fb4f14', tagline: 'Stripes, jungle noise, and a rocket arm.' },
  { id: '5', abbr: 'CLE', city: 'Cleveland', name: 'Browns', conf: 'AFC', div: 'North', emoji: '🟠', accent: '#ff3c00', tagline: 'The Dawg Pound never stopped barking.' },
  { id: '23', abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', conf: 'AFC', div: 'North', emoji: '🔧', accent: '#ffb612', tagline: 'Six rings, terrible towels, steel curtain.' },
  { id: '34', abbr: 'HOU', city: 'Houston', name: 'Texans', conf: 'AFC', div: 'South', emoji: '🐂', accent: '#03202f', tagline: 'The youngest franchise, rebuilt in a hurry.' },
  { id: '11', abbr: 'IND', city: 'Indianapolis', name: 'Colts', conf: 'AFC', div: 'South', emoji: '🐴', accent: '#002c5f', tagline: 'The horseshoe: two states, two legends.' },
  { id: '30', abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', conf: 'AFC', div: 'South', emoji: '🐆', accent: '#006778', tagline: 'Teal, London home games, duval noise.' },
  { id: '10', abbr: 'TEN', city: 'Tennessee', name: 'Titans', conf: 'AFC', div: 'South', emoji: '⚔️', accent: '#4b92db', tagline: 'One yard short, and the Music City Miracle.' },
  { id: '7', abbr: 'DEN', city: 'Denver', name: 'Broncos', conf: 'AFC', div: 'West', emoji: '🐎', accent: '#fa4616', tagline: 'Mile High thin air and Orange Crush.' },
  { id: '12', abbr: 'KC', city: 'Kansas City', name: 'Chiefs', conf: 'AFC', div: 'West', emoji: '🏹', accent: '#e31837', tagline: 'Arrowhead is the loudest place on earth.' },
  { id: '13', abbr: 'LV', city: 'Las Vegas', name: 'Raiders', conf: 'AFC', div: 'West', emoji: '🏴‍☠️', accent: '#a5acaf', tagline: 'Just win, baby — in a third home city.' },
  { id: '24', abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', conf: 'AFC', div: 'West', emoji: '⚡', accent: '#0080c6', tagline: 'Powder blue, lightning bolts, late heartbreak.' },
  { id: '6', abbr: 'DAL', city: 'Dallas', name: 'Cowboys', conf: 'NFC', div: 'East', emoji: '⭐', accent: '#041e42', tagline: "America's Team, whether you like it or not." },
  { id: '19', abbr: 'NYG', city: 'New York', name: 'Giants', conf: 'NFC', div: 'East', emoji: '🗽', accent: '#0b2265', tagline: 'Big Blue ruined two perfect seasons.' },
  { id: '21', abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', conf: 'NFC', div: 'East', emoji: '🦅', accent: '#004c54', tagline: 'Fly Eagles Fly — and the Brotherly Shove.' },
  { id: '28', abbr: 'WSH', city: 'Washington', name: 'Commanders', conf: 'NFC', div: 'East', emoji: '🪖', accent: '#5a1414', tagline: 'Burgundy and gold, three names, one fanbase.' },
  { id: '3', abbr: 'CHI', city: 'Chicago', name: 'Bears', conf: 'NFC', div: 'North', emoji: '🐻', accent: '#c83803', tagline: 'Monsters of the Midway, oldest rivalry going.' },
  { id: '8', abbr: 'DET', city: 'Detroit', name: 'Lions', conf: 'NFC', div: 'North', emoji: '🦁', accent: '#0076b6', tagline: 'Thanksgiving hosts who finally got good.' },
  { id: '9', abbr: 'GB', city: 'Green Bay', name: 'Packers', conf: 'NFC', div: 'North', emoji: '🧀', accent: '#203731', tagline: 'Fan-owned, frozen, and four trophies deep.' },
  { id: '16', abbr: 'MIN', city: 'Minnesota', name: 'Vikings', conf: 'NFC', div: 'North', emoji: '🪓', accent: '#4f2683', tagline: 'Skol chants and the purple people eaters.' },
  { id: '1', abbr: 'ATL', city: 'Atlanta', name: 'Falcons', conf: 'NFC', div: 'South', emoji: '🦉', accent: '#a71930', tagline: 'Dirty Bird, rise up, and 28-3.' },
  { id: '29', abbr: 'CAR', city: 'Carolina', name: 'Panthers', conf: 'NFC', div: 'South', emoji: '🐈‍⬛', accent: '#0085ca', tagline: 'Keep pounding. Two Carolinas, one cat.' },
  { id: '18', abbr: 'NO', city: 'New Orleans', name: 'Saints', conf: 'NFC', div: 'South', emoji: '⚜️', accent: '#d3bc8d', tagline: 'Who Dat, the Dome, and a city reborn.' },
  { id: '27', abbr: 'TB', city: 'Tampa Bay', name: 'Buccaneers', conf: 'NFC', div: 'South', emoji: '🏴', accent: '#d50a0a', tagline: 'Creamsicle to pirate ship, two titles.' },
  { id: '22', abbr: 'ARI', city: 'Arizona', name: 'Cardinals', conf: 'NFC', div: 'West', emoji: '🐦', accent: '#97233f', tagline: 'The oldest franchise, three cities later.' },
  { id: '14', abbr: 'LAR', city: 'Los Angeles', name: 'Rams', conf: 'NFC', div: 'West', emoji: '🐏', accent: '#003594', tagline: 'Helmet horns, and the Greatest Show on Turf.' },
  { id: '25', abbr: 'SF', city: 'San Francisco', name: '49ers', conf: 'NFC', div: 'West', emoji: '⛏️', accent: '#aa0000', tagline: 'Five rings, gold rush, west coast offense.' },
  { id: '26', abbr: 'SEA', city: 'Seattle', name: 'Seahawks', conf: 'NFC', div: 'West', emoji: '🦅', accent: '#69be28', tagline: 'The 12s registered on a seismograph.' },
];

const GROUP_PACKS: ReadonlyArray<{ group: PositionGroup; name: string; emoji: string; accent: string; tagline: string; size: number; featured?: boolean }> = [
  { group: 'QB', name: 'Quarterbacks', emoji: '🎯', accent: '#a855f7', tagline: 'The 32 faces everyone thinks they know.', size: 90, featured: true },
  { group: 'RB', name: 'Running Backs', emoji: '💨', accent: '#22d3ee', tagline: 'Between the tackles and out the back door.', size: 130, featured: true },
  { group: 'WR', name: 'Wide Receivers', emoji: '🧤', accent: '#f472b6', tagline: 'Gloves, routes, and contested-catch gods.', size: 210, featured: true },
  { group: 'TE', name: 'Tight Ends', emoji: '🧱', accent: '#fbbf24', tagline: 'Half lineman, half receiver, all problem.', size: 110 },
  { group: 'OL', name: 'Offensive Line', emoji: '🛡️', accent: '#94a3b8', tagline: 'The five nobody can name. Until now.', size: 260 },
  { group: 'DL', name: 'Defensive Line', emoji: '🐗', accent: '#fb7185', tagline: 'Edge rushers and the men who eat doubles.', size: 240 },
  { group: 'LB', name: 'Linebackers', emoji: '🎩', accent: '#34d399', tagline: 'Green dots, blitz timing, sideline range.', size: 170 },
  { group: 'DB', name: 'Defensive Backs', emoji: '🔒', accent: '#60a5fa', tagline: 'Islands, ball hawks, and the last line.', size: 280 },
  { group: 'ST', name: 'Special Teams', emoji: '🦶', accent: '#f59e0b', tagline: 'Kickers, punters, long snappers. Respect them.', size: 100 },
];

const DIVISIONS: ReadonlyArray<{ conf: Conference; div: DivisionName; emoji: string; accent: string; tagline: string; featured?: boolean }> = [
  { conf: 'AFC', div: 'East', emoji: '🦬', accent: '#1d4ed8', tagline: 'Bills, Dolphins, Patriots, Jets.' },
  { conf: 'AFC', div: 'North', emoji: '🔨', accent: '#7c3aed', tagline: 'The most physical division in football.', featured: true },
  { conf: 'AFC', div: 'South', emoji: '🌴', accent: '#0891b2', tagline: 'Texans, Colts, Jaguars, Titans.' },
  { conf: 'AFC', div: 'West', emoji: '🏔️', accent: '#db2777', tagline: 'Chiefs, Broncos, Raiders, Chargers.', featured: true },
  { conf: 'NFC', div: 'East', emoji: '⭐', accent: '#16a34a', tagline: 'Four fanbases who hate each other.' },
  { conf: 'NFC', div: 'North', emoji: '❄️', accent: '#ca8a04', tagline: 'Frozen tundra, Motor City, Monsters.' },
  { conf: 'NFC', div: 'South', emoji: '🎷', accent: '#e11d48', tagline: 'Saints, Falcons, Panthers, Buccaneers.' },
  { conf: 'NFC', div: 'West', emoji: '🌉', accent: '#0ea5e9', tagline: 'Niners, Rams, Seahawks, Cardinals.', featured: true },
];

function teamPack(t: TeamMeta): ScoutPack {
  return {
    id: `team-${t.abbr.toLowerCase()}`,
    name: `${t.city} ${t.name}`,
    emoji: t.emoji,
    tagline: t.tagline,
    accent: t.accent,
    kind: 'player',
    tags: ['team', t.conf.toLowerCase(), `${t.conf} ${t.div}`.toLowerCase(), t.abbr.toLowerCase()],
    filter: { teamIds: [t.id] },
    approxSize: 53,
  };
}

const FEATURED_TEAMS = new Set(['KC', 'SF', 'PHI', 'DAL']);

const TEAM_ROSTER_PACKS: readonly ScoutPack[] = SCOUT_TEAM_META.map((t) =>
  FEATURED_TEAMS.has(t.abbr) ? { ...teamPack(t), featured: true } : teamPack(t),
);

const GROUP_POSITION_PACKS: readonly ScoutPack[] = GROUP_PACKS.map((g) => {
  const pack: ScoutPack = {
    id: `pos-${g.group.toLowerCase()}`,
    name: g.name,
    emoji: g.emoji,
    tagline: g.tagline,
    accent: g.accent,
    kind: 'player',
    tags: ['position', g.group.toLowerCase()],
    filter: { groups: [g.group] },
    approxSize: g.size,
  };
  return g.featured ? { ...pack, featured: true } : pack;
});

const DIVISION_PACKS: readonly ScoutPack[] = DIVISIONS.map((d) => {
  const pack: ScoutPack = {
    id: `div-${d.conf.toLowerCase()}-${d.div.toLowerCase()}`,
    name: `${d.conf} ${d.div}`,
    emoji: d.emoji,
    tagline: d.tagline,
    accent: d.accent,
    kind: 'player',
    tags: ['division', d.conf.toLowerCase(), d.div.toLowerCase()],
    filter: { conferences: [d.conf], divisions: [d.div] },
    approxSize: 212,
  };
  return d.featured ? { ...pack, featured: true } : pack;
});

const CONFERENCE_PACKS: readonly ScoutPack[] = [
  {
    id: 'conf-afc',
    name: 'AFC Players',
    emoji: '🔴',
    tagline: 'Every roster in the American Football Conference.',
    accent: '#ef4444',
    kind: 'player',
    tags: ['conference', 'afc'],
    filter: { conferences: ['AFC'] },
    approxSize: 850,
  },
  {
    id: 'conf-nfc',
    name: 'NFC Players',
    emoji: '🔵',
    tagline: 'Every roster in the National Football Conference.',
    accent: '#3b82f6',
    kind: 'player',
    tags: ['conference', 'nfc'],
    filter: { conferences: ['NFC'] },
    approxSize: 850,
  },
];

const SPECIAL_PACKS: readonly ScoutPackDraft[] = [
  {
    id: 'superstars',
    name: 'Superstars',
    emoji: '🌟',
    tagline: 'Household names only. Fame 80 and up.',
    accent: '#eab308',
    kind: 'player',
    tags: ['difficulty', 'easy', 'stars'],
    filter: { minFame: 80 },
    approxSize: 70,
    featured: true,
  },
  {
    id: 'deep-cuts',
    name: 'Deep Cuts',
    emoji: '🕳️',
    tagline: 'Practice-squad energy. Only sickos survive.',
    accent: '#64748b',
    kind: 'player',
    tags: ['difficulty', 'hard', 'obscure'],
    filter: { maxFame: 29 },
    approxSize: 900,
    featured: true,
  },
  {
    id: 'rookies',
    name: 'Rookies',
    emoji: '🐣',
    tagline: 'First or second year. Brand new faces.',
    accent: '#22c55e',
    kind: 'player',
    tags: ['experience', 'rookies', 'draft'],
    filter: { maxExp: 1 },
    approxSize: 420,
    featured: true,
  },
  {
    id: 'veterans',
    name: 'Veterans',
    emoji: '🧓',
    tagline: 'Ten seasons or more. The old heads.',
    accent: '#b45309',
    kind: 'player',
    tags: ['experience', 'veterans'],
    filter: { minExp: 10 },
    approxSize: 150,
  },
  {
    id: 'first-rounders',
    name: 'First-Rounders',
    emoji: '🥇',
    tagline: 'Drafted on night one, for better or worse.',
    accent: '#8b5cf6',
    kind: 'player',
    tags: ['draft', 'first round'],
    filter: { maxDraftRound: 1 },
    approxSize: 250,
  },
  {
    id: 'undrafted',
    name: 'Undrafted',
    emoji: '🧾',
    tagline: 'Nobody called their name. They made it anyway.',
    accent: '#14b8a6',
    kind: 'player',
    tags: ['draft', 'undrafted', 'hard'],
    filter: { undrafted: true },
    approxSize: 400,
  },
];

/**
 * Packs for the CHOICE-SHAPED modes (ADDED).
 *
 * `household-names` is the measured pool those modes were designed against: fame ≥ 55 is exactly
 * the 460 players the data survey found recognisable, and every one of them has four teammates and
 * a jersey number to build a round from. `skill-stats` is the slice that actually carries stat
 * lines, so a Higher or Lower run never comes up empty. `draft-2011-on` is the `draftClass` floor —
 * older classes no longer have four recognisable men on a roster.
 */
const PUZZLE_PACKS: readonly ScoutPackDraft[] = [
  {
    id: 'household-names',
    name: 'Household Names',
    emoji: '🪪',
    tagline: 'Fame 55 and up: the faces a fan can actually name.',
    accent: '#7dd3fc',
    kind: 'player',
    tags: ['difficulty', 'teammates', 'jersey', 'recognisable'],
    filter: { minFame: 55 },
    approxSize: 460,
  },
  {
    id: 'skill-stats',
    name: 'Skill Positions',
    emoji: '📈',
    tagline: 'QBs, backs and pass catchers — the men with stat lines.',
    accent: '#a3e635',
    kind: 'player',
    tags: ['position', 'stats', 'higher or lower'],
    filter: { groups: ['QB', 'RB', 'WR', 'TE'], minFame: 45 },
    approxSize: 300,
  },
  {
    id: 'draft-2011-on',
    name: 'Draft Classes',
    emoji: '🎓',
    tagline: 'Every man taken from the 2011 draft onwards.',
    accent: '#c084fc',
    kind: 'player',
    tags: ['draft', 'class', 'modern'],
    filter: { minDraftYear: 2011 },
    approxSize: 700,
  },
];

const TEAM_GUESS_PACKS: readonly ScoutPack[] = [
  {
    id: 'franchises-all',
    name: 'All 32 Franchises',
    emoji: '🏟️',
    tagline: 'Name the franchise from its trivia or its logo.',
    accent: '#f97316',
    kind: 'team',
    tags: ['teams', 'trivia', 'logo'],
    filter: { teamIds: SCOUT_TEAM_META.map((t) => t.id) },
    approxSize: 32,
    featured: true,
  },
  {
    id: 'franchises-afc',
    name: 'AFC Franchises',
    emoji: '🅰️',
    tagline: 'Sixteen AFC clubs. Trivia only, no logos given.',
    accent: '#dc2626',
    kind: 'team',
    tags: ['teams', 'afc', 'trivia'],
    filter: { conferences: ['AFC'] },
    approxSize: 16,
  },
  {
    id: 'franchises-nfc',
    name: 'NFC Franchises',
    emoji: '🅾️',
    tagline: 'Sixteen NFC clubs. Old logos, older grudges.',
    accent: '#2563eb',
    kind: 'team',
    tags: ['teams', 'nfc', 'trivia'],
    filter: { conferences: ['NFC'] },
    approxSize: 16,
  },
];

/** Every pack: specials → choice-shaped → positions → divisions → conferences → franchises → rosters. */
export const SCOUT_PACKS: readonly ScoutPack[] = [
  ...SPECIAL_PACKS,
  ...PUZZLE_PACKS,
  ...GROUP_POSITION_PACKS,
  ...DIVISION_PACKS,
  ...CONFERENCE_PACKS,
  ...TEAM_GUESS_PACKS,
  ...TEAM_ROSTER_PACKS,
];

export const DEFAULT_SCOUT_PACK_ID = 'superstars';

export function scoutPack(id: string): ScoutPack | undefined {
  return SCOUT_PACKS.find((p) => p.id === id);
}

export function featuredScoutPacks(): ScoutPack[] {
  return SCOUT_PACKS.filter((p) => p.featured === true);
}

export function scoutPacksOfKind(kind: SubjectKind): ScoutPack[] {
  return SCOUT_PACKS.filter((p) => p.kind === kind);
}

// ---------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------

/**
 * What a mode's answer IS (ADDED). Not the same thing as its subject kind: `draftClass` is built out
 * of player records but the answer is a YEAR, and the two choice modes are answered by tapping a
 * card rather than by naming anything.
 */
export type ScoutAnswerShape = 'player' | 'team' | 'year' | 'option';

export interface ScoutModeInfo {
  id: ScoutMode;
  name: string;
  emoji: string;
  blurb: string;
  /** One line: how a round actually plays. */
  how: string;
  /** Which pool the mode draws from — unchanged, and still `subjectKindForMode(id)`. */
  guesses: SubjectKind;
  /** ADDED — what the player is actually naming. */
  answer: ScoutAnswerShape;
  /** ADDED — `'choice'` modes never use the guess box; the stage collects the answer. */
  input: 'text' | 'choice';
}

export const SCOUT_MODES: readonly ScoutModeInfo[] = [
  {
    id: 'silhouette',
    name: 'Silhouette',
    emoji: '🕶️',
    blurb: 'A blacked-out player, lit up one try at a time.',
    how: 'Guess the player; every miss lifts the shadow and adds a clue.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'faceZoom',
    name: 'Face Off',
    emoji: '🔍',
    blurb: 'One eyebrow. One chinstrap. Good luck.',
    how: 'The crop pulls back each try until the whole headshot shows.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'highlight',
    name: 'Film Room',
    emoji: '🎬',
    blurb: 'A real play, with every name blacked out.',
    how: 'Read the redacted play text, then earn team, situation and position.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'teamTrivia',
    name: 'Franchise IQ',
    emoji: '🏟️',
    blurb: 'Obscure franchise facts, easiest one last.',
    how: 'Name the team; each miss trades a fact for an easier fact.',
    guesses: 'team',
    answer: 'team',
    input: 'text',
  },
  {
    id: 'statLine',
    name: 'Stat Sheet',
    emoji: '📊',
    blurb: 'A season in numbers. Whose numbers?',
    how: 'Stat pairs appear one at a time, then position, then team.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'careerPath',
    name: 'Draft Board',
    emoji: '🗂️',
    blurb: 'Draft slot, college, team. Follow the paperwork.',
    how: 'Starts at the draft year and walks forward to the jersey number.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'logoZoom',
    name: 'Logo Zoom',
    emoji: '🔭',
    blurb: 'Three pixels of a helmet decal.',
    how: 'The logo zooms out each try while conference clues land.',
    guesses: 'team',
    answer: 'team',
    input: 'text',
  },
  // ------------------------------------------------------------------- the choice-shaped six
  {
    id: 'teammates',
    name: 'Locker Room',
    emoji: '🪪',
    blurb: 'Four of his teammates. Name the man missing.',
    how: 'Two faces to start, another every miss, then position and jersey.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
  {
    id: 'depthChart',
    name: 'Depth Chart',
    emoji: '📋',
    blurb: 'Five names off one roster. Whose?',
    how: 'Name the club; misses add a name, then conference, division, venue.',
    guesses: 'team',
    answer: 'team',
    input: 'text',
  },
  {
    id: 'draftClass',
    name: 'Draft Class',
    emoji: '🎓',
    blurb: 'Four men taken in the same draft. Which year?',
    how: 'The window narrows from a decade to two years as you miss.',
    guesses: 'player',
    answer: 'year',
    input: 'text',
  },
  {
    id: 'higherLower',
    name: 'Higher or Lower',
    emoji: '⚖️',
    blurb: 'Two players, one stat. Who put up more?',
    how: 'Tap a card. No typing — same position, same season, no ties.',
    guesses: 'player',
    answer: 'option',
    input: 'choice',
  },
  {
    id: 'oddOneOut',
    name: 'Odd One Out',
    emoji: '🧩',
    blurb: 'Three of these four share something. One does not.',
    how: 'The category is free; the shared value and the strike-outs cost tries.',
    guesses: 'player',
    answer: 'option',
    input: 'choice',
  },
  {
    id: 'jersey',
    name: 'Numbers Game',
    emoji: '🔢',
    blurb: 'A number, a position, two colours. No photo.',
    how: 'Name the man wearing it; misses buy conference, draft, college.',
    guesses: 'player',
    answer: 'player',
    input: 'text',
  },
];

/** What the player is naming in this mode. */
export function scoutModeAnswer(id: ScoutMode): ScoutAnswerShape {
  return scoutMode(id)?.answer ?? 'player';
}

/** True when the round is answered by tapping a card instead of typing a name. */
export function scoutModeIsChoice(id: ScoutMode): boolean {
  return scoutMode(id)?.input === 'choice';
}

export function scoutMode(id: ScoutMode): ScoutModeInfo | undefined {
  return SCOUT_MODES.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------------------

export interface ScoutPreset {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  settings: Partial<ScoutSettings>;
}

const CLASSIC_SCOUT_PRESETS: readonly ScoutPreset[] = [
  {
    id: 'silhouette-sprint',
    name: 'Silhouette Sprint',
    emoji: '🕶️',
    blurb: 'Ten stars in shadow, four tries, 30 seconds each.',
    settings: {
      mode: 'silhouette',
      packIds: ['superstars'],
      difficulty: 'star',
      tries: 4,
      rounds: 10,
      roundTimer: 30,
      mixModes: false,
    },
  },
  {
    id: 'face-off',
    name: 'Face Off',
    emoji: '🔍',
    blurb: 'Extreme close-ups of the biggest names.',
    settings: {
      mode: 'faceZoom',
      packIds: ['superstars'],
      difficulty: 'any',
      tries: 5,
      rounds: 10,
      roundTimer: 0,
      mixModes: false,
    },
  },
  {
    id: 'film-room',
    name: 'Film Room',
    emoji: '🎬',
    blurb: 'Redacted play text. Six tries. Pure film study.',
    settings: {
      mode: 'highlight',
      packIds: ['conf-afc', 'conf-nfc'],
      difficulty: 'any',
      tries: 6,
      rounds: 10,
      mixModes: false,
    },
  },
  {
    id: 'franchise-iq',
    name: 'Franchise IQ',
    emoji: '🏟️',
    blurb: 'All 32 clubs, hardest fact first.',
    settings: {
      mode: 'teamTrivia',
      packIds: ['franchises-all'],
      difficulty: 'any',
      tries: 5,
      rounds: 12,
      mixModes: false,
    },
  },
  {
    id: 'draft-board',
    name: 'Draft Board',
    emoji: '🗂️',
    blurb: 'Draft slot to jersey number, five rungs.',
    settings: {
      mode: 'careerPath',
      packIds: ['first-rounders'],
      difficulty: 'any',
      tries: 5,
      rounds: 10,
      mixModes: false,
    },
  },
  {
    id: 'stat-sheet',
    name: 'Stat Sheet',
    emoji: '📊',
    blurb: 'A season in numbers, revealed one column at a time.',
    settings: {
      mode: 'statLine',
      packIds: ['superstars'],
      difficulty: 'any',
      tries: 5,
      rounds: 10,
      mixModes: false,
    },
  },
  {
    id: 'mixed-bag',
    name: 'Mixed Bag',
    emoji: '🎲',
    blurb: 'Every mode, shuffled. Players and franchises.',
    settings: {
      mode: 'silhouette',
      packIds: ['superstars', 'franchises-all'],
      difficulty: 'any',
      tries: 5,
      rounds: 12,
      mixModes: true,
    },
  },
  {
    id: 'sicko-mode',
    name: 'Sicko Mode',
    emoji: '💀',
    blurb: 'Deep cuts, three tries, no hints, 20-second clock.',
    settings: {
      mode: 'silhouette',
      packIds: ['deep-cuts'],
      difficulty: 'deepCut',
      tries: 3,
      rounds: 10,
      roundTimer: 20,
      hintsEnabled: false,
      mixModes: false,
    },
  },
];

/**
 * One preset per choice-shaped mode (ADDED) — this is how they are reachable from the lobby.
 *
 * The try counts are deliberate. Higher or Lower is a two-way question, so it gets ONE try: a second
 * try would be a free win. Odd One Out has four options and three tries, which leaves brute force
 * possible but expensive (the try ladder pays 1 → 0.8 → 0.65).
 */
export const SCOUT_PUZZLE_PRESETS: readonly ScoutPreset[] = [
  {
    id: 'locker-room',
    name: 'Locker Room',
    emoji: '🪪',
    blurb: 'Four teammates on the board. Name the man who is missing.',
    settings: {
      mode: 'teammates',
      packIds: ['household-names'],
      difficulty: 'any',
      tries: 4,
      rounds: 10,
      mixModes: false,
    },
  },
  {
    id: 'depth-chart',
    name: 'Depth Chart',
    emoji: '📋',
    blurb: 'Five men off one roster. Name the club they play for.',
    settings: {
      mode: 'depthChart',
      packIds: ['franchises-all'],
      difficulty: 'any',
      tries: 5,
      rounds: 12,
      mixModes: false,
    },
  },
  {
    id: 'draft-class',
    name: 'Draft Class',
    emoji: '🎓',
    blurb: 'Four men, one draft. Name the year — 2011 or later.',
    settings: {
      mode: 'draftClass',
      packIds: ['draft-2011-on'],
      difficulty: 'any',
      tries: 4,
      rounds: 10,
      mixModes: false,
    },
  },
  {
    id: 'higher-or-lower',
    name: 'Higher or Lower',
    emoji: '⚖️',
    blurb: 'One stat, two players, one tap. Fifteen snap calls.',
    settings: {
      mode: 'higherLower',
      packIds: ['skill-stats'],
      difficulty: 'any',
      tries: 1,
      rounds: 15,
      roundTimer: 15,
      mixModes: false,
    },
  },
  {
    id: 'odd-one-out',
    name: 'Odd One Out',
    emoji: '🧩',
    blurb: 'Three share a school, a club, a round or a room. One does not.',
    settings: {
      mode: 'oddOneOut',
      packIds: ['household-names'],
      difficulty: 'any',
      tries: 3,
      rounds: 12,
      mixModes: false,
    },
  },
  {
    id: 'numbers-game',
    name: 'Numbers Game',
    emoji: '🔢',
    blurb: 'A number and two colours. No face, no stat line, no mercy.',
    settings: {
      mode: 'jersey',
      packIds: ['household-names'],
      difficulty: 'any',
      tries: 5,
      rounds: 10,
      mixModes: false,
    },
  },
];

/** Every standard-format preset: the reveal seven first, then the choice-shaped six. */
export const SCOUT_PRESETS: readonly ScoutPreset[] = [...CLASSIC_SCOUT_PRESETS, ...SCOUT_PUZZLE_PRESETS];

export function scoutPreset(id: string): ScoutPreset | undefined {
  return SCOUT_PRESETS.find((p) => p.id === id);
}
