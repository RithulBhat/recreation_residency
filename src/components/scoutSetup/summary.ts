/**
 * Pure text for the Highlight Scout lobby, daily and stats screens: the start-bar one-liner,
 * the difficulty copy, and the little "N players" phrasings. Framework-free so it unit tests.
 *
 * Scout's equivalent of `@/components/setup/summary` — deliberately the same shapes (`MODE_LABEL`,
 * `packsSummary`, `settingsSummary`) so the two lobbies read identically.
 */

import { SCOUT_MODES, scoutMode, scoutPack } from '@/scout/packs';
import {
  FACE_ZOOM_MAX,
  FACE_ZOOM_MIN,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  SILHOUETTE_MAX,
  visualLadder,
} from '@/scout/stages';
import type { ScoutDifficulty, ScoutMode, ScoutSettings } from '@/scout/types';

export const SCOUT_MODE_LABEL: Readonly<Record<ScoutMode, string>> = Object.fromEntries(
  SCOUT_MODES.map((m) => [m.id, m.name]),
) as Record<ScoutMode, string>;

export const SCOUT_MODE_EMOJI: Readonly<Record<ScoutMode, string>> = Object.fromEntries(
  SCOUT_MODES.map((m) => [m.id, m.emoji]),
) as Record<ScoutMode, string>;

/** Plain English for each tier, keyed to the fame windows in CLAUDE.md. */
export const SCOUT_DIFFICULTY_INFO: Readonly<
  Record<ScoutDifficulty, { label: string; hint: string; fame: string }>
> = {
  any: {
    label: 'Any',
    hint: 'Every tier mixed together — posters, starters and camp bodies.',
    fame: 'fame 0–100',
  },
  star: {
    label: 'Superstars',
    hint: 'Household names. If they have a jersey in the stands, they qualify.',
    fame: 'fame 80+',
  },
  starter: {
    label: 'Starters',
    hint: 'Week-one starters. You know the name, maybe not the face.',
    fame: 'fame 55–79',
  },
  rotation: {
    label: 'Rotation',
    hint: 'Role players and rotational depth. Fantasy managers only.',
    fame: 'fame 30–54',
  },
  deepCut: {
    label: 'Deep cuts',
    hint: 'Practice-squad energy. Nobody knows these. Sickos only.',
    fame: 'fame under 30',
  },
};

export const SCOUT_DIFFICULTY_ORDER: readonly ScoutDifficulty[] = [
  'any',
  'star',
  'starter',
  'rotation',
  'deepCut',
];

/** A mode's display name, falling back to the raw id if a mode is ever removed. */
export function scoutModeName(mode: ScoutMode): string {
  return scoutMode(mode)?.name ?? mode;
}

/** The mode's one-line "how it plays", with the draft's try count folded in. */
export function scoutModeHow(mode: ScoutMode, tries: number): string {
  const info = scoutMode(mode);
  if (!info) return `${tries} ${tryWord(tries)}`;
  return `${info.how} ${tries} ${tryWord(tries)}.`;
}

export function tryWord(n: number): string {
  return n === 1 ? 'try' : 'tries';
}

export function roundsLabel(rounds: number): string {
  return rounds === 0 ? '∞ rounds' : `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
}

export function triesLabel(tries: number): string {
  return `${tries} ${tryWord(tries)}`;
}

export function timerLabel(seconds: number): string {
  return seconds === 0 ? 'no timer' : `${seconds}s timer`;
}

/** `Superstars`, `Superstars + Rookies`, `Superstars + Rookies +2`. */
export function scoutPacksSummary(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return 'No packs';
  if (second === undefined) return first;
  const shown = `${first} + ${second}`;
  return names.length === 2 ? shown : `${shown} +${names.length - 2}`;
}

/** Names for a list of pack ids, unknown ids dropped. */
export function scoutPackNames(ids: readonly string[]): string[] {
  return ids.map((id) => scoutPack(id)?.name).filter((n): n is string => typeof n === 'string');
}

/**
 * The start-bar one-liner: `10 rounds · Silhouette · Superstars · Superstars · 4 tries · 30s timer`.
 * Mode first when it is a single mode; `Mixed bag` when the run shuffles them.
 */
export function scoutSettingsSummary(s: ScoutSettings, packNames?: readonly string[]): string {
  const names = packNames ?? scoutPackNames(s.packIds);
  const parts = [
    roundsLabel(s.rounds),
    s.mixModes ? 'Mixed bag' : scoutModeName(s.mode),
    scoutPacksSummary(names),
  ];
  if (s.difficulty !== 'any') parts.push(SCOUT_DIFFICULTY_INFO[s.difficulty].label);
  parts.push(triesLabel(s.tries));
  if (s.roundTimer > 0) parts.push(timerLabel(s.roundTimer));
  if (!s.hintsEnabled) parts.push('no hints');
  return parts.join(' · ');
}

/** `12 players`, `1 player`, `32 franchises` — the pool line under the Start button. */
export function poolLabel(count: number, kind: 'player' | 'team' | 'mixed'): string {
  const noun = kind === 'team' ? 'franchise' : kind === 'mixed' ? 'subject' : 'player';
  const plural = kind === 'team' ? 'franchises' : kind === 'mixed' ? 'subjects' : 'players';
  return `${count.toLocaleString()} ${count === 1 ? noun : plural}`;
}

/** What a run of these settings will be naming: players, franchises, or both. */
export function poolKind(s: Pick<ScoutSettings, 'mode' | 'mixModes'>): 'player' | 'team' | 'mixed' {
  if (s.mixModes) return 'mixed';
  return SCOUT_MODES.find((m) => m.id === s.mode)?.guesses ?? 'player';
}

/** Human copy when the pool comes back empty. */
export function emptyPoolMessage(s: ScoutSettings): string {
  const names = scoutPackNames(s.packIds);
  const where = names.length > 0 ? scoutPacksSummary(names) : 'these packs';
  const tier = s.difficulty === 'any' ? '' : ` at ${SCOUT_DIFFICULTY_INFO[s.difficulty].label}`;
  return `Nobody in ${where}${tier} can be played as ${scoutModeName(s.mode)}. Add a pack or drop the difficulty.`;
}

/** `0.82` → `82%`. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

/**
 * The reveal ladder a visual mode will walk for `tries` rungs, 0 → 1, or null for the text modes
 * (whose ladder is clues, not pixels). Reads the same constants `@/scout/stages` builds rounds from.
 */
export function scoutRevealLadder(mode: ScoutMode, tries: number): number[] | null {
  const range = VISUAL_RANGE[mode];
  if (!range) return null;
  return visualLadder(tries, range.min, range.max);
}

const VISUAL_RANGE: Partial<Record<ScoutMode, { min: number; max: number }>> = {
  silhouette: { min: 0, max: SILHOUETTE_MAX },
  faceZoom: { min: FACE_ZOOM_MIN, max: FACE_ZOOM_MAX },
  logoZoom: { min: LOGO_ZOOM_MIN, max: LOGO_ZOOM_MAX },
};
