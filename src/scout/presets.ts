/**
 * Default Highlight Scout settings and `normalizeScoutSettings` — the single place that clamps and
 * repairs a `ScoutSettings`. Everything arriving from outside (a persisted draft, a challenge code,
 * a URL param, a preset) goes through it.
 *
 * Coherence rules, beyond clamping:
 *   - `mode`, `format` or `difficulty` that no longer exist fall back to the defaults;
 *   - a run whose mode guesses TEAMS keeps at least one team pack (and vice versa), so the pool can
 *     never be empty just because the pack kind and the mode disagree;
 *   - `mixModes` adds whichever kind is missing, because a mixed run needs both.
 *
 * Session formats (see `./formats`) add their own coherence, so a format can never be handed
 * settings it cannot play:
 *   - `blitz` / `survival` / `gauntlet` force `rounds: 0` — their clock, their lives or the 32-club
 *     board decides when the run ends, not a round count;
 *   - `survival` and `gauntlet` force `difficulty: 'any'`: survival walks every tier itself, and the
 *     gauntlet has to be able to reach all 32 franchises;
 *   - `gauntlet` puts league-wide packs FIRST in `packIds` (so they survive the 12-pack cap) —
 *     a single-club selection could not fill a 32-round board;
 *   - `duel` keeps exactly 2 players, `party` 2–8, and both top the roster up from
 *     `DEFAULT_SCOUT_PLAYERS`; the solo formats keep an empty roster;
 *   - `party` snaps `rounds` to a multiple of the player count so everyone gets equal turns;
 *   - `lives` clamps to 1–5 and `blitzDuration` to 30–300 s;
 *   - `blitz` also forces `roundTimer: 0` — it already has a clock.
 *
 * Every session-format field is OPTIONAL on `ScoutSettings`, so a draft persisted before formats
 * existed still parses; normalization always fills them in.
 */

import type { PlayerConfig } from '@/types/game';
import type { ScoutDifficulty, ScoutMode, ScoutSettings } from './types';
import { DEFAULT_SCOUT_PACK_ID, SCOUT_MODES, SCOUT_PRESETS, type ScoutPreset, scoutPack, scoutPreset } from './packs';
import {
  DEFAULT_SCOUT_BLITZ_DURATION,
  DEFAULT_SCOUT_DUEL_STYLE,
  DEFAULT_SCOUT_FORMAT,
  DEFAULT_SCOUT_LIVES,
  DEFAULT_SCOUT_PLAYERS,
  SCOUT_DUEL_STYLES,
  SCOUT_FORMAT_IDS,
  SCOUT_FORMAT_LIMITS,
  isEndlessScoutFormat,
  normalizeScoutPlayers,
} from './formats';
import { subjectKindForMode } from './subjects';

export const SCOUT_MODE_IDS: readonly ScoutMode[] = SCOUT_MODES.map((m) => m.id);
export const SCOUT_DIFFICULTIES: readonly ScoutDifficulty[] = ['any', 'star', 'starter', 'rotation', 'deepCut'];

export const DEFAULT_TEAM_PACK_ID = 'franchises-all';

/** League-wide player packs — the gauntlet needs every franchise represented. */
export const GAUNTLET_PLAYER_PACK_IDS: readonly string[] = ['conf-afc', 'conf-nfc'];

export const SCOUT_LIMITS = {
  tries: { min: 1, max: 6 },
  rounds: { min: 0, max: 50 },
  roundTimer: { min: 0, max: 300 },
  packIds: { max: 12 },
  lives: SCOUT_FORMAT_LIMITS.lives,
  blitzDuration: SCOUT_FORMAT_LIMITS.blitzDuration,
  players: SCOUT_FORMAT_LIMITS.players,
} as const;

export const DEFAULT_SCOUT_SETTINGS: ScoutSettings = {
  mode: 'silhouette',
  packIds: [DEFAULT_SCOUT_PACK_ID],
  difficulty: 'any',
  tries: 5,
  rounds: 10,
  roundTimer: 0,
  hintsEnabled: true,
  mixModes: false,
  format: DEFAULT_SCOUT_FORMAT,
  blitzDuration: DEFAULT_SCOUT_BLITZ_DURATION,
  lives: DEFAULT_SCOUT_LIVES,
  players: [],
  duelStyle: DEFAULT_SCOUT_DUEL_STYLE,
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function cleanPackIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id === '' || out.includes(id)) continue;
    out.push(id);
    if (out.length >= SCOUT_LIMITS.packIds.max) break;
  }
  return out;
}

function hasKind(packIds: readonly string[], kind: 'player' | 'team'): boolean {
  return packIds.some((id) => scoutPack(id)?.kind === kind);
}

/**
 * Party: rounds snap UP to the next multiple of the player count so everyone gets the same number
 * of turns (10 rounds / 3 players → 12). Snaps down instead when going up would exceed `max`.
 * Same rule as Songooner's `snapToMultiple`.
 */
function snapToMultiple(rounds: number, n: number, max: number): number {
  const up = Math.ceil(rounds / n) * n;
  return up <= max ? up : Math.floor(max / n) * n;
}

/** Clamp, coerce and repair. Always returns a complete, playable `ScoutSettings`. */
export function normalizeScoutSettings(input: Partial<ScoutSettings> | null | undefined): ScoutSettings {
  const s: Partial<Record<keyof ScoutSettings, unknown>> = input && typeof input === 'object' ? { ...input } : {};
  const d = DEFAULT_SCOUT_SETTINGS;

  const mode = oneOf(s.mode, SCOUT_MODE_IDS, d.mode);
  const format = oneOf(s.format, SCOUT_FORMAT_IDS, DEFAULT_SCOUT_FORMAT);
  const mixModes = bool(s.mixModes, d.mixModes);
  const packIds = cleanPackIds(s.packIds);

  // Unknown pack ids are kept (a custom pack may resolve later), but the KINDS a run needs must
  // be represented by at least one known pack.
  const known = packIds.filter((id) => scoutPack(id) !== undefined);
  const needPlayer = mixModes || subjectKindForMode(mode) === 'player';
  const needTeam = mixModes || subjectKindForMode(mode) === 'team';
  const finalPacks = packIds.length > 0 ? packIds.slice() : [];
  if (format === 'gauntlet') {
    // The board is all 32 clubs: league-wide coverage goes first so the 12-pack cap cannot drop it.
    if (needTeam) finalPacks.unshift(DEFAULT_TEAM_PACK_ID);
    if (needPlayer) finalPacks.unshift(...GAUNTLET_PLAYER_PACK_IDS);
  } else {
    if (needPlayer && !hasKind(known, 'player')) finalPacks.push(DEFAULT_SCOUT_PACK_ID);
    if (needTeam && !hasKind(known, 'team')) finalPacks.push(DEFAULT_TEAM_PACK_ID);
  }

  const seed = typeof s.seed === 'string' && s.seed.trim() !== '' ? s.seed.trim() : undefined;
  const daily = typeof s.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.daily) ? s.daily : undefined;

  // survival walks every tier itself; the gauntlet must be able to reach all 32 franchises
  const tierFilterAllowed = format !== 'survival' && format !== 'gauntlet';
  const difficulty = tierFilterAllowed ? oneOf(s.difficulty, SCOUT_DIFFICULTIES, d.difficulty) : 'any';

  const players: PlayerConfig[] = normalizeScoutPlayers(s.players, format);
  let rounds = clamp(Math.round(num(s.rounds, d.rounds)), SCOUT_LIMITS.rounds.min, SCOUT_LIMITS.rounds.max);
  if (isEndlessScoutFormat(format)) rounds = 0;
  // blitz has exactly one clock, the run clock — a second per-round clock would double-penalise
  let roundTimer = clamp(Math.round(num(s.roundTimer, d.roundTimer)), SCOUT_LIMITS.roundTimer.min, SCOUT_LIMITS.roundTimer.max);
  if (format === 'blitz') roundTimer = 0;
  else if (format === 'party' && rounds > 0 && players.length > 0) {
    rounds = snapToMultiple(rounds, players.length, SCOUT_LIMITS.rounds.max);
  }

  const out: ScoutSettings = {
    mode,
    packIds: Array.from(new Set(finalPacks)).slice(0, SCOUT_LIMITS.packIds.max),
    difficulty,
    tries: clamp(Math.round(num(s.tries, d.tries)), SCOUT_LIMITS.tries.min, SCOUT_LIMITS.tries.max),
    rounds,
    roundTimer,
    hintsEnabled: bool(s.hintsEnabled, d.hintsEnabled),
    mixModes,
    format,
    blitzDuration: clamp(
      Math.round(num(s.blitzDuration, DEFAULT_SCOUT_BLITZ_DURATION)),
      SCOUT_LIMITS.blitzDuration.min,
      SCOUT_LIMITS.blitzDuration.max,
    ),
    lives: clamp(Math.round(num(s.lives, DEFAULT_SCOUT_LIVES)), SCOUT_LIMITS.lives.min, SCOUT_LIMITS.lives.max),
    players,
    duelStyle: oneOf(s.duelStyle, SCOUT_DUEL_STYLES, DEFAULT_SCOUT_DUEL_STYLE),
  };
  if (seed !== undefined) out.seed = seed;
  if (daily !== undefined) out.daily = daily;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Format presets
// ---------------------------------------------------------------------------------------------

function roster(n: number): PlayerConfig[] {
  return DEFAULT_SCOUT_PLAYERS.slice(0, n).map((p) => ({ ...p }));
}

/**
 * Presets that combine a SESSION FORMAT with one or more puzzle types.
 *
 * `SCOUT_PRESETS` (in `./packs`) is the puzzle-type list that shipped first and is untouched;
 * these are the format list, and {@link ALL_SCOUT_PRESETS} is what a screen should render.
 * `applyScoutPreset` resolves ids from both.
 */
export const SCOUT_FORMAT_PRESETS: readonly ScoutPreset[] = [
  {
    id: 'sixty-second-scout',
    name: 'Sixty Second Scout',
    emoji: '⏱️',
    blurb: 'One minute of extreme close-ups. How many faces do you know?',
    settings: {
      format: 'blitz',
      mode: 'faceZoom',
      packIds: ['superstars'],
      difficulty: 'any',
      blitzDuration: 60,
      hintsEnabled: false,
      mixModes: false,
    },
  },
  {
    id: 'ninety-second-shadows',
    name: 'Ninety Second Shadows',
    emoji: '🕶️',
    blurb: 'A minute and a half of silhouettes. Misses cost you five seconds.',
    settings: {
      format: 'blitz',
      mode: 'silhouette',
      packIds: ['superstars'],
      difficulty: 'any',
      blitzDuration: 90,
      hintsEnabled: false,
      mixModes: false,
    },
  },
  {
    id: 'last-man-standing',
    name: 'Last Man Standing',
    emoji: '💀',
    blurb: 'Three lives, every puzzle type, and the league gets obscure fast.',
    settings: {
      format: 'survival',
      mode: 'silhouette',
      packIds: ['conf-afc', 'conf-nfc', 'franchises-all'],
      lives: 3,
      tries: 5,
      mixModes: true,
    },
  },
  {
    id: 'around-the-league',
    name: 'Around the League',
    emoji: '🗺️',
    blurb: 'All 32 franchises, one subject each, every puzzle type in the mix.',
    settings: {
      format: 'gauntlet',
      mode: 'silhouette',
      tries: 4,
      mixModes: true,
    },
  },
  {
    id: 'helmet-run',
    name: 'Helmet Run',
    emoji: '🪖',
    blurb: 'Thirty-two logos, three pixels at a time. Clear the board.',
    settings: {
      format: 'gauntlet',
      mode: 'logoZoom',
      tries: 4,
      mixModes: false,
    },
  },
  {
    id: 'film-room-duel',
    name: 'Film Room Duel',
    emoji: '⚔️',
    blurb: 'Two scouts, one laptop, redacted play text. Buzz in with A or L.',
    settings: {
      format: 'duel',
      duelStyle: 'buzzer',
      mode: 'highlight',
      packIds: ['conf-afc', 'conf-nfc'],
      tries: 4,
      rounds: 10,
      mixModes: false,
      players: roster(2),
    },
  },
  {
    id: 'pass-the-laptop',
    name: 'Pass the Laptop',
    emoji: '🎉',
    blurb: 'Four players, twelve rounds, a handover card between every turn.',
    settings: {
      format: 'party',
      mode: 'silhouette',
      packIds: ['superstars'],
      tries: 4,
      rounds: 12,
      mixModes: false,
      players: roster(4),
    },
  },
];

/** Puzzle-type presets first, then the format presets. What a preset row should render. */
export const ALL_SCOUT_PRESETS: readonly ScoutPreset[] = [...SCOUT_PRESETS, ...SCOUT_FORMAT_PRESETS];

export function scoutPresetById(id: string): ScoutPreset | undefined {
  return scoutPreset(id) ?? SCOUT_FORMAT_PRESETS.find((p) => p.id === id);
}

/** Apply a named preset on top of the current settings (seed/daily are never carried over). */
export function applyScoutPreset(current: ScoutSettings, presetId: string): ScoutSettings {
  const preset = scoutPresetById(presetId);
  if (!preset) return current;
  const base: Partial<ScoutSettings> = {
    mode: current.mode,
    packIds: current.packIds,
    difficulty: current.difficulty,
    tries: current.tries,
    rounds: current.rounds,
    roundTimer: current.roundTimer,
    hintsEnabled: current.hintsEnabled,
    mixModes: current.mixModes,
    format: current.format,
    blitzDuration: current.blitzDuration,
    lives: current.lives,
    players: current.players,
    duelStyle: current.duelStyle,
  };
  return normalizeScoutSettings({ ...base, ...preset.settings });
}
