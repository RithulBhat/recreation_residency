/**
 * What a pack's numbers actually mean, in words.
 *
 * Shown under every value. It matters most in a mixed-pack run, where one card can be a
 * population and the next a draft pick: without a label the comparison is meaningless, and the
 * brief asks for mixed stats to be "clearly labelled".
 */

import type { ContentItem, UnitId } from '@/arcade/types';

const MEASURE: Record<UnitId, string> = {
  usd: 'GDP',
  gbp: 'value',
  eur: 'value',
  people: 'population',
  sqkm: 'surface area',
  year: 'year',
  pounds: 'weight',
  inches: 'height',
  rank: 'rank',
  count: 'count',
};

/**
 * `rank` is the one unit that means different things in different packs, so it is disambiguated
 * by the item's own category rather than by a pack id the item does not carry.
 */
export function measureFor(item: Pick<ContentItem, 'unit' | 'category'>): string {
  if (item.unit === 'rank') {
    if (item.category === 'Music') return 'chart heat';
    return 'draft pick';
  }
  return MEASURE[item.unit];
}

/**
 * True where a SMALLER number is the better one — a number 1 draft pick beats a number 200.
 * The game still asks plainly "higher or lower", about the number itself; this only drives the
 * hint text, so a player is never left guessing which direction "better" runs.
 */
export function lowerIsBetter(item: Pick<ContentItem, 'unit' | 'category'>): boolean {
  return item.unit === 'rank' && item.category !== 'Music';
}
