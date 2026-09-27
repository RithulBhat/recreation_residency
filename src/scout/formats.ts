/**
 * Highlight Scout SESSION FORMATS — the second axis of the game.
 *
 * `ScoutMode` is the puzzle type (silhouette, faceZoom, highlight, teamTrivia, statLine,
 * careerPath, logoZoom): what one round shows you. {@link ScoutFormat} is the session format:
 * how the whole run is shaped. A session picks ONE format and one or more puzzle types, so
 * "blitz + faceZoom" and "survival + everything" are different games built from the same rounds.
 *
 * The vocabulary mirrors Songooner's `GameMode` on purpose — `blitz`, `survival`, `duel` and
 * `party` behave the same way in both games, and `PlayerConfig` / `DuelStyle` / `DEFAULT_PLAYERS`
 * are reused from Songooner rather than re-declared. `classic` and `fixed` collapse into
 * `standard`, because a Scout round's ladder is the CLUE ladder, not a clip length.
 *
 * ## What each format changes
 *   standard  nothing — the pre-format engine, kept as the default so nothing regresses.
 *   blitz     one run-long clock; every subject opens at ONE fixed rung ({@link BLITZ_RUNG} of a
 *             {@link BLITZ_LADDER_RUNGS}-rung ladder, so roughly half the reveal and half the
 *             clues are free); a miss or a skip costs {@link BLITZ_MISS_PENALTY_MS}; a correct
 *             answer opens the next subject immediately. Rounds never pause on `round-over`.
 *   survival  lives instead of a round count, and the league gets harder: the target tier walks
 *             `star → starter → rotation → deepCut` every {@link SURVIVAL_TIER_STEP} correct
 *             answers (see {@link survivalTierFor}) while the ladder loses a rung each step
 *             (see {@link survivalTriesFor}), down to {@link SURVIVAL_MIN_TRIES}.
 *   gauntlet  exactly one subject per franchise, seeded order, `rounds` ignored; the run ends when
 *             the board is clear.
 *   duel      two players, one device. `buzzer`: nobody may guess until someone buzzes, and a
 *             wrong buzz locks that player out of the round (both locked → round lost).
 *             `turns`: the two alternate round by round.
 *   party     2–8 players alternating, per-player scores, a handover card between rounds.
 *
 * Everything here is pure data or a pure function. The reducer lives in `./engine`.
 */

import { DEFAULT_PLAYERS } from '@/game/presets';
import type { DuelStyle, PlayerConfig } from '@/types/game';
import type { ScoutDifficulty, ScoutFormat, ScoutSettings, ScoutSubject } from './types';

// ---------------------------------------------------------------------------------------------
// Ids, limits and rule constants
// ---------------------------------------------------------------------------------------------

export const SCOUT_FORMAT_IDS: readonly ScoutFormat[] = [
  'standard',
  'blitz',
  'survival',
  'gauntlet',
  'duel',
  'party',
];

export const DEFAULT_SCOUT_FORMAT: ScoutFormat = 'standard';

export const SCOUT_DUEL_STYLES: readonly DuelStyle[] = ['buzzer', 'turns'];

export const SCOUT_FORMAT_LIMITS = {
  /** survival starting lives. */
  lives: { min: 1, max: 5 },
  /** blitz clock, seconds. */
  blitzDuration: { min: 30, max: 300 },
  /** party roster (duel is always exactly 2). */
  players: { min: 2, max: 8 },
} as const;

export const DEFAULT_SCOUT_LIVES = 3;
export const DEFAULT_SCOUT_BLITZ_DURATION = 90;
export const DEFAULT_SCOUT_DUEL_STYLE: DuelStyle = 'buzzer';

/** A miss or a skip in blitz costs this much clock. */
export const BLITZ_MISS_PENALTY_MS = 5_000;

/**
 * Blitz builds a ladder this deep and freezes every round on {@link BLITZ_RUNG}, so the reveal is
 * identical for every subject and `settings.tries` plays no part. Rung 2 of 5 is about half the
 * visual and half the clues — hard enough to be worth points, fast enough for a 90-second clock.
 */
export const BLITZ_LADDER_RUNGS = 5;
export const BLITZ_RUNG = 2;

/** All 32 franchises. The gauntlet plays one subject from each. */
export const GAUNTLET_SIZE = 32;

/** Survival's escalation: the tier steps down every `SURVIVAL_TIER_STEP` correct answers. */
export const SURVIVAL_TIERS: readonly ScoutDifficulty[] = ['star', 'starter', 'rotation', 'deepCut'];
export const SURVIVAL_TIER_STEP = 3;
/** The ladder loses a rung per tier, but never drops below this. */
export const SURVIVAL_MIN_TRIES = 2;

/** The implicit identity for the solo formats — Songooner calls its equivalent `SOLO_PLAYER`. */
export const SOLO_SCOUT_PLAYER: PlayerConfig = { id: 'you', name: 'You', emoji: '🏈', color: '#a855f7' };

/** Duel / party roster defaults, shared with Songooner so the two scoreboards look alike. */
export const DEFAULT_SCOUT_PLAYERS: readonly PlayerConfig[] = DEFAULT_PLAYERS;

/** Buzz-in keys, by player index. Player 1 gets A, player 2 gets L (Songooner's mapping). */
export const DUEL_BUZZ_KEYS: readonly string[] = ['a', 'l'];

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

/** Every `ScoutSettings` field a format actually reads — the setup screen hides the rest. */
export type ScoutSettingKey =
  | 'mode'
  | 'mixModes'
  | 'packIds'
  | 'difficulty'
  | 'tries'
  | 'rounds'
  | 'roundTimer'
  | 'hintsEnabled'
  | 'blitzDuration'
  | 'lives'
  | 'players'
  | 'duelStyle';

export interface ScoutFormatInfo {
  id: ScoutFormat;
  name: string;
  emoji: string;
  /** Two lines at most — the card copy. */
  blurb: string;
  /** One line: how it actually plays. */
  how: string;
  /** What finishes a run, for the setup screen and the results header. */
  ends: string;
  /** Which settings the format uses. Anything absent is ignored (and should not be shown). */
  uses: readonly ScoutSettingKey[];
  /** How many humans it seats. */
  seats: 'solo' | 'pair' | 'group';
}

export const SCOUT_FORMATS: readonly ScoutFormatInfo[] = [
  {
    id: 'standard',
    name: 'Standard',
    emoji: '🎯',
    blurb: 'The full clue ladder. Pick the rounds, pick the tries.',
    how: 'Every miss lifts one more rung until you name it or run out of tries.',
    ends: 'After the round count — or when the pool runs dry.',
    uses: ['mode', 'mixModes', 'packIds', 'difficulty', 'tries', 'rounds', 'roundTimer', 'hintsEnabled'],
    seats: 'solo',
  },
  {
    id: 'blitz',
    name: 'Blitz',
    emoji: '⏱️',
    blurb: 'Ninety seconds on the clock. Name as many as you can.',
    how: 'One fixed reveal per subject; a miss or a skip burns 5 seconds.',
    ends: 'When the clock hits zero.',
    uses: ['mode', 'mixModes', 'packIds', 'difficulty', 'blitzDuration', 'hintsEnabled'],
    seats: 'solo',
  },
  {
    id: 'survival',
    name: 'Survival',
    emoji: '💀',
    blurb: 'Three lives, and the league gets harder every time you are right.',
    how: 'Starts on household names, walks down to deep cuts, and drops a rung each step.',
    ends: 'At zero lives. How far can you get?',
    uses: ['mode', 'mixModes', 'packIds', 'tries', 'lives', 'roundTimer', 'hintsEnabled'],
    seats: 'solo',
  },
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    emoji: '🗺️',
    blurb: 'All 32 franchises, one subject each, shuffled.',
    how: 'Clear a club per round and watch the board fill in.',
    ends: 'When every franchise has been played.',
    uses: ['mode', 'mixModes', 'tries', 'roundTimer', 'hintsEnabled'],
    seats: 'solo',
  },
  {
    id: 'duel',
    name: 'Duel',
    emoji: '⚔️',
    blurb: 'Head to head on one laptop. Buzz in first and be right.',
    how: 'A or L to buzz; a wrong buzz locks you out of the round. Or just alternate turns.',
    ends: 'After the round count, on the higher score.',
    uses: ['mode', 'mixModes', 'packIds', 'difficulty', 'tries', 'rounds', 'roundTimer', 'duelStyle', 'players'],
    seats: 'pair',
  },
  {
    id: 'party',
    name: 'Party',
    emoji: '🎉',
    blurb: 'Two to eight players. Pass the laptop, keep the score.',
    how: 'Everyone takes a turn, with a handover card covering the screen in between.',
    ends: 'After the round count, on the highest score.',
    uses: ['mode', 'mixModes', 'packIds', 'difficulty', 'tries', 'rounds', 'roundTimer', 'players'],
    seats: 'group',
  },
];

export function scoutFormatInfo(id: ScoutFormat): ScoutFormatInfo | undefined {
  return SCOUT_FORMATS.find((f) => f.id === id);
}

/** True when this format reads that setting — drive the setup screen from it. */
export function formatUses(format: ScoutFormat, key: ScoutSettingKey): boolean {
  return scoutFormatInfo(format)?.uses.includes(key) ?? false;
}

// ---------------------------------------------------------------------------------------------
// Total resolvers — the settings fields are optional, these never return undefined
// ---------------------------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function scoutFormat(settings: Pick<ScoutSettings, 'format'>): ScoutFormat {
  const f = settings.format;
  return f !== undefined && SCOUT_FORMAT_IDS.includes(f) ? f : DEFAULT_SCOUT_FORMAT;
}

export function scoutLives(settings: Pick<ScoutSettings, 'lives'>): number {
  const { min, max } = SCOUT_FORMAT_LIMITS.lives;
  return clamp(Math.round(num(settings.lives, DEFAULT_SCOUT_LIVES)), min, max);
}

export function scoutBlitzDuration(settings: Pick<ScoutSettings, 'blitzDuration'>): number {
  const { min, max } = SCOUT_FORMAT_LIMITS.blitzDuration;
  return clamp(Math.round(num(settings.blitzDuration, DEFAULT_SCOUT_BLITZ_DURATION)), min, max);
}

export function scoutDuelStyle(settings: Pick<ScoutSettings, 'duelStyle'>): DuelStyle {
  const s = settings.duelStyle;
  return s !== undefined && SCOUT_DUEL_STYLES.includes(s) ? s : DEFAULT_SCOUT_DUEL_STYLE;
}

export function isScoutMultiplayer(settings: Pick<ScoutSettings, 'format'>): boolean {
  const f = scoutFormat(settings);
  return f === 'duel' || f === 'party';
}

export function isScoutBuzzerDuel(settings: Pick<ScoutSettings, 'format' | 'duelStyle'>): boolean {
  return scoutFormat(settings) === 'duel' && scoutDuelStyle(settings) === 'buzzer';
}

/** True when 'next' hands the device to the following player (party, or a duel on turns). */
export function rotatesScoutPlayers(settings: Pick<ScoutSettings, 'format' | 'duelStyle'>): boolean {
  const f = scoutFormat(settings);
  return f === 'party' || (f === 'duel' && scoutDuelStyle(settings) === 'turns');
}

/** Formats with no round count: the clock, the lives or the board decides when they end. */
export function isEndlessScoutFormat(format: ScoutFormat): boolean {
  return format === 'blitz' || format === 'survival' || format === 'gauntlet';
}

// ---------------------------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Clamp and repair a roster for a format: duel gets exactly 2, party 2–8, solo formats none.
 * Mirrors Songooner's `normalizePlayers`, including topping the list up from `DEFAULT_PLAYERS`.
 */
export function normalizeScoutPlayers(raw: unknown, format: ScoutFormat): PlayerConfig[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: PlayerConfig[] = [];
  arr.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const src = p as Partial<Record<keyof PlayerConfig, unknown>>;
    const fallback = DEFAULT_SCOUT_PLAYERS[i % DEFAULT_SCOUT_PLAYERS.length];
    const id = typeof src.id === 'string' && src.id.trim() !== '' ? src.id.trim() : `p${i + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      name: typeof src.name === 'string' && src.name.trim() !== '' ? src.name.trim().slice(0, 24) : fallback.name,
      emoji: typeof src.emoji === 'string' && src.emoji.trim() !== '' ? src.emoji.trim() : fallback.emoji,
      color: typeof src.color === 'string' && HEX_RE.test(src.color) ? src.color : fallback.color,
    });
  });
  if (format !== 'duel' && format !== 'party') return [];
  const wanted = format === 'duel' ? 2 : SCOUT_FORMAT_LIMITS.players.min;
  let i = 0;
  while (out.length < wanted && i < DEFAULT_SCOUT_PLAYERS.length) {
    const d = DEFAULT_SCOUT_PLAYERS[i++];
    if (!seen.has(d.id)) {
      seen.add(d.id);
      out.push({ ...d });
    }
  }
  const max = format === 'duel' ? 2 : SCOUT_FORMAT_LIMITS.players.max;
  return out.slice(0, max);
}

/** The roster a run actually plays with: the configured players, or one implicit solo player. */
export function resolveScoutPlayers(settings: Pick<ScoutSettings, 'format' | 'players'>): PlayerConfig[] {
  if (isScoutMultiplayer(settings)) {
    const players = normalizeScoutPlayers(settings.players, scoutFormat(settings));
    if (players.length > 0) return players;
  }
  const first = Array.isArray(settings.players) ? settings.players[0] : undefined;
  return [{ ...SOLO_SCOUT_PLAYER, ...(first ?? {}), id: SOLO_SCOUT_PLAYER.id }];
}

// ---------------------------------------------------------------------------------------------
// Survival escalation
// ---------------------------------------------------------------------------------------------

/** 0-based tier step for a given correct count (clamped to the last tier). */
export function survivalTierIndex(correct: number): number {
  const c = Math.max(0, Math.floor(Number.isFinite(correct) ? correct : 0));
  return Math.min(SURVIVAL_TIERS.length - 1, Math.floor(c / SURVIVAL_TIER_STEP));
}

/** Which tier survival is hunting for after `correct` right answers. */
export function survivalTierFor(correct: number): ScoutDifficulty {
  return SURVIVAL_TIERS[survivalTierIndex(correct)];
}

/** The ladder shortens one rung per tier, never below {@link SURVIVAL_MIN_TRIES}. */
export function survivalTriesFor(baseTries: number, correct: number): number {
  const base = Math.max(1, Math.round(Number.isFinite(baseTries) ? baseTries : 1));
  return clamp(base - survivalTierIndex(correct), SURVIVAL_MIN_TRIES, base);
}

// ---------------------------------------------------------------------------------------------
// Gauntlet
// ---------------------------------------------------------------------------------------------

/**
 * The franchise a subject belongs to: a team subject IS its franchise; a player subject carries the
 * franchise on `team` (falling back to the raw `teamId` when the team was not resolved).
 */
export function franchiseIdOf(subject: ScoutSubject): string | undefined {
  if (subject.kind === 'team') return subject.id;
  return subject.team?.id ?? subject.player?.teamId;
}
