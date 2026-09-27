/**
 * Selection must not depend on how the run is going.
 *
 * The chain leak in `pairing.strategies.test.ts` came from the anchor being INHERITED rather than
 * chosen: anything that predicted where the walk had drifted predicted the answer. The general
 * form is wider than a chain — any state carried across rounds that feeds back into what the
 * next round contains gives the player something to read. A format that steps difficulty down as
 * you lose, a pool that drops items you have seen, a streak that unlocks harder content: each
 * makes "how am I doing" a clue about "what comes next".
 *
 * These tests pin the property structurally rather than statistically. Both games choose their
 * whole run up front from the seed, so no outcome can reach back into selection. If that ever
 * changes, this file fails before a harness has to discover it in the distribution.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import type { ContentItem } from './types';
import { buildSequence } from './pairing';
import { DEFAULT_SETTINGS, reconcile } from '@/price/settings';
import { createInitialState, reduce, reduceAll, selectItems } from '@/price/engine';

function item(id: string, value: number): ContentItem {
  return {
    id,
    name: id,
    emoji: '📦',
    category: 'c',
    value,
    unit: 'usd',
    source: 's',
    asOf: '2026-09-27',
    verified: true,
  };
}

const POOL: ContentItem[] = Array.from({ length: 60 }, (_, i) =>
  item(`i${i}`, Math.round(100 * Math.pow(1.12, i))),
);

describe('Higher or Lower selection is independent of play', () => {
  it('builds the entire run before a single answer is given', () => {
    const a = buildSequence(POOL, 'medium', 15, createRng('run'));
    const b = buildSequence(POOL, 'medium', 15, createRng('run'));
    expect(a.steps.map((s) => s.item.id)).toEqual(b.steps.map((s) => s.item.id));
  });

  it('gives the same sequence regardless of how many rounds are requested up to that point', () => {
    const long = buildSequence(POOL, 'medium', 20, createRng('run'));
    const short = buildSequence(POOL, 'medium', 5, createRng('run'));
    // a shorter run is a prefix of a longer one — the run does not re-plan as it goes
    expect(short.steps.map((s) => s.item.id)).toEqual(
      long.steps.slice(0, 5).map((s) => s.item.id),
    );
  });
});

describe('Price Guess selection is independent of play', () => {
  const settings = reconcile({ ...DEFAULT_SETTINGS, rounds: 6, seed: 'fixed' });

  it('picks every round from the seed alone', () => {
    const a = selectItems(POOL, settings, createRng('fixed'));
    const b = selectItems(POOL, settings, createRng('fixed'));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it('does not change the remaining items based on how the player is doing', () => {
    const items = selectItems(POOL, settings, createRng('fixed'));
    const perfect = reduceAll(reduce(createInitialState(settings, items), { type: 'start' }), [
      { type: 'guess', playerId: 'you', value: items[0].value, elapsedMs: 0 },
      { type: 'next' },
      { type: 'guess', playerId: 'you', value: items[1].value, elapsedMs: 0 },
      { type: 'next' },
    ]);
    const hopeless = reduceAll(reduce(createInitialState(settings, items), { type: 'start' }), [
      { type: 'guess', playerId: 'you', value: 1, elapsedMs: 0 },
      { type: 'next' },
      { type: 'guess', playerId: 'you', value: 1, elapsedMs: 0 },
      { type: 'next' },
    ]);
    expect(perfect.rounds.map((r) => r.item.id)).toEqual(hopeless.rounds.map((r) => r.item.id));
    // and the scores genuinely differ, so the runs really were different games
    expect(perfect.totalScore).toBeGreaterThan(hopeless.totalScore);
  });

  it('does not change the round order when hints are bought', () => {
    const items = selectItems(POOL, settings, createRng('fixed'));
    const base = reduce(createInitialState(settings, items), { type: 'start' });
    const hinted = reduce(base, { type: 'hint', hint: 'bracket' });
    expect(hinted.rounds.map((r) => r.item.id)).toEqual(base.rounds.map((r) => r.item.id));
  });

  it('does not change the round order when a player is eliminated', () => {
    const party = reconcile({
      ...DEFAULT_SETTINGS,
      rounds: 6,
      seed: 'fixed',
      scoring: 'elimination',
      players: [
        { id: 'a', name: 'A', emoji: '🦊', color: '#f97316' },
        { id: 'b', name: 'B', emoji: '🐙', color: '#a855f7' },
        { id: 'c', name: 'C', emoji: '🐸', color: '#34d399' },
      ],
    });
    const items = selectItems(POOL, party, createRng('fixed'));
    const state = reduceAll(reduce(createInitialState(party, items), { type: 'start' }), [
      { type: 'guess', playerId: 'a', value: items[0].value, elapsedMs: 0 },
      { type: 'guess', playerId: 'b', value: items[0].value * 1.1, elapsedMs: 0 },
      { type: 'guess', playerId: 'c', value: 999_999_999, elapsedMs: 0 },
      { type: 'next' },
    ]);
    expect(state.eliminated).toEqual(['c']);
    expect(state.rounds.map((r) => r.item.id)).toEqual(items.map((i) => i.id));
  });
});
