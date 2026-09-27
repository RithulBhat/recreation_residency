import { describe, expect, it } from 'vitest';
import { validatePacks } from '@/arcade/content';
import { summarizeProvenance, approximateNote } from '@/arcade/provenance';
import { isApproximate } from '@/arcade/types';
import { PRICE_PACKS, pricePackById, pricePool } from './index';

describe('price packs', () => {
  it('every pack passes the content schema', () => {
    const issues = validatePacks(PRICE_PACKS as unknown[]);
    expect(
      issues,
      issues.map((i) => `${i.pack}/${i.item ?? '-'}.${i.field}: ${i.message}`).join('\n'),
    ).toEqual([]);
  });

  it('ships enough content to play', () => {
    expect(PRICE_PACKS.length).toBeGreaterThanOrEqual(3);
    for (const p of PRICE_PACKS) {
      expect(p.items.length, `${p.id} is too small to play`).toBeGreaterThanOrEqual(20);
    }
  });

  it('is honest that every value is an estimate', () => {
    for (const p of PRICE_PACKS) expect(isApproximate(p), `${p.id}`).toBe(true);
    const summary = summarizeProvenance(PRICE_PACKS);
    expect(summary.verifiedItems).toBe(0);
    expect(approximateNote(summary, 'Prices')).toBe('Prices are approximate');
  });

  it('spans several orders of magnitude, so difficulty has room to move', () => {
    const values = PRICE_PACKS.flatMap((p) => p.items.map((i) => i.value));
    expect(Math.min(...values)).toBeLessThan(10);
    expect(Math.max(...values)).toBeGreaterThan(100_000);
  });

  it('gives every item an emoji, since no item carries an image', () => {
    for (const p of PRICE_PACKS) {
      for (const i of p.items) {
        expect(i.image, `${p.id}/${i.id} hotlinks an image`).toBeUndefined();
        expect(i.emoji, `${p.id}/${i.id} has no emoji fallback`).toBeTruthy();
      }
    }
  });

  it('looks up by id', () => {
    expect(pricePackById('tech')?.name).toBe('Tech & Gadgets');
    expect(pricePackById('nope')).toBeUndefined();
  });

  it('falls back to every pack for an empty or unknown selection', () => {
    expect(pricePool([])).toHaveLength(PRICE_PACKS.length);
    expect(pricePool(['nonsense'])).toHaveLength(PRICE_PACKS.length);
    expect(pricePool(['tech'])).toHaveLength(1);
  });
});
