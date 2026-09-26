/**
 * Highlight Scout test fixtures — deterministic fake-but-plausible NFL data.
 *
 * Safe to import from tests and from screens that need to render before
 * `src/data/nfl/` exists. Everything here is typed to `@/scout/types`.
 *
 * The roster is chosen to exercise the matcher: surname collisions (Bosa/Bosa,
 * Allen/Allen, Jefferson/Jefferson), 4-letter surnames (Rice, Bosa, Love),
 * aliases ('cmc'), suffixes ('Kenneth Walker III'), apostrophes ("D'Andre Swift"),
 * diacritics ('Sebastián Núñez'), shared-city teams (NYG/NYJ, LAR/LAC).
 */

import type {
  HighlightPlay,
  NflDataset,
  NflPlayer,
  NflTeam,
  PositionGroup,
  StatLine,
} from './types';

export const HEADSHOT_BASE = 'https://a.espncdn.com/i/headshots/nfl/players/full';
export const LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl/500';

export function fixtureHeadshot(id: string): string {
  return `${HEADSHOT_BASE}/${id}.png`;
}

export function fixtureLogo(abbr: string): string {
  return `${LOGO_BASE}/${abbr.toLowerCase()}.png`;
}

export function makeTeam(over: Partial<NflTeam> = {}): NflTeam {
  const abbr = over.abbr ?? 'KC';
  const location = over.location ?? 'Kansas City';
  const name = over.name ?? 'Chiefs';
  return {
    id: over.id ?? '12',
    abbr,
    name,
    location,
    displayName: over.displayName ?? `${location} ${name}`,
    color: over.color ?? '#e31837',
    altColor: over.altColor ?? '#ffb81c',
    logo: over.logo ?? fixtureLogo(abbr),
    conference: over.conference ?? 'AFC',
    division: over.division ?? 'West',
    venue: over.venue ?? 'Arrowhead Stadium',
    founded: over.founded ?? 1960,
    superBowls: over.superBowls ?? [1969, 2019, 2022, 2023],
    aliases: over.aliases ?? [name.toLowerCase(), abbr.toLowerCase(), location.toLowerCase()],
    rivals: over.rivals ?? ['LV', 'DEN', 'LAC'],
    legends: over.legends ?? ['Len Dawson', 'Derrick Thomas', 'Tony Gonzalez'],
    facts: over.facts ?? [
      'Played its first six seasons in another city entirely.',
      'Its stadium is regularly measured as the loudest in the league.',
      'Won the very first AFL-NFL World Championship Game played in Miami.',
    ],
  };
}

export function makePlayer(over: Partial<NflPlayer> = {}): NflPlayer {
  const name = over.name ?? 'Patrick Mahomes';
  const parts = name.split(' ').filter((x) => x !== '');
  const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
  const words = parts.filter((x, i) => i === 0 || !SUFFIXES.has(x.toLowerCase()));
  const first = over.first ?? words[0];
  const last = over.last ?? (words.length > 1 ? words[words.length - 1] : words[0]);
  const id = over.id ?? '3139477';
  const pos = over.pos ?? 'QB';
  const player: NflPlayer = {
    id,
    name,
    first,
    last,
    teamId: over.teamId ?? '12',
    pos,
    group: over.group ?? groupForPos(pos),
    headshot: over.headshot ?? fixtureHeadshot(id),
    fame: over.fame ?? 50,
  };
  if (over.jersey !== undefined) player.jersey = over.jersey;
  if (over.heightIn !== undefined) player.heightIn = over.heightIn;
  if (over.weightLb !== undefined) player.weightLb = over.weightLb;
  if (over.age !== undefined) player.age = over.age;
  if (over.exp !== undefined) player.exp = over.exp;
  if (over.college !== undefined) player.college = over.college;
  if (over.draft !== undefined) player.draft = over.draft;
  if (over.aliases !== undefined) player.aliases = over.aliases;
  return player;
}

const POS_GROUPS: Record<string, PositionGroup> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OT: 'OL',
  OG: 'OL',
  G: 'OL',
  C: 'OL',
  OL: 'OL',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  DL: 'DL',
  LB: 'LB',
  OLB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  CB: 'DB',
  S: 'DB',
  FS: 'DB',
  SS: 'DB',
  DB: 'DB',
  PK: 'ST',
  K: 'ST',
  P: 'ST',
  LS: 'ST',
};

/** Raw ESPN position abbreviation → coarse group. Unknown positions fall back to 'ST'. */
export function groupForPos(pos: string): PositionGroup {
  return POS_GROUPS[pos.toUpperCase()] ?? 'ST';
}

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

export const FIXTURE_TEAMS: readonly NflTeam[] = [
  makeTeam(),
  makeTeam({
    id: '25',
    abbr: 'SF',
    location: 'San Francisco',
    name: '49ers',
    color: '#aa0000',
    altColor: '#b3995d',
    conference: 'NFC',
    division: 'West',
    venue: "Levi's Stadium",
    founded: 1946,
    superBowls: [1981, 1984, 1988, 1989, 1994],
    aliases: ['49ers', 'niners', 'the niners', 'sf', 'san francisco', 'forty niners'],
    rivals: ['SEA', 'LAR', 'DAL'],
    legends: ['Joe Montana', 'Jerry Rice', 'Ronnie Lott'],
    facts: [
      'Named for the prospectors of an 1849 gold rush.',
      'The only franchise never to lose a Super Bowl in its first five trips.',
      'Moved into a stadium 40 miles south of the city it is named after.',
    ],
  }),
  makeTeam({
    id: '9',
    abbr: 'GB',
    location: 'Green Bay',
    name: 'Packers',
    color: '#203731',
    altColor: '#ffb612',
    conference: 'NFC',
    division: 'North',
    venue: 'Lambeau Field',
    founded: 1919,
    superBowls: [1966, 1967, 1996, 2010],
    aliases: ['packers', 'the pack', 'pack', 'gb', 'green bay', 'cheeseheads'],
    rivals: ['CHI', 'MIN', 'DET'],
    legends: ['Bart Starr', 'Reggie White', 'Brett Favre'],
    facts: [
      'The only community-owned, non-profit franchise in the league.',
      'Its home field is named for the man who founded the team with meat-packing money.',
      'Plays in the smallest market of any major North American pro team.',
    ],
  }),
  makeTeam({
    id: '2',
    abbr: 'BUF',
    location: 'Buffalo',
    name: 'Bills',
    color: '#00338d',
    altColor: '#c60c30',
    conference: 'AFC',
    division: 'East',
    venue: 'Highmark Stadium',
    founded: 1960,
    superBowls: [],
    aliases: ['bills', 'buf', 'buffalo', 'bills mafia'],
    rivals: ['MIA', 'NE', 'NYJ'],
    legends: ['Jim Kelly', 'Bruce Smith', 'Thurman Thomas'],
    facts: [
      'Lost four straight championship games in the early 1990s.',
      'Named after a 19th-century frontier scout.',
      'Its fan base is known for landing on folding tables.',
    ],
  }),
  makeTeam({
    id: '16',
    abbr: 'MIN',
    location: 'Minnesota',
    name: 'Vikings',
    color: '#4f2683',
    altColor: '#ffc62f',
    conference: 'NFC',
    division: 'North',
    venue: 'U.S. Bank Stadium',
    founded: 1961,
    superBowls: [],
    aliases: ['vikings', 'vikes', 'min', 'minnesota', 'skol'],
    rivals: ['GB', 'CHI', 'DET'],
    legends: ['Fran Tarkenton', 'Randy Moss', 'Alan Page'],
    facts: [
      'Lost four championship games in the 1970s without winning one.',
      'Is one of two franchises named for a state rather than a city.',
      'Its fans chant a Norse rallying cry with a clap.',
    ],
  }),
  makeTeam({
    id: '21',
    abbr: 'PHI',
    location: 'Philadelphia',
    name: 'Eagles',
    color: '#004c54',
    altColor: '#a5acaf',
    conference: 'NFC',
    division: 'East',
    venue: 'Lincoln Financial Field',
    founded: 1933,
    superBowls: [2017, 2024],
    aliases: ['eagles', 'phi', 'philadelphia', 'philly', 'birds'],
    rivals: ['DAL', 'NYG', 'WSH'],
    legends: ['Reggie White', 'Chuck Bednarik', 'Brian Dawkins'],
    facts: [
      'Was briefly merged with a rival during a wartime player shortage.',
      'Its fight song is sung after every touchdown at home.',
      'Runs a short-yardage play nicknamed after a European city.',
    ],
  }),
  makeTeam({
    id: '19',
    abbr: 'NYG',
    location: 'New York',
    name: 'Giants',
    color: '#0b2265',
    altColor: '#a71930',
    conference: 'NFC',
    division: 'East',
    venue: 'MetLife Stadium',
    founded: 1925,
    superBowls: [1986, 1990, 2007, 2011],
    aliases: ['giants', 'nyg', 'new york giants', 'g men', 'big blue'],
    rivals: ['PHI', 'DAL', 'WSH'],
    legends: ['Lawrence Taylor', 'Michael Strahan', 'Phil Simms'],
    facts: [
      'Shares a stadium in another state with a division-mate of nobody.',
      'Beat an undefeated team in the Super Bowl to end a perfect season.',
      'Its defensive end once redefined the outside linebacker position.',
    ],
  }),
  makeTeam({
    id: '20',
    abbr: 'NYJ',
    location: 'New York',
    name: 'Jets',
    color: '#125740',
    altColor: '#ffffff',
    conference: 'AFC',
    division: 'East',
    venue: 'MetLife Stadium',
    founded: 1960,
    superBowls: [1968],
    aliases: ['jets', 'nyj', 'new york jets', 'gang green'],
    rivals: ['NE', 'MIA', 'BUF'],
    legends: ['Joe Namath', 'Curtis Martin', 'Darrelle Revis'],
    facts: [
      'Its quarterback guaranteed a championship win in advance — and delivered.',
      'Began life named after a bird of prey before rebranding.',
      'Shares its home field with a team from the other conference.',
    ],
  }),
  makeTeam({
    id: '24',
    abbr: 'LAC',
    location: 'Los Angeles',
    name: 'Chargers',
    color: '#0080c6',
    altColor: '#ffc20e',
    conference: 'AFC',
    division: 'West',
    venue: 'SoFi Stadium',
    founded: 1960,
    superBowls: [],
    aliases: ['chargers', 'lac', 'los angeles chargers', 'bolts'],
    rivals: ['KC', 'LV', 'DEN'],
    legends: ['LaDainian Tomlinson', 'Junior Seau', 'Dan Fouts'],
    facts: [
      'Spent one season in Los Angeles, left for 56 years, then came back.',
      'Its helmet is the only one in the league with a lightning bolt.',
      'Shares a stadium with its city rival.',
    ],
  }),
  makeTeam({
    id: '14',
    abbr: 'LAR',
    location: 'Los Angeles',
    name: 'Rams',
    color: '#003594',
    altColor: '#ffa300',
    conference: 'NFC',
    division: 'West',
    venue: 'SoFi Stadium',
    founded: 1936,
    superBowls: [1999, 2021],
    aliases: ['rams', 'lar', 'los angeles rams', 'la rams'],
    rivals: ['SF', 'SEA', 'ARI'],
    legends: ['Eric Dickerson', 'Deacon Jones', 'Marshall Faulk'],
    facts: [
      'Won championships representing three different metro areas.',
      'Was the first NFL team to put a logo on its helmets.',
      'Its "Greatest Show on Turf" offense played indoors in the Midwest.',
    ],
  }),
  makeTeam({
    id: '26',
    abbr: 'SEA',
    location: 'Seattle',
    name: 'Seahawks',
    color: '#002244',
    altColor: '#69be28',
    conference: 'NFC',
    division: 'West',
    venue: 'Lumen Field',
    founded: 1976,
    superBowls: [2013],
    aliases: ['seahawks', 'hawks', 'sea', 'seattle', '12s'],
    rivals: ['SF', 'LAR', 'ARI'],
    legends: ['Steve Largent', 'Walter Jones', 'Cortez Kennedy'],
    facts: [
      'Is the only franchise to have played in both conference title games.',
      'Its crowd noise has registered on a seismograph.',
      'Its secondary went by a nickname borrowed from a police unit.',
    ],
  }),
];

// ---------------------------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------------------------

export const FIXTURE_PLAYERS: readonly NflPlayer[] = [
  makePlayer({
    id: '3139477',
    name: 'Patrick Mahomes',
    teamId: '12',
    pos: 'QB',
    jersey: '15',
    exp: 8,
    age: 29,
    heightIn: 75,
    weightLb: 225,
    college: 'Texas Tech',
    draft: { year: 2017, round: 1, pick: 10 },
    fame: 99,
    aliases: ['showtime'],
  }),
  makePlayer({
    id: '15847',
    name: 'Travis Kelce',
    teamId: '12',
    pos: 'TE',
    jersey: '87',
    exp: 12,
    age: 35,
    college: 'Cincinnati',
    draft: { year: 2013, round: 3, pick: 63 },
    fame: 92,
  }),
  makePlayer({
    id: '4362887',
    name: 'Rashee Rice',
    teamId: '12',
    pos: 'WR',
    jersey: '4',
    exp: 2,
    college: 'SMU',
    draft: { year: 2023, round: 2, pick: 55 },
    fame: 57,
  }),
  makePlayer({
    id: '3055899',
    name: 'Harrison Butker',
    teamId: '12',
    pos: 'PK',
    jersey: '7',
    exp: 8,
    college: 'Georgia Tech',
    draft: { year: 2017, round: 7, pick: 233 },
    fame: 38,
  }),
  makePlayer({
    id: '3117251',
    name: 'Christian McCaffrey',
    teamId: '25',
    pos: 'RB',
    jersey: '23',
    exp: 8,
    college: 'Stanford',
    draft: { year: 2017, round: 1, pick: 8 },
    fame: 90,
    aliases: ['cmc', 'run cmc'],
  }),
  makePlayer({
    id: '4361741',
    name: 'Brock Purdy',
    teamId: '25',
    pos: 'QB',
    jersey: '13',
    exp: 3,
    college: 'Iowa State',
    draft: { year: 2022, round: 7, pick: 262 },
    fame: 76,
    aliases: ['mr irrelevant'],
  }),
  makePlayer({
    id: '3915511',
    name: 'Nick Bosa',
    teamId: '25',
    pos: 'DE',
    jersey: '97',
    exp: 6,
    college: 'Ohio State',
    draft: { year: 2019, round: 1, pick: 2 },
    fame: 81,
  }),
  makePlayer({
    id: '2976499',
    name: 'Trent Williams',
    teamId: '25',
    pos: 'OT',
    jersey: '71',
    exp: 15,
    college: 'Oklahoma',
    draft: { year: 2010, round: 1, pick: 4 },
    fame: 62,
  }),
  makePlayer({
    id: '2976316',
    name: 'Joey Bosa',
    teamId: '24',
    pos: 'DE',
    jersey: '97',
    exp: 9,
    college: 'Ohio State',
    draft: { year: 2016, round: 1, pick: 3 },
    fame: 70,
  }),
  makePlayer({
    id: '15818',
    name: 'Keenan Allen',
    teamId: '24',
    pos: 'WR',
    jersey: '13',
    exp: 12,
    college: 'California',
    draft: { year: 2013, round: 3, pick: 76 },
    fame: 66,
  }),
  makePlayer({
    id: '3068267',
    name: 'Austin Ekeler',
    teamId: '24',
    pos: 'RB',
    jersey: '30',
    exp: 8,
    college: 'Western Colorado',
    fame: 55,
  }),
  makePlayer({
    id: '4262921',
    name: 'Sebastián Núñez',
    teamId: '24',
    pos: 'CB',
    jersey: '39',
    exp: 1,
    college: 'Rutgers',
    fame: 12,
  }),
  makePlayer({
    id: '4262921-2',
    name: 'Justin Jefferson',
    teamId: '16',
    pos: 'WR',
    jersey: '18',
    exp: 5,
    college: 'LSU',
    draft: { year: 2020, round: 1, pick: 22 },
    fame: 94,
    aliases: ['jettas'],
  }),
  makePlayer({
    id: '3915416',
    name: 'Van Jefferson',
    teamId: '26',
    pos: 'WR',
    jersey: '12',
    exp: 5,
    college: 'Florida',
    draft: { year: 2020, round: 2, pick: 57 },
    fame: 31,
  }),
  makePlayer({
    id: '3918298',
    name: 'Josh Allen',
    teamId: '2',
    pos: 'QB',
    jersey: '17',
    exp: 7,
    college: 'Wyoming',
    draft: { year: 2018, round: 1, pick: 7 },
    fame: 95,
  }),
  makePlayer({
    id: '4241389',
    name: 'Jordan Love',
    teamId: '9',
    pos: 'QB',
    jersey: '10',
    exp: 5,
    college: 'Utah State',
    draft: { year: 2020, round: 1, pick: 26 },
    fame: 74,
  }),
  makePlayer({
    id: '4360797',
    name: 'Jayden Reed',
    teamId: '9',
    pos: 'WR',
    jersey: '11',
    exp: 2,
    college: 'Michigan State',
    draft: { year: 2023, round: 2, pick: 50 },
    fame: 48,
  }),
  makePlayer({
    id: '3929630',
    name: 'Saquon Barkley',
    teamId: '21',
    pos: 'RB',
    jersey: '26',
    exp: 7,
    college: 'Penn State',
    draft: { year: 2018, round: 1, pick: 2 },
    fame: 91,
    aliases: ['saquon'],
  }),
  makePlayer({
    id: '4040715',
    name: 'Jalen Hurts',
    teamId: '21',
    pos: 'QB',
    jersey: '1',
    exp: 5,
    college: 'Oklahoma',
    draft: { year: 2020, round: 2, pick: 53 },
    fame: 88,
  }),
  makePlayer({
    id: '4259545',
    name: "D'Andre Swift",
    teamId: '21',
    pos: 'RB',
    jersey: '0',
    exp: 5,
    college: 'Georgia',
    draft: { year: 2020, round: 2, pick: 35 },
    fame: 52,
  }),
  makePlayer({
    id: '4569618',
    name: 'Malik Nabers',
    teamId: '19',
    pos: 'WR',
    jersey: '1',
    exp: 1,
    college: 'LSU',
    draft: { year: 2024, round: 1, pick: 6 },
    fame: 68,
  }),
  makePlayer({
    id: '4569173',
    name: 'Garrett Wilson',
    teamId: '20',
    pos: 'WR',
    jersey: '17',
    exp: 3,
    college: 'Ohio State',
    draft: { year: 2022, round: 1, pick: 10 },
    fame: 70,
  }),
  makePlayer({
    id: '4429795',
    name: 'Kenneth Walker III',
    teamId: '26',
    pos: 'RB',
    jersey: '9',
    exp: 3,
    college: 'Michigan State',
    draft: { year: 2022, round: 2, pick: 41 },
    fame: 64,
  }),
  makePlayer({
    id: '4361307',
    name: 'Riq Woolen',
    teamId: '26',
    pos: 'CB',
    jersey: '27',
    exp: 3,
    college: 'UTSA',
    draft: { year: 2022, round: 5, pick: 153 },
    fame: 29,
  }),
];

// ---------------------------------------------------------------------------------------------
// Plays and stat lines
// ---------------------------------------------------------------------------------------------

export const FIXTURE_PLAYS: readonly HighlightPlay[] = [
  {
    id: 'p1',
    season: 2024,
    week: 7,
    gameId: 'g1',
    text: '(Shotgun) P.Mahomes pass short right to T.Kelce for 22 yards, TOUCHDOWN.',
    redacted: '(Shotgun) [?] pass short right to [?] for 22 yards, TOUCHDOWN.',
    playerId: '3139477',
    otherPlayerIds: ['15847'],
    teamId: '12',
    oppTeamId: '24',
    quarter: 3,
    clock: '8:28',
    kind: 'Passing Touchdown',
  },
  {
    id: 'p2',
    season: 2024,
    week: 3,
    gameId: 'g2',
    text: 'C.McCaffrey left end for 51 yards, TOUCHDOWN.',
    redacted: '[?] left end for 51 yards, TOUCHDOWN.',
    playerId: '3117251',
    otherPlayerIds: [],
    teamId: '25',
    oppTeamId: '14',
    quarter: 1,
    clock: '2:04',
    kind: 'Rushing Touchdown',
  },
  {
    id: 'p3',
    season: 2024,
    week: 12,
    gameId: 'g3',
    text: '(No Huddle) J.Jefferson 63 yard catch and run, TOUCHDOWN.',
    redacted: '(No Huddle) [?] 63 yard catch and run, TOUCHDOWN.',
    playerId: '4262921-2',
    otherPlayerIds: [],
    teamId: '16',
    oppTeamId: '9',
    quarter: 4,
    clock: '0:41',
    kind: 'Passing Touchdown',
  },
  {
    id: 'p4',
    season: 2024,
    week: 15,
    gameId: 'g4',
    text: 'S.Barkley right tackle for 72 yards, TOUCHDOWN.',
    redacted: '[?] right tackle for 72 yards, TOUCHDOWN.',
    playerId: '3929630',
    otherPlayerIds: [],
    teamId: '21',
    oppTeamId: '19',
    quarter: 2,
    clock: '11:15',
    kind: 'Rushing Touchdown',
  },
  {
    id: 'p5',
    season: 2024,
    week: 1,
    gameId: 'g5',
    text: 'J.Allen pass deep left to K.Shakir for 45 yards, TOUCHDOWN.',
    redacted: '[?] pass deep left to [?] for 45 yards, TOUCHDOWN.',
    playerId: '3918298',
    otherPlayerIds: [],
    teamId: '2',
    oppTeamId: '20',
    quarter: 2,
    clock: '5:32',
    kind: 'Passing Touchdown',
  },
];

export const FIXTURE_STAT_LINES: readonly StatLine[] = [
  {
    playerId: '3139477',
    season: 2024,
    stats: [
      ['Pass yds', '3,928'],
      ['TD', '26'],
      ['INT', '11'],
      ['Rating', '93.5'],
      ['Comp %', '67.5'],
    ],
  },
  {
    playerId: '3117251',
    season: 2023,
    stats: [
      ['Rush yds', '1,459'],
      ['TD', '21'],
      ['Rec', '67'],
      ['Yds/att', '5.4'],
    ],
  },
  {
    playerId: '4262921-2',
    season: 2024,
    stats: [
      ['Rec', '103'],
      ['Rec yds', '1,533'],
      ['TD', '10'],
      ['Yds/rec', '14.9'],
    ],
  },
  {
    playerId: '3918298',
    season: 2024,
    stats: [
      ['Pass yds', '3,731'],
      ['TD', '28'],
      ['Rush TD', '12'],
      ['INT', '6'],
    ],
  },
  {
    playerId: '3929630',
    season: 2024,
    stats: [
      ['Rush yds', '2,005'],
      ['TD', '13'],
      ['Yds/att', '5.8'],
    ],
  },
];

export const FIXTURE_DATASET: NflDataset = {
  syncedAt: '2026-09-01',
  season: 2025,
  teams: [...FIXTURE_TEAMS],
  players: [...FIXTURE_PLAYERS],
};

export interface FixtureBundle extends NflDataset {
  plays: HighlightPlay[];
  statLines: StatLine[];
}

/** Everything a pool builder needs, as a fresh mutable copy. */
export function fixtureBundle(): FixtureBundle {
  return {
    syncedAt: FIXTURE_DATASET.syncedAt,
    season: FIXTURE_DATASET.season,
    teams: FIXTURE_TEAMS.map((t) => ({ ...t })),
    players: FIXTURE_PLAYERS.map((p) => ({ ...p })),
    plays: FIXTURE_PLAYS.map((p) => ({ ...p })),
    statLines: FIXTURE_STAT_LINES.map((s) => ({ ...s })),
  };
}

export function findFixtureTeam(abbr: string): NflTeam {
  const t = FIXTURE_TEAMS.find((x) => x.abbr === abbr);
  if (!t) throw new Error(`fixtures: no team ${abbr}`);
  return t;
}

export function findFixturePlayer(name: string): NflPlayer {
  const p = FIXTURE_PLAYERS.find((x) => x.name === name);
  if (!p) throw new Error(`fixtures: no player ${name}`);
  return p;
}

const FIRSTS = [
  'Jalen', 'Trey', 'Deion', 'Marcus', 'Elijah', 'Kenny', 'Tyler', 'Darius', 'Cooper', 'Isaiah',
  'Zach', 'Amari', 'Noah', 'Rashad', 'Tre', 'Quinn', 'Braxton', 'Cam', 'Dorian', 'Kyren',
];
const LASTS = [
  'Whitfield', 'Okafor', 'Sanderson', 'Pettigrew', 'Kalani', 'Bramlett', 'Duvernay', 'Yiadom',
  'Sorsdal', 'Nailor', 'Claypool', 'Vildor', 'Strnad', 'Tonges', 'Brugman', 'Castellanos',
  'Fehoko', 'Ojabo', 'Wypler', 'Kmet',
];
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'DE', 'LB', 'CB', 'S', 'PK'];

/**
 * `n` synthetic players with distinct names, spread across the fixture teams.
 * Used for the suggestion-search performance test (2000 subjects).
 */
export function makeManyPlayers(n: number): NflPlayer[] {
  const out: NflPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const first = FIRSTS[i % FIRSTS.length];
    const last = `${LASTS[Math.floor(i / FIRSTS.length) % LASTS.length]}${i > 399 ? String(Math.floor(i / 400)) : ''}`;
    const team = FIXTURE_TEAMS[i % FIXTURE_TEAMS.length];
    out.push(
      makePlayer({
        id: `syn-${i}`,
        name: `${first} ${last}`,
        first,
        last,
        teamId: team.id,
        pos: POSITIONS[i % POSITIONS.length],
        jersey: String((i % 99) + 1),
        exp: i % 16,
        college: 'State',
        draft: { year: 2015 + (i % 10), round: (i % 7) + 1, pick: (i % 250) + 1 },
        fame: i % 101,
      }),
    );
  }
  return out;
}
