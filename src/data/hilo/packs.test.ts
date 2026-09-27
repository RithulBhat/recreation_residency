import { describe, expect, it } from 'vitest';
import { validatePacks } from '@/arcade/content';
import { summarizeProvenance } from '@/arcade/provenance';
import { feasibleDifficulties, bandFeasibility, HILO_BANDS } from '@/arcade/pairing';
import { HILO_PACKS, hiloPackById, hiloPool } from './index';

describe('hilo packs', () => {
  it('every pack passes the content schema', () => {
    const issues = validatePacks(HILO_PACKS as unknown[]);
    expect(
      issues,
      issues.slice(0, 10).map((i) => `${i.pack}/${i.item ?? '-'}.${i.field}: ${i.message}`).join('\n'),
    ).toEqual([]);
  });

  it('meets the brief: six packs, fifty or more items each', () => {
    expect(HILO_PACKS.length).toBeGreaterThanOrEqual(6);
    for (const p of HILO_PACKS) {
      expect(p.items.length, `${p.id} is too small`).toBeGreaterThanOrEqual(50);
    }
  });

  it('includes packs built from the football and song data already on the site', () => {
    const ids = HILO_PACKS.map((p) => p.id);
    expect(ids).toContain('nfl-weight');
    expect(ids).toContain('song-popularity');
  });

  it('is genuinely sourced, unlike the price packs', () => {
    const summary = summarizeProvenance(HILO_PACKS);
    expect(summary.unverifiedItems).toBe(0);
    expect(summary.approximate).toBe(false);
    expect(summary.sources.length).toBeGreaterThan(1);
  });

  it('carries a real asOf on every value', () => {
    for (const p of HILO_PACKS) {
      for (const i of p.items) expect(i.asOf, `${p.id}/${i.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps one unit per pack, so a comparison is always meaningful', () => {
    for (const p of HILO_PACKS) {
      for (const i of p.items) expect(i.unit, `${p.id}/${i.id}`).toBe(p.unit);
    }
  });

  /**
   * The check that exists because a band a pack cannot satisfy makes the hardest difficulty
   * silently play like the easiest. Every shipped pack must honour every difficulty it will be
   * offered at, or the setup screen has to stop offering it.
   */
  it('every pack can honour the difficulties it will be offered at', () => {
    for (const p of HILO_PACKS) {
      const offered = feasibleDifficulties(p.items);
      expect(offered.length, `${p.id} can serve no difficulty at all`).toBeGreaterThan(0);
      expect(offered, `${p.id} cannot serve medium`).toContain('medium');
    }
  });

  it('reports which packs cannot serve the tightest band, rather than hiding it', () => {
    const report = HILO_PACKS.map((p) => ({
      id: p.id,
      insane: bandFeasibility(p.items, HILO_BANDS.insane) >= 0.6,
    }));
    // at least one dense pack must support it, or the difficulty should not exist at all
    expect(report.some((r) => r.insane), JSON.stringify(report)).toBe(true);
  });

  it('looks up by id and falls back sensibly', () => {
    expect(hiloPackById('country-gdp')?.unit).toBe('usd');
    expect(hiloPackById('nope')).toBeUndefined();
    expect(hiloPool([])).toHaveLength(HILO_PACKS.length);
    expect(hiloPool(['nonsense'])).toHaveLength(HILO_PACKS.length);
    expect(hiloPool(['nfl-weight'])).toHaveLength(1);
  });
});
