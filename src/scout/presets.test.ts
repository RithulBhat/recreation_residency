import { describe, expect, it } from 'vitest';
import type { PlayerConfig } from '@/types/game';
import {
  ALL_SCOUT_PRESETS,
  DEFAULT_SCOUT_SETTINGS,
  DEFAULT_TEAM_PACK_ID,
  GAUNTLET_PLAYER_PACK_IDS,
  SCOUT_DIFFICULTIES,
  SCOUT_FORMAT_PRESETS,
  SCOUT_LIMITS,
  SCOUT_MODE_IDS,
  applyScoutPreset,
  normalizeScoutSettings,
  scoutPresetById,
} from './presets';
import { SCOUT_FORMAT_IDS } from './formats';
import { SCOUT_PRESETS, scoutPack, scoutPreset } from './packs';
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

// ---------------------------------------------------------------------------------------------
// Session formats
// ---------------------------------------------------------------------------------------------

describe('normalizeScoutSettings — session formats', () => {
  const roster = (n: number): PlayerConfig[] =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, emoji: '🎈', color: '#a855f7' }));

  it('defaults to standard and fills every format field', () => {
    expect(DEFAULT_SCOUT_SETTINGS.format).toBe('standard');
    expect(DEFAULT_SCOUT_SETTINGS.blitzDuration).toBe(90);
    expect(DEFAULT_SCOUT_SETTINGS.lives).toBe(3);
    expect(DEFAULT_SCOUT_SETTINGS.duelStyle).toBe('buzzer');
    expect(DEFAULT_SCOUT_SETTINGS.players).toEqual([]);
    const out = normalizeScoutSettings({});
    expect(out.format).toBe('standard');
    expect(out.lives).toBe(3);
    expect(out.blitzDuration).toBe(90);
    expect(out.duelStyle).toBe('buzzer');
    expect(out.players).toEqual([]);
  });

  it('coerces a format that no longer exists', () => {
    const bad = { format: 'onlineDuel' } as unknown as Partial<ScoutSettings>;
    expect(normalizeScoutSettings(bad).format).toBe('standard');
  });

  it('keeps a pre-format persisted draft working, untouched but for the new defaults', () => {
    // exactly the shape `sg:scout` held before session formats existed
    const persisted = {
      mode: 'faceZoom',
      packIds: ['pos-qb'],
      difficulty: 'star',
      tries: 4,
      rounds: 12,
      roundTimer: 30,
      hintsEnabled: false,
      mixModes: false,
    } as Partial<ScoutSettings>;
    const out = normalizeScoutSettings(persisted);
    expect(out.mode).toBe('faceZoom');
    expect(out.packIds).toEqual(['pos-qb']);
    expect(out.difficulty).toBe('star');
    expect(out.tries).toBe(4);
    expect(out.rounds).toBe(12);
    expect(out.roundTimer).toBe(30);
    expect(out.hintsEnabled).toBe(false);
    expect(out.format).toBe('standard');
    expect(out.lives).toBe(3);
  });

  it('zeroes the round count for the endless formats and keeps it for the rest', () => {
    for (const format of ['blitz', 'survival', 'gauntlet'] as const) {
      expect(normalizeScoutSettings({ format, rounds: 25 }).rounds).toBe(0);
    }
    expect(normalizeScoutSettings({ format: 'standard', rounds: 25 }).rounds).toBe(25);
    expect(normalizeScoutSettings({ format: 'duel', rounds: 25 }).rounds).toBe(25);
  });

  it('gives blitz exactly one clock', () => {
    expect(normalizeScoutSettings({ format: 'blitz', roundTimer: 45 }).roundTimer).toBe(0);
    expect(normalizeScoutSettings({ format: 'survival', roundTimer: 45 }).roundTimer).toBe(45);
    expect(normalizeScoutSettings({ format: 'blitz', blitzDuration: 5 }).blitzDuration).toBe(30);
    expect(normalizeScoutSettings({ format: 'blitz', blitzDuration: 9999 }).blitzDuration).toBe(300);
    expect(normalizeScoutSettings({ format: 'blitz', blitzDuration: 120 }).blitzDuration).toBe(120);
  });

  it('clamps lives to 1–5 whatever the format', () => {
    expect(normalizeScoutSettings({ format: 'survival', lives: 0 }).lives).toBe(1);
    expect(normalizeScoutSettings({ format: 'survival', lives: 12 }).lives).toBe(5);
    expect(normalizeScoutSettings({ lives: 12 }).lives).toBe(5);
  });

  it('drops the tier filter for survival and the gauntlet only', () => {
    expect(normalizeScoutSettings({ format: 'survival', difficulty: 'deepCut' }).difficulty).toBe('any');
    expect(normalizeScoutSettings({ format: 'gauntlet', difficulty: 'star' }).difficulty).toBe('any');
    expect(normalizeScoutSettings({ format: 'standard', difficulty: 'deepCut' }).difficulty).toBe('deepCut');
    expect(normalizeScoutSettings({ format: 'blitz', difficulty: 'star' }).difficulty).toBe('star');
    expect(normalizeScoutSettings({ format: 'duel', difficulty: 'star' }).difficulty).toBe('star');
  });

  it('gives the gauntlet league-wide coverage, first in the list', () => {
    const players = normalizeScoutSettings({ format: 'gauntlet', mode: 'silhouette', packIds: ['team-kc'] });
    expect(players.packIds.slice(0, GAUNTLET_PLAYER_PACK_IDS.length)).toEqual([...GAUNTLET_PLAYER_PACK_IDS]);
    expect(players.packIds).toContain('team-kc');
    const teams = normalizeScoutSettings({ format: 'gauntlet', mode: 'logoZoom', packIds: [] });
    expect(teams.packIds).toContain(DEFAULT_TEAM_PACK_ID);
    const mixed = normalizeScoutSettings({ format: 'gauntlet', mixModes: true, packIds: [] });
    expect(mixed.packIds).toContain(DEFAULT_TEAM_PACK_ID);
    expect(mixed.packIds).toContain('conf-afc');
  });

  it('survives the 12-pack cap with the gauntlet packs intact', () => {
    const many = Array.from({ length: 12 }, (_, i) => `team-${i}`);
    const out = normalizeScoutSettings({ format: 'gauntlet', mode: 'silhouette', packIds: many });
    expect(out.packIds).toHaveLength(SCOUT_LIMITS.packIds.max);
    for (const id of GAUNTLET_PLAYER_PACK_IDS) expect(out.packIds).toContain(id);
  });

  it('seats duel at exactly two and party at 2–8, and empties the solo rosters', () => {
    expect(normalizeScoutSettings({ format: 'duel', players: roster(5) }).players).toHaveLength(2);
    expect(normalizeScoutSettings({ format: 'duel', players: [] }).players).toHaveLength(2);
    expect(normalizeScoutSettings({ format: 'party', players: roster(12) }).players).toHaveLength(8);
    expect(normalizeScoutSettings({ format: 'party', players: [] }).players).toHaveLength(2);
    for (const format of ['standard', 'blitz', 'survival', 'gauntlet'] as const) {
      expect(normalizeScoutSettings({ format, players: roster(4) }).players).toEqual([]);
    }
  });

  it('snaps party rounds to a multiple of the player count', () => {
    expect(normalizeScoutSettings({ format: 'party', players: roster(3), rounds: 10 }).rounds).toBe(12);
    expect(normalizeScoutSettings({ format: 'party', players: roster(3), rounds: 12 }).rounds).toBe(12);
    expect(normalizeScoutSettings({ format: 'party', players: roster(4), rounds: 9 }).rounds).toBe(12);
    // snapping up would exceed the 50-round cap, so it snaps down instead
    expect(normalizeScoutSettings({ format: 'party', players: roster(3), rounds: 50 }).rounds).toBe(48);
  });

  it('coerces a duel style that no longer exists', () => {
    const bad = { format: 'duel', duelStyle: 'online' } as unknown as Partial<ScoutSettings>;
    expect(normalizeScoutSettings(bad).duelStyle).toBe('buzzer');
    expect(normalizeScoutSettings({ format: 'duel', duelStyle: 'turns' }).duelStyle).toBe('turns');
  });

  it('is idempotent for every format', () => {
    for (const format of SCOUT_FORMAT_IDS) {
      for (const rounds of [0, 7, 10]) {
        const once = normalizeScoutSettings({ format, rounds, tries: 4, players: roster(3), lives: 4, roundTimer: 20 });
        expect(normalizeScoutSettings(once)).toEqual(once);
        expect(once.format).toBe(format);
      }
    }
  });

  it('carries the format across every mode, and the mode across every format', () => {
    for (const format of SCOUT_FORMAT_IDS) {
      for (const mode of SCOUT_MODE_IDS) {
        const out = normalizeScoutSettings({ format, mode });
        expect(out.format).toBe(format);
        expect(out.mode).toBe(mode);
        const kind = subjectKindForMode(mode);
        expect(out.packIds.some((id) => scoutPack(id)?.kind === kind)).toBe(true);
      }
    }
  });
});

describe('SCOUT_FORMAT_PRESETS', () => {
  it('has a unique id per preset and never collides with the puzzle-type presets', () => {
    const formatIds = SCOUT_FORMAT_PRESETS.map((p) => p.id);
    expect(new Set(formatIds).size).toBe(formatIds.length);
    const allIds = ALL_SCOUT_PRESETS.map((p) => p.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(ALL_SCOUT_PRESETS.length).toBe(SCOUT_PRESETS.length + SCOUT_FORMAT_PRESETS.length);
  });

  it('names a format on every preset and survives normalization intact', () => {
    for (const preset of SCOUT_FORMAT_PRESETS) {
      expect(preset.settings.format).toBeDefined();
      expect(preset.name.length).toBeGreaterThan(3);
      expect(preset.emoji.length).toBeGreaterThan(0);
      expect(preset.blurb.length).toBeGreaterThan(10);
      const out = normalizeScoutSettings(preset.settings);
      expect(out.format).toBe(preset.settings.format);
      expect(out.mode).toBe(preset.settings.mode);
    }
  });

  it('covers every format at least once', () => {
    const covered = new Set(SCOUT_FORMAT_PRESETS.map((p) => p.settings.format));
    for (const format of SCOUT_FORMAT_IDS) {
      if (format === 'standard') continue; // the puzzle-type presets are the standard ones
      expect(covered).toContain(format);
    }
  });

  it('ships the four the design called for', () => {
    const sixty = scoutPresetById('sixty-second-scout');
    expect(sixty?.name).toBe('Sixty Second Scout');
    expect(sixty?.settings.format).toBe('blitz');
    expect(sixty?.settings.mode).toBe('faceZoom');
    expect(sixty?.settings.blitzDuration).toBe(60);

    const last = scoutPresetById('last-man-standing');
    expect(last?.name).toBe('Last Man Standing');
    expect(last?.settings.format).toBe('survival');
    expect(last?.settings.mixModes).toBe(true);

    const league = scoutPresetById('around-the-league');
    expect(league?.name).toBe('Around the League');
    expect(league?.settings.format).toBe('gauntlet');

    const duel = scoutPresetById('film-room-duel');
    expect(duel?.name).toBe('Film Room Duel');
    expect(duel?.settings.format).toBe('duel');
    expect(duel?.settings.mode).toBe('highlight');
    expect(normalizeScoutSettings(duel!.settings).players).toHaveLength(2);
  });

  it('resolves ids from both lists and still ignores an unknown one', () => {
    expect(scoutPresetById('film-room')?.name).toBe('Film Room');
    expect(scoutPresetById('film-room-duel')?.name).toBe('Film Room Duel');
    expect(scoutPresetById('nope')).toBeUndefined();
  });

  it('applyScoutPreset switches the format and brings its settings with it', () => {
    const current = normalizeScoutSettings({ format: 'standard', rounds: 10, tries: 6, seed: 'old' });
    const out = applyScoutPreset(current, 'sixty-second-scout');
    expect(out.format).toBe('blitz');
    expect(out.mode).toBe('faceZoom');
    expect(out.blitzDuration).toBe(60);
    expect(out.rounds).toBe(0);
    expect(out.seed).toBeUndefined();
  });

  it('applyScoutPreset seats the players a multiplayer preset needs', () => {
    const current = normalizeScoutSettings({});
    expect(current.players).toEqual([]);
    const duel = applyScoutPreset(current, 'film-room-duel');
    expect(duel.players).toHaveLength(2);
    expect(duel.duelStyle).toBe('buzzer');
    const party = applyScoutPreset(current, 'pass-the-laptop');
    expect(party.format).toBe('party');
    expect(party.players).toHaveLength(4);
    expect(party.rounds % party.players!.length).toBe(0);
  });

  it('keeps the current format when a puzzle-type preset is applied on top of it', () => {
    const blitz = normalizeScoutSettings({ format: 'blitz', blitzDuration: 120 });
    const out = applyScoutPreset(blitz, 'franchise-iq');
    expect(out.format).toBe('blitz');
    expect(out.mode).toBe('teamTrivia');
    expect(out.blitzDuration).toBe(120);
    expect(out.rounds).toBe(0);
  });
});
