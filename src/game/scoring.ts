/**
 * Scoring: base 1000 × clipFactor × tryFactor, + time bonus (≤ 25%), + streak bonus (5%/streak,
 * ≤ 50%), − 15% per hint. A partial (artist-only when target = both) is worth 30% of the total.
 */

import type { ScoreBreakdown, ScoreInput } from '@/types';

export const BASE_POINTS = 1000;

/** (clip seconds, factor) — log-interpolated between points. */
export const CLIP_FACTOR_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0.1, 1],
  [0.25, 0.85],
  [0.5, 0.7],
  [1, 0.55],
  [2, 0.42],
  [4, 0.3],
  [7, 0.22],
  [10, 0.15],
  [15, 0.1],
];

export const TRY_FACTORS: readonly number[] = [1, 0.8, 0.65, 0.5, 0.4, 0.3];

export const MIN_CLIP = 0.1;
export const MAX_CLIP = 15;

export const TIME_BONUS_MAX = 0.25;
export const TIME_BONUS_FULL_MS = 3000;
export const TIME_BONUS_ZERO_MS = 20000;
export const STREAK_BONUS_STEP = 0.05;
export const STREAK_BONUS_MAX = 0.5;
export const HINT_PENALTY_STEP = 0.15;
export const PARTIAL_FACTOR = 0.3;

/** Clip-length factor, log-interpolated over the table; clamped to 0.1–15 s. */
export function clipFactor(len: number): number {
  const x = Math.min(MAX_CLIP, Math.max(MIN_CLIP, Number.isFinite(len) ? len : MIN_CLIP));
  const table = CLIP_FACTOR_TABLE;
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      const t = (Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
      return round4(y0 + t * (y1 - y0));
    }
  }
  return last[1];
}

/** Multiplier for the 0-based try index. Beyond the table it stays at the last value. */
export function tryFactor(tryIndex: number): number {
  const i = Math.max(0, Math.floor(Number.isFinite(tryIndex) ? tryIndex : 0));
  return TRY_FACTORS[Math.min(i, TRY_FACTORS.length - 1)];
}

/** 0..TIME_BONUS_MAX fraction: full up to 3 s, linear to 0 at 20 s. */
export function timeBonusFraction(elapsedMs: number): number {
  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : TIME_BONUS_ZERO_MS);
  if (t <= TIME_BONUS_FULL_MS) return TIME_BONUS_MAX;
  if (t >= TIME_BONUS_ZERO_MS) return 0;
  return TIME_BONUS_MAX * (1 - (t - TIME_BONUS_FULL_MS) / (TIME_BONUS_ZERO_MS - TIME_BONUS_FULL_MS));
}

export function streakBonusFraction(streak: number): number {
  const s = Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0));
  return Math.min(STREAK_BONUS_MAX, s * STREAK_BONUS_STEP);
}

export function scoreGuess(input: ScoreInput): ScoreBreakdown {
  const cf = clipFactor(input.clipLength);
  const tf = tryFactor(input.tryIndex);
  const raw = BASE_POINTS * cf * tf;
  const timeBonus = raw * timeBonusFraction(input.elapsedMs);
  const streakBonus = raw * streakBonusFraction(input.streak);
  const hints = Math.max(0, Math.floor(Number.isFinite(input.hintsUsed) ? input.hintsUsed : 0));
  const hintPenalty = Math.min(raw, raw * hints * HINT_PENALTY_STEP);
  let total = raw + timeBonus + streakBonus - hintPenalty;
  if (input.partial) total *= PARTIAL_FACTOR;
  return {
    base: BASE_POINTS,
    clipFactor: cf,
    tryFactor: tf,
    timeBonus: Math.round(timeBonus),
    streakBonus: Math.round(streakBonus),
    hintPenalty: Math.round(hintPenalty),
    total: Math.max(0, Math.round(total)),
  };
}

/** "12345" → "12,345". Deterministic (no locale). */
export function formatScore(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const sign = v < 0 ? '-' : '';
  const digits = String(Math.abs(v));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
