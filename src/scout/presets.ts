/**
 * Default Highlight Scout settings and `normalizeScoutSettings` — the single place that clamps and
 * repairs a `ScoutSettings`. Everything arriving from outside (a persisted draft, a challenge code,
 * a URL param, a preset) goes through it.
 *
 * Coherence rules, beyond clamping:
 *   - `mode` / `difficulty` that no longer exist fall back to the defaults.
 *   - a run whose mode guesses TEAMS keeps at least one team pack (and vice versa), so the pool can
 *     never be empty just because the pack kind and the mode disagree;
 *   - `mixModes` adds whichever kind is missing, because a mixed run needs both.
 */

import type { ScoutDifficulty, ScoutMode, ScoutSettings } from './types';
import { DEFAULT_SCOUT_PACK_ID, SCOUT_MODES, scoutPack, scoutPreset } from './packs';
import { subjectKindForMode } from './subjects';

export const SCOUT_MODE_IDS: readonly ScoutMode[] = SCOUT_MODES.map((m) => m.id);
export const SCOUT_DIFFICULTIES: readonly ScoutDifficulty[] = ['any', 'star', 'starter', 'rotation', 'deepCut'];

export const DEFAULT_TEAM_PACK_ID = 'franchises-all';

export const SCOUT_LIMITS = {
  tries: { min: 1, max: 6 },
  rounds: { min: 0, max: 50 },
  roundTimer: { min: 0, max: 300 },
  packIds: { max: 12 },
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

/** Clamp, coerce and repair. Always returns a complete, playable `ScoutSettings`. */
export function normalizeScoutSettings(input: Partial<ScoutSettings> | null | undefined): ScoutSettings {
  const s: Partial<Record<keyof ScoutSettings, unknown>> = input && typeof input === 'object' ? { ...input } : {};
  const d = DEFAULT_SCOUT_SETTINGS;

  const mode = oneOf(s.mode, SCOUT_MODE_IDS, d.mode);
  const mixModes = bool(s.mixModes, d.mixModes);
  const packIds = cleanPackIds(s.packIds);

  // Unknown pack ids are kept (a custom pack may resolve later), but the KINDS a run needs must
  // be represented by at least one known pack.
  const known = packIds.filter((id) => scoutPack(id) !== undefined);
  const needPlayer = mixModes || subjectKindForMode(mode) === 'player';
  const needTeam = mixModes || subjectKindForMode(mode) === 'team';
  const finalPacks = packIds.length > 0 ? packIds.slice() : [];
  if (needPlayer && !hasKind(known, 'player')) finalPacks.push(DEFAULT_SCOUT_PACK_ID);
  if (needTeam && !hasKind(known, 'team')) finalPacks.push(DEFAULT_TEAM_PACK_ID);

  const seed = typeof s.seed === 'string' && s.seed.trim() !== '' ? s.seed.trim() : undefined;
  const daily = typeof s.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.daily) ? s.daily : undefined;

  const out: ScoutSettings = {
    mode,
    packIds: Array.from(new Set(finalPacks)).slice(0, SCOUT_LIMITS.packIds.max),
    difficulty: oneOf(s.difficulty, SCOUT_DIFFICULTIES, d.difficulty),
    tries: clamp(Math.round(num(s.tries, d.tries)), SCOUT_LIMITS.tries.min, SCOUT_LIMITS.tries.max),
    rounds: clamp(Math.round(num(s.rounds, d.rounds)), SCOUT_LIMITS.rounds.min, SCOUT_LIMITS.rounds.max),
    roundTimer: clamp(
      Math.round(num(s.roundTimer, d.roundTimer)),
      SCOUT_LIMITS.roundTimer.min,
      SCOUT_LIMITS.roundTimer.max,
    ),
    hintsEnabled: bool(s.hintsEnabled, d.hintsEnabled),
    mixModes,
  };
  if (seed !== undefined) out.seed = seed;
  if (daily !== undefined) out.daily = daily;
  return out;
}

/** Apply a named preset on top of the current settings (seed/daily are never carried over). */
export function applyScoutPreset(current: ScoutSettings, presetId: string): ScoutSettings {
  const preset = scoutPreset(presetId);
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
  };
  return normalizeScoutSettings({ ...base, ...preset.settings });
}
