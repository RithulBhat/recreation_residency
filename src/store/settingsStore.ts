/**
 * Settings + preferences store (persisted under `sg:settings`).
 * `settings` is the draft GameSettings edited on the setup screen; prefs are device-level.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GameSettings, HostPersonality } from '@/types';
import { DEFAULT_SETTINGS, applyPresetToSettings, findPreset, normalizeSettings } from '@/game/presets';

export type Theme = 'midnight' | 'vinyl' | 'y2k' | 'daylight';
export type ReducedMotionPref = 'system' | 'on' | 'off';

export const THEMES: readonly Theme[] = ['midnight', 'vinyl', 'y2k', 'daylight'];
export const HOST_PERSONALITIES: readonly HostPersonality[] = ['hype', 'chill', 'savage', 'radio'];
export const MAX_RECENT_PACKS = 8;
export const MAX_RECENT_TRACKS = 300;

export interface SettingsPrefs {
  theme: Theme;
  /** 0..1 */
  volume: number;
  sfxEnabled: boolean;
  hostPersonality: HostPersonality;
  hostVoiceURI: string | null;
  reducedMotion: ReducedMotionPref;
  playerName: string;
  /** most recent first */
  recentPackIds: string[];
  /** most recent first; used to avoid repeats across games */
  recentTrackIds: number[];
}

export interface SettingsState extends SettingsPrefs {
  settings: GameSettings;
}

export interface SettingsActions {
  update(partial: Partial<GameSettings>): void;
  applyPreset(id: string): void;
  reset(): void;
  setTheme(theme: Theme): void;
  setVolume(volume: number): void;
  setSfxEnabled(on: boolean): void;
  setHostPersonality(p: HostPersonality): void;
  setHostVoiceURI(uri: string | null): void;
  setReducedMotion(pref: ReducedMotionPref): void;
  setPlayerName(name: string): void;
  pushRecentPack(id: string): void;
  pushRecentTracks(ids: readonly number[]): void;
  clearRecentTracks(): void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const DEFAULT_PREFS: SettingsPrefs = {
  theme: 'midnight',
  volume: 0.8,
  sfxEnabled: true,
  hostPersonality: 'hype',
  hostVoiceURI: null,
  reducedMotion: 'system',
  playerName: '',
  recentPackIds: [],
  recentTrackIds: [],
};

export const SETTINGS_STORAGE_KEY = 'sg:settings';
export const SETTINGS_VERSION = 1;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

function pushUnique<T>(list: readonly T[], items: readonly T[], max: number): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const x of [...items, ...list]) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Sanitize whatever came out of storage (or a migration) into a valid SettingsState. */
export function sanitizePersisted(raw: unknown): SettingsState {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof SettingsState, unknown>>;
  return {
    settings: normalizeSettings(p.settings as Partial<GameSettings> | undefined),
    theme: oneOf(p.theme, THEMES, DEFAULT_PREFS.theme),
    volume: typeof p.volume === 'number' ? clamp01(p.volume) : DEFAULT_PREFS.volume,
    sfxEnabled: typeof p.sfxEnabled === 'boolean' ? p.sfxEnabled : DEFAULT_PREFS.sfxEnabled,
    hostPersonality: oneOf(p.hostPersonality, HOST_PERSONALITIES, DEFAULT_PREFS.hostPersonality),
    hostVoiceURI: typeof p.hostVoiceURI === 'string' && p.hostVoiceURI ? p.hostVoiceURI : null,
    reducedMotion: oneOf(p.reducedMotion, ['system', 'on', 'off'] as const, DEFAULT_PREFS.reducedMotion),
    playerName: typeof p.playerName === 'string' ? p.playerName.slice(0, 24) : DEFAULT_PREFS.playerName,
    recentPackIds: Array.isArray(p.recentPackIds)
      ? pushUnique([], p.recentPackIds.filter((x): x is string => typeof x === 'string'), MAX_RECENT_PACKS)
      : [],
    recentTrackIds: Array.isArray(p.recentTrackIds)
      ? pushUnique([], p.recentTrackIds.filter((x): x is number => typeof x === 'number'), MAX_RECENT_TRACKS)
      : [],
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: normalizeSettings(DEFAULT_SETTINGS),
      ...DEFAULT_PREFS,

      update: (partial) => set({ settings: normalizeSettings({ ...get().settings, ...partial }) }),
      applyPreset: (id) => {
        const preset = findPreset(id);
        if (!preset) return;
        set({ settings: applyPresetToSettings(get().settings, preset) });
      },
      reset: () => set({ settings: normalizeSettings(DEFAULT_SETTINGS) }),

      setTheme: (theme) => set({ theme: oneOf(theme, THEMES, DEFAULT_PREFS.theme) }),
      setVolume: (volume) => set({ volume: clamp01(volume) }),
      setSfxEnabled: (sfxEnabled) => set({ sfxEnabled }),
      setHostPersonality: (hostPersonality) => set({ hostPersonality }),
      setHostVoiceURI: (hostVoiceURI) => set({ hostVoiceURI: hostVoiceURI || null }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setPlayerName: (name) => set({ playerName: name.trim().slice(0, 24) }),
      pushRecentPack: (id) => set({ recentPackIds: pushUnique(get().recentPackIds, [id], MAX_RECENT_PACKS) }),
      pushRecentTracks: (ids) => set({ recentTrackIds: pushUnique(get().recentTrackIds, ids, MAX_RECENT_TRACKS) }),
      clearRecentTracks: () => set({ recentTrackIds: [] }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): SettingsState => ({
        settings: s.settings,
        theme: s.theme,
        volume: s.volume,
        sfxEnabled: s.sfxEnabled,
        hostPersonality: s.hostPersonality,
        hostVoiceURI: s.hostVoiceURI,
        reducedMotion: s.reducedMotion,
        playerName: s.playerName,
        recentPackIds: s.recentPackIds,
        recentTrackIds: s.recentTrackIds,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
