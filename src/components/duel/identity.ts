/**
 * Duel identity: the name / emoji / color the opponent sees.
 *
 * The name lives in the settings store (`playerName`, shared with the rest of the app); the
 * emoji + color are a device-level flourish kept in localStorage under `sg:duel-identity`
 * so a returning player keeps their look without touching the shared settings schema.
 */

import type { PlayerConfig } from '@/types';
import { SOLO_PLAYER } from '@/game/presets';

/** The engine gives every solo game the player id 'you' — reuse it so Play stays consistent. */
export const ME_ID = SOLO_PLAYER.id;

export const DUEL_EMOJIS: readonly string[] = [
  '🎧', '🎤', '🎸', '🥁', '🎹', '🪩', '🔥', '⚡',
  '💀', '👻', '🦊', '🐙', '🐸', '🐼', '🚀', '👑',
];

export const DUEL_COLORS: readonly string[] = [
  '#a855f7', '#22d3ee', '#f472b6', '#34d399',
  '#fbbf24', '#fb7185', '#818cf8', '#f97316',
];

export interface DuelLook {
  emoji: string;
  color: string;
}

const LOOK_KEY = 'sg:duel-identity';
const MAX_NAME = 24;

function pick<T>(list: readonly T[], fallback: T): T {
  return list.length === 0 ? fallback : list[Math.floor(Math.random() * list.length)];
}

/** A random look, used the first time someone opens the lobby on this device. */
export function randomLook(): DuelLook {
  return { emoji: pick(DUEL_EMOJIS, '🎧'), color: pick(DUEL_COLORS, '#a855f7') };
}

export function loadLook(): DuelLook {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const rec = parsed as Record<string, unknown>;
        const emoji = typeof rec.emoji === 'string' && DUEL_EMOJIS.includes(rec.emoji) ? rec.emoji : null;
        const color = typeof rec.color === 'string' && DUEL_COLORS.includes(rec.color) ? rec.color : null;
        if (emoji && color) return { emoji, color };
      }
    }
  } catch {
    /* private mode / corrupt value — fall through to a fresh look */
  }
  return randomLook();
}

export function saveLook(look: DuelLook): void {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    /* nothing to do — the look is cosmetic */
  }
}

/** Trim to what the wire protocol accepts; empty names become 'Player'. */
export function cleanName(name: string): string {
  return name.trim().slice(0, MAX_NAME);
}

export function toPlayerConfig(name: string, look: DuelLook): PlayerConfig {
  return { id: ME_ID, name: cleanName(name) || 'Player', emoji: look.emoji, color: look.color };
}
