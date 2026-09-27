import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import { HILO_PACKS } from '@/data/hilo';
import { groupByUnit, resolveRunPool } from './pool';

describe('groupByUnit', () => {
  it('puts packs measuring the same thing together', () => {
    const groups = groupByUnit(HILO_PACKS);
    for (const g of groups) {
      const units = new Set(g.map((p) => p.unit));
      expect(units.size).toBe(1);
    }
  });

  it('orders by how much content each group has', () => {
    const groups = groupByUnit(HILO_PACKS);
    const sizes = groups.map((g) => g.reduce((n, p) => n + p.items.length, 0));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
  });

  it('is stable for the same input', () => {
    expect(groupByUnit(HILO_PACKS).map((g) => g.map((p) => p.id))).toEqual(
      groupByUnit(HILO_PACKS).map((g) => g.map((p) => p.id)),
    );
  });
});

describe('resolveRunPool', () => {
  it('never mixes units — the bug this module exists for', () => {
    // every pack selected, including populations, dollars, pounds and ranks
    const pool = resolveRunPool([], createRng('anything'));
    const units = new Set(pool.items.map((i) => i.unit));
    expect(units.size).toBe(1);
    expect(pool.unit).toBe([...units][0]);
  });

  it('holds across many seeds', () => {
    for (let i = 0; i < 60; i++) {
      const pool = resolveRunPool([], createRng(`s${i}`));
      expect(new Set(pool.items.map((x) => x.unit)).size, `seed ${i} mixed units`).toBe(1);
    }
  });

  it('keeps several packs together when they share a unit', () => {
    const pool = resolveRunPool(['country-population'], createRng('s'));
    expect(pool.packs.map((p) => p.id)).toEqual(['country-population']);
    expect(pool.droppedPacks).toEqual([]);
  });

  it('reports what it dropped rather than dropping it silently', () => {
    const pool = resolveRunPool(['country-population', 'nfl-weight'], createRng('s'));
    expect(pool.packs.length + pool.droppedPacks.length).toBe(2);
    expect(pool.droppedPacks.length).toBe(1);
  });

  it('is deterministic for a seed, so a daily run is the same stat for everyone', () => {
    const a = resolveRunPool([], createRng('daily-2026-09-27'));
    const b = resolveRunPool([], createRng('daily-2026-09-27'));
    expect(a.unit).toBe(b.unit);
    expect(a.packs.map((p) => p.id)).toEqual(b.packs.map((p) => p.id));
  });

  it('varies the stat across seeds rather than always picking the biggest group', () => {
    const units = new Set(
      Array.from({ length: 40 }, (_, i) => resolveRunPool([], createRng(`v${i}`)).unit),
    );
    expect(units.size).toBeGreaterThan(1);
  });

  it('is usable with no rng, defaulting to the largest group', () => {
    const pool = resolveRunPool([]);
    expect(pool.items.length).toBeGreaterThan(0);
    expect(new Set(pool.items.map((i) => i.unit)).size).toBe(1);
  });

  it('returns an empty pool rather than throwing for an unknown selection', () => {
    const pool = resolveRunPool(['does-not-exist'], createRng('s'));
    // hiloPool falls back to every pack, so this still yields one coherent unit
    expect(new Set(pool.items.map((i) => i.unit)).size).toBe(1);
  });
});
