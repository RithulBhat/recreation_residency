/**
 * Highlight Scout scoring — deliberately in the same league as Songooner's so the two games'
 * numbers are comparable on the residency leaderboard.
 *
 *   raw   = 1000 × tryFactor(tryIndex) × modeWeight(mode) × formatWeight(format)
 *   total = raw + timeBonus (≤ 25% of raw) + streakBonus + depthBonus − 15% per hint
 *
 * `tryFactor`, `timeBonusFraction` and `streakBonusFraction` are imported from
 * `@/game/scoring` — the same [1, 0.8, 0.65, 0.5, 0.4, 0.3] ladder Songooner uses, so solving on
 * the first rung is always worth strictly more than solving on the second.
 *
 * `modeWeight` prices how hard rung 0 of each PUZZLE TYPE is: a pure black silhouette or a 6% face
 * crop is the hardest thing in the game; a zoomed logo is the easiest.
 *
 * `formatWeight` and the streak profile price the SESSION FORMAT (see {@link FORMAT_SCORE_PROFILES}).
 * `standard` is the identity — weight 1 and Songooner's 5%/streak-capped-at-50% curve — so the
 * default format scores exactly what it scored before formats existed. Blitz pays a little less per
 * subject (you get many more of them) but rewards a run of them much harder; survival adds a depth
 * bonus, because its subjects get genuinely more obscure the further you go.
 */

import {
  BASE_POINTS,
  HINT_PENALTY_STEP,
  streakBonusFraction,
  timeBonusFraction,
  tryFactor,
} from '@/game/scoring';
import { BLITZ_RUNG, DEFAULT_SCOUT_FORMAT, scoutFormat } from './formats';
import type { ScoutFormat, ScoutMode } from './types';

export { BASE_POINTS, tryFactor, timeBonusFraction, streakBonusFraction };

export const MODE_WEIGHTS: Readonly<Record<ScoutMode, number>> = {
  silhouette: 1.15,
  faceZoom: 1.2,
  highlight: 1,
  statLine: 0.95,
  careerPath: 0.9,
  teamTrivia: 0.8,
  logoZoom: 0.75,
};

export function modeWeight(mode: ScoutMode): number {
  return MODE_WEIGHTS[mode] ?? 1;
}

/** How a session format prices a round and a run of them. */
export interface ScoutFormatScoreProfile {
  /** Multiplier on the raw points of one round. */
  weight: number;
  /** Streak bonus added per consecutive correct answer, as a fraction of raw. */
  streakStep: number;
  /** Cap on the streak bonus, as a fraction of raw. */
  streakMax: number;
}

/**
 * `standard` is the identity profile (Songooner's curve). Everything else is tuned so a good run of
 * any format lands in the same few-thousand-to-low-tens-of-thousands band, and a rank means the
 * same thing in Scout as it does in Songooner.
 */
export const FORMAT_SCORE_PROFILES: Readonly<Record<ScoutFormat, ScoutFormatScoreProfile>> = {
  standard: { weight: 1, streakStep: 0.05, streakMax: 0.5 },
  // many short rounds → less per round, but a hot streak is the whole point
  blitz: { weight: 0.85, streakStep: 0.08, streakMax: 1 },
  // fewer, harder rounds the deeper you get; the depth bonus does the rest
  survival: { weight: 1, streakStep: 0.06, streakMax: 0.75 },
  // 32 fixed rounds, no cherry-picking the pool
  gauntlet: { weight: 1.05, streakStep: 0.05, streakMax: 0.5 },
  duel: { weight: 1, streakStep: 0.05, streakMax: 0.5 },
  party: { weight: 1, streakStep: 0.05, streakMax: 0.5 },
};

export function formatProfile(format: ScoutFormat | undefined): ScoutFormatScoreProfile {
  return FORMAT_SCORE_PROFILES[scoutFormat({ format })] ?? FORMAT_SCORE_PROFILES.standard;
}

export function formatWeight(format: ScoutFormat | undefined): number {
  return formatProfile(format).weight;
}

/** Streak bonus fraction under a format's profile. `standard` matches `@/game/scoring` exactly. */
export function scoutStreakBonusFraction(streak: number, format?: ScoutFormat): number {
  const p = formatProfile(format);
  const s = Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0));
  return Math.min(p.streakMax, s * p.streakStep);
}

/** Survival pays 10% more per round already survived, up to double. */
export const SURVIVAL_DEPTH_STEP = 0.1;
export const SURVIVAL_DEPTH_MAX = 1;

export function survivalDepthFraction(depth: number): number {
  const d = Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0));
  return Math.min(SURVIVAL_DEPTH_MAX, d * SURVIVAL_DEPTH_STEP);
}

export interface ScoutScoreInput {
  mode: ScoutMode;
  /** 0-based rung the answer landed on. */
  tryIndex: number;
  /** Milliseconds since the round was actually seen. */
  elapsedMs: number;
  /** Streak BEFORE this round. */
  streak: number;
  hintsUsed?: number;
  /** ADDED: session format. Absent → `'standard'`, i.e. the pre-format numbers. */
  format?: ScoutFormat;
  /** ADDED: survival only — rounds already survived, which raises the payout. */
  depth?: number;
}

export interface ScoutScoreBreakdown {
  base: number;
  tryFactor: number;
  modeWeight: number;
  /** ADDED: the session format's multiplier (1 for `standard`). */
  formatWeight: number;
  timeBonus: number;
  streakBonus: number;
  /** ADDED: survival's escalation bonus (0 everywhere else). */
  depthBonus: number;
  hintPenalty: number;
  total: number;
}

export function scoreScoutRound(input: ScoutScoreInput): ScoutScoreBreakdown {
  const format = scoutFormat({ format: input.format });
  const tf = tryFactor(input.tryIndex);
  const mw = modeWeight(input.mode);
  const fw = formatWeight(format);
  const raw = BASE_POINTS * tf * mw * fw;
  const timeBonus = raw * timeBonusFraction(input.elapsedMs);
  const streakBonus = raw * scoutStreakBonusFraction(input.streak, format);
  const depthBonus = format === 'survival' ? raw * survivalDepthFraction(input.depth ?? 0) : 0;
  const hints = Math.max(0, Math.floor(Number.isFinite(input.hintsUsed ?? 0) ? (input.hintsUsed ?? 0) : 0));
  const hintPenalty = Math.min(raw, raw * hints * HINT_PENALTY_STEP);
  const total = raw + timeBonus + streakBonus + depthBonus - hintPenalty;
  return {
    base: BASE_POINTS,
    tryFactor: tf,
    modeWeight: mw,
    formatWeight: fw,
    timeBonus: Math.round(timeBonus),
    streakBonus: Math.round(streakBonus),
    depthBonus: Math.round(depthBonus),
    hintPenalty: Math.round(hintPenalty),
    total: Math.max(0, Math.round(total)),
  };
}

/**
 * The most a round of this puzzle type can pay out under a format (its best rung, instant, on a
 * maxed streak, no hints). Blitz's best rung is the fixed one it always plays.
 */
export function maxScoutScore(mode: ScoutMode, format: ScoutFormat = DEFAULT_SCOUT_FORMAT): number {
  const tryIndex = format === 'blitz' ? BLITZ_RUNG : 0;
  const streak = Math.ceil(FORMAT_SCORE_PROFILES[format].streakMax / FORMAT_SCORE_PROFILES[format].streakStep);
  return scoreScoutRound({ mode, tryIndex, elapsedMs: 0, streak, format, depth: 99 }).total;
}
