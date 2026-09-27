/**
 * Content validation and pack helpers.
 *
 * The build prompt's hardest content rule is "don't invent precise figures and present them as
 * facts", and the only way to keep that true as packs grow is to make provenance a schema
 * requirement rather than an author's good intention. So `validatePack` rejects an item with no
 * `source`, no `asOf`, or a non-ISO date — including unverified ones, which still have to say
 * where the estimate came from.
 *
 * Every function here is pure and runs in both Node (the validation script) and the browser.
 */

import type { ContentItem, ContentPack, UnitId } from './types';

const UNIT_IDS: readonly UnitId[] = [
  'usd',
  'gbp',
  'eur',
  'people',
  'sqkm',
  'year',
  'pounds',
  'inches',
  'rank',
  'count',
];

export function isUnitId(v: unknown): v is UnitId {
  return typeof v === 'string' && (UNIT_IDS as readonly string[]).includes(v);
}

/** Strict `YYYY-MM-DD`, and a real date — `2026-02-31` is rejected, not silently rolled over. */
export function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

export interface Issue {
  /** Pack id, or `'<root>'` for a problem with the file itself. */
  pack: string;
  /** Item id when the problem is item-level. */
  item?: string;
  field: string;
  message: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Validate one item. `packUnit` is passed so a pack mixing dollars and people is caught here
 * rather than showing up as a nonsensical comparison mid-game.
 */
export function validateItem(raw: unknown, packId: string, packUnit: UnitId): Issue[] {
  const issues: Issue[] = [];
  const at = (field: string, message: string, item?: string): void => {
    issues.push({ pack: packId, item, field, message });
  };

  if (!isRecord(raw)) {
    at('<item>', 'item is not an object');
    return issues;
  }

  const id = raw.id;
  const label = typeof id === 'string' ? id : '<no id>';
  if (!nonEmptyString(id)) at('id', 'missing or empty', label);
  if (!nonEmptyString(raw.name)) at('name', 'missing or empty', label);
  if (!nonEmptyString(raw.category)) at('category', 'missing or empty', label);

  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
    at('value', 'must be a finite number', label);
  } else if (raw.value < 0) {
    at('value', `must not be negative (got ${raw.value})`, label);
  }

  if (!isUnitId(raw.unit)) {
    at('unit', `missing or unknown unit (got ${JSON.stringify(raw.unit)})`, label);
  } else if (raw.unit !== packUnit) {
    at('unit', `is '${raw.unit}' but the pack is '${packUnit}'`, label);
  }

  if (!nonEmptyString(raw.source)) {
    at('source', 'every value must say where it came from, verified or not', label);
  }
  if (!isIsoDate(raw.asOf)) {
    at('asOf', `must be a real YYYY-MM-DD date (got ${JSON.stringify(raw.asOf)})`, label);
  }
  if (typeof raw.verified !== 'boolean') {
    at('verified', 'must be an explicit boolean', label);
  }
  if (raw.image !== undefined && !nonEmptyString(raw.image)) {
    at('image', 'present but empty — omit it instead', label);
  }
  if (raw.image === undefined && raw.emoji === undefined) {
    at('emoji', 'an item with no image must carry an emoji fallback', label);
  }

  return issues;
}

/** Validate a pack and everything in it, including duplicate ids. */
export function validatePack(raw: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(raw)) {
    return [{ pack: '<root>', field: '<pack>', message: 'pack is not an object' }];
  }

  const packId = nonEmptyString(raw.id) ? raw.id : '<no id>';
  const at = (field: string, message: string): void => {
    issues.push({ pack: packId, field, message });
  };

  if (!nonEmptyString(raw.id)) at('id', 'missing or empty');
  if (!nonEmptyString(raw.name)) at('name', 'missing or empty');
  if (!nonEmptyString(raw.emoji)) at('emoji', 'missing or empty');
  if (!nonEmptyString(raw.tagline)) at('tagline', 'missing or empty');
  if (!nonEmptyString(raw.category)) at('category', 'missing or empty');
  if (!isUnitId(raw.unit)) {
    at('unit', `missing or unknown unit (got ${JSON.stringify(raw.unit)})`);
    return issues;
  }

  if (!Array.isArray(raw.items)) {
    at('items', 'must be an array');
    return issues;
  }
  if (raw.items.length === 0) at('items', 'pack is empty');

  const seen = new Set<string>();
  for (const entry of raw.items) {
    issues.push(...validateItem(entry, packId, raw.unit));
    if (isRecord(entry) && nonEmptyString(entry.id)) {
      if (seen.has(entry.id)) {
        issues.push({ pack: packId, item: entry.id, field: 'id', message: 'duplicate id' });
      }
      seen.add(entry.id);
    }
  }

  return issues;
}

/** Validate a whole set of packs, also catching ids duplicated *across* packs. */
export function validatePacks(packs: readonly unknown[]): Issue[] {
  const issues: Issue[] = [];
  const seenPackIds = new Set<string>();
  for (const pack of packs) {
    issues.push(...validatePack(pack));
    if (isRecord(pack) && nonEmptyString(pack.id)) {
      if (seenPackIds.has(pack.id)) {
        issues.push({ pack: pack.id, field: 'id', message: 'duplicate pack id' });
      }
      seenPackIds.add(pack.id);
    }
  }
  return issues;
}

/** Merge several packs into one playable pool. Units must match or the result is meaningless. */
export function poolFrom(packs: readonly ContentPack[]): readonly ContentItem[] {
  const out: ContentItem[] = [];
  const seen = new Set<string>();
  for (const pack of packs) {
    for (const i of pack.items) {
      const key = `${pack.id}:${i.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i);
    }
  }
  return out;
}

/** The units present across a selection — more than one means "mixed stats" must be labelled. */
export function unitsOf(packs: readonly ContentPack[]): readonly UnitId[] {
  return [...new Set(packs.map((p) => p.unit))];
}
