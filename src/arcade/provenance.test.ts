import { describe, expect, it } from 'vitest';
import type { ContentItem, ContentPack } from './types';
import {
  EMPTY_PROVENANCE,
  approximateNote,
  provenanceLine,
  summarizeProvenance,
} from './provenance';

function item(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'i',
    name: 'Thing',
    emoji: '📦',
    category: 'c',
    value: 1,
    unit: 'usd',
    source: 'World Bank',
    asOf: '2026-07-13',
    verified: true,
    ...over,
  };
}

function pack(items: ContentItem[], id = 'p'): ContentPack {
  return { id, name: id, emoji: '🎯', tagline: 't', category: 'c', unit: 'usd', items };
}

describe('summarizeProvenance', () => {
  it('is empty for no packs', () => {
    expect(summarizeProvenance([])).toEqual(EMPTY_PROVENANCE);
  });

  it('counts verified and unverified values', () => {
    const s = summarizeProvenance([
      pack([item({ id: 'a' }), item({ id: 'b', verified: false })]),
    ]);
    expect(s.totalItems).toBe(2);
    expect(s.verifiedItems).toBe(1);
    expect(s.unverifiedItems).toBe(1);
  });

  it('flags approximate when a SINGLE value is estimated — not a majority', () => {
    const items = Array.from({ length: 99 }, (_, i) => item({ id: `v${i}` }));
    items.push(item({ id: 'odd', verified: false }));
    expect(summarizeProvenance([pack(items)]).approximate).toBe(true);
  });

  it('is not approximate when everything is sourced', () => {
    expect(summarizeProvenance([pack([item()])]).approximate).toBe(false);
  });

  it('orders sources by how much they contribute, then alphabetically', () => {
    const s = summarizeProvenance([
      pack([
        item({ id: 'a', source: 'Deezer' }),
        item({ id: 'b', source: 'World Bank' }),
        item({ id: 'c', source: 'World Bank' }),
        item({ id: 'd', source: 'ESPN' }),
      ]),
    ]);
    expect(s.sources).toEqual(['World Bank', 'Deezer', 'ESPN']);
  });

  it('ignores a blank source in the credit list', () => {
    expect(summarizeProvenance([pack([item({ source: '   ' })])]).sources).toEqual([]);
  });

  it('reports the oldest and newest asOf, so staleness is visible', () => {
    const s = summarizeProvenance([
      pack([
        item({ id: 'a', asOf: '2024-01-01' }),
        item({ id: 'b', asOf: '2026-07-13' }),
        item({ id: 'c', asOf: '2025-05-05' }),
      ]),
    ]);
    expect(s.oldestAsOf).toBe('2024-01-01');
    expect(s.newestAsOf).toBe('2026-07-13');
  });

  it('spans several packs', () => {
    const s = summarizeProvenance([
      pack([item({ id: 'a' })], 'p1'),
      pack([item({ id: 'b', verified: false, source: 'Estimated' })], 'p2'),
    ]);
    expect(s.totalItems).toBe(2);
    expect(s.approximate).toBe(true);
    expect(s.sources).toContain('Estimated');
  });

  it('cannot drift — adding one estimated value flips the flag with no other edit', () => {
    const sourced = [item({ id: 'a' }), item({ id: 'b' })];
    expect(summarizeProvenance([pack(sourced)]).approximate).toBe(false);
    expect(summarizeProvenance([pack([...sourced, item({ id: 'c', verified: false })])]).approximate).toBe(
      true,
    );
  });
});

describe('approximateNote', () => {
  it('is null when nothing is estimated — no blank warning can render', () => {
    expect(approximateNote(summarizeProvenance([pack([item()])]), 'Prices')).toBeNull();
  });

  it('says so plainly when every value is estimated', () => {
    const s = summarizeProvenance([pack([item({ verified: false })])]);
    expect(approximateNote(s, 'Prices')).toBe('Prices are approximate');
  });

  it('qualifies when only some values are estimated', () => {
    const s = summarizeProvenance([
      pack([item({ id: 'a' }), item({ id: 'b', verified: false })]),
    ]);
    expect(approximateNote(s, 'Prices')).toBe('Some prices are approximate');
  });
});

describe('provenanceLine', () => {
  it('is null with no sources', () => {
    expect(provenanceLine(EMPTY_PROVENANCE)).toBeNull();
  });

  it('names a single source', () => {
    const s = summarizeProvenance([pack([item({ source: 'World Bank' })])]);
    expect(provenanceLine(s)).toBe('Data from World Bank');
  });

  it('joins two sources', () => {
    const s = summarizeProvenance([
      pack([item({ id: 'a', source: 'World Bank' }), item({ id: 'b', source: 'ESPN' })]),
    ]);
    expect(provenanceLine(s)).toBe('Data from ESPN and World Bank');
  });

  it('counts the remainder rather than listing a paragraph', () => {
    const s = summarizeProvenance([
      pack([
        item({ id: 'a', source: 'A' }),
        item({ id: 'b', source: 'B' }),
        item({ id: 'c', source: 'C' }),
        item({ id: 'd', source: 'D' }),
      ]),
    ]);
    expect(provenanceLine(s)).toBe('Data from A, B and 2 other sources');
  });

  it('uses the singular for exactly one remaining source', () => {
    const s = summarizeProvenance([
      pack([item({ id: 'a', source: 'A' }), item({ id: 'b', source: 'B' }), item({ id: 'c', source: 'C' })]),
    ]);
    expect(provenanceLine(s)).toBe('Data from A, B and 1 other source');
  });
});
