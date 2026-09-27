import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from '@/arcade/types';
import { renderShare } from '@/arcade/share';
import { DEFAULT_SETTINGS, reconcile } from './settings';
import { createInitialState, reduce, selectItems } from './engine';
import { markFor, shareCard } from './share';

function item(id: string, value: number): ContentItem {
  return { id, name: id, emoji: '📦', category: 'c', value, unit: 'usd',
    source: 's', asOf: '2026-09-27', verified: false };
}
const POOL = Array.from({ length: 10 }, (_, i) => item(`i${i}`, 100 * (i + 1)));

describe('markFor', () => {
  it('grades by how close the guess was', () => {
    expect(markFor(100, 100, false)).toBe('great');
    expect(markFor(110, 100, false)).toBe('good');
    expect(markFor(130, 100, false)).toBe('poor');
    expect(markFor(900, 100, false)).toBe('miss');
  });

  it('marks a Price Is Right overbid as a miss however close it was', () => {
    expect(markFor(101, 100, true)).toBe('miss');
  });

  it('marks a round with no guess as skipped', () => {
    expect(markFor(undefined, 100, false)).toBe('skip');
  });
});

describe('shareCard', () => {
  const settings = reconcile({ ...DEFAULT_SETTINGS, rounds: 3, seed: 'price-daily-x' });

  it('has one mark per played round and none for unplayed ones', () => {
    const items = selectItems(POOL, settings, createRng('s'));
    let state = reduce(createInitialState(settings, items), { type: 'start' });
    state = reduce(state, { type: 'guess', playerId: 'you', value: items[0].value, elapsedMs: 0 });
    expect(shareCard(state).marks).toHaveLength(1);
  });

  it('names the daily when it is one', () => {
    const state = createInitialState(settings, selectItems(POOL, settings, createRng('s')));
    expect(shareCard(state, { daily: '2026-09-27' }).title).toContain('Daily 2026-09-27');
    expect(shareCard(state).title).toBe('Price Guess');
  });

  it('leaks no item name or price into the shared text', () => {
    const items = selectItems(POOL, settings, createRng('s'));
    let state = reduce(createInitialState(settings, items), { type: 'start' });
    state = reduce(state, { type: 'guess', playerId: 'you', value: 12345, elapsedMs: 0 });
    const text = renderShare(shareCard(state, { daily: '2026-09-27' }));
    for (const i of items) expect(text).not.toContain(i.name);
    expect(text).not.toContain('12345');
  });
});
