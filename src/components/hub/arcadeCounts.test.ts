import { describe, expect, it } from 'vitest';
import { PRICE_PACKS } from '@/data/price';
import { HILO_PACKS } from '@/data/hilo';
import {
  HILO_ITEM_COUNT,
  HILO_PACK_COUNT,
  PRICE_ITEM_COUNT,
  PRICE_PACK_COUNT,
} from './counts';

/**
 * The hub is the front door, so its numbers are constants rather than imports of 800 kB of JSON.
 * That is exactly how a card came to advertise "7 clue modes" for a game with thirteen, so these
 * load the real data and fail the build the moment a constant drifts.
 */
describe('arcade counts match the real content', () => {
  it('price packs and items', () => {
    expect(PRICE_PACK_COUNT).toBe(PRICE_PACKS.length);
    expect(PRICE_ITEM_COUNT).toBe(PRICE_PACKS.reduce((n, p) => n + p.items.length, 0));
  });

  it('hilo packs and items', () => {
    expect(HILO_PACK_COUNT).toBe(HILO_PACKS.length);
    expect(HILO_ITEM_COUNT).toBe(HILO_PACKS.reduce((n, p) => n + p.items.length, 0));
  });
});
