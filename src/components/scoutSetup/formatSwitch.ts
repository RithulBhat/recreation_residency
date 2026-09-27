/**
 * Moving between SESSION FORMATS without silently destroying the draft.
 *
 * `normalizeScoutSettings` overwrites what a format cannot play: blitz, survival and the gauntlet
 * force `rounds: 0`; survival and the gauntlet force `difficulty: 'any'`; the gauntlet rewrites
 * `packIds` to league-wide coverage so it can reach all 32 franchises. Those writes are correct —
 * but they mean a LOOK at the gauntlet would otherwise cost you the 10 rounds, the tier and the pack
 * selection you had picked, with nothing on screen to say so.
 *
 * So switching format restores every key the format being LEFT had overwritten and the format being
 * ENTERED can use again: from `kept` (what the player last chose while a format that honours it was
 * selected) or, when nothing was kept — a deep link straight into a format, say — from the defaults.
 * A key both formats use is never touched.
 */

import { formatUses, scoutFormat } from '@/scout/formats';
import { DEFAULT_SCOUT_SETTINGS } from '@/scout/presets';
import type { ScoutDifficulty, ScoutFormat, ScoutSettings } from '@/scout/types';

/** The player's last choice for each key a format can overwrite. Every field optional. */
export interface KeptScoutSettings {
  packIds?: readonly string[];
  rounds?: number;
  difficulty?: ScoutDifficulty;
}

/** The keys a format is allowed to overwrite, and which every other format can hand back. */
const RESTORED = ['packIds', 'rounds', 'difficulty'] as const;

/**
 * The patch that switches `current` to the `next` format. Always sets `format`; adds back a key only
 * when the outgoing format ignored it and the incoming one reads it.
 */
export function scoutFormatSwitch(
  current: Pick<ScoutSettings, 'format' | 'packIds' | 'rounds' | 'difficulty'>,
  next: ScoutFormat,
  kept?: KeptScoutSettings,
): Partial<ScoutSettings> {
  const from = scoutFormat(current);
  const patch: Partial<ScoutSettings> = { format: next };
  if (from === next) return patch;
  for (const key of RESTORED) {
    if (!formatUses(next, key) || formatUses(from, key)) continue;
    if (key === 'packIds') {
      const packIds = kept?.packIds ?? DEFAULT_SCOUT_SETTINGS.packIds;
      patch.packIds = [...packIds];
    } else if (key === 'rounds') {
      patch.rounds = kept?.rounds ?? DEFAULT_SCOUT_SETTINGS.rounds;
    } else {
      patch.difficulty = kept?.difficulty ?? DEFAULT_SCOUT_SETTINGS.difficulty;
    }
  }
  return patch;
}

/** Update the remembered values with whatever the CURRENT format actually honours. */
export function keepScoutSettings(
  kept: KeptScoutSettings,
  settings: Pick<ScoutSettings, 'format' | 'packIds' | 'rounds' | 'difficulty'>,
): void {
  const format = scoutFormat(settings);
  if (formatUses(format, 'packIds')) kept.packIds = settings.packIds;
  if (formatUses(format, 'rounds')) kept.rounds = settings.rounds;
  if (formatUses(format, 'difficulty')) kept.difficulty = settings.difficulty;
}
