/**
 * Highlight Scout — shared contracts.
 *
 * Data is BAKED AT BUILD TIME by `scripts/sync-nfl.mjs` into `src/data/nfl/*.json`
 * (ESPN's JSON APIs send no CORS headers, so the browser never calls them). Images are
 * loaded at runtime from `a.espncdn.com`, which does send `Access-Control-Allow-Origin: *`
 * — so headshots and logos can be drawn to a canvas and pixel-manipulated.
 *
 * ## Puzzle types vs session formats
 * {@link ScoutMode} is the PUZZLE TYPE (silhouette, faceZoom, …): what one round shows you.
 * {@link ScoutFormat} is the SESSION FORMAT (standard, blitz, survival, gauntlet, duel, party):
 * how the run as a whole is shaped. A session has ONE format and one or more puzzle types.
 * The format vocabulary deliberately mirrors Songooner's `GameMode`, and `PlayerConfig` /
 * `DuelStyle` are REUSED from `@/types/game` rather than re-declared, so the two games are siblings.
 */

import type { DuelStyle, PlayerConfig } from '@/types/game';

export type Conference = 'AFC' | 'NFC';
export type DivisionName = 'North' | 'South' | 'East' | 'West';

/** Coarse grouping used for packs, filters and clue text. */
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST';

export interface NflTeam {
  /** ESPN team id, e.g. '12'. */
  id: string;
  /** 'KC' */
  abbr: string;
  /** 'Chiefs' */
  name: string;
  /** 'Kansas City' */
  location: string;
  /** 'Kansas City Chiefs' */
  displayName: string;
  /** '#e31837' */
  color: string;
  altColor: string;
  /** 500px PNG on the CORS-enabled CDN. */
  logo: string;
  conference: Conference;
  division: DivisionName;
  /** 'Arrowhead Stadium' */
  venue: string;
  /** Franchise founding year. */
  founded: number;
  /** Seasons won, e.g. [1969, 2019, 2022, 2023]. */
  superBowls: number[];
  /** Accepted alternate guesses, lowercase: ['chiefs', 'kc', 'kansas city']. */
  aliases: string[];
  /** Team abbreviations of traditional rivals. */
  rivals: string[];
  /** Notable alumni, for clues. */
  legends: string[];
  /** Curated trivia lines, ordered HARDEST (most obscure) first. */
  facts: string[];
}

export interface NflDraft {
  year: number;
  round: number;
  pick: number;
}

export interface NflPlayer {
  /** ESPN athlete id. */
  id: string;
  /** 'Patrick Mahomes' */
  name: string;
  first: string;
  last: string;
  teamId: string;
  /** Raw ESPN abbreviation: 'QB', 'CB', 'PK', 'G'… */
  pos: string;
  group: PositionGroup;
  jersey?: string;
  heightIn?: number;
  weightLb?: number;
  age?: number;
  /** Years of NFL experience. */
  exp?: number;
  college?: string;
  draft?: NflDraft;
  /** Transparent-background PNG, 600px, CORS enabled. */
  headshot: string;
  /**
   * Notability 0–100, derived from season statistical leaderboards, draft capital,
   * position weighting and experience. Drives difficulty tiers.
   */
  fame: number;
  /** Extra accepted guesses, lowercase: ['cmc', 'run cmc']. */
  aliases?: string[];
}

/** A real scoring/explosive play with player names redacted. */
export interface HighlightPlay {
  id: string;
  season: number;
  week: number;
  gameId: string;
  /** Raw ESPN play text. */
  text: string;
  /** Same text with every resolved player name replaced by `[?]`. */
  redacted: string;
  /** The player the round asks about. */
  playerId: string;
  /** Other players named in the play (also redacted). */
  otherPlayerIds: string[];
  /** Team that ran the play. */
  teamId: string;
  oppTeamId: string;
  quarter: number;
  /** '8:28' */
  clock: string;
  /** ESPN play type, e.g. 'Passing Touchdown'. */
  kind: string;
}

/** A single season stat line, used by the statLine mode. */
export interface StatLine {
  playerId: string;
  season: number;
  /** Ordered label/value pairs: [['Pass yds', '5,250'], ['TD', '50']]. */
  stats: Array<[string, string]>;
}

export interface NflDataset {
  /** ISO date the sync ran. */
  syncedAt: string;
  season: number;
  teams: NflTeam[];
  players: NflPlayer[];
}

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------

export type ScoutMode =
  | 'silhouette' // blacked-out headshot, revealed progressively
  | 'faceZoom' // extreme crop of the face, zooming out each try
  | 'highlight' // a real play with names redacted
  | 'teamTrivia' // clue ladder about a franchise
  | 'statLine' // a season stat line
  | 'careerPath' // draft → college → team history
  | 'logoZoom'; // zoomed team logo

/**
 * The SESSION FORMAT — the shape of the whole run, orthogonal to {@link ScoutMode}.
 * Mirrors Songooner's `GameMode` (`classic`/`fixed` collapse into `standard`, since a Scout round's
 * ladder is the clue ladder rather than a clip length).
 */
export type ScoutFormat =
  | 'standard' // N rounds, T tries each, optional round timer. The default.
  | 'blitz' // one clock, one fixed rung per subject, a miss costs seconds
  | 'survival' // lives; the tier escalates and the ladder shortens as you go
  | 'gauntlet' // one subject from each of the 32 franchises, seeded order
  | 'duel' // 2 players, one device (buzzer keys A / L, or turns)
  | 'party'; // 2–8 players, pass-and-play with a handover between rounds

/** What the player is naming. */
export type SubjectKind = 'player' | 'team';

export type ScoutDifficulty = 'any' | 'star' | 'starter' | 'rotation' | 'deepCut';

/** A curated selection of subjects — the Scout equivalent of a Songooner pack. */
export interface ScoutPack {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  accent: string;
  kind: SubjectKind;
  tags: string[];
  /** Explicit subject ids, or a rule evaluated against the dataset. */
  filter: ScoutPackFilter;
  approxSize?: number;
  featured?: boolean;
}

export interface ScoutPackFilter {
  teamIds?: string[];
  conferences?: Conference[];
  divisions?: DivisionName[];
  groups?: PositionGroup[];
  positions?: string[];
  /** Inclusive fame window. */
  minFame?: number;
  maxFame?: number;
  /** Rookie/veteran windows. */
  maxExp?: number;
  minExp?: number;
  /** Explicit ids always included. */
  ids?: string[];
}

/** One rung of the reveal ladder for a round. */
export interface ScoutStage {
  /**
   * How much of the visual is shown, 0 → 1.
   * silhouette: 0 = pure black shape, 1 = full photo.
   * faceZoom:   0 = maximum zoom on one feature, 1 = full headshot.
   * logoZoom:   same as faceZoom.
   * Text modes ignore this.
   */
  visual: number;
  /** Clues unlocked at this rung, newest last. */
  clues: ScoutClue[];
}

export interface ScoutClue {
  kind: ScoutClueKind;
  /** 'Position' */
  label: string;
  /** 'Quarterback' */
  value: string;
}

export type ScoutClueKind =
  | 'position'
  | 'team'
  | 'conference'
  | 'division'
  | 'jersey'
  | 'experience'
  | 'draft'
  | 'college'
  | 'physical'
  | 'initials'
  | 'stat'
  | 'play'
  | 'fact'
  | 'venue'
  | 'superBowls'
  | 'founded'
  | 'rival'
  | 'legend'
  | 'colors';

/** The thing being guessed, resolved to everything a round needs to render. */
export interface ScoutSubject {
  kind: SubjectKind;
  id: string;
  /** Canonical answer. */
  name: string;
  /** Every accepted spelling, lowercased and normalized by the matcher. */
  accepted: string[];
  /** Headshot (player) or logo (team). */
  image: string;
  team?: NflTeam;
  player?: NflPlayer;
  /** Present for highlight rounds. */
  play?: HighlightPlay;
  /** Present for statLine rounds. */
  statLine?: StatLine;
  /** Difficulty tier this subject landed in. */
  tier: ScoutDifficulty;
}

export interface ScoutSettings {
  mode: ScoutMode;
  packIds: string[];
  difficulty: ScoutDifficulty;
  /** Attempts per subject, 1–6. Also the number of reveal rungs. */
  tries: number;
  /** Subjects per game. 0 = endless. */
  rounds: number;
  /** Seconds per round, 0 = off. */
  roundTimer: number;
  hintsEnabled: boolean;
  /** Mix several modes in one run. */
  mixModes: boolean;
  /** Deterministic run (daily / challenge). */
  seed?: string;
  /** Marks a daily run (YYYY-MM-DD). */
  daily?: string;

  // -------------------------------------------------------------------------------------------
  // Session format (ADDED). All optional so a settings object persisted before formats existed
  // still parses; `normalizeScoutSettings` always fills them in, and `@/scout/formats` exports a
  // total resolver for each (`scoutFormat`, `scoutLives`, …) so engine code never sees undefined.
  // -------------------------------------------------------------------------------------------

  /** Session format. Absent → `'standard'`. */
  format?: ScoutFormat;
  /** blitz: total seconds on the clock (30–300). */
  blitzDuration?: number;
  /** survival: starting lives (1–5). */
  lives?: number;
  /** duel (exactly 2) / party (2–8) roster. Empty for the solo formats. */
  players?: PlayerConfig[];
  /** duel: buzz-in or alternating turns. */
  duelStyle?: DuelStyle;
}

/**
 * One player's running tally (ADDED). Extends the shared {@link PlayerConfig} exactly as
 * Songooner's `PlayerState` does, so a scoreboard component can render either game.
 */
export interface ScoutPlayerState extends PlayerConfig {
  score: number;
  streak: number;
  bestStreak: number;
  /** Rounds this player won. */
  correct: number;
  /** survival only. */
  lives?: number;
}

export type ScoutVerdict = 'correct' | 'close' | 'wrong' | 'skipped' | 'timeout';

export interface ScoutGuess {
  text: string;
  verdict: ScoutVerdict;
  tryIndex: number;
  at: number;
  /** ADDED — duel / party: who made this guess. Absent in the solo formats. */
  playerId?: string;
}

export type ScoutRoundStatus = 'playing' | 'won' | 'lost' | 'skipped';

export interface ScoutRound {
  index: number;
  mode: ScoutMode;
  subject: ScoutSubject;
  stages: ScoutStage[];
  tryIndex: number;
  guesses: ScoutGuess[];
  status: ScoutRoundStatus;
  score: number;
  startedAt: number;
  endedAt?: number;

  // --- multiplayer (ADDED; absent in the solo formats) ---------------------------------------
  /** duel / party: whose turn it is, or who has buzzed in. */
  activePlayerId?: string;
  /** duel buzzer: players who already buzzed and missed this round. */
  lockedOutPlayerIds?: string[];
  /** Who won the round, when anyone did. */
  winnerPlayerId?: string;
}

export type ScoutStatus = 'idle' | 'loading' | 'playing' | 'round-over' | 'finished';

export interface ScoutState {
  id: string;
  settings: ScoutSettings;
  status: ScoutStatus;
  rounds: ScoutRound[];
  currentRound: number;
  /** Pre-shuffled upcoming subjects (deterministic when seeded). */
  queue: ScoutSubject[];
  startedAt?: number;
  finishedAt?: number;
  totalScore: number;
  streak: number;
  bestStreak: number;
  /**
   * Why the run ended. WIDENED (no member removed) for the session formats:
   * 'time' = the blitz clock, 'lives' = survival ran out, 'gauntlet' = all 32 franchises played.
   */
  endReason?: 'rounds' | 'time' | 'lives' | 'gauntlet' | 'quit' | 'queue-empty';

  // -------------------------------------------------------------------------------------------
  // Session-format state (ADDED). Always populated by 'start'; absent only on a state persisted
  // before formats existed, which every reader tolerates (`@/scout/selectors` defaults them).
  // -------------------------------------------------------------------------------------------

  /** One entry for the implicit solo player, or one per configured player in duel / party. */
  players?: ScoutPlayerState[];
  /** Index into `players` whose turn it is (rotated by 'next' in party / duel-turns). */
  activePlayerIndex?: number;
  /** blitz: epoch ms at which the clock expires. Shrinks by the miss penalty. */
  blitzEndsAt?: number;
  /** gauntlet: the franchise ids this run will visit, in play order. */
  gauntletTeamIds?: string[];
  /** gauntlet: franchise ids already cleared (their round was won). */
  clearedTeamIds?: string[];
}

export type ScoutAction =
  | { type: 'start'; settings: ScoutSettings; subjects: ScoutSubject[]; now: number }
  | { type: 'guess'; text: string; now: number; playerId?: string }
  | { type: 'skip'; now: number }
  | { type: 'giveUp'; now: number }
  | { type: 'timeout'; now: number }
  | { type: 'next'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'quit'; now: number }
  /** ADDED — duel buzzer: claim the round. Ignored outside a buzzer duel. */
  | { type: 'buzz'; playerId: string; now: number };

export interface ScoutMatchResult {
  verdict: Extract<ScoutVerdict, 'correct' | 'close' | 'wrong'>;
  /** 0..1 */
  confidence: number;
}
