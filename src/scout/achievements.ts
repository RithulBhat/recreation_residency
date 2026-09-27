/**
 * Highlight Scout achievements — 47 badges in football's language.
 *
 * Modelled on `src/stats/achievements.ts`: every entry is a PURE predicate over one finished run
 * plus the lifetime totals *after* that run has been folded in, so "first ever" checks can lean on
 * `totals` and nothing needs a clock or storage.
 *
 * The roster deliberately rewards the things Scout actually measures rather than raw volume:
 * naming a man from the pure black shadow, reading a redacted play with no other clue, clearing a
 * division, surviving twenty, finishing the gauntlet. A badge that any long session would unlock is
 * a badge worth nothing.
 */

import { SCOUT_FORMAT_IDS } from './formats';
import { SCOUT_MAX_LEVEL, scoutRankFor } from './progress';
import {
  SCOUT_MODE_KEYS,
  SCOUT_POSITION_GROUPS,
  scoutDivisionsSwept,
  scoutTeamsKnown,
  type ScoutRoundStat,
  type ScoutRunRecord,
  type ScoutStatsTotals,
  type ScoutSubjectRecord,
} from './scoutStats';
import type { ScoutFameTier } from './scoutStats';
import type { PositionGroup, ScoutMode, ScoutState } from './types';

export type ScoutRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const SCOUT_RARITIES: readonly ScoutRarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface ScoutAchievementContext {
  /** The finished run. */
  state: ScoutState;
  /** Its condensed record. */
  record: ScoutRunRecord;
  /** Lifetime totals, already including this run. */
  totals: ScoutStatsTotals;
  /** Per-subject history, already including this run. */
  subjects: ReadonlyMap<string, ScoutSubjectRecord>;
  /** Distinct dailies completed, including this one. */
  dailies?: number;
  /** Stored records, newest first, including this run. */
  records?: readonly ScoutRunRecord[];
}

export interface ScoutAchievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: ScoutRarity;
  /** Not shown in the list until unlocked. */
  hidden?: boolean;
  check: (ctx: ScoutAchievementContext) => boolean;
}

/* ------------------------------------------------------------------------------------ helpers */

/** Local `YYYY-MM-DD` for an epoch ms. Used by the store for daily keys. */
export function scoutLocalDateKey(at: number): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local-time hour a run finished at. */
function hourOf(record: ScoutRunRecord): number {
  return new Date(record.finishedAt).getHours();
}

function wonStats(record: ScoutRunRecord): ScoutRoundStat[] {
  return record.roundStats.filter((s) => s.won);
}

/** Solved rounds of one puzzle type, optionally only those solved at or below `maxRung`. */
function winsInMode(record: ScoutRunRecord, mode: ScoutMode, maxRung = Number.POSITIVE_INFINITY): number {
  return wonStats(record).filter((s) => s.mode === mode && s.rung !== null && s.rung <= maxRung).length;
}

function winsInGroup(record: ScoutRunRecord, group: PositionGroup): number {
  return wonStats(record).filter((s) => s.group === group).length;
}

function winsInTier(record: ScoutRunRecord, tier: ScoutFameTier, maxRung = Number.POSITIVE_INFINITY): number {
  return wonStats(record).filter((s) => s.tier === tier && s.rung !== null && s.rung <= maxRung).length;
}

function roundsOfMode(record: ScoutRunRecord, mode: ScoutMode): ScoutRoundStat[] {
  return record.roundStats.filter((s) => s.mode === mode);
}

function correctInGroup(totals: ScoutStatsTotals, group: PositionGroup): number {
  return totals.byGroup[group]?.correct ?? 0;
}

function correctInConference(totals: ScoutStatsTotals, conf: 'AFC' | 'NFC'): number {
  return totals.byConference[conf]?.correct ?? 0;
}

/* --------------------------------------------------------------------------------- the roster */

export const SCOUT_ACHIEVEMENTS: readonly ScoutAchievement[] = [
  // ---- firsts and volume ----------------------------------------------------------------
  {
    id: 'first-call',
    name: 'First Call',
    emoji: '🎯',
    description: 'Name your first subject.',
    rarity: 'common',
    check: ({ record, totals }) => record.correct >= 1 && totals.correct >= 1,
  },
  {
    id: 'on-the-clock',
    name: 'On the Clock',
    emoji: '⏱️',
    description: 'Finish your first run.',
    rarity: 'common',
    check: ({ record, totals }) => totals.runs >= 1 && record.rounds >= 1,
  },
  {
    id: 'film-hours',
    name: 'Film Hours',
    emoji: '🎞️',
    description: 'Grade 100 rounds of tape.',
    rarity: 'common',
    check: ({ totals }) => totals.rounds >= 100,
  },
  {
    id: 'tape-grinder',
    name: 'Tape Grinder',
    emoji: '📼',
    description: 'Grade 500 rounds of tape.',
    rarity: 'rare',
    check: ({ totals }) => totals.rounds >= 500,
  },
  {
    id: 'thousand-yard-eye',
    name: 'Thousand-Yard Eye',
    emoji: '👁️',
    description: 'A thousand correct calls.',
    rarity: 'legendary',
    check: ({ totals }) => totals.correct >= 1000,
  },

  // ---- puzzle types, at the hardest rung ------------------------------------------------
  {
    id: 'pure-shadow',
    name: 'Pure Shadow',
    emoji: '🕶️',
    description: 'Name a player from the pure black silhouette, before any clue.',
    rarity: 'epic',
    check: ({ record }) => winsInMode(record, 'silhouette', 0) >= 1,
  },
  {
    id: 'lights-out',
    name: 'Lights Out',
    emoji: '🌒',
    description: 'Three silhouettes named from the shadow alone in one run.',
    rarity: 'legendary',
    check: ({ record }) => winsInMode(record, 'silhouette', 0) >= 3,
  },
  {
    id: 'one-eyebrow',
    name: 'One Eyebrow',
    emoji: '🔍',
    description: 'Name a player from the tightest face crop.',
    rarity: 'epic',
    check: ({ record }) => winsInMode(record, 'faceZoom', 0) >= 1,
  },
  {
    id: 'film-room-read',
    name: 'Film Room Read',
    emoji: '🎬',
    description: 'Name a player from the redacted play alone.',
    rarity: 'epic',
    check: ({ record }) => winsInMode(record, 'highlight', 0) >= 1,
  },
  {
    id: 'stat-sheet-savant',
    name: 'Stat Sheet Savant',
    emoji: '📊',
    description: 'Name a player off the opening stat pair.',
    rarity: 'epic',
    check: ({ record }) => winsInMode(record, 'statLine', 0) >= 1,
  },
  {
    id: 'paper-trail',
    name: 'Paper Trail',
    emoji: '🗂️',
    description: 'Name a player from the draft slot alone.',
    rarity: 'epic',
    check: ({ record }) => winsInMode(record, 'careerPath', 0) >= 1,
  },
  {
    id: 'three-pixels',
    name: 'Three Pixels',
    emoji: '🔭',
    description: 'Name a franchise from the tightest logo crop.',
    rarity: 'rare',
    check: ({ record }) => winsInMode(record, 'logoZoom', 0) >= 1,
  },
  {
    id: 'franchise-iq',
    name: 'Franchise IQ',
    emoji: '🏟️',
    description: 'A perfect Franchise IQ run — five or more franchises, none missed.',
    rarity: 'epic',
    check: ({ record }) => {
      const rounds = roundsOfMode(record, 'teamTrivia');
      return rounds.length >= 5 && rounds.every((s) => s.won);
    },
  },
  {
    id: 'every-angle',
    name: 'Every Angle',
    emoji: '♟️',
    // Derived, so adding a puzzle type can never leave this sentence lying.
    description: `Solve at least one round of all ${SCOUT_MODE_KEYS.length} puzzle types.`,
    rarity: 'legendary',
    check: ({ totals }) => SCOUT_MODE_KEYS.every((mode) => (totals.byMode[mode]?.correct ?? 0) >= 1),
  },

  // ---- who you can name ------------------------------------------------------------------
  {
    id: 'deep-cut',
    name: 'Deep Cut',
    emoji: '🕳️',
    description: 'Name a deep cut — fame under 30.',
    rarity: 'rare',
    check: ({ record }) => winsInTier(record, 'deepCut') >= 1,
  },
  {
    id: 'practice-squad-scout',
    name: 'Practice Squad Scout',
    emoji: '🎽',
    description: 'Five deep cuts in a single run.',
    rarity: 'epic',
    check: ({ record }) => winsInTier(record, 'deepCut') >= 5,
  },
  {
    id: 'nobody-knows-him',
    name: 'Nobody Knows Him',
    emoji: '🥷',
    description: 'Name a deep cut on the very first rung.',
    rarity: 'legendary',
    check: ({ record }) => winsInTier(record, 'deepCut', 0) >= 1,
  },
  {
    id: 'rookie-eye',
    name: 'Rookie Eye',
    emoji: '🐣',
    description: 'Identify a rookie.',
    rarity: 'rare',
    check: ({ record }) => wonStats(record).some((s) => s.rookie),
  },
  {
    id: 'rookie-class',
    name: 'Rookie Class',
    emoji: '🎓',
    description: 'Three rookies in one run.',
    rarity: 'epic',
    check: ({ record }) => wonStats(record).filter((s) => s.rookie).length >= 3,
  },

  // ---- coverage of the league -----------------------------------------------------------
  {
    id: 'division-sweep',
    name: 'Division Sweep',
    emoji: '🧹',
    description: 'Name someone from all four clubs of one division.',
    rarity: 'epic',
    check: ({ totals }) => scoutDivisionsSwept(totals).length >= 1,
  },
  {
    id: 'half-the-league',
    name: 'Half the League',
    emoji: '🗺️',
    description: 'Sixteen franchises on your map.',
    rarity: 'rare',
    check: ({ totals }) => scoutTeamsKnown(totals) >= 16,
  },
  {
    id: 'league-wide',
    name: 'League Wide',
    emoji: '🌎',
    description: 'All thirty-two franchises on your map.',
    rarity: 'legendary',
    check: ({ totals }) => scoutTeamsKnown(totals) >= 32,
  },
  {
    id: 'every-room',
    name: 'Every Room',
    emoji: '🧬',
    description: 'A correct call in all nine position groups.',
    rarity: 'epic',
    check: ({ totals }) => SCOUT_POSITION_GROUPS.every((g) => correctInGroup(totals, g) >= 1),
  },
  {
    id: 'trench-eyes',
    name: 'Trench Eyes',
    emoji: '🛡️',
    description: 'Ten offensive linemen named. Nobody can name linemen.',
    rarity: 'rare',
    check: ({ totals }) => correctInGroup(totals, 'OL') >= 10,
  },
  {
    id: 'respect-the-kickers',
    name: 'Respect the Kickers',
    emoji: '🦶',
    description: 'Five special teamers named.',
    rarity: 'rare',
    check: ({ totals }) => correctInGroup(totals, 'ST') >= 5,
  },
  {
    id: 'both-conferences',
    name: 'Both Conferences',
    emoji: '🔀',
    description: 'Twenty-five correct in each conference.',
    rarity: 'rare',
    check: ({ totals }) => correctInConference(totals, 'AFC') >= 25 && correctInConference(totals, 'NFC') >= 25,
  },

  // ---- session formats -------------------------------------------------------------------
  {
    id: 'survivor-10',
    name: 'Ten Deep',
    emoji: '💀',
    description: 'Survive ten in Survival.',
    rarity: 'rare',
    check: ({ record }) => record.format === 'survival' && record.survived >= 10,
  },
  {
    id: 'survivor-20',
    name: 'Twenty Deep',
    emoji: '🧟',
    description: 'Survive twenty in Survival.',
    rarity: 'legendary',
    check: ({ record }) => record.format === 'survival' && record.survived >= 20,
  },
  {
    id: 'gauntlet-run',
    name: 'Gauntlet Run',
    emoji: '🪜',
    description: 'Complete the Gauntlet — all thirty-two franchises played.',
    rarity: 'epic',
    check: ({ record }) => record.format === 'gauntlet' && record.gauntletCleared,
  },
  {
    id: 'clean-board',
    name: 'Clean Board',
    emoji: '🏆',
    description: 'Clear twenty-eight franchises in one Gauntlet.',
    rarity: 'legendary',
    check: ({ record }) => record.format === 'gauntlet' && record.franchisesCleared >= 28,
  },
  {
    id: 'duel-won',
    name: 'Duel Won',
    emoji: '⚔️',
    description: 'Win a duel.',
    rarity: 'rare',
    check: ({ record }) => record.format === 'duel' && record.duel?.won === true,
  },
  {
    id: 'blitz-package',
    name: 'Blitz Package',
    emoji: '🚨',
    description: 'Name five quarterbacks in one Blitz.',
    rarity: 'epic',
    check: ({ record }) => record.format === 'blitz' && winsInGroup(record, 'QB') >= 5,
  },
  {
    id: 'twenty-in-ninety',
    name: 'Twenty in Ninety',
    emoji: '⚡',
    description: 'Twenty correct in a single Blitz.',
    rarity: 'epic',
    check: ({ record }) => record.format === 'blitz' && record.correct >= 20,
  },
  {
    id: 'host-with-the-most',
    name: 'Host With the Most',
    emoji: '🎉',
    description: 'Win a Party run of three or more players.',
    rarity: 'rare',
    check: ({ record }) =>
      record.format === 'party' && (record.players?.length ?? 0) >= 3 && record.duel?.won === true,
  },
  {
    id: 'format-tourist',
    name: 'Format Tourist',
    emoji: '🎛️',
    description: 'Finish a run in all six session formats.',
    rarity: 'epic',
    check: ({ totals }) => SCOUT_FORMAT_IDS.every((f) => (totals.runsByFormat[f]?.runs ?? 0) >= 1),
  },

  // ---- runs and streaks ------------------------------------------------------------------
  {
    id: 'streak-5',
    name: 'Warmed Up',
    emoji: '🔥',
    description: 'Five correct in a row.',
    rarity: 'common',
    check: ({ record }) => record.bestStreak >= 5,
  },
  {
    id: 'streak-10',
    name: 'On Fire',
    emoji: '🚒',
    description: 'Ten correct in a row.',
    rarity: 'rare',
    check: ({ record }) => record.bestStreak >= 10,
  },
  {
    id: 'streak-25',
    name: 'Volcanic',
    emoji: '🌋',
    description: 'Twenty-five correct in a row.',
    rarity: 'legendary',
    check: ({ record }) => record.bestStreak >= 25,
  },
  {
    id: 'clean-sheet',
    name: 'Clean Sheet',
    emoji: '✅',
    description: 'Win every round of a five-round-or-longer run.',
    rarity: 'rare',
    check: ({ record }) => record.rounds >= 5 && record.correct === record.rounds,
  },
  {
    id: 'flawless-eye',
    name: 'Flawless Eye',
    emoji: '💎',
    description: 'Win every round of a five-round-or-longer run on the first rung.',
    rarity: 'legendary',
    check: ({ record }) => record.rounds >= 5 && record.perfect,
  },
  {
    id: 'no-passes',
    name: 'No Passes',
    emoji: '🙅',
    description: 'Finish a ten-round run without skipping once.',
    rarity: 'rare',
    check: ({ record }) => record.rounds >= 10 && record.noSkips,
  },
  {
    id: 'first-ballot',
    name: 'First Ballot',
    emoji: '🗳️',
    description: 'Twenty-five first-rung calls, lifetime.',
    rarity: 'epic',
    check: ({ totals }) => totals.firstRungSolves >= 25,
  },

  // ---- daily, rank, small hours ----------------------------------------------------------
  {
    id: 'daily-debut',
    name: 'Daily Debut',
    emoji: '🗓️',
    description: 'Play your first daily.',
    rarity: 'common',
    check: ({ record, dailies }) => record.daily !== undefined && (dailies ?? 0) >= 1,
  },
  {
    id: 'daily-seven',
    name: 'Week of Tape',
    emoji: '📅',
    description: 'Seven dailies completed.',
    rarity: 'rare',
    check: ({ dailies }) => (dailies ?? 0) >= 7,
  },
  {
    id: 'pro-bowl-nod',
    name: 'Pro Bowl Nod',
    emoji: '🌺',
    description: 'Reach Pro Bowler.',
    rarity: 'rare',
    check: ({ totals }) => scoutRankFor(totals.xp).level >= 8,
  },
  {
    id: 'gold-jacket',
    name: 'Gold Jacket',
    emoji: '🧥',
    description: 'Reach the top of the ladder.',
    rarity: 'legendary',
    check: ({ totals }) => scoutRankFor(totals.xp).level >= SCOUT_MAX_LEVEL,
  },
  {
    id: 'midnight-film',
    name: 'Midnight Film',
    emoji: '🌙',
    description: 'Finish a run between midnight and 4am.',
    rarity: 'rare',
    check: ({ record }) => hourOf(record) < 4,
  },
];

export const SCOUT_ACHIEVEMENT_BY_ID: ReadonlyMap<string, ScoutAchievement> = new Map(
  SCOUT_ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function scoutAchievementById(id: string): ScoutAchievement | undefined {
  return SCOUT_ACHIEVEMENT_BY_ID.get(id);
}

export function scoutAchievementsByRarity(rarity: ScoutRarity): ScoutAchievement[] {
  return SCOUT_ACHIEVEMENTS.filter((a) => a.rarity === rarity);
}

/**
 * Newly-earned achievements for this run, in roster order. A throwing check counts as "not
 * earned" — a bad predicate must never break run recording.
 */
export function evaluateScoutAchievements(
  ctx: ScoutAchievementContext,
  alreadyUnlocked: ReadonlySet<string> = new Set(),
): ScoutAchievement[] {
  const out: ScoutAchievement[] = [];
  for (const a of SCOUT_ACHIEVEMENTS) {
    if (alreadyUnlocked.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.check(ctx);
    } catch {
      ok = false;
    }
    if (ok) out.push(a);
  }
  return out;
}
