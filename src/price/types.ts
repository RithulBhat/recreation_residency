/**
 * Price Guess — contracts.
 *
 * Show a thing, guess what it costs, score by how close you were. The variation lives almost
 * entirely in settings: five ways to enter an answer, three ways to score, and a hint ladder
 * that costs points. Tuning those is the game, so the settings object is the real contract here
 * and everything else derives from it.
 *
 * Mirrors the shape of `@/types/game` (Songooner) and `@/scout/types` deliberately — `PlayerConfig`
 * and `DuelStyle` are reused rather than re-declared so all four games stay siblings.
 */

import type { DuelStyle, PlayerConfig } from '@/types/game';
import type { ContentItem, UnitId } from '@/arcade/types';

/** How the player enters a price. */
export type PriceInput =
  /** Currency-formatted keypad, free numeric entry. */
  | 'exact'
  /** Drag within a range derived from the answer's magnitude. */
  | 'slider'
  /** Four options at plausible distances from the truth. */
  | 'choice'
  /** Costcodle-style: N guesses, each answered "higher ↑" or "lower ↓". */
  | 'ladder';

/** How a round is turned into points. */
export type PriceScoring =
  /** Percentage-error curve. The default. */
  | 'closeness'
  /** Closest without going over; going over scores zero. */
  | 'priceIsRight'
  /** Party only: the furthest player each round is out. */
  | 'elimination';

export type PriceDifficulty = 'easy' | 'medium' | 'hard' | 'chaos';

/** Hints cost points. Ordered cheapest-to-dearest by how much they give away. */
export type PriceHint = 'category' | 'bracket' | 'firstDigit';

/** When other players' guesses become visible. */
export type GuessVisibility = 'off' | 'afterLock' | 'live';

export interface PriceTwists {
  /** Players guess in turn; each must beat the previous or call "lower". */
  bidWar: boolean;
  /** One player sees the truth and enters a fake; others score for spotting it. */
  bluffRound: boolean;
  /** Two teams; each team's guesses are averaged. */
  teamMode: boolean;
}

export interface PriceSettings {
  rounds: number;
  /** Seconds per round. `0` disables the timer. */
  timer: number;
  packIds: readonly string[];
  difficulty: PriceDifficulty;
  input: PriceInput;
  scoring: PriceScoring;
  /** Guesses allowed in `ladder` input. Ignored otherwise. */
  ladderTries: number;
  /** Relative error at or under which a `ladder` guess counts as a win. */
  ladderTolerance: number;
  /** Which hints may be bought this game. */
  hints: readonly PriceHint[];
  /** Display currency. Content is stored in its own unit; this only affects rendering. */
  currency: Extract<UnitId, 'usd' | 'gbp' | 'eur'>;
  /** Adjust historical prices to present-day money where an item supplies a year. */
  inflationAdjust: boolean;
  speedBonus: boolean;
  streakMultiplier: boolean;
  guessVisibility: GuessVisibility;
  twists: PriceTwists;
  players: readonly PlayerConfig[];
  duelStyle: DuelStyle;
  /** Set for daily runs, challenge links and seeded party races. */
  seed?: string;
}

export type PriceVerdict = 'exact' | 'close' | 'over' | 'wide' | 'timeout' | 'skipped';

export interface PriceGuess {
  playerId: string;
  value: number;
  /** Milliseconds from the round starting to the guess landing. */
  elapsedMs: number;
  /** Ladder input only: what the player was told after this guess. */
  feedback?: 'higher' | 'lower' | 'hit';
}

export interface PriceRound {
  item: ContentItem;
  guesses: readonly PriceGuess[];
  hintsUsed: readonly PriceHint[];
  verdict: PriceVerdict | null;
  /** Points awarded once the round resolves. */
  score: number;
}

export type PriceStatus = 'idle' | 'playing' | 'revealing' | 'finished';

export interface PriceState {
  status: PriceStatus;
  settings: PriceSettings;
  rounds: readonly PriceRound[];
  index: number;
  streak: number;
  bestStreak: number;
  totalScore: number;
  /** Players still in, for `elimination` scoring. */
  eliminated: readonly string[];
}

/** What a scoring call needs to know. Framework-free so it is trivially testable. */
export interface PriceScoreInput {
  guess: number;
  answer: number;
  scoring: PriceScoring;
  /** Seconds allowed; `0` when untimed. Drives the speed bonus. */
  timer: number;
  elapsedMs: number;
  speedBonus: boolean;
  streak: number;
  streakMultiplier: boolean;
  hintsUsed: number;
}

export interface PriceScoreBreakdown {
  /** Points from the closeness curve before any adjustment. */
  base: number;
  /** Added for landing within 1% or 5%. */
  accuracyBonus: number;
  /** Added for answering quickly. */
  speedBonus: number;
  /** Multiplier applied from the current streak. */
  streakFactor: number;
  /** Subtracted for hints bought this round. */
  hintPenalty: number;
  /** What the player actually scores. */
  total: number;
  verdict: PriceVerdict;
  /** Relative error as a ratio; `Infinity` when unscoreable. */
  error: number;
}
