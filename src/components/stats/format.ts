/**
 * Small formatting helpers shared by the stats screen components.
 * Pure, framework-free, no locale surprises for score text (see `formatScore`).
 */

import type { GameMode } from '@/types/game';
import type { ClipBucket } from '@/stats/types';
import type { Rarity } from '@/stats/achievements';
import type { BadgeTone } from '@/components/ui/Badge';

export const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classic',
  fixed: 'Fixed clip',
  blitz: 'Blitz',
  survival: 'Survival',
  duel: 'Duel',
  party: 'Party',
};

export const MODE_EMOJI: Record<GameMode, string> = {
  classic: '💿',
  fixed: '⏱️',
  blitz: '⚡',
  survival: '🔥',
  duel: '⚔️',
  party: '🪩',
};

/** `0.82` → `82%`. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const clamped = Math.max(0, Math.min(1, value));
  return `${(clamped * 100).toFixed(digits)}%`;
}

/** `0.25` → `0.25s`. */
export function clipLabel(seconds: number | ClipBucket): string {
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}s`;
}

/** `275000` → `4m 35s`, `4_500_000` → `1h 15m`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** `just now` · `12m ago` · `3h ago` · `4d ago` · `2w ago` · `12 Mar`. */
export function relativeTime(at: number, now: number = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '—';
  const diff = now - at;
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 35) return `${Math.floor(days / 7)}w ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Absolute timestamp for `title=` tooltips. */
export function absoluteTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  return new Date(at).toLocaleString();
}

export const RARITY_TONE: Record<Rarity, BadgeTone> = {
  common: 'neutral',
  rare: 'accent',
  epic: 'gradient',
  legendary: 'warn',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};
