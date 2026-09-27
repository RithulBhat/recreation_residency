/**
 * Highlight Scout progression — the rank ladder and the XP a run pays out.
 *
 * `ScoutRank` / `ScoutRankTier` are STRUCTURALLY IDENTICAL to `Rank` / `RankTier` in
 * `src/stats/rank.ts`, and the XP thresholds are the same 14-step curve, so a single rank component
 * renders either game and a Songooner level 9 means the same amount of play as a Scout level 9.
 * Only the titles change: football's ladder instead of music's, climbing from the bottom of the
 * roster (Waterboy) to the top of the scouting profession (Gold Jacket).
 *
 * ## XP
 *   xp = score/10 + 20·correct + 3·bestStreak + formatBonus + tierBonus
 *
 * `formatBonus` prices the session format (a Gauntlet or a Survival run asks more of you than a
 * ten-round Standard), and `tierBonus` pays for WHO you named — naming a deep cut is worth five
 * household names, because that is the actual skill Scout measures. Both are additive, so XP is
 * monotone in score and in correct count: a better run never earns less.
 */

import {
  SCOUT_TIER_HARDNESS,
  asScoutFormat,
  summarizeScoutRun,
  type ScoutFameTier,
  type ScoutRunExtras,
  type ScoutRunRecord,
  type ScoutRunSummary,
} from './scoutStats';
import type { ScoutFormat, ScoutState } from './types';

/* --------------------------------------------------------------------------------- the ladder */

export interface ScoutRankTier {
  /** 1-based */
  level: number;
  title: string;
  emoji: string;
  /** XP required to hold this title */
  at: number;
}

export interface ScoutRank {
  level: number;
  title: string;
  emoji: string;
  /** the player's XP, clamped to >= 0 */
  xp: number;
  /** XP threshold of the current tier */
  threshold: number;
  /** XP needed for the next tier — null at max level */
  nextAt: number | null;
  /** 0..1 progress through the current tier (1 at max level) */
  progress: number;
  /** the tier after this one, if any */
  next: ScoutRankTier | null;
}

/**
 * 14 tiers, ascending — the bottom of the roster to the top of the scouting profession.
 * Thresholds match `RANKS` in `src/stats/rank.ts` on purpose (see the module note).
 */
export const SCOUT_RANKS: readonly ScoutRankTier[] = [
  { level: 1, title: 'Waterboy', emoji: '🧴', at: 0 },
  { level: 2, title: 'Practice Squad', emoji: '🎽', at: 300 },
  { level: 3, title: 'Special Teamer', emoji: '🦶', at: 800 },
  { level: 4, title: 'Rotational', emoji: '🔄', at: 1600 },
  { level: 5, title: 'Nickel Back', emoji: '🪙', at: 2800 },
  { level: 6, title: 'Starter', emoji: '🏈', at: 4500 },
  { level: 7, title: 'Team Captain', emoji: '🧢', at: 6800 },
  { level: 8, title: 'Pro Bowler', emoji: '🌺', at: 9800 },
  { level: 9, title: 'All-Pro', emoji: '🥇', at: 13600 },
  { level: 10, title: 'Franchise Cornerstone', emoji: '🧱', at: 18500 },
  { level: 11, title: 'Area Scout', emoji: '🔭', at: 24500 },
  { level: 12, title: 'General Manager', emoji: '🧑‍💼', at: 32000 },
  { level: 13, title: 'Hall of Fame Scout', emoji: '🏛️', at: 42000 },
  { level: 14, title: 'Gold Jacket', emoji: '🧥', at: 55000 },
];

export const SCOUT_MAX_LEVEL = SCOUT_RANKS.length;

/** XP needed to reach a given level (clamped to the table). */
export function scoutXpForLevel(level: number): number {
  const i = Math.min(Math.max(1, Math.round(level)), SCOUT_MAX_LEVEL) - 1;
  return SCOUT_RANKS[i]?.at ?? 0;
}

/** The tier for a level (clamped to the table). */
export function scoutTierForLevel(level: number): ScoutRankTier {
  const i = Math.min(Math.max(1, Math.round(level)), SCOUT_MAX_LEVEL) - 1;
  // SCOUT_RANKS is a non-empty literal, so the clamped index always hits.
  return SCOUT_RANKS[i];
}

/** Resolve XP into a rank + progress towards the next title. */
export function scoutRankFor(xp: number): ScoutRank {
  const clamped = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let tier = scoutTierForLevel(1);
  for (const t of SCOUT_RANKS) {
    if (clamped >= t.at) tier = t;
    else break;
  }
  const next: ScoutRankTier | null = tier.level < SCOUT_MAX_LEVEL ? SCOUT_RANKS[tier.level] : null;
  const span = next ? next.at - tier.at : 0;
  const progress = next && span > 0 ? Math.min(1, Math.max(0, (clamped - tier.at) / span)) : 1;
  return {
    level: tier.level,
    title: tier.title,
    emoji: tier.emoji,
    xp: clamped,
    threshold: tier.at,
    nextAt: next === null ? null : next.at,
    progress,
    next,
  };
}

/** XP still needed for the next title (0 at max level). */
export function scoutXpToNext(xp: number): number {
  const r = scoutRankFor(xp);
  return r.nextAt === null ? 0 : Math.max(0, r.nextAt - r.xp);
}

/** True when adding XP crossed into a new title. */
export function scoutLeveledUp(before: number, after: number): boolean {
  return scoutRankFor(after).level > scoutRankFor(before).level;
}

/* ------------------------------------------------------------------------------------ xp maths */

/** Flat XP for finishing a run in each format — the harder the shape, the bigger the purse. */
export const SCOUT_FORMAT_XP_BONUS: Readonly<Record<ScoutFormat, number>> = {
  standard: 10,
  blitz: 25,
  survival: 25,
  gauntlet: 35,
  duel: 30,
  party: 15,
};

/** XP paid per correct call, by who you named. Naming a deep cut is the whole game. */
export const SCOUT_TIER_XP: Readonly<Record<ScoutFameTier, number>> = {
  star: 0,
  starter: 3,
  rotation: 7,
  deepCut: 15,
};

/** Format bonus, defaulting to the standard purse for anything unrecognised. */
export function scoutFormatXpBonus(format: ScoutFormat): number {
  return SCOUT_FORMAT_XP_BONUS[asScoutFormat(format)] ?? SCOUT_FORMAT_XP_BONUS.standard;
}

/** Sum of the tier bonuses for the rounds this run actually solved. */
export function scoutTierXp(record: ScoutRunSummary): number {
  let xp = 0;
  for (const stat of record.roundStats) {
    if (stat.won) xp += SCOUT_TIER_XP[stat.tier];
  }
  return xp;
}

/**
 * XP for one run: `score/10 + 20·correct + 3·bestStreak + formatBonus + tierBonus`.
 * Never negative, always an integer.
 */
export function xpForScoutRun(record: ScoutRunSummary): number {
  const base = record.score / 10 + 20 * record.correct + 3 * record.bestStreak;
  const total = base + scoutFormatXpBonus(record.format) + scoutTierXp(record);
  return Math.max(0, Math.round(Number.isFinite(total) ? total : 0));
}

/**
 * Condense a finished run and price its XP — the one call the store needs.
 * Null when the run never finished (or has no id), exactly like `summarizeScoutRun`.
 */
export function finalizeScoutRun(state: ScoutState, extras: ScoutRunExtras = {}): ScoutRunRecord | null {
  const summary = summarizeScoutRun(state, extras);
  if (!summary) return null;
  return { ...summary, xp: xpForScoutRun(summary) };
}

/** Hardness of the tier a call was made against — re-exported so the UI can sort by it. */
export function scoutTierHardness(tier: ScoutFameTier): number {
  return SCOUT_TIER_HARDNESS[tier];
}
