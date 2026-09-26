/**
 * Curated pack catalog — 220 packs, every Deezer id verified by `scripts/verify-packs.mjs`.
 *
 * The data lives in `packs.json` so the verification script (plain Node ESM) and the app
 * read exactly the same bytes; this module only types it and derives lookup helpers.
 * Run `npm run catalog:verify -- --write` to refresh `approxSize` after editing sources.
 */

import type { Pack, PackCategory } from '@/types/catalog';
import raw from './packs.json';

export const PACKS: Pack[] = raw as Pack[];

/** Slug → pack, for O(1) lookup. */
export const PACKS_BY_ID: ReadonlyMap<string, Pack> = new Map(PACKS.map((p) => [p.id, p]));

export const FEATURED_PACKS: Pack[] = PACKS.filter((p) => p.featured === true);

export function packsInCategory(category: PackCategory): Pack[] {
  return PACKS.filter((p) => p.category === category);
}
