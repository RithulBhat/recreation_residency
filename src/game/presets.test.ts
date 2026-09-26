import { describe, expect, it } from 'vitest';
import type { GameSettings } from '@/types';
import { createRng } from './rng';
import {
  DEFAULT_PLAYERS,
  DEFAULT_SETTINGS,
  PRESETS,
  applyPresetToSettings,
  clipLengthPresets,
  findPreset,
  maxClipLength,
  normalizeSettings,
  randomModifiers,
} from './presets';

describe('DEFAULT_SETTINGS', () => {
  it('matches the spec', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      mode: 'classic',
      packIds: ['pop-hits'],
      stages: [0.1, 0.3, 1, 2, 4, 7, 10],
      tries: 7,
      clipLength: 1,
      rounds: 10,
      startPosition: 'random',
      sameStartEachTry: true,
      guessTarget: 'title',
      hintsEnabled: true,
      roundTimer: 0,
      modifiers: { speed: 1, reverse: false, lofi: false, bitcrush: false, pitch: 0 },
      allowSkip: true,
      explicitFilter: false,
      blitzDuration: 90,
      lives: 3,
      players: [],
      duelStyle: 'buzzer',
      voiceHost: false,
    });
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(clipLengthPresets).toEqual([0.1, 0.25, 0.5, 1, 2, 3, 5, 10]);
    expect(DEFAULT_PLAYERS).toHaveLength(8);
    expect(new Set(DEFAULT_PLAYERS.map((p) => p.id)).size).toBe(8);
  });
});

describe('PRESETS', () => {
  it('has the expected presets and each normalizes cleanly', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toEqual(['songspot', 'heardle', 'impossible', 'sniper', 'chill', 'speedrun', 'iron-ears', 'chaos', 'party-night', 'duel']);
    for (const p of PRESETS) {
      const s = normalizeSettings(p.settings);
      expect(s.tries).toBeGreaterThanOrEqual(1);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });

  it('specific preset shapes', () => {
    expect(normalizeSettings(findPreset('songspot')!.settings)).toMatchObject({ mode: 'classic', stages: [0.1, 0.5, 2, 8, 15], tries: 5 });
    expect(normalizeSettings(findPreset('heardle')!.settings)).toMatchObject({ stages: [1, 2, 4, 7, 11, 16], tries: 6, startPosition: 'start' });
    expect(normalizeSettings(findPreset('impossible')!.settings)).toMatchObject({ mode: 'fixed', clipLength: 0.1, tries: 3 });
    expect(normalizeSettings(findPreset('sniper')!.settings)).toMatchObject({ mode: 'fixed', clipLength: 0.3, tries: 1 });
    expect(normalizeSettings(findPreset('chill')!.settings)).toMatchObject({ mode: 'fixed', clipLength: 5, tries: 3 });
    expect(normalizeSettings(findPreset('speedrun')!.settings)).toMatchObject({ mode: 'blitz', clipLength: 1, blitzDuration: 60 });
    expect(normalizeSettings(findPreset('iron-ears')!.settings)).toMatchObject({ mode: 'survival', lives: 3 });
    expect(normalizeSettings(findPreset('party-night')!.settings).players.length).toBeGreaterThanOrEqual(2);
    expect(normalizeSettings(findPreset('duel')!.settings)).toMatchObject({ mode: 'duel', duelStyle: 'buzzer' });
    expect(normalizeSettings(findPreset('duel')!.settings).players).toHaveLength(2);
  });

  it('applyPresetToSettings keeps packs/prefs and re-rolls chaos modifiers', () => {
    const current: GameSettings = { ...DEFAULT_SETTINGS, packIds: ['hip-hop'], difficulty: 'hard', explicitFilter: true };
    const s = applyPresetToSettings(current, findPreset('sniper')!);
    expect(s.packIds).toEqual(['hip-hop']);
    expect(s.difficulty).toBe('hard');
    expect(s.explicitFilter).toBe(true);
    expect(s.clipLength).toBe(0.3);

    const chaos = applyPresetToSettings(current, findPreset('chaos')!, createRng('chaos-1'));
    const chaos2 = applyPresetToSettings(current, findPreset('chaos')!, createRng('chaos-1'));
    expect(chaos.modifiers).toEqual(chaos2.modifiers);
    const m = randomModifiers(createRng('z'));
    expect([0.5, 0.75, 1, 1.25, 1.5, 2]).toContain(m.speed);
    expect(m.pitch).toBeGreaterThanOrEqual(-12);
  });
});

describe('normalizeSettings', () => {
  it('fills defaults from empty / garbage', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const garbage = normalizeSettings({ mode: 'nope', clipLength: 'x', stages: 'y', rounds: -5 } as unknown as Partial<GameSettings>);
    expect(garbage.mode).toBe('classic');
    expect(garbage.clipLength).toBe(1);
    expect(garbage.stages).toEqual(DEFAULT_SETTINGS.stages);
    expect(garbage.rounds).toBe(0);
  });

  it('sorts stages ascending unique and derives tries in escalating mode', () => {
    const s = normalizeSettings({ mode: 'classic', stages: [4, 0.1, 4, 1, 100, -1, Number.NaN], tries: 99 });
    expect(s.stages).toEqual([0.1, 1, 4, 30]);
    expect(s.tries).toBe(4);
    expect(s.clipMode).toBe('escalating');
  });

  it('clamps fixed-mode values', () => {
    const s = normalizeSettings({ mode: 'fixed', clipLength: 50, tries: 20 });
    expect(s.clipMode).toBe('fixed');
    expect(s.clipLength).toBe(10);
    expect(s.tries).toBe(6);
    const s2 = normalizeSettings({ mode: 'fixed', clipLength: 0.001, tries: 0 });
    expect(s2.clipLength).toBe(0.1);
    expect(s2.tries).toBe(1);
  });

  it('forces clipMode by mode (classic → escalating, blitz/fixed → fixed)', () => {
    expect(normalizeSettings({ mode: 'classic', clipMode: 'fixed' }).clipMode).toBe('escalating');
    expect(normalizeSettings({ mode: 'blitz', clipMode: 'escalating' }).clipMode).toBe('fixed');
    expect(normalizeSettings({ mode: 'survival', clipMode: 'escalating' }).clipMode).toBe('escalating');
    expect(normalizeSettings({ mode: 'survival' }).clipMode).toBe('fixed');
    expect(normalizeSettings({ mode: 'party' }).clipMode).toBe('escalating');
  });

  it('clamps modifiers, blitz, lives, timer', () => {
    const s = normalizeSettings({
      modifiers: { speed: 3 as unknown as 1, reverse: true, lofi: false, bitcrush: true, pitch: 40 },
      blitzDuration: 5,
      lives: 0,
      roundTimer: 9999,
    });
    expect(s.modifiers).toEqual({ speed: 1, reverse: true, lofi: false, bitcrush: true, pitch: 12 });
    expect(s.blitzDuration).toBe(15);
    expect(s.lives).toBe(1);
    expect(s.roundTimer).toBe(300);
  });

  it('fills duel/party players from defaults and validates them', () => {
    const duel = normalizeSettings({ mode: 'duel', players: [{ id: 'a', name: 'Ann', emoji: '🐸', color: '#ff0000' }] });
    expect(duel.players).toHaveLength(2);
    expect(duel.players[0]).toEqual({ id: 'a', name: 'Ann', emoji: '🐸', color: '#ff0000' });
    const party = normalizeSettings({ mode: 'party', players: [] });
    expect(party.players).toHaveLength(2);
    const big = normalizeSettings({ mode: 'party', players: DEFAULT_PLAYERS.concat(DEFAULT_PLAYERS.map((p) => ({ ...p, id: p.id + 'x' }))) });
    expect(big.players).toHaveLength(8);
    const bad = normalizeSettings({ mode: 'duel', players: [{ id: '', name: '', emoji: '', color: 'red' }, { id: 'p1', name: 'X', emoji: 'Y', color: '#123456' }] });
    expect(bad.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(bad.players[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('keeps seed/daily only when valid, dedupes packs', () => {
    expect(normalizeSettings({ seed: '  ' }).seed).toBeUndefined();
    expect(normalizeSettings({ seed: 'abc' }).seed).toBe('abc');
    expect(normalizeSettings({ daily: 'nope' }).daily).toBeUndefined();
    expect(normalizeSettings({ daily: '2026-09-26' }).daily).toBe('2026-09-26');
    expect(normalizeSettings({ packIds: ['a', 'a', ' b ', ''] }).packIds).toEqual(['a', 'b']);
    expect(normalizeSettings({ packIds: [] }).packIds).toEqual(['pop-hits']);
  });

  it('party rounds snap UP to a multiple of the player count (P3-7)', () => {
    const three = DEFAULT_PLAYERS.slice(0, 3);
    expect(normalizeSettings({ mode: 'party', rounds: 10, players: three }).rounds).toBe(12);
    expect(normalizeSettings({ mode: 'party', rounds: 12, players: three }).rounds).toBe(12);
    expect(normalizeSettings({ mode: 'party', rounds: 1, players: three }).rounds).toBe(3);
    expect(normalizeSettings({ mode: 'party', rounds: 0, players: three }).rounds).toBe(0); // endless stays endless
    expect(normalizeSettings({ mode: 'party', rounds: 200, players: three }).rounds).toBe(198); // never past the cap
    expect(normalizeSettings({ mode: 'party', rounds: 7, players: DEFAULT_PLAYERS.slice(0, 4) }).rounds).toBe(8);
    // players fill from defaults first (party minimum is 2)
    expect(normalizeSettings({ mode: 'party', rounds: 7, players: [] }).rounds).toBe(8);
    // other modes are left alone
    expect(normalizeSettings({ mode: 'duel', rounds: 7 }).rounds).toBe(7);
    expect(normalizeSettings({ mode: 'classic', rounds: 7 }).rounds).toBe(7);
  });

  it('maxClipLength follows the mode', () => {
    expect(maxClipLength(normalizeSettings({ mode: 'classic' }))).toBe(10);
    expect(maxClipLength(normalizeSettings({ mode: 'fixed', clipLength: 2 }))).toBe(2);
    expect(maxClipLength(normalizeSettings({ mode: 'blitz', clipLength: 1, stages: [5, 9] }))).toBe(1);
  });
});
