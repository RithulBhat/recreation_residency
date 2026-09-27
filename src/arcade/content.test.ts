import { describe, expect, it } from 'vitest';
import type { ContentItem, ContentPack } from './types';
import { isApproximate, unverifiedItems } from './types';
import {
  isIsoDate,
  isUnitId,
  poolFrom,
  unitsOf,
  validateItem,
  validatePack,
  validatePacks,
} from './content';

function good(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'i1',
    name: 'Thing',
    emoji: '📦',
    category: 'test',
    value: 10,
    unit: 'usd',
    source: 'https://example.com',
    asOf: '2026-09-27',
    verified: true,
    ...over,
  };
}

function pack(over: Partial<ContentPack> = {}): ContentPack {
  return {
    id: 'p1',
    name: 'Pack',
    emoji: '🎯',
    tagline: 'A pack',
    category: 'test',
    unit: 'usd',
    items: [good()],
    ...over,
  };
}

const fields = (issues: { field: string }[]): string[] => issues.map((i) => i.field).sort();

describe('isIsoDate', () => {
  it('accepts a real date', () => {
    expect(isIsoDate('2026-09-27')).toBe(true);
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
  });

  it('rejects loose formats', () => {
    expect(isIsoDate('2026-9-27')).toBe(false);
    expect(isIsoDate('27/09/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(20260927)).toBe(false);
  });
});

describe('isUnitId', () => {
  it('accepts shipped units and rejects anything else', () => {
    expect(isUnitId('usd')).toBe(true);
    expect(isUnitId('people')).toBe(true);
    expect(isUnitId('bitcoin')).toBe(false);
    expect(isUnitId(undefined)).toBe(false);
  });
});

describe('validateItem', () => {
  it('passes a well-formed item', () => {
    expect(validateItem(good(), 'p1', 'usd')).toEqual([]);
  });

  it('requires provenance even when the value is unverified', () => {
    const issues = validateItem(good({ verified: false, source: '' }), 'p1', 'usd');
    expect(fields(issues)).toContain('source');
  });

  it('requires a real asOf date', () => {
    expect(fields(validateItem(good({ asOf: 'recently' }), 'p1', 'usd'))).toContain('asOf');
  });

  it('rejects a negative or non-finite value', () => {
    expect(fields(validateItem(good({ value: -5 }), 'p1', 'usd'))).toContain('value');
    expect(fields(validateItem(good({ value: Infinity }), 'p1', 'usd'))).toContain('value');
    expect(fields(validateItem(good({ value: NaN }), 'p1', 'usd'))).toContain('value');
  });

  it('catches an item whose unit disagrees with its pack', () => {
    const issues = validateItem(good({ unit: 'people' }), 'p1', 'usd');
    expect(issues[0]?.message).toContain("pack is 'usd'");
  });

  it('demands an emoji when there is no image', () => {
    const { emoji: _drop, ...noEmoji } = good();
    expect(fields(validateItem(noEmoji, 'p1', 'usd'))).toContain('emoji');
  });

  it('accepts an image instead of an emoji', () => {
    const { emoji: _drop, ...rest } = good();
    expect(validateItem({ ...rest, image: 'https://cdn.example/x.png' }, 'p1', 'usd')).toEqual([]);
  });

  it('requires verified to be an explicit boolean, not merely truthy', () => {
    expect(fields(validateItem(good({ verified: 'yes' as unknown as boolean }), 'p1', 'usd'))).toContain(
      'verified',
    );
  });

  it('does not throw on junk input', () => {
    expect(validateItem(null, 'p1', 'usd')).toHaveLength(1);
    expect(validateItem('nope', 'p1', 'usd')).toHaveLength(1);
  });
});

describe('validatePack', () => {
  it('passes a well-formed pack', () => {
    expect(validatePack(pack())).toEqual([]);
  });

  it('catches duplicate item ids', () => {
    const issues = validatePack(pack({ items: [good(), good()] }));
    expect(issues.some((i) => i.message === 'duplicate id')).toBe(true);
  });

  it('flags an empty pack', () => {
    expect(fields(validatePack(pack({ items: [] })))).toContain('items');
  });

  it('flags a missing unit and stops before reading items', () => {
    const issues = validatePack({ ...pack(), unit: undefined });
    expect(fields(issues)).toContain('unit');
  });

  it('does not throw on junk input', () => {
    expect(validatePack(null)[0].message).toContain('not an object');
  });
});

describe('validatePacks', () => {
  it('catches a pack id reused across files', () => {
    const issues = validatePacks([pack(), pack()]);
    expect(issues.some((i) => i.message === 'duplicate pack id')).toBe(true);
  });

  it('passes distinct packs', () => {
    expect(validatePacks([pack(), pack({ id: 'p2' })])).toEqual([]);
  });
});

describe('approximate packs', () => {
  it('marks a pack approximate when any single value is unverified', () => {
    expect(isApproximate(pack())).toBe(false);
    const mixed = pack({ items: [good(), good({ id: 'i2', verified: false })] });
    expect(isApproximate(mixed)).toBe(true);
    expect(unverifiedItems(mixed).map((i) => i.id)).toEqual(['i2']);
  });
});

describe('poolFrom / unitsOf', () => {
  it('merges packs into one pool', () => {
    const merged = poolFrom([pack(), pack({ id: 'p2', items: [good({ id: 'i2' })] })]);
    expect(merged.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('keeps same-id items from different packs — ids are only unique within a pack', () => {
    const merged = poolFrom([pack(), pack({ id: 'p2' })]);
    expect(merged).toHaveLength(2);
  });

  it('reports every unit in a selection so mixed stats can be labelled', () => {
    expect(unitsOf([pack(), pack({ id: 'p2', unit: 'people' })])).toEqual(['usd', 'people']);
  });
});
