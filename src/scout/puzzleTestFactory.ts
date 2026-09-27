/**
 * Test dataset for the choice-shaped puzzle types.
 *
 * `@/scout/fixtures` is deliberately small (12 clubs, 26 players) — enough for a silhouette or a
 * redacted play, nowhere near enough for a mode that needs four teammates, five men off one roster,
 * four men out of one draft and two men who carry the same stat. This factory builds a dataset that
 * exercises every generator AND every guard rail, in the same spirit as `statsTestFactory.ts`:
 *
 * - four clubs × ten players, fame laddered 90 → 20, so `fame >= 45` leaves eight per roster
 *   (teammates and depth charts are always fillable) while `fame >= 70` leaves only three — which is
 *   what makes the fame-window FALLBACK testable.
 * - colleges assigned so several have three or more alumni (odd-one-out needs that).
 * - draft years 2009 / 2012 / 2016 / 2019 / 2022 / 2024, all four-deep. 2009 is there on purpose:
 *   it is the class that must be refused for being older than 2011.
 * - one player with no jersey number, and one number worn twice on the same roster — the two things
 *   `jerseyPuzzle` is required to refuse.
 * - stat lines for four position groups, all in one season, so a cross-position comparison would be
 *   available if the generator were wrong to allow it.
 */

import { makePlayer, makeTeam } from './fixtures';
import type { NflDataset, NflPlayer, NflTeam, StatLine } from './types';

/** A full `ScoutPoolSource`, so `buildPool` can be driven straight off it. */
export interface PuzzleTestDataset extends NflDataset {
  statLines: StatLine[];
}

export const TEST_SEASON = 2025;

/** The club a test player belongs to, by ESPN id. */
export const TEST_TEAMS: readonly NflTeam[] = [
  makeTeam({ id: '12', abbr: 'KC', location: 'Kansas City', name: 'Chiefs', conference: 'AFC', division: 'West' }),
  makeTeam({
    id: '2',
    abbr: 'BUF',
    location: 'Buffalo',
    name: 'Bills',
    conference: 'AFC',
    division: 'East',
    color: '#00338d',
    altColor: '#c60c30',
    venue: 'Highmark Stadium',
    superBowls: [],
    legends: ['Jim Kelly', 'Bruce Smith'],
    founded: 1960,
  }),
  makeTeam({
    id: '25',
    abbr: 'SF',
    location: 'San Francisco',
    name: '49ers',
    conference: 'NFC',
    division: 'West',
    color: '#aa0000',
    altColor: '#b3995d',
    venue: "Levi's Stadium",
    superBowls: [1981, 1984, 1988, 1989, 1994],
    legends: ['Joe Montana', 'Jerry Rice'],
    founded: 1946,
  }),
  makeTeam({
    id: '21',
    abbr: 'PHI',
    location: 'Philadelphia',
    name: 'Eagles',
    conference: 'NFC',
    division: 'East',
    color: '#004c54',
    altColor: '#a5acaf',
    venue: 'Lincoln Financial Field',
    superBowls: [2017, 2024],
    legends: ['Reggie White', 'Brian Dawkins'],
    founded: 1933,
  }),
];

/** Ten fame levels per roster: eight clear 45, six clear 55, three clear 70. */
const FAME_LADDER = [92, 84, 74, 66, 61, 57, 51, 47, 34, 22];

const POSITIONS = ['QB', 'RB', 'WR', 'WR', 'TE', 'OT', 'DE', 'LB', 'CB', 'PK'];
const COLLEGES = ['Alabama', 'Georgia', 'Ohio State', 'LSU', 'Texas', 'Alabama', 'Georgia', 'Ohio State', 'LSU', 'Texas'];
const DRAFT_YEARS = [2019, 2022, 2016, 2009, 2012, 2024, 2019, 2022, 2016, 2012];

const FIRSTS = ['Dax', 'Corbin', 'Malachi', 'Ronan', 'Teddy', 'Ellis', 'Jonah', 'Sable', 'Quincy', 'Vance'];
const LASTS: Readonly<Record<string, readonly string[]>> = {
  '12': ['Harlowe', 'Brightwell', 'Castellan', 'Dunmore', 'Eldridge', 'Fenwick', 'Garrow', 'Halloway', 'Ingersol', 'Jessup'],
  '2': ['Kearsley', 'Lockhart', 'Mainwaring', 'Northcott', 'Oakleigh', 'Pemberly', 'Quarles', 'Rosewood', 'Stanbury', 'Thackery'],
  '25': ['Underhill', 'Vandermeer', 'Wexley', 'Yardley', 'Ashcombe', 'Bellweather', 'Cravenhill', 'Dorsey', 'Everhart', 'Fairweather'],
  '21': ['Glasswell', 'Hartigan', 'Ivory', 'Jardine', 'Kilbride', 'Larkspur', 'Marchetti', 'Nashwood', 'Orrington', 'Pyke'],
};

/** Two men on the Chiefs both wear 55 — the ambiguity `jerseyPuzzle` must refuse. */
export const DUPLICATE_JERSEY = { teamId: '12', jersey: '55' } as const;
/** The Bills' kicker carries no number at all. */
export const NO_JERSEY_PLAYER_ID = 'p-2-9';

export function makePuzzleDataset(): PuzzleTestDataset {
  const players: NflPlayer[] = [];
  for (const team of TEST_TEAMS) {
    const lasts = LASTS[team.id];
    for (let i = 0; i < 10; i++) {
      const id = `p-${team.id}-${i}`;
      const first = FIRSTS[i];
      const last = lasts[i];
      const jersey =
        id === NO_JERSEY_PLAYER_ID
          ? undefined
          : team.id === DUPLICATE_JERSEY.teamId && (i === 6 || i === 7)
            ? DUPLICATE_JERSEY.jersey
            : String(i + 1 + Number(team.id));
      const year = DRAFT_YEARS[i];
      const player = makePlayer({
        id,
        name: `${first} ${last}`,
        first,
        last,
        teamId: team.id,
        pos: POSITIONS[i],
        fame: FAME_LADDER[i],
        exp: (i % 9) + 1,
        heightIn: 70 + (i % 9),
        weightLb: 190 + i * 7,
        college: COLLEGES[(i + Number(team.id)) % COLLEGES.length],
        draft: { year, round: (i % 7) + 1, pick: i * 11 + 3 },
        ...(jersey === undefined ? {} : { jersey }),
      });
      players.push(player);
    }
  }

  // Stat lines: one season, four position groups, several men per label so a board can be built.
  const statLines: StatLine[] = [];
  const line = (playerId: string, stats: Array<[string, string]>): StatLine => ({ playerId, season: TEST_SEASON, stats });
  const scale = (base: number, i: number) => String(base - i * 137);
  for (let t = 0; t < TEST_TEAMS.length; t++) {
    const id = TEST_TEAMS[t].id;
    statLines.push(line(`p-${id}-0`, [['Pass yds', scale(4600, t)], ['Pass TD', String(34 - t * 3)], ['INT', String(7 + t)]]));
    statLines.push(line(`p-${id}-1`, [['Rush yds', scale(1500, t)], ['Carries', String(280 - t * 9)], ['Rush TD', String(14 - t)]]));
    statLines.push(line(`p-${id}-2`, [['Rec yds', scale(1450, t)], ['Rec', String(102 - t * 6)], ['Rec TD', String(11 - t)]]));
    statLines.push(line(`p-${id}-3`, [['Rec yds', scale(1100, t)], ['Rec', String(80 - t * 5)], ['Rec TD', String(8 - t)]]));
    statLines.push(line(`p-${id}-7`, [['Tackles', String(140 - t * 8)], ['Sacks', String(9 - t)], ['TFL', String(15 - t)]]));
  }
  return {
    syncedAt: '2026-09-26',
    season: TEST_SEASON,
    teams: TEST_TEAMS.map((t) => ({ ...t })),
    players,
    statLines,
  };
}

/** The one player id `findTestPlayer` callers reach for most: the Chiefs' quarterback. */
export const TEST_STAR_ID = 'p-12-0';

export function findTestPlayer(dataset: PuzzleTestDataset, id: string): NflPlayer {
  const p = dataset.players.find((x) => x.id === id);
  if (!p) throw new Error(`puzzleTestFactory: no player ${id}`);
  return p;
}

export function findTestTeam(dataset: PuzzleTestDataset, abbr: string): NflTeam {
  const t = dataset.teams.find((x) => x.abbr === abbr);
  if (!t) throw new Error(`puzzleTestFactory: no team ${abbr}`);
  return t;
}
