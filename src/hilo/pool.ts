/**
 * Choosing the pool for one run.
 *
 * ## A run compares ONE stat
 * The brief floats a "mixed stats" mode, and the naive reading — throw every selected pack into
 * one pool — produces rounds like "Wait a Minute! by WILLOW, chart heat 823,418" against
 * "Djibouti, population 1,168,722". Labelling those does not rescue them: the two numbers are
 * not comparable, so the round is not a question. It was the first thing visible on screen.
 *
 * So a run is always about a single unit. A selection spanning several is resolved to one,
 * chosen from the seed, and the setup screen says which. Mixing is still possible and still
 * interesting — several packs sharing a unit (three country stats, two NFL measures) play as one
 * pool — but a round never asks you to weigh people against chart positions.
 */

import type { Rng } from '@/game/rng';
import type { ContentItem, ContentPack, UnitId } from '@/arcade/types';
import { poolFrom } from '@/arcade/content';
import { hiloPool } from '@/data/hilo';

export interface RunPool {
  items: readonly ContentItem[];
  /** The unit every item in this run shares. */
  unit: UnitId | null;
  /** The packs that made it in. */
  packs: readonly ContentPack[];
  /** Packs dropped because they measure something else — surfaced, never silent. */
  droppedPacks: readonly ContentPack[];
}

/** Group packs by unit, largest group first, ties broken by pack id for a stable order. */
export function groupByUnit(packs: readonly ContentPack[]): ContentPack[][] {
  const groups = new Map<UnitId, ContentPack[]>();
  for (const p of packs) {
    const list = groups.get(p.unit);
    if (list) list.push(p);
    else groups.set(p.unit, [p]);
  }
  return [...groups.values()]
    .map((g) => [...g].sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => {
      const sizeA = a.reduce((n, p) => n + p.items.length, 0);
      const sizeB = b.reduce((n, p) => n + p.items.length, 0);
      return sizeB - sizeA || a[0].id.localeCompare(b[0].id);
    });
}

/**
 * Resolve a pack selection into a single-unit pool.
 *
 * `rng` picks the group when the selection spans units, so a seeded run (daily, duel, party
 * race) is about the same stat for everyone.
 */
export function resolveRunPool(packIds: readonly string[], rng?: Rng): RunPool {
  const selected = hiloPool(packIds);
  const groups = groupByUnit(selected);
  if (groups.length === 0) return { items: [], unit: null, packs: [], droppedPacks: [] };

  const chosen = rng ? groups[rng.int(0, groups.length - 1)] : groups[0];
  const dropped = selected.filter((p) => !chosen.includes(p));

  return {
    items: poolFrom(chosen),
    unit: chosen[0].unit,
    packs: chosen,
    droppedPacks: dropped,
  };
}
