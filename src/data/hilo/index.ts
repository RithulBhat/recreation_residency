/**
 * Higher or Lower content packs, baked by `scripts/sync-hilo.mjs`.
 *
 * Unlike Price Guess, almost all of this is genuinely sourced: World Bank indicators (with the
 * provider's own `lastupdated` as `asOf`), ESPN roster data already in the repo, and Deezer
 * chart popularity harvested in Node. Every item ships `verified: true`.
 */

import type { ContentPack } from '@/arcade/types';
import population from './country-population.json';
import gdp from './country-gdp.json';
import area from './country-area.json';
import nflWeight from './nfl-weight.json';
import nflDraft from './nfl-draft.json';
import songs from './song-popularity.json';

export const HILO_PACKS: readonly ContentPack[] = [
  population as ContentPack,
  gdp as ContentPack,
  area as ContentPack,
  nflWeight as ContentPack,
  nflDraft as ContentPack,
  songs as ContentPack,
];

export function hiloPackById(id: string): ContentPack | undefined {
  return HILO_PACKS.find((p) => p.id === id);
}

/**
 * The packs a selection refers to; all of them when nothing is chosen.
 *
 * Mixing units is allowed (the brief's "mixed stats" mode) but the UI must label it — comparing
 * a population to a draft pick is meaningless unless the player knows which is which.
 */
export function hiloPool(packIds: readonly string[]): readonly ContentPack[] {
  if (packIds.length === 0) return HILO_PACKS;
  const chosen = HILO_PACKS.filter((p) => packIds.includes(p.id));
  return chosen.length > 0 ? chosen : HILO_PACKS;
}
