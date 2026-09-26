/**
 * How big is the pool? The lobby answers that live, from the real dataset rather than a guess.
 *
 * `ScoutPack.approxSize` is a hand-written hint written before the roster sync existed; the numbers
 * shown in the lobby come from `src/data/nfl` through `loadScoutBundle()` and the SAME predicates
 * `@/scout/subjects` uses to build a pool (`playerMatchesFilter`, `teamMatchesFilter`, `tierOf`), so
 * the count on screen can never disagree with what Start actually deals.
 */

import { useCallback, useEffect, useState } from 'react';
import { loadScoutBundle } from '@/scout/data';
import { SCOUT_PACKS } from '@/scout/packs';
import {
  buildPool,
  playerMatchesFilter,
  teamMatchesFilter,
  tierOf,
  type ScoutPoolSource,
} from '@/scout/subjects';
import type { NflTeam, ScoutDifficulty, ScoutPack, ScoutSettings } from '@/scout/types';

/** Team lookup by id — every player filter needs the team for conference/division rules. */
export function teamsById(dataset: ScoutPoolSource): Map<string, NflTeam> {
  const m = new Map<string, NflTeam>();
  for (const t of dataset.teams) m.set(t.id, t);
  return m;
}

/**
 * Subjects one pack contributes at a difficulty tier. Player packs count players (tier-filtered,
 * exactly like `buildPool`); team packs count franchises, which have no fame score.
 */
export function countPackSubjects(
  dataset: ScoutPoolSource,
  pack: ScoutPack,
  difficulty: ScoutDifficulty = 'any',
  teams: Map<string, NflTeam> = teamsById(dataset),
): number {
  if (pack.kind === 'team') {
    let n = 0;
    for (const team of dataset.teams) if (teamMatchesFilter(team, pack.filter)) n += 1;
    return n;
  }
  let n = 0;
  for (const player of dataset.players) {
    if (difficulty !== 'any' && tierOf(player) !== difficulty) continue;
    if (playerMatchesFilter(player, pack.filter, teams.get(player.teamId))) n += 1;
  }
  return n;
}

/** Every pack's count in one pass over the roster — the grid needs all 40+ at once. */
export function scoutPackCounts(
  dataset: ScoutPoolSource,
  difficulty: ScoutDifficulty = 'any',
  packs: readonly ScoutPack[] = SCOUT_PACKS,
): Record<string, number> {
  const teams = teamsById(dataset);
  const out: Record<string, number> = {};
  for (const pack of packs) out[pack.id] = countPackSubjects(dataset, pack, difficulty, teams);
  return out;
}

/**
 * The exact number of subjects a run of `settings` would deal — packs, difficulty, mode
 * renderability and de-duplication all applied. This is `buildPool().length`, not an estimate.
 */
export function scoutPoolSize(dataset: ScoutPoolSource, settings: ScoutSettings): number {
  return buildPool(dataset, settings).length;
}

export interface ScoutDatasetState {
  dataset: ScoutPoolSource | null;
  loading: boolean;
  /** Human copy for the inline error. */
  error: string | null;
  retry: () => void;
}

const LOAD_FAILED =
  'The NFL dataset chunk did not load. Check your connection and try again — nothing else is needed to play.';

/**
 * Load the baked dataset once per session (it is cached in `@/scout/data`). Kicking it off from the
 * lobby also warms the chunk, so pressing Start is instant.
 */
export function useScoutDataset(): ScoutDatasetState {
  const [dataset, setDataset] = useState<ScoutPoolSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadScoutBundle().then(
      (d) => {
        if (!alive) return;
        setDataset(d);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setError(LOAD_FAILED);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { dataset, loading, error, retry };
}
