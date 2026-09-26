/**
 * Highlight Scout scoring — deliberately in the same league as Songooner's so the two games'
 * numbers are comparable on the residency leaderboard.
 *
 *   raw   = 1000 × tryFactor(tryIndex) × modeWeight(mode)
 *   total = raw + timeBonus (≤ 25% of raw) + streakBonus (5%/streak, ≤ 50%) − 15% per hint
 *
 * `tryFactor`, `timeBonusFraction` and `streakBonusFraction` are imported from
 * `@/game/scoring` — the same [1, 0.8, 0.65, 0.5, 0.4, 0.3] ladder Songooner uses, so solving on
 * the first rung is always worth strictly more than solving on the second.
 *
 * `modeWeight` prices how hard rung 0 of each mode is: a pure black silhouette or a 6% face crop
 * is the hardest thing in the game; a zoomed logo is the easiest.
 */

import {
  BASE_POINTS,
  HINT_PENALTY_STEP,
  streakBonusFraction,
  timeBonusFraction,
  tryFactor,
} from '@/game/scoring';
import type { ScoutMode } from './types';

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

export interface ScoutScoreInput {
  mode: ScoutMode;
  /** 0-based rung the answer landed on. */
  tryIndex: number;
  /** Milliseconds since the round was actually seen. */
  elapsedMs: number;
  /** Streak BEFORE this round. */
  streak: number;
  hintsUsed?: number;
}

export interface ScoutScoreBreakdown {
  base: number;
  tryFactor: number;
  modeWeight: number;
  timeBonus: number;
  streakBonus: number;
  hintPenalty: number;
  total: number;
}

export function scoreScoutRound(input: ScoutScoreInput): ScoutScoreBreakdown {
  const tf = tryFactor(input.tryIndex);
  const mw = modeWeight(input.mode);
  const raw = BASE_POINTS * tf * mw;
  const timeBonus = raw * timeBonusFraction(input.elapsedMs);
  const streakBonus = raw * streakBonusFraction(input.streak);
  const hints = Math.max(0, Math.floor(Number.isFinite(input.hintsUsed ?? 0) ? (input.hintsUsed ?? 0) : 0));
  const hintPenalty = Math.min(raw, raw * hints * HINT_PENALTY_STEP);
  const total = raw + timeBonus + streakBonus - hintPenalty;
  return {
    base: BASE_POINTS,
    tryFactor: tf,
    modeWeight: mw,
    timeBonus: Math.round(timeBonus),
    streakBonus: Math.round(streakBonus),
    hintPenalty: Math.round(hintPenalty),
    total: Math.max(0, Math.round(total)),
  };
}

/** The most a round of this mode can pay out (rung 0, instant, max streak, no hints). */
export function maxScoutScore(mode: ScoutMode): number {
  return scoreScoutRound({ mode, tryIndex: 0, elapsedMs: 0, streak: 10 }).total;
}
