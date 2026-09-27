import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYERS } from '@/game/presets';
import {
  DEFAULT_SETTINGS,
  HILO_POWER_UPS,
  PARTY_PLAYERS,
  PRESETS,
  SOLO_PLAYER,
  presetById,
  reconcile,
  validateSettings,
} from './settings';
import type { HiloSettings } from './types';

const base = (over: Partial<HiloSettings> = {}): HiloSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('validateSettings', () => {
  it('returns the defaults for junk input', () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(7)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps every numeric field into range', () => {
    const out = validateSettings({ lives: 99, duration: 9999, rounds: -4, timer: 999 });
    expect(out.lives).toBeLessThanOrEqual(5);
    expect(out.duration).toBeLessThanOrEqual(300);
    expect(out.rounds).toBeGreaterThanOrEqual(3);
    expect(out.timer).toBeLessThanOrEqual(60);
  });

  it('falls back for unknown enums', () => {
    expect(validateSettings({ format: 'telepathy' }).format).toBe('classic');
    expect(validateSettings({ difficulty: 'impossible' }).difficulty).toBe('medium');
    expect(validateSettings({ streakCurve: 'vertical' }).streakCurve).toBe('gentle');
  });

  it('keeps only recognised power-ups', () => {
    expect(validateSettings({ powerUps: ['peek', 'teleport'] }).powerUps).toEqual(['peek']);
  });

  it('rejects a colour that is not real hex', () => {
    const out = validateSettings({
      players: [{ id: 'x', name: 'X', emoji: '🧀', color: 'javascript:alert(1)' }],
    });
    expect(out.players[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('caps an absurd roster and truncates long strings', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: 'x'.repeat(99) }));
    const out = validateSettings({ players: many, seed: 's'.repeat(400) });
    expect(out.players.length).toBeLessThanOrEqual(12);
    expect(out.players[0].name.length).toBeLessThanOrEqual(24);
    expect(out.seed?.length).toBeLessThanOrEqual(64);
  });

  it('falls back to the solo player for an unusable roster', () => {
    expect(validateSettings({ players: [] }).players).toEqual([SOLO_PLAYER]);
  });
});

describe('reconcile', () => {
  it('pins classic and sudden death to one life', () => {
    expect(reconcile(base({ format: 'classic', lives: 5 })).lives).toBe(1);
    expect(reconcile(base({ format: 'suddenDeath', lives: 5 })).lives).toBe(1);
  });

  it('seats a second player for sudden death', () => {
    expect(reconcile(base({ format: 'suddenDeath', players: [SOLO_PLAYER] })).players).toHaveLength(2);
  });

  it('turns off the "too close to call" button on the tightest band', () => {
    // at within-3%, almost every pair would qualify and the button would be the answer
    expect(reconcile(base({ difficulty: 'insane', allowSame: true })).allowSame).toBe(false);
    expect(reconcile(base({ difficulty: 'easy', allowSame: true })).allowSame).toBe(true);
  });

  it('removes the per-pick timer in the timed format, which has its own clock', () => {
    expect(reconcile(base({ format: 'timed', timer: 10 })).timer).toBe(0);
  });

  it('does not destroy the double-down preference in a format that cannot use it', () => {
    expect(reconcile(base({ format: 'classic' })).powerUps).toContain('doubleDown');
  });

  it('does not mutate its input and is idempotent', () => {
    const original = base({ format: 'suddenDeath', lives: 4, timer: 9 });
    const snapshot = JSON.parse(JSON.stringify(original));
    const once = reconcile(original);
    expect(original).toEqual(snapshot);
    expect(reconcile(once)).toEqual(once);
  });
});

describe('presets', () => {
  it('ships the six named in the brief', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'classic',
      'speedrun',
      'football-nerd',
      'hard-mode',
      'party-race',
      'sudden-death',
    ]);
  });

  it('every preset is already reconciled and survives validation', () => {
    for (const p of PRESETS) {
      expect(reconcile(p.settings), `preset ${p.id}`).toEqual(p.settings);
      expect(validateSettings(p.settings), `preset ${p.id}`).toEqual(p.settings);
    }
  });

  it('every preset has presentable copy', () => {
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(10);
      expect(p.emoji.length).toBeGreaterThan(0);
    }
  });

  it('looks up by id', () => {
    expect(presetById('hard-mode')?.settings.difficulty).toBe('hard');
    expect(presetById('nope')).toBeUndefined();
  });
});

describe('defaults', () => {
  it('are themselves reconciled', () => {
    expect(reconcile(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('reuse the shared roster rather than declaring another', () => {
    expect(PARTY_PLAYERS).toBe(DEFAULT_PLAYERS);
  });

  it('offer every power-up by default', () => {
    expect(DEFAULT_SETTINGS.powerUps).toEqual(HILO_POWER_UPS);
  });
});
