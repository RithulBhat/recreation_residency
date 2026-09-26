import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCOUT_SETTINGS,
  DEFAULT_TEAM_PACK_ID,
  SCOUT_DIFFICULTIES,
  SCOUT_LIMITS,
  SCOUT_MODE_IDS,
  applyScoutPreset,
  normalizeScoutSettings,
} from './presets';
import { scoutPack, scoutPreset } from './packs';
import { subjectKindForMode } from './subjects';
import type { ScoutSettings } from './types';

describe('DEFAULT_SCOUT_SETTINGS', () => {
  it('is already normalized and playable', () => {
    expect(normalizeScoutSettings(DEFAULT_SCOUT_SETTINGS)).toEqual(DEFAULT_SCOUT_SETTINGS);
    expect(scoutPack(DEFAULT_SCOUT_SETTINGS.packIds[0])).toBeDefined();
    expect(SCOUT_MODE_IDS).toContain(DEFAULT_SCOUT_SETTINGS.mode);
    expect(SCOUT_DIFFICULTIES).toContain(DEFAULT_SCOUT_SETTINGS.difficulty);
  });
});

describe('normalizeScoutSettings', () => {
  it('fills in everything from nothing', () => {
    expect(normalizeScoutSettings(undefined)).toEqual(DEFAULT_SCOUT_SETTINGS);
    expect(normalizeScoutSettings(null)).toEqual(DEFAULT_SCOUT_SETTINGS);
    expect(normalizeScoutSettings({})).toEqual(DEFAULT_SCOUT_SETTINGS);
  });

  it('clamps tries to 1–6', () => {
    expect(normalizeScoutSettings({ tries: 0 }).tries).toBe(SCOUT_LIMITS.tries.min);
    expect(normalizeScoutSettings({ tries: -4 }).tries).toBe(1);
    expect(normalizeScoutSettings({ tries: 99 }).tries).toBe(SCOUT_LIMITS.tries.max);
    expect(normalizeScoutSettings({ tries: 3.6 }).tries).toBe(4);
    expect(normalizeScoutSettings({ tries: Number.NaN }).tries).toBe(DEFAULT_SCOUT_SETTINGS.tries);
  });

  it('clamps rounds to 0–50 and the timer to 0–300', () => {
    expect(normalizeScoutSettings({ rounds: -1 }).rounds).toBe(0);
    expect(normalizeScoutSettings({ rounds: 9999 }).rounds).toBe(50);
    expect(normalizeScoutSettings({ roundTimer: -5 }).roundTimer).toBe(0);
    expect(normalizeScoutSettings({ roundTimer: 10_000 }).roundTimer).toBe(300);
    expect(normalizeScoutSettings({ roundTimer: 30.4 }).roundTimer).toBe(30);
  });

  it('coerces a mode or difficulty that no longer exists', () => {
    const bad = { mode: 'videoClip', difficulty: 'impossible' } as unknown as Partial<ScoutSettings>;
    const out = normalizeScoutSettings(bad);
    expect(out.mode).toBe(DEFAULT_SCOUT_SETTINGS.mode);
    expect(out.difficulty).toBe(DEFAULT_SCOUT_SETTINGS.difficulty);
  });

  it('cleans pack ids: trims, dedupes, drops junk, caps the list', () => {
    expect(normalizeScoutSettings({ packIds: ['  pos-qb  ', 'pos-qb'] }).packIds).toEqual(['pos-qb']);
    expect(normalizeScoutSettings({ packIds: [] }).packIds).toEqual(DEFAULT_SCOUT_SETTINGS.packIds);
    const junk = { packIds: ['pos-qb', '', '   ', 42, null] } as unknown as Partial<ScoutSettings>;
    expect(normalizeScoutSettings(junk).packIds).toEqual(['pos-qb']);
    const many = normalizeScoutSettings({ packIds: Array.from({ length: 40 }, (_, i) => `team-${i}`) });
    expect(many.packIds.length).toBeLessThanOrEqual(SCOUT_LIMITS.packIds.max);
  });

  it('keeps unknown pack ids but guarantees a pack of the needed kind', () => {
    const out = normalizeScoutSettings({ mode: 'silhouette', packIds: ['my-custom-pack'] });
    expect(out.packIds).toContain('my-custom-pack');
    expect(out.packIds.some((id) => scoutPack(id)?.kind === 'player')).toBe(true);
  });

  it('adds a team pack for a team mode and a player pack for a player mode', () => {
    const team = normalizeScoutSettings({ mode: 'teamTrivia', packIds: ['pos-qb'] });
    expect(team.packIds).toContain(DEFAULT_TEAM_PACK_ID);
    const player = normalizeScoutSettings({ mode: 'silhouette', packIds: ['franchises-all'] });
    expect(player.packIds.some((id) => scoutPack(id)?.kind === 'player')).toBe(true);
  });

  it('gives a mixed run both kinds', () => {
    const out = normalizeScoutSettings({ mixModes: true, packIds: ['pos-qb'] });
    expect(out.packIds.some((id) => scoutPack(id)?.kind === 'player')).toBe(true);
    expect(out.packIds.some((id) => scoutPack(id)?.kind === 'team')).toBe(true);
  });

  it('validates the seed and the daily date', () => {
    expect(normalizeScoutSettings({ seed: '  abc ' }).seed).toBe('abc');
    expect(normalizeScoutSettings({ seed: '   ' }).seed).toBeUndefined();
    expect('seed' in normalizeScoutSettings({})).toBe(false);
    expect(normalizeScoutSettings({ daily: '2026-09-26' }).daily).toBe('2026-09-26');
    expect(normalizeScoutSettings({ daily: 'yesterday' }).daily).toBeUndefined();
  });

  it('is idempotent for every mode', () => {
    for (const mode of SCOUT_MODE_IDS) {
      const once = normalizeScoutSettings({ mode, tries: 4, rounds: 12 });
      expect(normalizeScoutSettings(once)).toEqual(once);
      const kind = subjectKindForMode(mode);
      expect(once.packIds.some((id) => scoutPack(id)?.kind === kind)).toBe(true);
    }
  });
});

describe('applyScoutPreset', () => {
  it('applies a preset over the current draft and drops the seed', () => {
    const current = normalizeScoutSettings({ tries: 2, rounds: 3, seed: 'old', daily: '2026-01-01' });
    const out = applyScoutPreset(current, 'franchise-iq');
    expect(out.mode).toBe('teamTrivia');
    expect(out.rounds).toBe(scoutPreset('franchise-iq')!.settings.rounds);
    expect(out.seed).toBeUndefined();
    expect(out.daily).toBeUndefined();
  });

  it('ignores an unknown preset', () => {
    const current = normalizeScoutSettings({});
    expect(applyScoutPreset(current, 'nope')).toBe(current);
  });
});
