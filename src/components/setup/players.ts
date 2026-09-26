import type { PlayerConfig } from '@/types';
import { DEFAULT_PLAYERS } from '@/game/presets';

/** Curated emoji for the player picker. */
export const PLAYER_EMOJI: readonly string[] = [
  '🦊', '🐙', '🐸', '🐼', '🐱', '🐝', '👻', '🦖',
  '🐶', '🦁', '🐨', '🐵', '🦄', '🐧', '🐢', '🦋',
  '🐬', '🌵', '🍕', '🎸', '🚀', '👑', '🔥', '⚡',
];

export const PLAYER_COLORS: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#f97316', name: 'Orange' },
  { hex: '#a855f7', name: 'Violet' },
  { hex: '#34d399', name: 'Mint' },
  { hex: '#22d3ee', name: 'Cyan' },
  { hex: '#f472b6', name: 'Pink' },
  { hex: '#fbbf24', name: 'Gold' },
  { hex: '#818cf8', name: 'Indigo' },
  { hex: '#fb7185', name: 'Rose' },
];

/** The next default player whose id is not in use yet. */
export function nextDefaultPlayer(existing: readonly PlayerConfig[]): PlayerConfig {
  const used = new Set(existing.map((p) => p.id));
  const fresh = DEFAULT_PLAYERS.find((p) => !used.has(p.id));
  if (fresh) return { ...fresh };
  const n = existing.length + 1;
  const base = DEFAULT_PLAYERS[n % DEFAULT_PLAYERS.length] ?? DEFAULT_PLAYERS[0]!;
  return { ...base, id: `p${Date.now().toString(36)}`, name: `Player ${n}` };
}
