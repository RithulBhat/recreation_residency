/**
 * Higher or Lower settings: defaults, limits, validation, presets.
 *
 * Same discipline as Price Guess — `validateSettings` CLAMPS rather than rejects, because
 * settings arrive from share links and from a party host over PeerJS and neither is trusted, and
 * `DEFAULT_SETTINGS` is defined THROUGH `reconcile` so the defaults are never exempt from the
 * consistency rules they enforce on everyone else.
 */

import type { PlayerConfig } from '@/types/game';
import { DEFAULT_PLAYERS } from '@/game/presets';
import type { HiloDifficulty, HiloFormat, HiloPowerUp, HiloSettings, StreakCurve } from './types';

export const LIVES_LIMITS = { min: 1, max: 5 } as const;
export const DURATION_LIMITS = { min: 15, max: 300 } as const;
export const ROUND_LIMITS = { min: 3, max: 100 } as const;
export const TIMER_LIMITS = { min: 0, max: 60 } as const;
export const SAME_TOLERANCE_LIMITS = { min: 0.001, max: 0.2 } as const;
export const PLAYER_LIMITS = { min: 1, max: 12 } as const;

export const HILO_FORMATS: readonly HiloFormat[] = [
  'classic',
  'lives',
  'timed',
  'rounds',
  'suddenDeath',
];
export const HILO_DIFFICULTIES: readonly HiloDifficulty[] = ['easy', 'medium', 'hard', 'insane'];
export const HILO_POWER_UPS: readonly HiloPowerUp[] = ['skip', 'peek', 'doubleDown'];
export const STREAK_CURVES: readonly StreakCurve[] = ['off', 'gentle', 'steep'];

export const FORMAT_LABEL: Record<HiloFormat, string> = {
  classic: 'Classic',
  lives: 'Lives',
  timed: 'Timed',
  rounds: 'Fixed rounds',
  suddenDeath: 'Sudden death',
};

export const FORMAT_BLURB: Record<HiloFormat, string> = {
  classic: 'One life. How far can you get?',
  lives: 'A few mistakes allowed before it ends.',
  timed: 'As many as you can before the clock runs out.',
  rounds: 'A set number of rounds, points for each one right.',
  suddenDeath: 'Two players, same sequence. First mistake loses.',
};

export const DIFFICULTY_BLURB: Record<HiloDifficulty, string> = {
  easy: 'The two values are at least 2× apart.',
  medium: 'A clear gap, but you have to think.',
  hard: 'Within 10% of each other.',
  insane: 'Within 3%. Good luck.',
};

export const SOLO_PLAYER: PlayerConfig = { id: 'you', name: 'You', emoji: '📈', color: '#22d3ee' };
export const PARTY_PLAYERS: readonly PlayerConfig[] = DEFAULT_PLAYERS;

/** How steeply a streak multiplies the points for one correct answer. */
export const STREAK_STEP: Record<StreakCurve, number> = { off: 0, gentle: 0.04, steep: 0.1 };
export const MAX_STREAK_FACTOR: Record<StreakCurve, number> = { off: 1, gentle: 1.6, steep: 3 };

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clamp(v, min, max, fallback));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function validatePlayers(v: unknown): readonly PlayerConfig[] {
  if (!Array.isArray(v)) return [SOLO_PLAYER];
  const out: PlayerConfig[] = [];
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue;
    const p = entry as Partial<PlayerConfig>;
    if (typeof p.id !== 'string' || p.id.trim() === '') continue;
    if (out.some((e) => e.id === p.id)) continue;
    const fallback = PARTY_PLAYERS[out.length % PARTY_PLAYERS.length];
    out.push({
      id: p.id.slice(0, 32),
      name: typeof p.name === 'string' && p.name.trim() !== '' ? p.name.slice(0, 24) : fallback.name,
      emoji: typeof p.emoji === 'string' && p.emoji !== '' ? p.emoji.slice(0, 8) : fallback.emoji,
      color: typeof p.color === 'string' && HEX.test(p.color) ? p.color : fallback.color,
    });
    if (out.length >= PLAYER_LIMITS.max) break;
  }
  return out.length > 0 ? out : [SOLO_PLAYER];
}

function stringList(v: unknown, max: number): readonly string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const e of v) {
    if (typeof e === 'string' && e.trim() !== '' && !out.includes(e)) out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/** Rebuild settings from untrusted input, clamping everything into range. Always playable. */
export function validateSettings(raw: unknown): HiloSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<HiloSettings>;
  const powerUps = Array.isArray(s.powerUps)
    ? HILO_POWER_UPS.filter((p) => (s.powerUps as readonly unknown[]).includes(p))
    : HILO_POWER_UPS;

  const out: HiloSettings = {
    format: oneOf(s.format, HILO_FORMATS, 'classic'),
    packIds: stringList(s.packIds, 24),
    difficulty: oneOf(s.difficulty, HILO_DIFFICULTIES, 'medium'),
    lives: clampInt(s.lives, LIVES_LIMITS.min, LIVES_LIMITS.max, 3),
    duration: clampInt(s.duration, DURATION_LIMITS.min, DURATION_LIMITS.max, 60),
    rounds: clampInt(s.rounds, ROUND_LIMITS.min, ROUND_LIMITS.max, 15),
    timer: clampInt(s.timer, TIMER_LIMITS.min, TIMER_LIMITS.max, 0),
    exactValues: bool(s.exactValues, true),
    allowSame: bool(s.allowSame, false),
    sameTolerance: clamp(
      s.sameTolerance,
      SAME_TOLERANCE_LIMITS.min,
      SAME_TOLERANCE_LIMITS.max,
      0.02,
    ),
    powerUps,
    streakCurve: oneOf(s.streakCurve, STREAK_CURVES, 'gentle'),
    players: validatePlayers(s.players),
    duelStyle: oneOf(s.duelStyle, ['buzzer', 'turns'] as const, 'turns'),
  };
  if (typeof s.seed === 'string' && s.seed.trim() !== '') out.seed = s.seed.slice(0, 64);
  return reconcile(out);
}

/**
 * Resolve settings that contradict each other. Each rule is here because the combination is
 * genuinely unplayable, not merely unusual.
 */
export function reconcile(s: HiloSettings): HiloSettings {
  const out: HiloSettings = { ...s, powerUps: [...s.powerUps] };

  // Sudden death is a two-player format; anything else is solo unless a party is present.
  if (out.format === 'suddenDeath' && out.players.length < 2) {
    out.players = PARTY_PLAYERS.slice(0, 2);
  }

  // Classic is one life by definition — a lives count would be a lie in the UI.
  if (out.format === 'classic') out.lives = 1;
  if (out.format === 'suddenDeath') out.lives = 1;

  // Note: Double Down needs more than one life, but that is gated at USE time in the engine,
  // not stripped from the stored preference here. Removing it would mean a player who starts on
  // Classic and switches to Lives never gets it back — the preference would have been quietly
  // destroyed by a format they since left.

  // A "too close to call" button on the tightest band would be the answer to most rounds.
  if (out.difficulty === 'insane') out.allowSame = false;

  // The timed format has its own clock; a per-pick timer on top of it is two countdowns.
  if (out.format === 'timed') out.timer = 0;

  return out;
}

export const DEFAULT_SETTINGS: HiloSettings = reconcile({
  format: 'classic',
  packIds: [],
  difficulty: 'medium',
  lives: 1,
  duration: 60,
  rounds: 15,
  timer: 0,
  exactValues: true,
  allowSame: false,
  sameTolerance: 0.02,
  powerUps: HILO_POWER_UPS,
  streakCurve: 'gentle',
  players: [SOLO_PLAYER],
  duelStyle: 'turns',
});

export interface HiloPreset {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  settings: HiloSettings;
}

function preset(
  id: string,
  name: string,
  emoji: string,
  blurb: string,
  over: Partial<HiloSettings>,
): HiloPreset {
  return { id, name, emoji, blurb, settings: reconcile({ ...DEFAULT_SETTINGS, ...over }) };
}

export const PRESETS: readonly HiloPreset[] = [
  preset('classic', 'Classic', '♾️', 'One life, endless chain. The original.', { format: 'classic' }),
  preset('speedrun', 'Speedrun 60s', '⏱️', 'As many as you can in a minute.', {
    format: 'timed',
    duration: 60,
    difficulty: 'easy',
  }),
  preset('football-nerd', 'Football Nerd', '🏈', 'NFL only. Prove it.', {
    format: 'lives',
    lives: 3,
    packIds: ['nfl-weight', 'nfl-draft'],
  }),
  preset('hard-mode', 'Hard Mode', '🔥', 'Every pair within 10% of each other.', {
    format: 'lives',
    lives: 3,
    difficulty: 'hard',
  }),
  preset('party-race', 'Party Race', '🏁', 'Everyone gets the same chain. Longest streak wins.', {
    format: 'rounds',
    rounds: 15,
    players: PARTY_PLAYERS.slice(0, 4),
  }),
  preset('sudden-death', 'Sudden Death', '💀', 'Two players, one mistake.', {
    format: 'suddenDeath',
    players: PARTY_PLAYERS.slice(0, 2),
  }),
];

export function presetById(id: string): HiloPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
