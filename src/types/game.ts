import type { Difficulty, Track } from './catalog';

/**
 * Game contracts — settings, state, and the action vocabulary of the engine.
 * The engine (src/game) is a pure reducer; the store (src/store) wraps it.
 */

export type GameMode =
  | 'classic' // Heardle-style: escalating clip lengths per try
  | 'fixed' // one clip length (0.1s–10s) for every try
  | 'blitz' // timed: as many songs as possible
  | 'survival' // lives; clip shrinks as you go
  | 'duel' // 2 players, same device (buzzer or turns) — online duel reuses this mode
  | 'party'; // 2–8 players, pass-and-play

export type ClipMode = 'fixed' | 'escalating';

/** Where in the 30s preview the clip starts. */
export type StartPosition =
  | 'start' // 0s
  | 'random' // anywhere that fits
  | 'middle' // 10–20s in (chorus-ish)
  | 'end'; // last 10s

/** What must be correct to win the round. */
export type GuessTarget = 'title' | 'artist' | 'both';

export type Speed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

export interface Modifiers {
  speed: Speed;
  reverse: boolean;
  lofi: boolean;
  bitcrush: boolean;
  /** semitones, -12..12 (implemented via detune; changes speed too) */
  pitch: number;
}

export interface PlayerConfig {
  id: string;
  name: string;
  emoji: string;
  /** hex */
  color: string;
}

export type DuelStyle = 'buzzer' | 'turns';

export interface GameSettings {
  mode: GameMode;
  /** One or more packs; tracks are mixed. */
  packIds: string[];
  difficulty: Difficulty;
  clipMode: ClipMode;
  /** Seconds, 0.1–10. Used when clipMode === 'fixed'. */
  clipLength: number;
  /** Escalating clip lengths, one per try. e.g. [0.1, 0.3, 1, 2, 4, 7, 10] */
  stages: number[];
  /** Attempts per song (1–6). For escalating mode this equals stages.length. */
  tries: number;
  /** Songs per game. 0 = endless. */
  rounds: number;
  startPosition: StartPosition;
  /** Replay the same offset on each try (true) or a new random offset per try (false). */
  sameStartEachTry: boolean;
  guessTarget: GuessTarget;
  hintsEnabled: boolean;
  /** Seconds per round, 0 = off. */
  roundTimer: number;
  modifiers: Modifiers;
  allowSkip: boolean;
  /** Hide explicit tracks. */
  explicitFilter: boolean;
  /** Blitz: total seconds. */
  blitzDuration: number;
  /** Survival: starting lives. */
  lives: number;
  /** Duel / party players. */
  players: PlayerConfig[];
  duelStyle: DuelStyle;
  /** Voice host narration on/off. */
  voiceHost: boolean;
  /** Deterministic run (daily / challenge). Omit for random. */
  seed?: string;
  /** Marks a daily run (YYYY-MM-DD). */
  daily?: string;
}

export type Verdict = 'correct' | 'partial' | 'wrong' | 'skipped' | 'timeout';

export interface Guess {
  text: string;
  verdict: Verdict;
  tryIndex: number;
  /** clip length the player had heard when guessing */
  clipLength: number;
  at: number;
  playerId?: string;
  matchedTitle: boolean;
  matchedArtist: boolean;
}

export type HintKind = 'year' | 'artistInitials' | 'coverPeek' | 'firstLetter' | 'album';

export type RoundStatus = 'playing' | 'won' | 'lost' | 'skipped';

export interface Round {
  index: number;
  track: Track;
  /** seconds into the preview where the clip starts (for the current try) */
  startOffset: number;
  /** 0-based current attempt */
  tryIndex: number;
  guesses: Guess[];
  hintsUsed: HintKind[];
  status: RoundStatus;
  /** points awarded for this round */
  score: number;
  startedAt: number;
  endedAt?: number;
  /** how many times the clip was played on the current try */
  playsThisTry: number;
  /** duel/party: whose turn (or who buzzed) */
  activePlayerId?: string;
  /** duel buzzer: players who already failed this round */
  lockedOutPlayerIds: string[];
  /** id of the player who won the round, if any */
  winnerPlayerId?: string;
}

export interface PlayerState extends PlayerConfig {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  /** survival */
  lives?: number;
}

export type GameStatus = 'idle' | 'loading' | 'playing' | 'round-over' | 'finished';

export interface GameState {
  id: string;
  settings: GameSettings;
  status: GameStatus;
  rounds: Round[];
  currentRound: number;
  players: PlayerState[];
  activePlayerIndex: number;
  /** upcoming tracks, pre-shuffled (deterministic when seeded) */
  queue: Track[];
  startedAt?: number;
  finishedAt?: number;
  /** blitz: epoch ms when time is up */
  blitzEndsAt?: number;
  totalScore: number;
  streak: number;
  bestStreak: number;
  /** why the game ended */
  endReason?: 'rounds' | 'time' | 'lives' | 'quit' | 'queue-empty';
}

export type GameAction =
  | { type: 'start'; settings: GameSettings; tracks: Track[]; now: number }
  | { type: 'play'; now: number } // clip was played (counts plays)
  | { type: 'guess'; text: string; now: number; playerId?: string }
  | { type: 'skip'; now: number } // give up this try → next try (or lose round)
  | { type: 'giveUp'; now: number } // reveal answer, lose round
  | { type: 'hint'; kind: HintKind; now: number }
  | { type: 'timeout'; now: number }
  | { type: 'buzz'; playerId: string; now: number }
  | { type: 'next'; now: number } // advance to next round
  | { type: 'tick'; now: number } // blitz clock
  | { type: 'quit'; now: number };

export interface MatchResult {
  verdict: Extract<Verdict, 'correct' | 'partial' | 'wrong'>;
  matchedTitle: boolean;
  matchedArtist: boolean;
  /** 0..1 */
  confidence: number;
}

export interface ScoreInput {
  clipLength: number;
  tryIndex: number;
  tries: number;
  /** ms since the first play on this round */
  elapsedMs: number;
  hintsUsed: number;
  /** consecutive correct before this one */
  streak: number;
  partial?: boolean;
}

export interface ScoreBreakdown {
  base: number;
  clipFactor: number;
  tryFactor: number;
  timeBonus: number;
  streakBonus: number;
  hintPenalty: number;
  total: number;
}

/** Encoded in challenge links (#/c/<code>). Keep keys short. */
export interface ChallengePayload {
  v: 1;
  seed: string;
  settings: Partial<GameSettings> & Pick<GameSettings, 'packIds' | 'mode'>;
  /** challenger's result, optional */
  by?: string;
  score?: number;
  /** exact tracks played (Deezer ids), so the friend gets the same songs regardless of pool changes */
  trackIds?: number[];
}
