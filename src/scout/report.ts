/**
 * The Scout Report Card — the page that should be worth opening.
 *
 * Everything here is derived from `ScoutStatsTotals` (lifetime, never capped) plus the optional run
 * history and per-subject history. It is a pure transform: no clocks, no storage, no React.
 *
 * ## What it claims, and why it is allowed to claim it
 * A stats page that says "great job!" is noise. This one only speaks when the numbers back it:
 *   - a cut (position group, conference, division, fame tier, puzzle type, format) is only eligible
 *     for a verdict once it has been seen `MIN_CUT_SEEN` times;
 *   - the whole card stays in "not enough tape" mode until `MIN_SCOUT_REPORT_ROUNDS` graded rounds
 *     exist, and says so plainly instead of inventing a personality;
 *   - praise has floors (`ELITE_ACCURACY`, `SOLID_ACCURACY`) and criticism has ceilings
 *     (`SHAKY_ACCURACY`, `BLIND_ACCURACY`), and nothing in between produces a line at all.
 * The result is a verdict like "Elite on quarterbacks. You cannot name a defensive back." that is
 * literally true of the player's history, or an honest "not enough tape yet".
 *
 * ## Shapes the UI renders
 *   `ScoutCut[]`       → breakdown bars. Always the FULL ordered axis (all 9 groups, all 8
 *                        divisions, all 7 puzzle types), including zero rows, so the chart never
 *                        reflows as new data arrives.
 *   `ScoutTeamHeat[]`  → the league grid. Always all 32 franchises in conference/division order,
 *                        each with `seen`, `correct`, `accuracy` and `heat` (0..1 vs the most-seen
 *                        franchise) plus the team's `accent` colour and `emoji`.
 *   `ScoutVerdictLine[]` → the headline. Tone tells the UI how to colour it.
 */

import { SCOUT_FORMAT_IDS, scoutFormatInfo } from './formats';
import { SCOUT_TEAM_META, scoutMode } from './packs';
import {
  SCOUT_CONFERENCES,
  SCOUT_DIVISION_KEYS,
  SCOUT_FAME_TIERS,
  SCOUT_MODE_KEYS,
  SCOUT_POSITION_GROUPS,
  scoutCutAccuracy,
  scoutCutAvgRung,
  scoutDivisionsSwept,
  type ScoutBestCall,
  type ScoutCutTotals,
  type ScoutFameTier,
  type ScoutRunRecord,
  type ScoutStatsTotals,
  type ScoutSubjectRecord,
  type ScoutTeamInfo,
} from './scoutStats';
import type { Conference, DivisionName, PositionGroup } from './types';

/** Graded rounds needed before the card will pass judgement at all. */
export const MIN_SCOUT_REPORT_ROUNDS = 20;
/** Sightings a single cut needs before it can be praised or damned. */
export const MIN_CUT_SEEN = 6;

export const ELITE_ACCURACY = 0.8;
export const SOLID_ACCURACY = 0.65;
export const SHAKY_ACCURACY = 0.45;
export const BLIND_ACCURACY = 0.25;

/* ------------------------------------------------------------------------------------- labels */

/** Display copy for a position group: short axis label, plural headline, singular accusation. */
export interface ScoutGroupLabel {
  group: PositionGroup;
  /** 'QB' */
  short: string;
  /** 'Quarterbacks' */
  label: string;
  /** 'quarterbacks' — reads after a verb. */
  many: string;
  /** 'a quarterback' — reads after "You cannot name". */
  one: string;
  emoji: string;
}

export const SCOUT_GROUP_LABELS: readonly ScoutGroupLabel[] = [
  { group: 'QB', short: 'QB', label: 'Quarterbacks', many: 'quarterbacks', one: 'a quarterback', emoji: '🎯' },
  { group: 'RB', short: 'RB', label: 'Running Backs', many: 'running backs', one: 'a running back', emoji: '💨' },
  { group: 'WR', short: 'WR', label: 'Wide Receivers', many: 'receivers', one: 'a receiver', emoji: '🧤' },
  { group: 'TE', short: 'TE', label: 'Tight Ends', many: 'tight ends', one: 'a tight end', emoji: '🧱' },
  { group: 'OL', short: 'OL', label: 'Offensive Line', many: 'offensive linemen', one: 'an offensive lineman', emoji: '🛡️' },
  { group: 'DL', short: 'DL', label: 'Defensive Line', many: 'defensive linemen', one: 'a defensive lineman', emoji: '🐗' },
  { group: 'LB', short: 'LB', label: 'Linebackers', many: 'linebackers', one: 'a linebacker', emoji: '🎩' },
  { group: 'DB', short: 'DB', label: 'Defensive Backs', many: 'defensive backs', one: 'a defensive back', emoji: '🔒' },
  { group: 'ST', short: 'ST', label: 'Special Teams', many: 'special teamers', one: 'a kicker', emoji: '🦶' },
];

const GROUP_LABEL_BY_KEY: ReadonlyMap<string, ScoutGroupLabel> = new Map(
  SCOUT_GROUP_LABELS.map((g) => [g.group, g]),
);

export function scoutGroupLabel(group: PositionGroup): ScoutGroupLabel {
  return GROUP_LABEL_BY_KEY.get(group) ?? SCOUT_GROUP_LABELS[0];
}

export const SCOUT_TIER_LABELS: Readonly<Record<ScoutFameTier, string>> = {
  star: 'Superstars',
  starter: 'Starters',
  rotation: 'Rotational',
  deepCut: 'Deep Cuts',
};

export const SCOUT_TIER_EMOJI: Readonly<Record<ScoutFameTier, string>> = {
  star: '🌟',
  starter: '🏈',
  rotation: '🔄',
  deepCut: '🕳️',
};

const CONFERENCE_EMOJI: Readonly<Record<Conference, string>> = { AFC: '🔴', NFC: '🔵' };

/* --------------------------------------------------------------------------------------- cuts */

/** One bar of a breakdown chart. */
export interface ScoutCut {
  /** Axis key: `'QB'`, `'AFC West'`, `'silhouette'`, `'survival'`, `'deepCut'`… */
  key: string;
  /** Compact axis tick: 'QB', 'AFC W', 'Film Room'. */
  short: string;
  /** Full label: 'Quarterbacks'. */
  label: string;
  emoji: string;
  seen: number;
  correct: number;
  /** 0..1, and 0 when never seen. */
  accuracy: number;
  /** Mean 1-based rung of the solved rounds; 0 when none were solved. */
  avgRung: number;
}

/** One franchise cell of the league heatmap. */
export interface ScoutTeamHeat {
  teamId: string;
  abbr: string;
  /** 'Kansas City Chiefs' */
  name: string;
  city: string;
  emoji: string;
  /** Team colour, for the cell fill. */
  accent: string;
  conference: Conference;
  division: DivisionName;
  /** 'AFC West' */
  divisionKey: string;
  seen: number;
  correct: number;
  /** 0..1, and 0 when never seen. */
  accuracy: number;
  /** 0..1 against the most-seen franchise — drives opacity/size, not colour. */
  heat: number;
}

export type ScoutVerdictTone = 'insufficient' | 'strength' | 'weakness' | 'balanced' | 'coverage';

export interface ScoutVerdictLine {
  tone: ScoutVerdictTone;
  text: string;
  /** The cut that produced the line, when one did. */
  key?: string;
}

/** One point of the recent-form sparkline (oldest → newest). */
export interface ScoutFormPoint {
  runId: string;
  at: number;
  format: string;
  mode: string;
  score: number;
  rounds: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
  /** Every graded round won. */
  clean: boolean;
}

export interface ScoutReportInput {
  totals: ScoutStatsTotals;
  /** Newest first. Drives recent form only — the cuts come from `totals`. */
  records?: readonly ScoutRunRecord[];
  /** Per-subject history, for the nemesis list and the best-call fallback. */
  subjects?: readonly ScoutSubjectRecord[];
}

export interface ScoutReport {
  runs: number;
  /** Graded rounds. */
  rounds: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
  xp: number;
  bestStreak: number;
  bestScore: number;
  /** False until `MIN_SCOUT_REPORT_ROUNDS` rounds exist. */
  enoughData: boolean;
  /** Rounds still needed before the verdict unlocks (0 once it has). */
  roundsToVerdict: number;
  /** All nine groups, in offence→defence→special order. */
  byGroup: ScoutCut[];
  /** AFC, NFC. */
  byConference: ScoutCut[];
  /** All eight divisions. */
  byDivision: ScoutCut[];
  /** Superstars → Deep Cuts: the real skill curve. */
  byTier: ScoutCut[];
  /** All seven puzzle types. */
  byMode: ScoutCut[];
  /** All six session formats, in ladder order. */
  byFormat: ScoutCut[];
  /** All 32 franchises, conference/division order. */
  teams: ScoutTeamHeat[];
  /** Franchises seen at least once. */
  teamsSeen: number;
  /** Franchises with at least one correct call. */
  teamsKnown: number;
  /** Divisions where all four franchises have been named. */
  divisionsSwept: string[];
  /** Best eligible cut across groups and tiers, or null when nothing qualifies. */
  strongest: ScoutCut | null;
  /** Worst eligible cut across groups and tiers, or null. */
  weakest: ScoutCut | null;
  verdict: ScoutVerdictLine[];
  /** The verdict as one shareable string (coverage line excluded). */
  verdictLine: string;
  /** The shortest rung the player ever named anyone at, and who it was. */
  bestCall: ScoutBestCall | null;
  /** Subjects seen repeatedly and never once named, most-seen first. */
  nemeses: ScoutSubjectRecord[];
  /** Oldest → newest, at most 12 points. */
  recentForm: ScoutFormPoint[];
}

function makeCut(
  key: string,
  short: string,
  label: string,
  emoji: string,
  cut: ScoutCutTotals | undefined,
): ScoutCut {
  return {
    key,
    short,
    label,
    emoji,
    seen: cut?.seen ?? 0,
    correct: cut?.correct ?? 0,
    accuracy: scoutCutAccuracy(cut),
    avgRung: scoutCutAvgRung(cut),
  };
}

export function scoutGroupCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_POSITION_GROUPS.map((group) => {
    const meta = scoutGroupLabel(group);
    return makeCut(group, meta.short, meta.label, meta.emoji, totals.byGroup[group]);
  });
}

export function scoutConferenceCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_CONFERENCES.map((conf) =>
    makeCut(conf, conf, `${conf} players`, CONFERENCE_EMOJI[conf], totals.byConference[conf]),
  );
}

export function scoutDivisionCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_DIVISION_KEYS.map((key) => {
    const conf = key.slice(0, 3);
    const short = `${conf} ${key.slice(4, 5)}`;
    return makeCut(key, short, key, CONFERENCE_EMOJI[conf === 'AFC' ? 'AFC' : 'NFC'], totals.byDivision[key]);
  });
}

export function scoutTierCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_FAME_TIERS.map((tier) =>
    makeCut(tier, SCOUT_TIER_LABELS[tier], SCOUT_TIER_LABELS[tier], SCOUT_TIER_EMOJI[tier], totals.byTier[tier]),
  );
}

export function scoutModeCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_MODE_KEYS.map((mode) => {
    const info = scoutMode(mode);
    return makeCut(mode, info?.name ?? mode, info?.name ?? mode, info?.emoji ?? '🏈', totals.byMode[mode]);
  });
}

/** Every session format, in `SCOUT_FORMATS` ladder order. */
export function scoutFormatCuts(totals: ScoutStatsTotals): ScoutCut[] {
  return SCOUT_FORMAT_IDS.map((id) => {
    const info = scoutFormatInfo(id);
    return makeCut(id, info?.name ?? id, info?.name ?? id, info?.emoji ?? '🏈', totals.byFormat[id]);
  });
}

/** All 32 franchises, in `SCOUT_TEAM_META` (conference → division) order. */
export function scoutTeamHeatmap(totals: ScoutStatsTotals): ScoutTeamHeat[] {
  const maxSeen = SCOUT_TEAM_META.reduce((n, t) => Math.max(n, totals.byTeam[t.id]?.seen ?? 0), 0);
  return SCOUT_TEAM_META.map((team: ScoutTeamInfo) => {
    const cut = totals.byTeam[team.id];
    const seen = cut?.seen ?? 0;
    return {
      teamId: team.id,
      abbr: team.abbr,
      name: `${team.city} ${team.name}`,
      city: team.city,
      emoji: team.emoji,
      accent: team.accent,
      conference: team.conf,
      division: team.div,
      divisionKey: `${team.conf} ${team.div}`,
      seen,
      correct: cut?.correct ?? 0,
      accuracy: scoutCutAccuracy(cut),
      heat: maxSeen > 0 ? seen / maxSeen : 0,
    };
  });
}

/* ------------------------------------------------------------------------------------ verdict */

function pct(x: number): number {
  return Math.round(x * 100);
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The group cut's accusation copy, or the cut's own label for non-group cuts. */
function oneOf(cut: ScoutCut): string {
  const meta = GROUP_LABEL_BY_KEY.get(cut.key);
  return meta ? meta.one : `anyone in ${cut.label}`;
}

function manyOf(cut: ScoutCut): string {
  const meta = GROUP_LABEL_BY_KEY.get(cut.key);
  return meta ? meta.many : cut.label.toLowerCase();
}

function eligible(cuts: readonly ScoutCut[]): ScoutCut[] {
  return cuts.filter((c) => c.seen >= MIN_CUT_SEEN);
}

/** Highest accuracy, ties broken by sample size. */
function best(cuts: readonly ScoutCut[]): ScoutCut | null {
  let out: ScoutCut | null = null;
  for (const c of cuts) {
    if (!out || c.accuracy > out.accuracy || (c.accuracy === out.accuracy && c.seen > out.seen)) out = c;
  }
  return out;
}

/** Lowest accuracy, ties broken by sample size. */
function worst(cuts: readonly ScoutCut[]): ScoutCut | null {
  let out: ScoutCut | null = null;
  for (const c of cuts) {
    if (!out || c.accuracy < out.accuracy || (c.accuracy === out.accuracy && c.seen > out.seen)) out = c;
  }
  return out;
}

/** The slices the verdict templates read. `buildScoutReport` fills this in. */
export interface ScoutVerdictParts {
  groups: readonly ScoutCut[];
  tiers: readonly ScoutCut[];
  rounds: number;
  accuracy: number;
  teamsKnown: number;
  divisionsSwept: readonly string[];
}

/**
 * Honest templates, picked by the data. Never produces a compliment the numbers do not support, and
 * says plainly when there is not enough history yet.
 */
export function scoutVerdict(parts: ScoutVerdictParts): ScoutVerdictLine[] {
  const lines: ScoutVerdictLine[] = [];
  if (parts.rounds < MIN_SCOUT_REPORT_ROUNDS) {
    const need = MIN_SCOUT_REPORT_ROUNDS - parts.rounds;
    lines.push({
      tone: 'insufficient',
      text:
        parts.rounds === 0
          ? 'No tape on you yet. Play a run and the report card fills in.'
          : `Not enough tape yet — ${need} more ${need === 1 ? 'round' : 'rounds'} and this page starts telling the truth.`,
    });
    return lines;
  }

  const groups = eligible(parts.groups);
  const strongest = best(groups);
  const weakest = worst(groups);

  if (strongest && strongest.accuracy >= ELITE_ACCURACY) {
    lines.push({ tone: 'strength', key: strongest.key, text: `Elite on ${manyOf(strongest)}.` });
  } else if (strongest && strongest.accuracy >= SOLID_ACCURACY) {
    lines.push({ tone: 'strength', key: strongest.key, text: `${cap(manyOf(strongest))} are your strongest room.` });
  }

  if (weakest && weakest !== strongest) {
    if (weakest.accuracy <= BLIND_ACCURACY) {
      lines.push({ tone: 'weakness', key: weakest.key, text: `You cannot name ${oneOf(weakest)}.` });
    } else if (weakest.accuracy <= SHAKY_ACCURACY) {
      lines.push({ tone: 'weakness', key: weakest.key, text: `${cap(manyOf(weakest))} are a blind spot.` });
    }
  }

  const deep = parts.tiers.find((t) => t.key === 'deepCut');
  const star = parts.tiers.find((t) => t.key === 'star');
  if (deep && deep.seen >= MIN_CUT_SEEN && deep.accuracy >= 0.5) {
    lines.push({
      tone: 'strength',
      key: 'deepCut',
      text: `You name deep cuts ${pct(deep.accuracy)}% of the time, which is not a fan's eye any more.`,
    });
  } else if (star && star.seen >= MIN_CUT_SEEN && star.accuracy < SOLID_ACCURACY) {
    lines.push({
      tone: 'weakness',
      key: 'star',
      text: 'Even the household names get away from you.',
    });
  }

  if (lines.length === 0) {
    lines.push({
      tone: 'balanced',
      text: `No specialism and no blind spot yet — ${pct(parts.accuracy)}% across ${parts.rounds} rounds.`,
    });
  }

  if (parts.divisionsSwept.length > 0) {
    lines.push({
      tone: 'coverage',
      text: `${parts.teamsKnown} of 32 franchises on your map, ${parts.divisionsSwept.length} ${
        parts.divisionsSwept.length === 1 ? 'division' : 'divisions'
      } swept clean.`,
    });
  } else {
    lines.push({ tone: 'coverage', text: `${parts.teamsKnown} of 32 franchises on your map.` });
  }
  return lines.slice(0, 4);
}

/* ------------------------------------------------------------------------------------- extras */

/** Subjects seen twice or more and never once named, most-seen first. */
export function scoutWeakestSubjects(
  subjects: readonly ScoutSubjectRecord[] | undefined,
  limit = 5,
): ScoutSubjectRecord[] {
  if (!subjects) return [];
  return subjects
    .filter((s) => s.timesSeen >= 2 && s.timesCorrect === 0)
    .sort((a, b) => b.timesSeen - a.timesSeen || b.lastSeen - a.lastSeen)
    .slice(0, Math.max(0, limit));
}

/** Oldest → newest form points from a newest-first record list. */
export function scoutRecentForm(records: readonly ScoutRunRecord[] | undefined, n = 12): ScoutFormPoint[] {
  if (!records || records.length === 0) return [];
  return records
    .slice(0, Math.max(0, n))
    .map((r) => ({
      runId: r.id,
      at: r.finishedAt,
      format: r.format,
      mode: r.mode,
      score: r.score,
      rounds: r.rounds,
      correct: r.correct,
      accuracy: r.rounds === 0 ? 0 : r.correct / r.rounds,
      clean: r.rounds > 0 && r.correct === r.rounds,
    }))
    .reverse();
}

/** The best single call, from totals, falling back to a scan of per-subject history. */
export function scoutBestCall(input: ScoutReportInput): ScoutBestCall | null {
  if (input.totals.bestCall) return input.totals.bestCall;
  let out: ScoutBestCall | null = null;
  for (const s of input.subjects ?? []) {
    if (s.bestRung === null) continue;
    if (out && s.bestRung >= out.rung) continue;
    const call: ScoutBestCall = {
      key: s.key,
      subjectId: s.id,
      name: s.name,
      mode: s.bestRungMode ?? 'silhouette',
      rung: s.bestRung,
      tier: s.tier,
      runId: '',
      at: s.lastSeen,
    };
    if (s.teamAbbr !== undefined) call.teamAbbr = s.teamAbbr;
    out = call;
  }
  return out;
}

/* -------------------------------------------------------------------------------------- build */

/** Build the whole Report Card. Cheap enough to call inside a selector on every render. */
export function buildScoutReport(input: ScoutReportInput): ScoutReport {
  const { totals } = input;
  const byGroup = scoutGroupCuts(totals);
  const byTier = scoutTierCuts(totals);
  const teams = scoutTeamHeatmap(totals);
  const teamsSeen = teams.filter((t) => t.seen > 0).length;
  const teamsKnown = teams.filter((t) => t.correct > 0).length;
  const divisionsSwept = scoutDivisionsSwept(totals);
  const accuracy = totals.rounds === 0 ? 0 : totals.correct / totals.rounds;
  const eligibleCuts = eligible([...byGroup, ...byTier]);
  const verdict = scoutVerdict({
    groups: byGroup,
    tiers: byTier,
    rounds: totals.rounds,
    accuracy,
    teamsKnown,
    divisionsSwept,
  });

  return {
    runs: totals.runs,
    rounds: totals.rounds,
    correct: totals.correct,
    accuracy,
    xp: totals.xp,
    bestStreak: totals.bestStreak,
    bestScore: totals.bestScore,
    enoughData: totals.rounds >= MIN_SCOUT_REPORT_ROUNDS,
    roundsToVerdict: Math.max(0, MIN_SCOUT_REPORT_ROUNDS - totals.rounds),
    byGroup,
    byConference: scoutConferenceCuts(totals),
    byDivision: scoutDivisionCuts(totals),
    byTier,
    byMode: scoutModeCuts(totals),
    byFormat: scoutFormatCuts(totals),
    teams,
    teamsSeen,
    teamsKnown,
    divisionsSwept,
    strongest: best(eligibleCuts),
    weakest: worst(eligibleCuts),
    verdict,
    verdictLine: verdict
      .filter((l) => l.tone !== 'coverage')
      .map((l) => l.text)
      .join(' '),
    bestCall: scoutBestCall(input),
    nemeses: scoutWeakestSubjects(input.subjects),
    recentForm: scoutRecentForm(input.records),
  };
}
