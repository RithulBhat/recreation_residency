/**
 * DEV-ONLY sample ledger for the Report Card (`#/scout/stats?demo=1`), so the populated page can be
 * reviewed and screenshotted without grinding out thirteen runs by hand.
 *
 * Loaded through a dynamic import behind `import.meta.env.DEV` and deliberately NOT re-exported from
 * the barrel, so it can never be pulled in by a production bundle.
 *
 * Every run is built by the REAL test factory (`@/scout/statsTestFactory`) and folded in through the
 * REAL `recordScoutGame`, so what this page renders is exactly what it renders after a real session:
 * the same scorer, the same XP maths, the same achievement predicates.
 *
 * The fixture is shaped to exercise every state the card can be in:
 *   - QB elite, DB blind (the verdict's two headline lines),
 *   - deep cuts named more often than not (the "not a fan's eye any more" line),
 *   - 23 of 32 franchises named and five divisions swept (a league map worth looking at),
 *   - a rung-0 run in all seven puzzle types (a best call, and the epic badges),
 *   - thin samples left thin (`teamTrivia`, `logoZoom`) so the "not enough tape" bar treatment shows,
 *   - four subjects seen repeatedly and never named (the nemesis list).
 * Runs finish at 2pm local so the `midnight-film` badge stays locked.
 */

import { BLITZ_RUNG } from '@/scout/formats';
import { scoutLocalDateKey } from '@/scout/achievements';
import { makeScoutRun, type ScoutRoundSpec, type ScoutRunOpts } from '@/scout/statsTestFactory';
import { useScoutStatsStore } from '@/store/scoutStatsStore';
import type { PositionGroup, ScoutMode, ScoutSettings, ScoutState } from '@/scout/types';

const DAY = 86_400_000;

/** Today at 2pm local — runs hang off this so relative times read fresh and the hour stays fixed. */
function anchor(): number {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  return d.getTime();
}

interface SeedRun extends Omit<ScoutRunOpts, 'startedAt' | 'settings'> {
  id: string;
  daysAgo: number;
  settings: Partial<ScoutSettings>;
  rounds: ScoutRoundSpec[];
  /** Record it as the daily for its own date. */
  asDaily?: boolean;
}

/* ------------------------------------------------------------------------------ round shapes */

const won = (spec: ScoutRoundSpec): ScoutRoundSpec => ({ shape: 'won', rung: 1, ...spec });
const lost = (spec: ScoutRoundSpec): ScoutRoundSpec => ({ shape: 'lost', ...spec });
const close = (spec: ScoutRoundSpec): ScoutRoundSpec => ({ shape: 'close', ...spec });

/** A synthetic subject: the name never renders, but the group / franchise / fame axes all do. */
const syn = (group: PositionGroup, teamId: string, fame: number): ScoutRoundSpec => ({ group, teamId, fame });

/* --------------------------------------------------------------------------------- the table */

/**
 * The franchises this history touches. A real ledger clusters: you play the packs you like, so some
 * rosters are known cold, a few have been faced and never cracked, and seven have never come up at
 * all — which is what makes the league map worth looking at.
 *
 * `HOT` gets every winning round (cycled, so all 22 pick up calls), `GREY` only ever loses, and the
 * seven franchises in neither list stay dark.
 */
const HOT_TEAMS: readonly string[] = [
  '2', '15', '17', '20', // AFC East — swept
  '33', '4', '23', //       AFC North (CLE stays grey)
  '11', //                  AFC South
  '7', '12', '13', '24', // AFC West — swept
  '6', '19', '21', //       NFC East (WSH never faced)
  '3', '8', '9', '16', //   NFC North — swept
  '27', //                  NFC South
  '25', '26', //            NFC West (LAR grey, ARI never faced)
];
/** Faced more than once, never once named. */
const GREY_TEAMS: readonly string[] = ['5', '14', '34'];

function cycler(pool: readonly string[]): () => string {
  let i = 0;
  return () => pool[i++ % pool.length];
}

const BLITZ_GROUPS: readonly PositionGroup[] = ['WR', 'RB', 'QB', 'TE', 'DL', 'LB'];
const TOUR_GROUPS: readonly PositionGroup[] = ['WR', 'RB', 'TE', 'DL', 'LB', 'OL', 'ST', 'WR'];
const TOUR_MODES: readonly ScoutMode[] = ['silhouette', 'faceZoom', 'highlight'];

function blitzRounds(hot: () => string, grey: () => string): ScoutRoundSpec[] {
  return [
    ...Array.from({ length: 15 }, (_unused, i) =>
      won({
        rung: BLITZ_RUNG,
        elapsedMs: 3_000,
        ...syn(BLITZ_GROUPS[i % BLITZ_GROUPS.length], hot(), 62 + (i % 5) * 6),
      }),
    ),
    lost({ elapsedMs: 4_000, ...syn('WR', grey(), 34) }),
    lost({ elapsedMs: 4_000, ...syn('WR', hot(), 34) }),
    lost({ elapsedMs: 4_000, ...syn('TE', hot(), 41) }),
  ];
}

function survivalRounds(hot: () => string, grey: () => string): ScoutRoundSpec[] {
  const easy: readonly PositionGroup[] = ['WR', 'QB', 'RB', 'TE', 'DL', 'LB'];
  const hard: readonly PositionGroup[] = ['WR', 'RB', 'LB', 'DL', 'TE', 'OL'];
  return [
    // Survival walks the league down from household names to nobodies, a rung at a time.
    ...easy.map((group) => won({ rung: 1, ...syn(group, hot(), 86) })),
    ...hard.map((group) => won({ rung: 2, ...syn(group, hot(), 22) })),
    lost(syn('OL', grey(), 24)),
    lost(syn('DL', hot(), 19)),
    lost(syn('LB', hot(), 26)),
  ];
}

/**
 * A gauntlet abandoned 25 franchises in: 18 clubs cleared, four missed, the three grey rosters
 * missed again, and seven franchises never reached — the board keeps its own shuffled order.
 */
function tourRounds(hot: () => string, grey: () => string): { rounds: ScoutRoundSpec[]; cleared: string[] } {
  const rounds: ScoutRoundSpec[] = [];
  const cleared: string[] = [];
  HOT_TEAMS.forEach((teamId, i) => {
    const spec: ScoutRoundSpec = {
      rung: 1,
      mode: TOUR_MODES[i % TOUR_MODES.length],
      ...syn(TOUR_GROUPS[i % TOUR_GROUPS.length], teamId, 40 + (i % 6) * 9),
    };
    // Four clubs get away even though the roster is otherwise known — 18 of 22 cleared.
    const missed = i % 6 === 5;
    rounds.push(missed ? lost(spec) : won(spec));
    if (!missed) cleared.push(teamId);
  });
  GREY_TEAMS.forEach((teamId, i) => {
    rounds.push(lost({ mode: TOUR_MODES[i % TOUR_MODES.length], ...syn('DB', teamId, 31) }));
  });
  // `hot` / `grey` are threaded through for signature symmetry with the other builders.
  void hot;
  void grey;
  return { rounds, cleared };
}

function seedRuns(): SeedRun[] {
  const hot = cycler(HOT_TEAMS);
  const grey = cycler(GREY_TEAMS);
  const tour = tourRounds(hot, grey);
  return [
    {
      id: 'scout-demo-standard-1',
      daysAgo: 13,
      settings: { format: 'standard', mode: 'silhouette', tries: 5, rounds: 10, packIds: ['superstars'] },
      rounds: [
        won({ rung: 2, ...syn('QB', hot(), 90) }),
        won({ rung: 1, ...syn('WR', hot(), 88) }),
        lost({ player: 'Riq Woolen' }),
        lost(syn('DB', grey(), 40)),
        won({ rung: 2, ...syn('RB', hot(), 70) }),
        lost({ player: 'Harrison Butker' }),
        lost(syn('OL', hot(), 45)),
        close(syn('TE', hot(), 60)),
        won({ rung: 3, ...syn('WR', hot(), 65) }),
        lost(syn('DL', hot(), 50)),
      ],
    },
    {
      id: 'scout-demo-standard-2',
      daysAgo: 11,
      settings: { format: 'standard', mode: 'silhouette', tries: 5, rounds: 10, packIds: ['superstars'] },
      rounds: [
        won({ rung: 1, ...syn('QB', hot(), 95) }),
        won({ rung: 2, ...syn('QB', hot(), 88) }),
        won({ rung: 1, ...syn('WR', hot(), 94) }),
        won({ rung: 2, ...syn('RB', hot(), 91) }),
        won({ rung: 2, ...syn('TE', hot(), 92) }),
        lost({ player: 'Sebastián Núñez' }),
        lost(syn('DB', grey(), 35)),
        won({ rung: 2, ...syn('DL', hot(), 81) }),
        lost({ player: 'Van Jefferson' }),
        close(syn('LB', hot(), 55)),
      ],
    },
    {
      id: 'scout-demo-face-1',
      daysAgo: 9,
      settings: { format: 'standard', mode: 'faceZoom', tries: 4, rounds: 10, packIds: ['pos-wr', 'pos-qb'] },
      rounds: [
        won({ rung: 1, ...syn('QB', hot(), 74) }),
        won({ rung: 1, ...syn('WR', hot(), 70) }),
        won({ rung: 2, ...syn('RB', hot(), 64) }),
        won({ rung: 2, ...syn('LB', hot(), 58) }),
        won({ rung: 1, ...syn('DL', hot(), 66) }),
        won({ rung: 3, ...syn('OL', hot(), 62) }),
        lost(syn('DB', grey(), 30)),
        lost({ player: 'Riq Woolen' }),
        lost(syn('ST', hot(), 25)),
        close(syn('WR', hot(), 42)),
      ],
    },
    {
      id: 'scout-demo-blitz-1',
      daysAgo: 8,
      settings: { format: 'blitz', mode: 'silhouette', blitzDuration: 90, packIds: ['superstars'] },
      rounds: blitzRounds(hot, grey),
      endReason: 'time',
    },
    {
      id: 'scout-demo-survival-1',
      daysAgo: 7,
      settings: { format: 'survival', mode: 'silhouette', tries: 4, lives: 3 },
      rounds: survivalRounds(hot, grey),
      endReason: 'lives',
    },
    {
      id: 'scout-demo-sharp-eye',
      daysAgo: 6,
      settings: { format: 'standard', mode: 'silhouette', mixModes: true, tries: 5, rounds: 7 },
      rounds: [
        won({ mode: 'silhouette', rung: 0, player: 'Nick Bosa', elapsedMs: 4_200 }),
        won({ mode: 'faceZoom', rung: 0, player: 'Patrick Mahomes', elapsedMs: 2_600 }),
        won({ mode: 'highlight', rung: 0, player: 'Justin Jefferson', elapsedMs: 5_400 }),
        won({ mode: 'statLine', rung: 0, player: 'Saquon Barkley', elapsedMs: 6_100 }),
        won({ mode: 'careerPath', rung: 0, player: 'Travis Kelce', elapsedMs: 5_000 }),
        won({ mode: 'teamTrivia', rung: 0, team: 'SF', elapsedMs: 3_400 }),
        won({ mode: 'logoZoom', rung: 0, team: 'GB', elapsedMs: 2_200 }),
      ],
    },
    {
      id: 'scout-demo-gauntlet-1',
      daysAgo: 5,
      settings: { format: 'gauntlet', mode: 'silhouette', mixModes: true, tries: 4 },
      rounds: tour.rounds,
      endReason: 'quit',
      gauntletTeamIds: [...HOT_TEAMS, ...GREY_TEAMS, '28', '22', '30', '10', '1', '29', '18'],
      clearedTeamIds: tour.cleared,
    },
    {
      id: 'scout-demo-daily-1',
      daysAgo: 4,
      asDaily: true,
      settings: { format: 'standard', mode: 'silhouette', tries: 5, rounds: 10 },
      rounds: [
        won({ rung: 1, ...syn('QB', hot(), 84) }),
        won({ rung: 2, ...syn('WR', hot(), 72) }),
        won({ rung: 1, ...syn('WR', hot(), 69) }),
        won({ rung: 2, ...syn('RB', hot(), 61) }),
        won({ rung: 3, ...syn('TE', hot(), 58) }),
        won({ rung: 2, ...syn('LB', hot(), 54) }),
        won({ rung: 1, ...syn('DL', hot(), 66) }),
        lost(syn('DB', grey(), 44)),
        lost({ player: 'Riq Woolen' }),
        close(syn('OL', hot(), 39)),
      ],
    },
    {
      id: 'scout-demo-daily-2',
      daysAgo: 3,
      asDaily: true,
      settings: { format: 'standard', mode: 'silhouette', mixModes: true, tries: 5, rounds: 10 },
      rounds: [
        won({ rung: 1, mode: 'highlight', ...syn('QB', hot(), 87) }),
        won({ rung: 1, mode: 'silhouette', ...syn('WR', hot(), 76) }),
        won({ rung: 2, mode: 'faceZoom', ...syn('RB', hot(), 68) }),
        won({ rung: 1, mode: 'statLine', ...syn('TE', hot(), 57) }),
        won({ rung: 2, mode: 'silhouette', ...syn('DL', hot(), 63) }),
        won({ rung: 2, mode: 'careerPath', ...syn('LB', hot(), 49) }),
        won({ rung: 3, mode: 'silhouette', ...syn('OL', hot(), 41) }),
        won({ rung: 1, mode: 'faceZoom', ...syn('WR', hot(), 73) }),
        lost({ mode: 'silhouette', player: 'Sebastián Núñez' }),
        lost({ mode: 'silhouette', ...syn('DB', grey(), 33) }),
      ],
    },
    {
      id: 'scout-demo-duel-1',
      daysAgo: 2,
      settings: { format: 'duel', mode: 'silhouette', tries: 4, rounds: 8, players: [] },
      rounds: Array.from({ length: 8 }, (_unused, i) =>
        won({
          rung: 1,
          winnerPlayerId: i % 3 === 2 ? 'p2' : 'p1',
          ...syn((['QB', 'WR', 'RB', 'TE', 'DL', 'LB', 'WR', 'OL'] as const)[i], hot(), 70),
        }),
      ),
      players: [
        { id: 'p1', name: 'You', score: 4680, correct: 6, bestStreak: 4 },
        { id: 'p2', name: 'Maanu', score: 2240, correct: 2, bestStreak: 2 },
      ],
    },
    {
      id: 'scout-demo-party-1',
      daysAgo: 2,
      settings: { format: 'party', mode: 'logoZoom', tries: 4, rounds: 6, players: [] },
      rounds: [
        won({ rung: 1, team: 'SF' }),
        won({ rung: 2, team: 'GB' }),
        won({ rung: 1, team: 'BUF' }),
        lost({ team: 'NYJ' }),
        won({ rung: 2, team: 'PHI' }),
        won({ rung: 1, team: 'SEA' }),
      ],
      players: [
        { id: 'p1', name: 'You', score: 3120, correct: 3, bestStreak: 3 },
        { id: 'p2', name: 'Maanu', score: 2400, correct: 2, bestStreak: 2 },
        { id: 'p3', name: 'Dad', score: 900, correct: 1, bestStreak: 1 },
      ],
    },
    {
      id: 'scout-demo-film-1',
      daysAgo: 1,
      settings: { format: 'standard', mode: 'highlight', tries: 5, rounds: 10, packIds: ['film-room'] },
      rounds: [
        won({ rung: 1, ...syn('QB', hot(), 99) }),
        won({ rung: 2, ...syn('WR', hot(), 79) }),
        won({ rung: 1, ...syn('RB', hot(), 83) }),
        won({ rung: 2, ...syn('TE', hot(), 71) }),
        won({ rung: 1, ...syn('DL', hot(), 74) }),
        won({ rung: 2, ...syn('LB', hot(), 52) }),
        won({ rung: 2, ...syn('WR', hot(), 67) }),
        lost(syn('QB', hot(), 46)),
        lost({ player: 'Riq Woolen' }),
        lost(syn('DB', grey(), 28)),
      ],
    },
    {
      id: 'scout-demo-career-1',
      daysAgo: 0,
      settings: { format: 'standard', mode: 'careerPath', tries: 5, rounds: 10, packIds: ['deep-cuts'] },
      rounds: [
        won({ rung: 1, ...syn('QB', hot(), 92) }),
        won({ rung: 1, ...syn('QB', hot(), 77) }),
        won({ rung: 2, ...syn('WR', hot(), 24) }),
        won({ rung: 2, ...syn('RB', hot(), 21) }),
        won({ rung: 1, ...syn('TE', hot(), 26) }),
        won({ rung: 2, ...syn('DL', hot(), 18) }),
        won({ rung: 2, ...syn('LB', hot(), 23) }),
        won({ rung: 3, ...syn('OL', hot(), 27) }),
        won({ rung: 2, ...syn('DB', hot(), 29) }),
        close(syn('ST', hot(), 22)),
      ],
    },
  ];
}

/* ----------------------------------------------------------------------------------- seeding */

function build(run: SeedRun, base: number): ScoutState {
  const { id, daysAgo, settings, rounds, asDaily: _asDaily, ...rest } = run;
  return makeScoutRun({ id, settings, rounds, startedAt: base - daysAgo * DAY, ...rest });
}

/**
 * Wipe the Scout ledger and fold in the sample history. Returns the number of runs recorded, so the
 * caller can assert the fixture is actually rich enough to review.
 */
export function seedScoutReportDemo(): number {
  const store = useScoutStatsStore.getState();
  store.reset();
  const base = anchor();
  let recorded = 0;
  for (const run of seedRuns()) {
    const state = build(run, base);
    const result = run.asDaily
      ? useScoutStatsStore
          .getState()
          .recordScoutDaily(state, scoutLocalDateKey(state.finishedAt ?? base - run.daysAgo * DAY))
      : useScoutStatsStore.getState().recordScoutGame(state);
    if (result && !result.duplicate) recorded += 1;
  }
  return recorded;
}
