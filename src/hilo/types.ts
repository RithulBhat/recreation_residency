/**
 * Higher or Lower — contracts.
 *
 * Item A shows its value, item B hides it, the player says which way it goes, and B becomes the
 * new A. Everything else is settings: five session shapes, four difficulty bands, three
 * power-ups and a streak curve.
 *
 * `PlayerConfig` / `DuelStyle` are reused from `@/types/game` rather than re-declared, so all
 * four games on the site share one notion of who is playing.
 */

import type { DuelStyle, PlayerConfig } from '@/types/game';
import type { ContentItem } from '@/arcade/types';
import type { HiloDifficulty } from '@/arcade/pairing';

export type { HiloDifficulty };

/** How a whole run is shaped. */
export type HiloFormat =
  /** One life. The classic. */
  | 'classic'
  /** 1–5 lives. */
  | 'lives'
  /** As many as possible before the clock runs out. */
  | 'timed'
  /** A fixed number of rounds, points per correct answer. */
  | 'rounds'
  /** Two players, first mistake loses. */
  | 'suddenDeath';

export type HiloPowerUp = 'skip' | 'peek' | 'doubleDown';

export type StreakCurve = 'off' | 'gentle' | 'steep';

export interface HiloSettings {
  format: HiloFormat;
  packIds: readonly string[];
  difficulty: HiloDifficulty;
  /** Lives in `lives` format. */
  lives: number;
  /** Seconds in `timed` format. */
  duration: number;
  /** Rounds in `rounds` format. */
  rounds: number;
  /** Seconds per pick. `0` disables. */
  timer: number;
  /** Show A's exact figure, or a rounded one. */
  exactValues: boolean;
  /** Offer a third "too close to call" button when values are within `sameTolerance`. */
  allowSame: boolean;
  sameTolerance: number;
  powerUps: readonly HiloPowerUp[];
  streakCurve: StreakCurve;
  players: readonly PlayerConfig[];
  duelStyle: DuelStyle;
  seed?: string;
}

export type HiloPick = 'higher' | 'lower' | 'same';
export type HiloOutcome = 'correct' | 'wrong' | 'skipped' | 'timeout';

export interface HiloRound {
  from: ContentItem;
  to: ContentItem;
  /** How far the pairing had to relax to build this round; `0` means the band was honoured. */
  degraded: number;
  pick: HiloPick | null;
  outcome: HiloOutcome | null;
  /** True when the player spent Double Down on this round. */
  doubled: boolean;
  /** True when Peek was spent here. */
  peeked: boolean;
  score: number;
  elapsedMs: number;
}

export type HiloStatus = 'idle' | 'playing' | 'revealing' | 'finished';

export interface HiloState {
  status: HiloStatus;
  settings: HiloSettings;
  /** The whole chain, planned from the seed before play starts. */
  chain: readonly ContentItem[];
  /** Degradation per link, index-aligned with `chain` (index 0 is always 0). */
  degradations: readonly number[];
  rounds: readonly HiloRound[];
  /** Which link of the chain is live: round `index` compares chain[index] to chain[index+1]. */
  index: number;
  livesLeft: number;
  streak: number;
  bestStreak: number;
  totalScore: number;
  /** Power-ups not yet spent. */
  powerUpsLeft: readonly HiloPowerUp[];
  /** Double Down is armed: this round scores double but a miss costs two lives. */
  pendingDouble: boolean;
  /** Peek was spent on this round — the UI may show whether the gap is big or small. */
  peeking: boolean;
  /** Milliseconds left in `timed` format. */
  msLeft: number;
  /** Set when the run ended because the pool could not supply another pair. */
  exhausted: boolean;
}
