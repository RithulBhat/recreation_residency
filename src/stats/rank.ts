/**
 * XP ranks. Thresholds grow roughly quadratically, so early levels pop fast and
 * the top title is a real grind.
 */

export interface RankTier {
  /** 1-based */
  level: number;
  title: string;
  emoji: string;
  /** XP required to reach this tier */
  at: number;
}

export interface Rank {
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
  next: RankTier | null;
}

/** 14 tiers, ascending. `at` is the XP needed to hold the title. */
export const RANKS: readonly RankTier[] = [
  { level: 1, title: 'Shower Singer', emoji: '🚿', at: 0 },
  { level: 2, title: 'Radio Rookie', emoji: '📻', at: 300 },
  { level: 3, title: 'Shazam Who?', emoji: '❓', at: 800 },
  { level: 4, title: 'Hook Hunter', emoji: '🪝', at: 1600 },
  { level: 5, title: 'Chorus Crusher', emoji: '🕺', at: 2800 },
  { level: 6, title: 'Tune Tracker', emoji: '🧭', at: 4500 },
  { level: 7, title: 'Beat Detective', emoji: '🕵️', at: 6800 },
  { level: 8, title: 'Vinyl Vandal', emoji: '💿', at: 9800 },
  { level: 9, title: 'Melody Mystic', emoji: '🔮', at: 13600 },
  { level: 10, title: 'Waveform Wizard', emoji: '🌊', at: 18500 },
  { level: 11, title: 'Golden Ears', emoji: '👂', at: 24500 },
  { level: 12, title: 'Certified Songooner', emoji: '🏆', at: 32000 },
  { level: 13, title: 'Sonic Oracle', emoji: '🛸', at: 42000 },
  { level: 14, title: 'Songooner Supreme', emoji: '👑', at: 55000 },
];

export const MAX_LEVEL = RANKS.length;

/** XP needed to reach a given level (clamped to the table). */
export function xpForLevel(level: number): number {
  const i = Math.min(Math.max(1, Math.round(level)), MAX_LEVEL) - 1;
  return RANKS[i]?.at ?? 0;
}

/** The tier for a level (clamped to the table). */
export function tierForLevel(level: number): RankTier {
  const i = Math.min(Math.max(1, Math.round(level)), MAX_LEVEL) - 1;
  // RANKS is a non-empty literal, so the clamped index always hits.
  return RANKS[i];
}

/** Resolve XP into a rank + progress towards the next tier. */
export function rankFor(xp: number): Rank {
  const clamped = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let tier = tierForLevel(1);
  for (const t of RANKS) {
    if (clamped >= t.at) tier = t;
    else break;
  }
  const next: RankTier | null = tier.level < MAX_LEVEL ? RANKS[tier.level] : null;
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
export function xpToNext(xp: number): number {
  const r = rankFor(xp);
  return r.nextAt === null ? 0 : Math.max(0, r.nextAt - r.xp);
}

/** True when adding `gained` XP crossed into a new tier. */
export function leveledUp(before: number, after: number): boolean {
  return rankFor(after).level > rankFor(before).level;
}
