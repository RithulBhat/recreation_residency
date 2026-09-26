/**
 * Default settings, named presets, and `normalizeSettings` (the single place that clamps and
 * derives every GameSettings field). Everything that receives settings from outside (persisted
 * drafts, challenge codes, URL params) should pass them through `normalizeSettings`.
 */

import type {
  ClipMode,
  Difficulty,
  DuelStyle,
  GameMode,
  GameSettings,
  GuessTarget,
  Modifiers,
  PlayerConfig,
  Speed,
  StartPosition,
} from '@/types';
import type { Rng } from './rng';
import { createRng } from './rng';

export const DEFAULT_STAGES: readonly number[] = [0.1, 0.3, 1, 2, 4, 7, 10];

export const clipLengthPresets: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10];

export const NEUTRAL_MODIFIERS: Modifiers = { speed: 1, reverse: false, lofi: false, bitcrush: false, pitch: 0 };

export const DEFAULT_PLAYERS: readonly PlayerConfig[] = [
  { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
  { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
  { id: 'p3', name: 'Frog', emoji: '🐸', color: '#34d399' },
  { id: 'p4', name: 'Panda', emoji: '🐼', color: '#22d3ee' },
  { id: 'p5', name: 'Kitty', emoji: '🐱', color: '#f472b6' },
  { id: 'p6', name: 'Bee', emoji: '🐝', color: '#fbbf24' },
  { id: 'p7', name: 'Ghost', emoji: '👻', color: '#818cf8' },
  { id: 'p8', name: 'Rex', emoji: '🦖', color: '#fb7185' },
];

/** The implicit single-player identity used by classic/fixed/blitz/survival games. */
export const SOLO_PLAYER: PlayerConfig = { id: 'you', name: 'You', emoji: '🎧', color: '#a855f7' };

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'classic',
  packIds: ['pop-hits'],
  difficulty: 'any',
  clipMode: 'escalating',
  clipLength: 1,
  stages: [...DEFAULT_STAGES],
  tries: DEFAULT_STAGES.length,
  rounds: 10,
  startPosition: 'random',
  sameStartEachTry: true,
  guessTarget: 'title',
  hintsEnabled: true,
  roundTimer: 0,
  modifiers: { ...NEUTRAL_MODIFIERS },
  allowSkip: true,
  explicitFilter: false,
  blitzDuration: 90,
  lives: 3,
  players: [],
  duelStyle: 'buzzer',
  voiceHost: false,
};

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  settings: Partial<GameSettings>;
  /** Chaos: modifiers are re-rolled every time the preset is applied. */
  randomizeModifiers?: boolean;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'songspot',
    name: 'Songspot Classic',
    emoji: '🎯',
    blurb: 'Five tries, 0.1 s to 15 s. The original ladder.',
    settings: { mode: 'classic', clipMode: 'escalating', stages: [0.1, 0.5, 2, 8, 15], rounds: 10 },
  },
  {
    id: 'heardle',
    name: 'Heardle',
    emoji: '🎧',
    blurb: 'Six escalating clips from the intro. Skips unlock more.',
    settings: {
      mode: 'classic',
      clipMode: 'escalating',
      stages: [1, 2, 4, 7, 11, 16],
      startPosition: 'start',
      rounds: 10,
    },
  },
  {
    id: 'impossible',
    name: 'Impossible',
    emoji: '💀',
    blurb: '0.1 seconds. Three tries. Good luck.',
    settings: { mode: 'fixed', clipMode: 'fixed', clipLength: 0.1, tries: 3, rounds: 10, hintsEnabled: false },
  },
  {
    id: 'sniper',
    name: 'Sniper',
    emoji: '🔫',
    blurb: 'One shot at 0.3 seconds. No second chances.',
    settings: { mode: 'fixed', clipMode: 'fixed', clipLength: 0.3, tries: 1, rounds: 10, hintsEnabled: false },
  },
  {
    id: 'chill',
    name: 'Chill',
    emoji: '🌴',
    blurb: 'Five-second clips, three tries. Vibes only.',
    settings: { mode: 'fixed', clipMode: 'fixed', clipLength: 5, tries: 3, rounds: 10 },
  },
  {
    id: 'speedrun',
    name: 'Speedrun',
    emoji: '⚡',
    blurb: '60 seconds on the clock, 1 s clips. Wrong answers cost 3 s.',
    settings: { mode: 'blitz', clipMode: 'fixed', clipLength: 1, blitzDuration: 60, rounds: 0, hintsEnabled: false },
  },
  {
    id: 'iron-ears',
    name: 'Iron Ears',
    emoji: '🛡️',
    blurb: 'Three lives. Every hit makes the next clip 15% shorter.',
    settings: { mode: 'survival', clipMode: 'fixed', clipLength: 2, tries: 3, lives: 3, rounds: 0 },
  },
  {
    id: 'chaos',
    name: 'Chaos',
    emoji: '🌀',
    blurb: 'Random speed, pitch, reverse, lo-fi. Nothing sounds right.',
    settings: { mode: 'classic', clipMode: 'escalating', stages: [0.5, 1, 2, 4, 7], rounds: 10 },
    randomizeModifiers: true,
  },
  {
    id: 'party-night',
    name: 'Party Night',
    emoji: '🎉',
    blurb: 'Pass the phone. 2–8 players, 2 s clips, two tries each.',
    settings: {
      mode: 'party',
      clipMode: 'fixed',
      clipLength: 2,
      tries: 2,
      rounds: 12,
      players: DEFAULT_PLAYERS.slice(0, 4).map((p) => ({ ...p })),
    },
  },
  {
    id: 'duel',
    name: 'Duel',
    emoji: '⚔️',
    blurb: 'Head to head. Buzz in first, get it right, take the round.',
    settings: {
      mode: 'duel',
      duelStyle: 'buzzer',
      clipMode: 'escalating',
      stages: [0.5, 1, 2, 4],
      rounds: 10,
      players: DEFAULT_PLAYERS.slice(0, 2).map((p) => ({ ...p })),
    },
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

const SPEEDS: readonly Speed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function randomModifiers(rng: Rng = createRng()): Modifiers {
  return {
    speed: rng.pick(SPEEDS),
    reverse: rng.next() < 0.3,
    lofi: rng.next() < 0.4,
    bitcrush: rng.next() < 0.3,
    pitch: rng.int(-5, 5),
  };
}

/**
 * Apply a preset on top of the current draft: keeps pack selection and personal prefs
 * (packs, difficulty, explicit filter, voice host, players), resets the rest to defaults.
 */
export function applyPresetToSettings(current: GameSettings, preset: Preset, rng: Rng = createRng()): GameSettings {
  const base: Partial<GameSettings> = {
    packIds: current.packIds,
    difficulty: current.difficulty,
    explicitFilter: current.explicitFilter,
    voiceHost: current.voiceHost,
    players: current.players,
  };
  const merged: Partial<GameSettings> = { ...base, ...preset.settings };
  if (preset.randomizeModifiers) merged.modifiers = randomModifiers(rng);
  return normalizeSettings(merged);
}

// ---------------------------------------------------------------------------------------------
// normalizeSettings
// ---------------------------------------------------------------------------------------------

const MODES: readonly GameMode[] = ['classic', 'fixed', 'blitz', 'survival', 'duel', 'party'];
const CLIP_MODES: readonly ClipMode[] = ['fixed', 'escalating'];
const START_POSITIONS: readonly StartPosition[] = ['start', 'random', 'middle', 'end'];
const GUESS_TARGETS: readonly GuessTarget[] = ['title', 'artist', 'both'];
const DIFFICULTIES: readonly Difficulty[] = ['any', 'easy', 'medium', 'hard', 'expert', 'impossible'];
const DUEL_STYLES: readonly DuelStyle[] = ['buzzer', 'turns'];

export const LIMITS = {
  clipLength: { min: 0.1, max: 10 },
  stage: { min: 0.1, max: 30 },
  triesFixed: { min: 1, max: 6 },
  rounds: { min: 0, max: 200 },
  roundTimer: { min: 0, max: 300 },
  blitzDuration: { min: 15, max: 600 },
  lives: { min: 1, max: 10 },
  pitch: { min: -12, max: 12 },
  players: { min: 2, max: 8 },
  maxStages: 8,
} as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeModifiers(m: unknown): Modifiers {
  const src = (m && typeof m === 'object' ? m : {}) as Partial<Record<keyof Modifiers, unknown>>;
  const speedRaw = num(src.speed, 1);
  const speed = (SPEEDS as readonly number[]).includes(speedRaw) ? (speedRaw as Speed) : 1;
  return {
    speed,
    reverse: bool(src.reverse, false),
    lofi: bool(src.lofi, false),
    bitcrush: bool(src.bitcrush, false),
    pitch: clamp(Math.round(num(src.pitch, 0)), LIMITS.pitch.min, LIMITS.pitch.max),
  };
}

function normalizeStages(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  const cleaned = arr
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map((v) => round2(clamp(v, LIMITS.stage.min, LIMITS.stage.max)));
  const sorted = Array.from(new Set(cleaned)).sort((a, b) => a - b);
  if (sorted.length === 0) return [...DEFAULT_STAGES];
  return sorted.slice(0, LIMITS.maxStages);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizePlayers(raw: unknown, mode: GameMode): PlayerConfig[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: PlayerConfig[] = [];
  arr.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const src = p as Partial<Record<keyof PlayerConfig, unknown>>;
    const fallback = DEFAULT_PLAYERS[i % DEFAULT_PLAYERS.length];
    const id = typeof src.id === 'string' && src.id.trim() ? src.id.trim() : `p${i + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 24) : fallback.name,
      emoji: typeof src.emoji === 'string' && src.emoji.trim() ? src.emoji.trim() : fallback.emoji,
      color: typeof src.color === 'string' && HEX_RE.test(src.color) ? src.color : fallback.color,
    });
  });
  const wanted = mode === 'duel' ? 2 : mode === 'party' ? LIMITS.players.min : 0;
  let i = 0;
  while (out.length < wanted && i < DEFAULT_PLAYERS.length) {
    const d = DEFAULT_PLAYERS[i++];
    if (!seen.has(d.id)) {
      seen.add(d.id);
      out.push({ ...d });
    }
  }
  const max = mode === 'duel' ? 2 : LIMITS.players.max;
  return out.slice(0, max);
}

/**
 * Party: rounds snap UP to the next multiple of the player count so everyone gets the same number
 * of turns (10 rounds / 3 players → 12). Snaps down instead when going up would exceed `max`.
 */
function snapToMultiple(rounds: number, n: number, max: number): number {
  const up = Math.ceil(rounds / n) * n;
  return up <= max ? up : Math.floor(max / n) * n;
}

/**
 * Fill defaults, clamp ranges, derive `tries` from stages in escalating mode, sort stages, and in
 * party mode snap `rounds` (when > 0) to a multiple of the player count (see `snapToMultiple`).
 */
export function normalizeSettings(input: Partial<GameSettings> | null | undefined): GameSettings {
  const s: Partial<Record<keyof GameSettings, unknown>> = input && typeof input === 'object' ? { ...input } : {};
  const d = DEFAULT_SETTINGS;

  const mode = oneOf(s.mode, MODES, d.mode);
  const fixedByDefault = mode === 'fixed' || mode === 'blitz' || mode === 'survival';
  let clipMode = oneOf(s.clipMode, CLIP_MODES, fixedByDefault ? 'fixed' : d.clipMode);
  if (mode === 'classic') clipMode = 'escalating';
  if (mode === 'fixed' || mode === 'blitz') clipMode = 'fixed';

  const stages = normalizeStages(s.stages);
  const clipLength = round2(clamp(num(s.clipLength, d.clipLength), LIMITS.clipLength.min, LIMITS.clipLength.max));
  const tries =
    clipMode === 'escalating'
      ? stages.length
      : clamp(Math.round(num(s.tries, 3)), LIMITS.triesFixed.min, LIMITS.triesFixed.max);

  const packIdsRaw = Array.isArray(s.packIds) ? s.packIds : d.packIds;
  const packIds = Array.from(
    new Set(packIdsRaw.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())),
  );

  const seed = typeof s.seed === 'string' && s.seed.trim() !== '' ? s.seed.trim() : undefined;
  const daily = typeof s.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.daily) ? s.daily : undefined;

  const players = normalizePlayers(s.players, mode);
  let rounds = clamp(Math.round(num(s.rounds, d.rounds)), LIMITS.rounds.min, LIMITS.rounds.max);
  if (mode === 'party' && rounds > 0 && players.length > 0) {
    rounds = snapToMultiple(rounds, players.length, LIMITS.rounds.max);
  }

  const out: GameSettings = {
    mode,
    packIds: packIds.length ? packIds : [...d.packIds],
    difficulty: oneOf(s.difficulty, DIFFICULTIES, d.difficulty),
    clipMode,
    clipLength,
    stages,
    tries,
    rounds,
    startPosition: oneOf(s.startPosition, START_POSITIONS, d.startPosition),
    sameStartEachTry: bool(s.sameStartEachTry, d.sameStartEachTry),
    guessTarget: oneOf(s.guessTarget, GUESS_TARGETS, d.guessTarget),
    hintsEnabled: bool(s.hintsEnabled, d.hintsEnabled),
    roundTimer: clamp(Math.round(num(s.roundTimer, d.roundTimer)), LIMITS.roundTimer.min, LIMITS.roundTimer.max),
    modifiers: normalizeModifiers(s.modifiers),
    allowSkip: bool(s.allowSkip, d.allowSkip),
    explicitFilter: bool(s.explicitFilter, d.explicitFilter),
    blitzDuration: clamp(
      Math.round(num(s.blitzDuration, d.blitzDuration)),
      LIMITS.blitzDuration.min,
      LIMITS.blitzDuration.max,
    ),
    lives: clamp(Math.round(num(s.lives, d.lives)), LIMITS.lives.min, LIMITS.lives.max),
    players,
    duelStyle: oneOf(s.duelStyle, DUEL_STYLES, d.duelStyle),
    voiceHost: bool(s.voiceHost, d.voiceHost),
  };
  if (seed !== undefined) out.seed = seed;
  if (daily !== undefined) out.daily = daily;
  return out;
}

export function isMultiplayer(settings: Pick<GameSettings, 'mode'>): boolean {
  return settings.mode === 'duel' || settings.mode === 'party';
}

export function isBuzzerDuel(settings: Pick<GameSettings, 'mode' | 'duelStyle'>): boolean {
  return settings.mode === 'duel' && settings.duelStyle === 'buzzer';
}

/** Longest clip a round could ever play (drives the start-offset window). */
export function maxClipLength(settings: Pick<GameSettings, 'mode' | 'clipMode' | 'clipLength' | 'stages'>): number {
  if (settings.mode === 'blitz') return settings.clipLength;
  if (settings.clipMode === 'escalating' && settings.stages.length) return Math.max(...settings.stages);
  return settings.clipLength;
}
