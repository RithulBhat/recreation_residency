import { describe, expect, it } from 'vitest';
import { SCOUT_PACKS, scoutPack } from '@/scout/packs';
import { normalizeScoutSettings } from '@/scout/presets';
import { buildPool, playerMatchesFilter, tierOf } from '@/scout/subjects';
import { fixtureBundle } from '@/scout/fixtures';
import { countPackSubjects, scoutPackCounts, scoutPoolSize, teamsById } from './pool';

const bundle = fixtureBundle();

describe('teamsById', () => {
  it('indexes every team', () => {
    const map = teamsById(bundle);
    expect(map.size).toBe(bundle.teams.length);
    expect(map.get(bundle.teams[0]!.id)?.abbr).toBe(bundle.teams[0]!.abbr);
  });
});

describe('countPackSubjects', () => {
  it('counts players through the same predicate the pool builder uses', () => {
    const pack = scoutPack('pos-qb')!;
    const teams = teamsById(bundle);
    const expected = bundle.players.filter((p) => playerMatchesFilter(p, pack.filter, teams.get(p.teamId))).length;
    expect(countPackSubjects(bundle, pack)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('applies the difficulty tier to player packs', () => {
    const pack = scoutPack('conf-afc')!;
    const any = countPackSubjects(bundle, pack, 'any');
    const stars = countPackSubjects(bundle, pack, 'star');
    expect(stars).toBeLessThanOrEqual(any);
    const teams = teamsById(bundle);
    const expected = bundle.players.filter(
      (p) => tierOf(p) === 'star' && playerMatchesFilter(p, pack.filter, teams.get(p.teamId)),
    ).length;
    expect(stars).toBe(expected);
  });

  it('never tier-filters franchises — they have no fame score', () => {
    const pack = scoutPack('franchises-all')!;
    expect(countPackSubjects(bundle, pack, 'star')).toBe(countPackSubjects(bundle, pack, 'deepCut'));
  });
});

describe('scoutPackCounts', () => {
  it('returns a count for every pack in one pass', () => {
    const counts = scoutPackCounts(bundle);
    expect(Object.keys(counts)).toHaveLength(SCOUT_PACKS.length);
    for (const pack of SCOUT_PACKS) expect(counts[pack.id]).toBeGreaterThanOrEqual(0);
    expect(counts['franchises-all']).toBe(bundle.teams.length);
  });
});

describe('scoutPoolSize', () => {
  it('is exactly what buildPool would deal', () => {
    const settings = normalizeScoutSettings({ mode: 'silhouette', packIds: ['superstars'], difficulty: 'any' });
    expect(scoutPoolSize(bundle, settings)).toBe(buildPool(bundle, settings).length);
  });

  it('shrinks when the tier narrows', () => {
    const base = normalizeScoutSettings({ mode: 'silhouette', packIds: ['conf-afc', 'conf-nfc'] });
    const any = scoutPoolSize(bundle, base);
    const star = scoutPoolSize(bundle, { ...base, difficulty: 'star' });
    expect(star).toBeLessThan(any);
  });

  it('counts franchises for a team mode', () => {
    const settings = normalizeScoutSettings({ mode: 'logoZoom', packIds: ['franchises-all'] });
    expect(scoutPoolSize(bundle, settings)).toBe(bundle.teams.length);
  });

  it('can be zero when no subject can render the mode', () => {
    // `highlight` needs a play; no fixture player in this pack has one at deepCut.
    const settings = normalizeScoutSettings({
      mode: 'highlight',
      packIds: ['superstars'],
      difficulty: 'deepCut',
    });
    expect(scoutPoolSize(bundle, settings)).toBe(0);
  });
});
