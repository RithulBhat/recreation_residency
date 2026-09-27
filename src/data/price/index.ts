/**
 * Price Guess content packs.
 *
 * Every value here is an AUTHOR ESTIMATE, not a sourced figure — there is no free,
 * licence-clean price dataset, and inventing numbers and labelling them `verified: true` is
 * exactly what the brief forbids. So all of it ships `verified: false`, which makes each pack
 * `approximate`, which the hub and the setup screen both surface. `REPORT.md` lists every value
 * for fact-checking.
 *
 * Items carry emoji rather than images on purpose: hotlinking product photography is neither
 * allowed nor stable, and a consistent emoji board reads better than a grid of broken images.
 */

import type { ContentPack } from '@/arcade/types';
import groceries from './groceries.json';
import tech from './tech.json';
import luxury from './luxury.json';

export const PRICE_PACKS: readonly ContentPack[] = [
  groceries as ContentPack,
  tech as ContentPack,
  luxury as ContentPack,
];

export function pricePackById(id: string): ContentPack | undefined {
  return PRICE_PACKS.find((p) => p.id === id);
}

/** Every item across the selected packs; all packs when the selection is empty. */
export function pricePool(packIds: readonly string[]): readonly ContentPack[] {
  if (packIds.length === 0) return PRICE_PACKS;
  const chosen = PRICE_PACKS.filter((p) => packIds.includes(p.id));
  return chosen.length > 0 ? chosen : PRICE_PACKS;
}
