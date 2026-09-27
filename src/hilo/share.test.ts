import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { renderShare } from '@/arcade/share';
import { DEFAULT_SETTINGS, reconcile } from './settings';
import { correctPick, createInitialState, reduce } from './engine';
import { markFor, shareCard } from './share';

function item(id: string, value: number): ContentItem {
  return { id, name: `Country ${id}`, emoji: '🌍', category: 'c', value, unit: 'people',
    source: 's', asOf: '2026-09-27', verified: true };
}
const POOL = Array.from({ length: 40 }, (_, i) => item(`i${i}`, Math.round(1000 * Math.pow(1.2, i))));

describe('markFor', () => {
  it('maps outcomes to glyphs', () => {
    expect(markFor('correct')).toBe('great');
    expect(markFor('wrong')).toBe('miss');
    expect(markFor('timeout')).toBe('miss');
    expect(markFor('skipped')).toBe('skip');
    expect(markFor(null)).toBe('miss');
  });
});

describe('shareCard', () => {
  const settings = reconcile({ ...DEFAULT_SETTINGS, format: 'rounds', rounds: 5, seed: 'hilo-daily-x' });

  it('has one mark per round played', () => {
    let s = reduce(createInitialState(settings, POOL, createRng('s')), { type: 'start' });
    s = reduce(s, { type: 'pick', pick: correctPick(s) ?? 'higher', elapsedMs: 0 });
    expect(shareCard(s).marks).toHaveLength(1);
  });

  it('names the daily when it is one', () => {
    const s = createInitialState(settings, POOL, createRng('s'));
    expect(shareCard(s, { daily: '2026-09-27' }).title).toContain('Daily 2026-09-27');
  });

  it('leaks no item name or value', () => {
    let s = reduce(createInitialState(settings, POOL, createRng('s')), { type: 'start' });
    s = reduce(s, { type: 'pick', pick: 'higher', elapsedMs: 0 });
    const text = renderShare(shareCard(s, { daily: '2026-09-27' }));
    expect(text).not.toContain('Country');
  });
});
